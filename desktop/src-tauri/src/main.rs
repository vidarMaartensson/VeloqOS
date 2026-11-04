//! Veloq OS on the Mac: the web dashboard in a native window, with the API started alongside it.

mod api;
mod nav;

use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use std::time::Duration;

use tauri::window::Color;
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

/// The API this app started, so it can be stopped on quit. An API that was already running is left alone.
struct ApiProcess(Mutex<Option<Child>>);

/// Where the dashboard expects the API, so a restart puts it back on the same port.
struct ApiTarget {
    port: u16,
    binary: PathBuf,
    log: PathBuf,
}

const HEALTHY_WITHIN: Duration = Duration::from_secs(20);

/// "Starta om API:t" in the dashboard: stop whatever Veloq API holds the port – ours or a leftover – and start a fresh one.
#[tauri::command]
async fn restart_api(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || restart(&app)).await.map_err(|e| e.to_string())?
}

fn restart(app: &AppHandle) -> Result<(), String> {
    let target = app.state::<ApiTarget>();
    let process = app.state::<ApiProcess>();
    let mut slot = process.0.lock().unwrap();
    if let Some(mut child) = slot.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    if !api::stop_foreign_api(target.port) {
        return Err(format!("Port {} är upptagen av något annat än Veloq OS.", target.port));
    }
    let child = api::spawn(&target.binary, target.port, &target.log).map_err(|e| format!("Kunde inte starta API:t: {e}"))?;
    *slot = Some(child);
    drop(slot);
    if api::wait_until_healthy(target.port, HEALTHY_WITHIN) {
        Ok(())
    } else {
        Err(format!("API:t startade men svarar inte – se {}", target.log.display()))
    }
}

/// `--bg` from web/src/styles/tokens.css, so the window never flashes white before the page paints.
const BACKGROUND: Color = Color(0x0b, 0x0d, 0x12, 0xff);

fn main() {
    tauri::Builder::default()
        .manage(ApiProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![restart_api])
        .setup(|app| {
            // SIGTERM (logout, `kill`) skips RunEvent::Exit; route it through a normal exit so the API stops too.
            let handle = app.handle().clone();
            ctrlc::set_handler(move || handle.exit(0))?;

            // Same variable as scripts/start.sh; the smoke test uses it to stay off a running API.
            let start = std::env::var("VELOQ_API_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(api::DEFAULT_PORT);
            // Tauri places the sidecar next to the app's own executable.
            let binary = std::env::current_exe()?.with_file_name("veloq-api");
            let log = app.path().app_log_dir()?.join("api.log");
            let port = match api::choose_port(start, api::probe) {
                Some(api::Plan::Reuse(port)) => port,
                Some(api::Plan::Spawn(port)) => {
                    // A failed start still opens the window, where "Starta om API:t" can try again.
                    match api::spawn(&binary, port, &log) {
                        Ok(child) => *app.state::<ApiProcess>().0.lock().unwrap() = Some(child),
                        Err(e) => eprintln!("Veloq OS: kunde inte starta API:t: {e}"),
                    }
                    if !api::wait_until_healthy(port, HEALTHY_WITHIN) {
                        eprintln!("Veloq OS: API:t svarade inte på :{port} – se {}", log.display());
                    }
                    port
                }
                None => {
                    eprintln!("Veloq OS: hittade ingen ledig port från {start}");
                    start
                }
            };
            app.manage(ApiTarget { port, binary, log });

            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Veloq OS")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 680.0)
                .background_color(BACKGROUND)
                .theme(Some(tauri::Theme::Dark))
                .initialization_script(format!("window.__VELOQ_API_BASE__ = 'http://127.0.0.1:{port}/api';"))
                .on_navigation(|url| {
                    if nav::stays_in_app(url) {
                        return true;
                    }
                    nav::open_in_browser(url);
                    false
                })
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Veloq OS kunde inte starta")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(mut child) = app.state::<ApiProcess>().0.lock().unwrap().take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}
