#![forbid(unsafe_code)]

mod build_operations;
mod build_system;
#[cfg(test)]
mod latex_fixtures;
mod pdf_read;
mod persistence;
mod project_config;
mod project_files;
mod project_open;
mod project_search;
mod readiness;
pub mod root_detection;
mod source_edit;
mod source_read;
mod synctex;
mod watch_system;

#[cfg(target_os = "macos")]
use tauri::{LogicalPosition, TitleBarStyle};
use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_log::{Target, TargetKind};

/// Starts the desktop application and registers its validated local capabilities.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(build_system::BuildController::default())
        .manage(watch_system::WatchController::default())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let window_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
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

            window_builder.build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            readiness::phase_zero_readiness,
            project_open::open_project,
            project_files::create_project_entry,
            project_files::rename_project_entry,
            project_files::delete_project_entry,
            persistence::forget_recent_project,
            persistence::load_startup_state,
            persistence::load_app_preferences,
            persistence::save_app_preferences,
            persistence::save_workspace_state,
            project_config::load_project_build_configuration,
            project_config::save_project_build_configuration,
            pdf_read::read_project_pdf,
            pdf_read::project_pdf_revision,
            source_read::read_project_source,
            source_edit::save_project_source,
            source_edit::save_recovery_draft,
            source_edit::load_recovery_draft,
            source_edit::discard_recovery_draft,
            project_search::search_project_sources,
            project_search::replace_project_sources,
            project_search::undo_project_replace,
            build_system::preview_build,
            build_system::get_build_profiles,
            build_system::start_build,
            build_system::stop_build,
            build_system::get_build_history,
            build_operations::preview_clean_auxiliary_files,
            build_operations::clean_auxiliary_files,
            build_operations::reveal_project_output,
            watch_system::start_project_watch,
            watch_system::stop_project_watch,
            watch_system::get_project_watch_status,
            watch_system::start_project_tree_watch,
            watch_system::stop_project_tree_watch,
            synctex::synctex_forward_search,
            synctex::synctex_inverse_search,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run the TeX desktop application");
}
