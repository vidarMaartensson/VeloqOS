//! Keeps the window on the dashboard. Everything else, such as Google's sign-in (which refuses
//! embedded webviews) or artifact links, opens in the default browser.

use tauri::Url;

/// The bundled dashboard (`tauri://localhost`) or the Vite dev server during `npm run dev`.
pub fn stays_in_app(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "about" | "data" | "blob" => true,
        "http" | "https" => matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "tauri.localhost")),
        _ => false,
    }
}

pub fn open_in_browser(url: &Url) {
    if let Err(e) = std::process::Command::new("open").arg(url.as_str()).spawn() {
        eprintln!("Veloq OS: kunde inte öppna {url} – {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn keeps_the_dashboard_in_the_window() {
        assert!(stays_in_app(&url("tauri://localhost/")));
        assert!(stays_in_app(&url("http://localhost:7470/")));
        assert!(stays_in_app(&url("http://127.0.0.1:7480/api/google/callback")));
    }

    #[test]
    fn sends_everything_else_to_the_browser() {
        assert!(!stays_in_app(&url("https://accounts.google.com/o/oauth2/v2/auth?client_id=x")));
        assert!(!stays_in_app(&url("https://claude.ai/artifact/a2")));
        assert!(!stays_in_app(&url("mailto:hej@example.com")));
    }
}
