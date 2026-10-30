//! Veloq OS on the Mac: the web dashboard in a native window, with the API started alongside it.

mod api;

use std::process::Child;
use std::sync::Mutex;
use std::time::Duration;

use tauri::window::Color;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

/// The API this app started, so it can be stopped on quit. An API that was already running is left alone.
struct ApiProcess(Mutex<Option<Child>>);

/// `--bg` from web/src/styles/tokens.css, so the window never flashes white before the page paints.
const BACKGROUND: Color = Color(0x0b, 0x0d, 0x12, 0xff);

fn main() {
    tauri::Builder::default()
        .manage(ApiProcess(Mutex::new(None)))
        .setup(|app| {
            // SIGTERM (logout, `kill`) skips RunEvent::Exit; route it through a normal exit so the API stops too.
            let handle = app.handle().clone();
            ctrlc::set_handler(move || handle.exit(0))?;

            // Same variable as scripts/start.sh; the smoke test uses it to stay off a running API.
            let start = std::env::var("VELOQ_API_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(api::DEFAULT_PORT);
            let port = match api::choose_port(start, api::probe) {
                Some(api::Plan::Reuse(port)) => port,
                Some(api::Plan::Spawn(port)) => {
                    // Tauri places the sidecar next to the app's own executable.
                    let binary = std::env::current_exe()?.with_file_name("veloq-api");
                    let log = app.path().app_log_dir()?.join("api.log");
                    let child = api::spawn(&binary, port, &log)?;
                    *app.state::<ApiProcess>().0.lock().unwrap() = Some(child);
                    if !api::wait_until_healthy(port, Duration::from_secs(20)) {
                        eprintln!("Veloq OS: API:t svarade inte på :{port} – se {}", log.display());
                    }
                    port
                }
                None => {
                    eprintln!("Veloq OS: hittade ingen ledig port från {start}");
                    start
                }
            };

            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Veloq OS")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 680.0)
                .background_color(BACKGROUND)
                .theme(Some(tauri::Theme::Dark))
                .initialization_script(format!("window.__VELOQ_API_BASE__ = 'http://127.0.0.1:{port}/api';"))
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
