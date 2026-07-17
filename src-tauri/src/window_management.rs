use std::{
    error::Error,
    fmt,
    sync::atomic::{AtomicU64, Ordering},
};

use serde::Serialize;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};
#[cfg(target_os = "macos")]
use tauri::{LogicalPosition, TitleBarStyle};

static NEXT_WINDOW_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowCreationError {
    pub message: &'static str,
}

impl fmt::Display for WindowCreationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.message)
    }
}

impl Error for WindowCreationError {}

/// Creates the first application window using the shared desktop chrome configuration.
pub fn create_main_window(app: &AppHandle) -> Result<(), WindowCreationError> {
    create_window(app, "main")
}

/// Creates a project-home window without copying the caller's workspace state.
#[tauri::command]
pub fn create_new_window(app: AppHandle) -> Result<(), WindowCreationError> {
    let label = window_label(NEXT_WINDOW_SEQUENCE.fetch_add(1, Ordering::Relaxed));
    create_window(&app, &label)
}

fn create_window(app: &AppHandle, label: &str) -> Result<(), WindowCreationError> {
    let window_builder = WebviewWindowBuilder::new(app, label, WebviewUrl::default())
        .title("TeX")
        .inner_size(1400.0, 918.0)
        .min_inner_size(900.0, 600.0)
        .center();

    #[cfg(target_os = "macos")]
    let window_builder = window_builder
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(LogicalPosition::new(12.0, 10.0));

    #[cfg(not(target_os = "macos"))]
    let window_builder = window_builder.decorations(false);

    window_builder.build().map_err(|_| WindowCreationError {
        message: "TeX could not open a new window. Your current window remains available.",
    })?;
    Ok(())
}

fn window_label(sequence: u64) -> String {
    format!("tex-window-{sequence}")
}

#[cfg(test)]
mod tests {
    use super::window_label;

    #[test]
    fn assigns_unique_labels_to_secondary_windows() {
        assert_eq!(window_label(1), "tex-window-1");
        assert_ne!(window_label(1), window_label(2));
    }
}
