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
