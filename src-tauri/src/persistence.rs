use std::{
    collections::HashMap,
    error::Error,
    fmt, fs,
    io::{self, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const STATE_FILE_NAME: &str = "workspace-state.json";
const STATE_VERSION: u8 = 1;
const DEFAULT_SIDEBAR_WIDTH: u16 = 288;
const MIN_SIDEBAR_WIDTH: u16 = 220;
const MAX_SIDEBAR_WIDTH: u16 = 4096;
const MAX_RECENT_PROJECTS: usize = 12;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupState {
    pub recent_projects: Vec<RecentProject>,
    pub last_workspace: Option<WorkspaceState>,
    pub restoration_notice: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    pub color_theme: ColorTheme,
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ColorTheme {
    System,
    Light,
    Dark,
    Custom,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            color_theme: ColorTheme::System,
            accent_color: default_accent_color(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub name: String,
    pub path: String,
    pub last_opened_at: u64,
    pub availability: ProjectAvailability,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectAvailability {
    Available,
    Missing,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub project_path: String,
    #[serde(default)]
    pub pinned_files: Vec<String>,
    pub selected_root: Option<String>,
    pub selected_file: Option<String>,
    pub sidebar_width: u16,
    #[serde(default = "default_editor_font_size")]
    pub editor_font_size: u8,
    #[serde(default)]
    pub selected_pdf: Option<String>,
    #[serde(default)]
    pub pdf_viewer_states: HashMap<String, PdfViewerState>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfViewerState {
    pub page: u32,
    pub position: f64,
    pub zoom: f64,
    pub rotation: u16,
    pub layout: PdfLayoutMode,
    pub sidebar: PdfSidebarMode,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PdfLayoutMode {
    Continuous,
    Single,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PdfSidebarMode {
    None,
    Outline,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistenceError {
    pub code: &'static str,
    pub message: &'static str,
}

impl fmt::Display for PersistenceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.message)
    }
}

impl Error for PersistenceError {}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedState {
    version: u8,
    recent_projects: Vec<PersistedRecentProject>,
    last_workspace: Option<WorkspaceState>,
    #[serde(default)]
    preferences: AppPreferences,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedRecentProject {
    name: String,
    path: String,
    last_opened_at: u64,
}

impl Default for PersistedState {
    fn default() -> Self {
        Self {
            version: STATE_VERSION,
            recent_projects: Vec::new(),
            last_workspace: None,
            preferences: AppPreferences::default(),
        }
    }
}

/// Loads local application preferences without accessing project files.
#[tauri::command]
pub fn load_app_preferences(app: AppHandle) -> Result<AppPreferences, PersistenceError> {
    Ok(read_state(&state_path(&app)?)?.preferences)
}

/// Persists validated application preferences outside the user's projects.
#[tauri::command]
pub fn save_app_preferences(
    app: AppHandle,
    preferences: AppPreferences,
) -> Result<(), PersistenceError> {
    if !is_hex_color(&preferences.accent_color) {
        return Err(PersistenceError {
            code: "invalid-preference",
            message: "The selected accent color is not valid.",
        });
    }
    let path = state_path(&app)?;
    let mut state = read_state(&path)?;
    state.preferences = preferences;
    write_state(&path, &state)
}

fn default_accent_color() -> String {
    "#2563eb".to_owned()
}

fn is_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
}

/// Loads local application metadata and validates restorable paths before exposing them.
#[tauri::command]
pub fn load_startup_state(app: AppHandle) -> Result<StartupState, PersistenceError> {
    load_startup_state_from_path(&state_path(&app)?)
}

/// Removes a project from local recents without touching its source directory.
#[tauri::command]
pub fn forget_recent_project(
    app: AppHandle,
    project_path: String,
) -> Result<StartupState, PersistenceError> {
    let path = state_path(&app)?;
    let mut state = read_state(&path)?;
    state
        .recent_projects
        .retain(|project| project.path != project_path);
    if state
        .last_workspace
        .as_ref()
        .is_some_and(|workspace| workspace.project_path == project_path)
    {
        state.last_workspace = None;
    }
    write_state(&path, &state)?;
    startup_state_from_persisted(state)
}

/// Persists validated workspace context outside the user's project directory.
#[tauri::command]
pub fn save_workspace_state(
    app: AppHandle,
    workspace: WorkspaceState,
) -> Result<(), PersistenceError> {
    let canonical_root = Path::new(&workspace.project_path)
        .canonicalize()
        .map_err(|_| unavailable())?;
    if !canonical_root.is_dir() {
        return Err(unavailable());
    }

    validate_optional_file(&canonical_root, workspace.selected_root.as_deref())?;
    validate_optional_file(&canonical_root, workspace.selected_file.as_deref())?;
    validate_optional_pdf(&canonical_root, workspace.selected_pdf.as_deref())?;
    for path in &workspace.pinned_files {
        validate_optional_file(&canonical_root, Some(path))?;
    }
    for (path, viewer) in &workspace.pdf_viewer_states {
        validate_optional_pdf(&canonical_root, Some(path))?;
        if !viewer.position.is_finite()
            || !viewer.zoom.is_finite()
            || !(0.0..=1.0).contains(&viewer.position)
            || !(0.25..=5.0).contains(&viewer.zoom)
            || !matches!(viewer.rotation, 0 | 90 | 180 | 270)
        {
            return Err(unavailable());
        }
    }

    let path = state_path(&app)?;
    let mut state = read_state(&path)?;
    state.last_workspace = Some(WorkspaceState {
        sidebar_width: workspace
            .sidebar_width
            .clamp(MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH),
        editor_font_size: workspace.editor_font_size.clamp(11, 24),
        ..workspace
    });
    write_state(&path, &state)
}

pub fn record_project_opened(
    app: &AppHandle,
    name: &str,
    project_path: &Path,
) -> Result<(), PersistenceError> {
    let path = state_path(app)?;
    let mut state = read_state(&path)?;
    let path_text = project_path.to_string_lossy().into_owned();
    state
        .recent_projects
        .retain(|project| project.path != path_text);
    state.recent_projects.insert(
        0,
        PersistedRecentProject {
            name: name.to_owned(),
            path: path_text.clone(),
            last_opened_at: now_millis(),
        },
    );
    state.recent_projects.truncate(MAX_RECENT_PROJECTS);
    state.last_workspace = Some(WorkspaceState {
        project_path: path_text,
        pinned_files: Vec::new(),
        selected_root: None,
        selected_file: None,
        sidebar_width: DEFAULT_SIDEBAR_WIDTH,
        editor_font_size: default_editor_font_size(),
        selected_pdf: None,
        pdf_viewer_states: HashMap::new(),
    });
    write_state(&path, &state)
}

fn state_path(app: &AppHandle) -> Result<PathBuf, PersistenceError> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(STATE_FILE_NAME))
        .map_err(|_| unavailable())
}

fn load_startup_state_from_path(path: &Path) -> Result<StartupState, PersistenceError> {
    startup_state_from_persisted(read_state(path)?)
}

fn startup_state_from_persisted(
    mut state: PersistedState,
) -> Result<StartupState, PersistenceError> {
    let mut restoration_notice = None;
    let had_last_workspace = state.last_workspace.is_some();
    let last_workspace = state.last_workspace.take().and_then(|mut workspace| {
        let root = Path::new(&workspace.project_path).canonicalize().ok()?;
        if !root.is_dir() {
            return None;
        }

        if !optional_file_exists_within(&root, workspace.selected_root.as_deref()) {
            workspace.selected_root = None;
            restoration_notice = Some(
                "The previous root file is no longer available. Choose another root file."
                    .to_owned(),
            );
        }
        if !optional_file_exists_within(&root, workspace.selected_file.as_deref()) {
            workspace.selected_file = None;
            restoration_notice = Some(
                "The previously open file is no longer available. The project was restored safely."
                    .to_owned(),
            );
        }
        if !optional_pdf_exists_within(&root, workspace.selected_pdf.as_deref()) {
            workspace.selected_pdf = None;
            restoration_notice = Some(
                "The previously open PDF is no longer available. The project was restored safely."
                    .to_owned(),
            );
        }
        workspace
            .pdf_viewer_states
            .retain(|path, _| optional_pdf_exists_within(&root, Some(path)));
        workspace
            .pinned_files
            .retain(|path| optional_file_exists_within(&root, Some(path)));
        workspace.sidebar_width = workspace
            .sidebar_width
            .clamp(MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
        workspace.editor_font_size = workspace.editor_font_size.clamp(11, 24);
        Some(workspace)
    });

    if had_last_workspace && last_workspace.is_none() {
        restoration_notice = Some(
            "The previous project is no longer available. Choose it again or forget it below."
                .to_owned(),
        );
    }

    let recent_projects = state
        .recent_projects
        .into_iter()
        .map(|project| RecentProject {
            availability: if Path::new(&project.path).is_dir() {
                ProjectAvailability::Available
            } else {
                ProjectAvailability::Missing
            },
            name: project.name,
            path: project.path,
            last_opened_at: project.last_opened_at,
        })
        .collect();

    Ok(StartupState {
        recent_projects,
        last_workspace,
        restoration_notice,
    })
}

fn read_state(path: &Path) -> Result<PersistedState, PersistenceError> {
    let source = match fs::read(path) {
        Ok(source) => source,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(PersistedState::default())
        }
        Err(_) => return Err(unavailable()),
    };
    let state: PersistedState = serde_json::from_slice(&source).map_err(|_| unavailable())?;
    if state.version != STATE_VERSION {
        return Ok(PersistedState::default());
    }
    Ok(state)
}

fn write_state(path: &Path, state: &PersistedState) -> Result<(), PersistenceError> {
    let parent = path.parent().ok_or_else(unavailable)?;
    fs::create_dir_all(parent).map_err(|_| unavailable())?;
    let encoded = serde_json::to_vec_pretty(state).map_err(|_| unavailable())?;
    let mut temporary = AtomicWriteFile::open(path).map_err(|_| unavailable())?;
    temporary.write_all(&encoded).map_err(|_| unavailable())?;
    temporary.commit().map_err(|_| unavailable())
}

fn validate_optional_file(root: &Path, relative: Option<&str>) -> Result<(), PersistenceError> {
    if optional_file_exists_within(root, relative) {
        Ok(())
    } else {
        Err(PersistenceError {
            code: "invalid-workspace-path",
            message: "Workspace state contains a file that is no longer available.",
        })
    }
}

fn validate_optional_pdf(root: &Path, relative: Option<&str>) -> Result<(), PersistenceError> {
    if optional_pdf_exists_within(root, relative) {
        Ok(())
    } else {
        Err(PersistenceError {
            code: "invalid-workspace-path",
            message: "Workspace state contains a PDF that is no longer available.",
        })
    }
}

fn optional_pdf_exists_within(root: &Path, relative: Option<&str>) -> bool {
    let Some(relative) = relative else {
        return true;
    };
    Path::new(relative)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("pdf"))
        && optional_file_exists_within(root, Some(relative))
}

fn optional_file_exists_within(root: &Path, relative: Option<&str>) -> bool {
    let Some(relative) = relative else {
        return true;
    };
    let relative_path = Path::new(relative);
    if relative_path.is_absolute() {
        return false;
    }
    root.join(relative_path)
        .canonicalize()
        .ok()
        .is_some_and(|candidate| candidate.is_file() && candidate.starts_with(root))
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| {
            u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
        })
}

const fn default_editor_font_size() -> u8 {
    14
}

fn unavailable() -> PersistenceError {
    PersistenceError {
        code: "persistence-unavailable",
        message:
            "TeX could not update local workspace metadata. Your project files were not changed.",
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{
        load_startup_state_from_path, write_state, AppPreferences, PersistedRecentProject,
        PersistedState, ProjectAvailability, WorkspaceState, STATE_VERSION,
    };

    #[test]
    fn missing_workspace_files_are_removed_without_losing_the_project(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let directory = std::env::temp_dir().join(format!("tex-persistence-{unique}"));
        let project = directory.join("project");
        fs::create_dir_all(&project)?;
        fs::write(project.join("main.tex"), "\\documentclass{article}")?;
        let state_path = directory.join("state.json");
        write_state(
            &state_path,
            &PersistedState {
                version: STATE_VERSION,
                recent_projects: vec![PersistedRecentProject {
                    name: "Project".to_owned(),
                    path: project.to_string_lossy().into_owned(),
                    last_opened_at: 1,
                }],
                last_workspace: Some(WorkspaceState {
                    project_path: project.to_string_lossy().into_owned(),
                    pinned_files: vec!["main.tex".to_owned()],
                    selected_root: Some("main.tex".to_owned()),
                    selected_file: Some("missing.tex".to_owned()),
                    sidebar_width: 999,
                    editor_font_size: 14,
                    selected_pdf: None,
                    pdf_viewer_states: HashMap::new(),
                }),
                preferences: AppPreferences::default(),
            },
        )?;

        let startup = load_startup_state_from_path(&state_path)?;
        let workspace = startup.last_workspace.ok_or("workspace was not restored")?;
        assert_eq!(workspace.selected_root.as_deref(), Some("main.tex"));
        assert_eq!(workspace.selected_file, None);
        assert_eq!(workspace.sidebar_width, 999);
        assert!(startup.restoration_notice.is_some());
        assert!(matches!(
            startup.recent_projects[0].availability,
            ProjectAvailability::Available
        ));

        fs::remove_dir_all(directory)?;
        Ok(())
    }
}
