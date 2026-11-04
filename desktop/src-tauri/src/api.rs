//! Finds or starts the Veloq OS API that the dashboard talks to.
//!
//! Mirrors `scripts/start.sh`: reuse an API that already answers on 7480, step past ports
//! held by something else, and start the bundled API on the first free port.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

pub const DEFAULT_PORT: u16 = 7480;
const PORTS_TO_TRY: u16 = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PortState {
    /// A Veloq OS API answers here.
    Veloq,
    /// Something else listens here.
    Busy,
    Free,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Plan {
    Reuse(u16),
    Spawn(u16),
}

pub fn choose_port(start: u16, probe: impl Fn(u16) -> PortState) -> Option<Plan> {
    (start..start.saturating_add(PORTS_TO_TRY)).find_map(|port| match probe(port) {
        PortState::Veloq => Some(Plan::Reuse(port)),
        PortState::Free => Some(Plan::Spawn(port)),
        PortState::Busy => None,
    })
}

pub fn probe(port: u16) -> PortState {
    match health(port) {
        None => PortState::Free,
        Some(true) => PortState::Veloq,
        Some(false) => PortState::Busy,
    }
}

/// `None` if nothing listens on the port, otherwise whether `/api/health` says `"status":"ok"`.
fn health(port: u16) -> Option<bool> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(300)).ok()?;
    let timeout = Some(Duration::from_secs(2));
    let _ = stream.set_read_timeout(timeout);
    let _ = stream.set_write_timeout(timeout);

    let request = format!("GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return Some(false);
    }
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    Some(is_ok_response(&response))
}

fn is_ok_response(response: &str) -> bool {
    let status_ok = response.lines().next().is_some_and(|line| line.split_whitespace().nth(1) == Some("200"));
    status_ok && response.replace(' ', "").contains(r#""status":"ok""#)
}

pub fn spawn(binary: &Path, port: u16, log: &Path) -> std::io::Result<Child> {
    if let Some(dir) = log.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let out = std::fs::File::create(log)?;
    let err = out.try_clone()?;
    Command::new(binary)
        // Listen on all interfaces like `start.sh`, so the phone still reaches it.
        .arg("--urls")
        .arg(format!("http://0.0.0.0:{port}"))
        // The bundled binary ships without appsettings.json, so CORS origins come from here.
        .arg("--Veloq:WebOrigins:0=tauri://localhost")
        .arg("--Veloq:WebOrigins:1=http://localhost:7470")
        .current_dir(log.parent().unwrap_or(Path::new(".")))
        .stdin(Stdio::null())
        .stdout(out)
        .stderr(err)
        .spawn()
}

pub fn wait_until_healthy(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if health(port) == Some(true) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}

/// PIDs of the processes listening on the port, from `lsof`.
pub fn listeners(port: u16) -> Vec<u32> {
    Command::new("/usr/sbin/lsof")
        .args(["-nP", "-t", &format!("-iTCP:{port}"), "-sTCP:LISTEN"])
        .output()
        .map(|out| parse_pids(&String::from_utf8_lossy(&out.stdout)))
        .unwrap_or_default()
}

fn parse_pids(output: &str) -> Vec<u32> {
    output.lines().filter_map(|line| line.trim().parse().ok()).collect()
}

/// The bundled sidecar, or the API from `dotnet run` / `start.sh` – never anything else on the port.
pub fn is_veloq_api_command(command: &str) -> bool {
    command.contains("veloq-api") || command.contains("VeloqOS.Api")
}

fn command_of(pid: u32) -> String {
    Command::new("/bin/ps")
        .args(["-o", "command=", "-p", &pid.to_string()])
        .output()
        .map(|out| String::from_utf8_lossy(&out.stdout).into_owned())
        .unwrap_or_default()
}

/// Stops a Veloq API this app did not start (left from an earlier run, or `start.sh`), even if it hangs.
/// Returns false if the port is still taken afterwards.
pub fn stop_foreign_api(port: u16) -> bool {
    for signal in ["-TERM", "-KILL"] {
        let pids: Vec<u32> = listeners(port).into_iter().filter(|&pid| is_veloq_api_command(&command_of(pid))).collect();
        if pids.is_empty() {
            break;
        }
        for pid in pids {
            let _ = Command::new("/bin/kill").args([signal, &pid.to_string()]).status();
        }
        if wait_until_free(port, Duration::from_secs(5)) {
            return true;
        }
    }
    listeners(port).is_empty()
}

pub fn wait_until_free(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if listeners(port).is_empty() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn reuses_a_running_veloq_api() {
        assert_eq!(choose_port(7480, |_| PortState::Veloq), Some(Plan::Reuse(7480)));
    }

    #[test]
    fn steps_past_busy_ports() {
        let plan = choose_port(7480, |port| if port < 7482 { PortState::Busy } else { PortState::Free });
        assert_eq!(plan, Some(Plan::Spawn(7482)));
    }

    #[test]
    fn gives_up_when_every_port_is_busy() {
        assert_eq!(choose_port(7480, |_| PortState::Busy), None);
    }

    #[test]
    fn parses_lsof_pids() {
        assert_eq!(parse_pids("123\n456\n"), vec![123, 456]);
        assert_eq!(parse_pids(""), Vec::<u32>::new());
    }

    #[test]
    fn finds_the_listener_on_a_port() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        assert_eq!(listeners(port), vec![std::process::id()]);
        drop(listener);
        assert!(wait_until_free(port, Duration::from_secs(2)));
    }

    #[test]
    fn only_stops_veloq_apis() {
        assert!(is_veloq_api_command("/Applications/Veloq OS.app/Contents/MacOS/veloq-api --urls http://0.0.0.0:7480"));
        assert!(is_veloq_api_command("/Users/v/VeloqOS/api/src/VeloqOS.Api/bin/Debug/net10.0/VeloqOS.Api"));
        assert!(!is_veloq_api_command("/usr/bin/python3 -m http.server 7480"));
    }

    #[test]
    fn reads_health_responses() {
        assert!(is_ok_response("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"status\":\"ok\"}"));
        assert!(is_ok_response("HTTP/1.1 200 OK\r\n\r\n{ \"status\": \"ok\", \"time\": \"x\" }"));
        assert!(!is_ok_response("HTTP/1.1 404 Not Found\r\n\r\n{\"status\":\"ok\"}"));
        assert!(!is_ok_response("HTTP/1.1 200 OK\r\n\r\n<html>another app</html>"));
        assert!(!is_ok_response(""));
    }

    fn serve_once(body: &'static str) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf);
            let _ = stream.write_all(body.as_bytes());
        });
        port
    }

    #[test]
    fn probes_a_veloq_api() {
        let port = serve_once("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n{\"status\":\"ok\"}");
        assert_eq!(probe(port), PortState::Veloq);
    }

    #[test]
    fn probes_another_service() {
        let port = serve_once("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\nhello");
        assert_eq!(probe(port), PortState::Busy);
    }

    #[test]
    fn probes_a_free_port() {
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        assert_eq!(probe(port), PortState::Free);
    }
}
