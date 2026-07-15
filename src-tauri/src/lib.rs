#![forbid(unsafe_code)]

mod persistence;
mod project_files;
mod project_open;
mod project_search;
mod readiness;
pub mod root_detection;
mod source_edit;
mod source_read;

use tauri_plugin_log::{Target, TargetKind};

/// Starts the desktop application and registers only Phase 0 commands.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            readiness::phase_zero_readiness,
            project_open::open_project,
            project_files::create_project_entry,
            project_files::rename_project_entry,
            project_files::delete_project_entry,
            persistence::forget_recent_project,
            persistence::load_startup_state,
            persistence::save_workspace_state,
            source_read::read_project_source,
            source_edit::save_project_source,
            source_edit::save_recovery_draft,
            source_edit::load_recovery_draft,
            source_edit::discard_recovery_draft,
            project_search::search_project_sources,
            project_search::replace_project_sources,
            project_search::undo_project_replace,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run the TeX desktop application");
}
