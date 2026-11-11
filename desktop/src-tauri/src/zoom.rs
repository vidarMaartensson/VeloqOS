//! Scales the dashboard down a little in wide windows. The layout is tuned for a MacBook Air
//! (about 1470 points across); on a big external screen the same pixels end up physically larger,
//! so the webview zoom eases from 100 % to 80 % as the window grows. It works like Cmd-minus, so
//! `vh`, pointer coordinates and the canvas keep lining up.

/// Up to this width (logical points) the dashboard stays at 100 %.
const FULL_SIZE_UP_TO: f64 = 1600.0;
/// From this width on it stays at the smallest zoom.
const SMALLEST_FROM: f64 = 2560.0;
const SMALLEST: f64 = 0.8;

/// The zoom for a window this wide, in logical points, rounded to whole percent.
pub fn for_width(width: f64) -> f64 {
    let t = ((width - FULL_SIZE_UP_TO) / (SMALLEST_FROM - FULL_SIZE_UP_TO)).clamp(0.0, 1.0);
    let zoom = 1.0 - t * (1.0 - SMALLEST);
    (zoom * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_a_macbook_window_at_full_size() {
        assert_eq!(for_width(1024.0), 1.0);
        assert_eq!(for_width(1470.0), 1.0);
        assert_eq!(for_width(1600.0), 1.0);
    }

    #[test]
    fn shrinks_gradually_on_wider_windows() {
        assert_eq!(for_width(1920.0), 0.93);
        assert_eq!(for_width(2080.0), 0.9);
    }

    #[test]
    fn never_goes_below_the_smallest_zoom() {
        assert_eq!(for_width(2560.0), 0.8);
        assert_eq!(for_width(3840.0), 0.8);
    }
}
