use std::{
    collections::HashMap,
    error::Error,
    fmt, fs,
    io::{self, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::{bounded_io, project_access::ProjectAccess};

const STATE_FILE_NAME: &str = "workspace-state.json";
const STATE_VERSION: u8 = 2;
const DEFAULT_SIDEBAR_WIDTH: u16 = 288;
const MIN_SIDEBAR_WIDTH: u16 = 220;
const MAX_SIDEBAR_WIDTH: u16 = 4096;
const DEFAULT_PDF_PANE_WIDTH: u16 = 480;
const DEFAULT_BUILD_PANEL_HEIGHT: u16 = 240;
const MIN_PANE_SIZE: u16 = 160;
const MAX_PANE_SIZE: u16 = 4096;
const MAX_RECENT_PROJECTS: usize = 12;
const MAX_STATE_BYTES: u64 = 4 * 1024 * 1024;
const MAX_WORKSPACE_FILES: usize = 256;

/// Serializes read-modify-write access to the single on-disk state file. Atomic
/// writes keep each file whole, but without this a mutation in one window could
/// read stale state and clobber a concurrent mutation from another window.
static STATE_WRITE_LOCK: Mutex<()> = Mutex::new(());

fn lock_state_writes() -> std::sync::MutexGuard<'static, ()> {
    STATE_WRITE_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupState {
    pub recent_projects: Vec<RecentProject>,
    pub last_workspace: Option<WorkspaceState>,
    pub restoration_notice: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceState {
    pub project_path: String,
    #[serde(default)]
    pub pinned_files: Vec<String>,
    pub selected_root: Option<String>,
    pub selected_file: Option<String>,
    pub sidebar_width: u16,
    #[serde(default = "default_editor_font_size")]
    pub editor_font_size: u8,
    #[serde(default = "default_true")]
    pub pdf_pane_open: bool,
    #[serde(default = "default_pdf_pane_width")]
    pub pdf_pane_width: u16,
    #[serde(default)]
    pub build_panel_open: bool,
    #[serde(default = "default_build_panel_height")]
    pub build_panel_height: u16,
    #[serde(default)]
    pub sidebar_tab: ProjectSidebarTab,
    #[serde(default)]
    pub build_panel_tab: BuildPanelTab,
    #[serde(default)]
    pub bottom_panel_tab: BottomPanelTab,
    #[serde(default)]
    pub build_profile: BuildProfile,
    #[serde(default)]
    pub selected_pdf: Option<String>,
    #[serde(default)]
    pub pdf_viewer_states: HashMap<String, PdfViewerState>,
    #[serde(default)]
    pub editor_viewer_states: HashMap<String, EditorViewerState>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectSidebarTab {
    #[default]
    Files,
    Outline,
    References,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BuildPanelTab {
    #[default]
    Output,
    Problems,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BottomPanelTab {
    #[default]
    Build,
    Terminal,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BuildProfile {
    #[default]
    LatexmkPdf,
    PdfLatex,
    XeLatex,
    LuaLatex,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditorViewerState {
    pub line: u32,
    pub column: u32,
    pub scroll_top: f64,
    pub scroll_left: f64,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PdfViewerState {
    pub page: u32,
    pub position: f64,
    pub zoom: f64,
    pub rotation: u16,
    pub layout: PdfLayoutMode,
    pub sidebar: PdfSidebarMode,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PdfLayoutMode {
    Continuous,
    Single,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistedState {
    version: u8,
    recent_projects: Vec<PersistedRecentProject>,
    last_workspace: Option<WorkspaceState>,
    #[serde(default)]
    preferences: AppPreferences,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistedRecentProject {
    name: String,
    path: String,
    last_opened_at: u64,
}

struct ReadState {
    state: PersistedState,
    restoration_notice: Option<String>,
    migrated: bool,
    writable: bool,
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
    let _state_guard = lock_state_writes();
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
pub fn load_startup_state(
    app: AppHandle,
    access: State<'_, ProjectAccess>,
) -> Result<StartupState, PersistenceError> {
    let startup = load_startup_state_from_path(&state_path(&app)?)?;
    approve_restorable_projects(&access, &startup);
    Ok(startup)
}

/// Removes a project from local recents without touching its source directory.
#[tauri::command]
pub fn forget_recent_project(
    app: AppHandle,
    project_path: String,
    access: State<'_, ProjectAccess>,
) -> Result<StartupState, PersistenceError> {
    let path = state_path(&app)?;
    let _state_guard = lock_state_writes();
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
    access.revoke(&project_path);
    startup_state_from_persisted(state)
}

/// Persists validated workspace context outside the user's project directory.
#[tauri::command]
pub fn save_workspace_state(
    app: AppHandle,
    workspace: WorkspaceState,
    access: State<'_, ProjectAccess>,
) -> Result<(), PersistenceError> {
    if workspace.pinned_files.len() > MAX_WORKSPACE_FILES
        || workspace.pdf_viewer_states.len() > MAX_WORKSPACE_FILES
        || workspace.editor_viewer_states.len() > MAX_WORKSPACE_FILES
    {
        return Err(PersistenceError {
            code: "workspace-too-large",
            message: "Workspace state exceeds the supported open-file limit.",
        });
    }
    let canonical_root = access
        .resolve(&workspace.project_path)
        .map_err(|_| unavailable())?;

    validate_optional_file(&canonical_root, workspace.selected_root.as_deref())?;
    validate_optional_file(&canonical_root, workspace.selected_file.as_deref())?;
    validate_optional_pdf(&canonical_root, workspace.selected_pdf.as_deref())?;
    for path in &workspace.pinned_files {
        validate_optional_file(&canonical_root, Some(path))?;
    }
    for (path, viewer) in &workspace.pdf_viewer_states {
        validate_optional_pdf(&canonical_root, Some(path))?;
        if !valid_pdf_viewer_state(viewer) {
            return Err(unavailable());
        }
    }
    for (path, viewer) in &workspace.editor_viewer_states {
        validate_optional_file(&canonical_root, Some(path))?;
        if !valid_editor_viewer_state(viewer) {
            return Err(unavailable());
        }
    }

    let path = state_path(&app)?;
    let _state_guard = lock_state_writes();
    let mut state = read_state(&path)?;
    state.last_workspace = Some(WorkspaceState {
        sidebar_width: workspace
            .sidebar_width
            .clamp(MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH),
        editor_font_size: workspace.editor_font_size.clamp(11, 24),
        pdf_pane_width: workspace.pdf_pane_width.clamp(MIN_PANE_SIZE, MAX_PANE_SIZE),
        build_panel_height: workspace
            .build_panel_height
            .clamp(MIN_PANE_SIZE, MAX_PANE_SIZE),
        ..workspace
    });
    write_state(&path, &state)
}

fn approve_restorable_projects(access: &ProjectAccess, startup: &StartupState) {
    // Approve only the workspace actually being restored on launch. Recent
    // projects are approved lazily when the user reopens one (see
    // `approve_if_recent`), so session authority stays scoped to the project in
    // use instead of every directory in the recents list.
    if let Some(workspace) = &startup.last_workspace {
        let _ = access.approve(Path::new(&workspace.project_path));
    }
}

/// Grants session authority for `project_path` only if it is present in the
/// Rust-owned recents list (or is the restored workspace), so a recent project
/// can be reopened on demand without pre-approving every recent for the whole
/// session. Returns whether authority was granted.
pub fn approve_if_recent(app: &AppHandle, access: &ProjectAccess, project_path: &str) -> bool {
    let Ok(path) = state_path(app) else {
        return false;
    };
    let Ok(state) = read_state(&path) else {
        return false;
    };
    let known = state
        .recent_projects
        .iter()
        .any(|project| project.path == project_path)
        || state
            .last_workspace
            .as_ref()
            .is_some_and(|workspace| workspace.project_path == project_path);
    known && access.approve(Path::new(project_path)).is_ok()
}

pub fn record_project_opened(
    app: &AppHandle,
    name: &str,
    project_path: &Path,
) -> Result<(), PersistenceError> {
    let path = state_path(app)?;
    let _state_guard = lock_state_writes();
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
        pdf_pane_open: true,
        pdf_pane_width: default_pdf_pane_width(),
        build_panel_open: false,
        build_panel_height: default_build_panel_height(),
        sidebar_tab: ProjectSidebarTab::default(),
        build_panel_tab: BuildPanelTab::default(),
        bottom_panel_tab: BottomPanelTab::default(),
        build_profile: BuildProfile::default(),
        selected_pdf: None,
        pdf_viewer_states: HashMap::new(),
        editor_viewer_states: HashMap::new(),
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
    let _state_guard = lock_state_writes();
    let read = read_state_with_notice(path)?;
    if read.migrated {
        write_state(path, &read.state)?;
    }
    let mut startup = startup_state_from_persisted(read.state)?;
    startup.restoration_notice =
        combine_notices(read.restoration_notice, startup.restoration_notice);
    Ok(startup)
}

fn startup_state_from_persisted(
    mut state: PersistedState,
) -> Result<StartupState, PersistenceError> {
    state.recent_projects.truncate(MAX_RECENT_PROJECTS);
    let mut restoration_notice = None;
    let had_last_workspace = state.last_workspace.is_some();
    let last_workspace = state.last_workspace.take().and_then(|mut workspace| {
        let root = Path::new(&workspace.project_path).canonicalize().ok()?;
        if !root.is_dir() {
            return None;
        }

        if !optional_file_exists_within(&root, workspace.selected_root.as_deref()) {
            workspace.selected_root = None;
            append_notice(
                &mut restoration_notice,
                "The previous root file is no longer available. Choose another root file."
                    .to_owned(),
            );
        }
        if !optional_file_exists_within(&root, workspace.selected_file.as_deref()) {
            workspace.selected_file = None;
            append_notice(
                &mut restoration_notice,
                "The previously open file is no longer available. The project was restored safely."
                    .to_owned(),
            );
        }
        if !optional_pdf_exists_within(&root, workspace.selected_pdf.as_deref()) {
            workspace.selected_pdf = None;
            append_notice(
                &mut restoration_notice,
                "The previously open PDF is no longer available. The project was restored safely."
                    .to_owned(),
            );
        }
        let pdf_state_count = workspace.pdf_viewer_states.len();
        let pinned_file_count = workspace.pinned_files.len();
        let editor_state_count = workspace.editor_viewer_states.len();
        workspace.pdf_viewer_states.retain(|path, viewer| {
            optional_pdf_exists_within(&root, Some(path)) && valid_pdf_viewer_state(viewer)
        });
        workspace
            .pinned_files
            .retain(|path| optional_file_exists_within(&root, Some(path)));
        workspace.editor_viewer_states.retain(|path, viewer| {
            optional_file_exists_within(&root, Some(path)) && valid_editor_viewer_state(viewer)
        });
        workspace.pinned_files.truncate(MAX_WORKSPACE_FILES);
        retain_bounded(&mut workspace.pdf_viewer_states, MAX_WORKSPACE_FILES);
        retain_bounded(&mut workspace.editor_viewer_states, MAX_WORKSPACE_FILES);
        if pdf_state_count != workspace.pdf_viewer_states.len()
            || pinned_file_count != workspace.pinned_files.len()
            || editor_state_count != workspace.editor_viewer_states.len()
        {
            append_notice(
                &mut restoration_notice,
                "Some unavailable file, editor, or PDF positions were not restored.".to_owned(),
            );
        }
        workspace.sidebar_width = workspace
            .sidebar_width
            .clamp(MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
        workspace.editor_font_size = workspace.editor_font_size.clamp(11, 24);
        workspace.pdf_pane_width = workspace.pdf_pane_width.clamp(MIN_PANE_SIZE, MAX_PANE_SIZE);
        workspace.build_panel_height = workspace
            .build_panel_height
            .clamp(MIN_PANE_SIZE, MAX_PANE_SIZE);
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
    let read = read_state_with_notice(path)?;
    if !read.writable {
        return Err(unavailable());
    }
    Ok(read.state)
}

fn read_state_with_notice(path: &Path) -> Result<ReadState, PersistenceError> {
    let source = match bounded_io::read(path, MAX_STATE_BYTES) {
        Ok(source) => source,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(ReadState {
                state: PersistedState::default(),
                restoration_notice: None,
                migrated: false,
                writable: true,
            })
        }
        Err(error) if error.kind() == io::ErrorKind::InvalidData => return Ok(corrupted_state()),
        Err(_) => return Err(unavailable()),
    };
    let value: serde_json::Value = match serde_json::from_slice(&source) {
        Ok(value) => value,
        Err(_) => return Ok(corrupted_state()),
    };
    let Some(version) = value.get("version").and_then(serde_json::Value::as_u64) else {
        return Ok(corrupted_state());
    };
    match version {
        1 => {
            let mut state: PersistedState = match serde_json::from_value(value) {
                Ok(state) => state,
                Err(_) => return Ok(corrupted_state()),
            };
            state.version = STATE_VERSION;
            Ok(ReadState {
                state,
                restoration_notice: Some(
                    "The saved workspace was upgraded. New pane and tab settings use safe defaults."
                        .to_owned(),
                ),
                migrated: true,
                writable: true,
            })
        }
        current if current == u64::from(STATE_VERSION) => {
            let state = match serde_json::from_value(value) {
                Ok(state) => state,
                Err(_) => return Ok(corrupted_state()),
            };
            Ok(ReadState {
                state,
                restoration_notice: None,
                migrated: false,
                writable: true,
            })
        }
        _ => Ok(ReadState {
            state: PersistedState::default(),
            restoration_notice: Some(
                "The saved workspace uses an unsupported version. TeX started with safe defaults."
                    .to_owned(),
            ),
            migrated: false,
            writable: false,
        }),
    }
}

fn corrupted_state() -> ReadState {
    ReadState {
        state: PersistedState::default(),
        restoration_notice: Some(
            "The saved workspace could not be read. TeX started with safe defaults.".to_owned(),
        ),
        migrated: false,
        writable: true,
    }
}

fn combine_notices(first: Option<String>, second: Option<String>) -> Option<String> {
    match (first, second) {
        (Some(first), Some(second)) => Some(format!("{first} {second}")),
        (Some(notice), None) | (None, Some(notice)) => Some(notice),
        (None, None) => None,
    }
}

fn append_notice(notice: &mut Option<String>, next: String) {
    *notice = combine_notices(notice.take(), Some(next));
}

fn write_state(path: &Path, state: &PersistedState) -> Result<(), PersistenceError> {
    let parent = path.parent().ok_or_else(unavailable)?;
    fs::create_dir_all(parent).map_err(|_| unavailable())?;
    let encoded = serde_json::to_vec_pretty(state).map_err(|_| unavailable())?;
    if encoded.len() as u64 > MAX_STATE_BYTES {
        return Err(PersistenceError {
            code: "workspace-too-large",
            message: "Workspace state exceeds the supported persistence limit.",
        });
    }
    let mut temporary = AtomicWriteFile::open(path).map_err(|_| unavailable())?;
    temporary.write_all(&encoded).map_err(|_| unavailable())?;
    temporary.commit().map_err(|_| unavailable())
}

fn retain_bounded<K, V>(values: &mut HashMap<K, V>, limit: usize)
where
    K: Eq + std::hash::Hash,
{
    let mut retained = 0_usize;
    values.retain(|_, _| {
        retained += 1;
        retained <= limit
    });
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

fn valid_editor_viewer_state(viewer: &EditorViewerState) -> bool {
    viewer.line > 0
        && viewer.column > 0
        && viewer.scroll_top.is_finite()
        && viewer.scroll_left.is_finite()
        && viewer.scroll_top >= 0.0
        && viewer.scroll_left >= 0.0
}

fn valid_pdf_viewer_state(viewer: &PdfViewerState) -> bool {
    viewer.position.is_finite()
        && viewer.zoom.is_finite()
        && (0.0..=1.0).contains(&viewer.position)
        && (0.25..=5.0).contains(&viewer.zoom)
        && matches!(viewer.rotation, 0 | 90 | 180 | 270)
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

const fn default_true() -> bool {
    true
}

const fn default_pdf_pane_width() -> u16 {
    DEFAULT_PDF_PANE_WIDTH
}

const fn default_build_panel_height() -> u16 {
    DEFAULT_BUILD_PANEL_HEIGHT
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
        load_startup_state_from_path, read_state, write_state, AppPreferences, BottomPanelTab,
        BuildPanelTab,
        BuildProfile, EditorViewerState, PdfLayoutMode, PdfSidebarMode, PdfViewerState,
        PersistedRecentProject, PersistedState, ProjectAvailability, ProjectSidebarTab,
        WorkspaceState, STATE_VERSION,
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
                    pdf_pane_open: true,
                    pdf_pane_width: 480,
                    build_panel_open: false,
                    build_panel_height: 240,
                    sidebar_tab: super::ProjectSidebarTab::Files,
                    build_panel_tab: super::BuildPanelTab::Output,
                    bottom_panel_tab: super::BottomPanelTab::default(),
                    build_profile: super::BuildProfile::LatexmkPdf,
                    selected_pdf: None,
                    pdf_viewer_states: HashMap::new(),
                    editor_viewer_states: HashMap::new(),
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

    #[test]
    fn version_one_state_is_migrated_with_safe_workspace_defaults(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let directory = std::env::temp_dir().join(format!("tex-persistence-migration-{unique}"));
        let project = directory.join("project");
        fs::create_dir_all(&project)?;
        fs::write(project.join("main.tex"), "\\documentclass{article}")?;
        let state_path = directory.join("state.json");
        fs::write(
            &state_path,
            serde_json::to_vec(&serde_json::json!({
                "version": 1,
                "recentProjects": [],
                "lastWorkspace": {
                    "projectPath": project.to_string_lossy(),
                    "pinnedFiles": ["main.tex"],
                    "selectedRoot": "main.tex",
                    "selectedFile": "main.tex",
                    "sidebarWidth": 300,
                    "editorFontSize": 15,
                    "selectedPdf": null,
                    "pdfViewerStates": {}
                },
                "preferences": { "colorTheme": "system", "accentColor": "#2563eb" }
            }))?,
        )?;

        let startup = load_startup_state_from_path(&state_path)?;
        let workspace = startup.last_workspace.ok_or("workspace was not restored")?;
        assert!(workspace.pdf_pane_open);
        assert_eq!(workspace.pdf_pane_width, 480);
        assert_eq!(workspace.build_panel_height, 240);
        assert!(startup
            .restoration_notice
            .is_some_and(|notice| notice.contains("upgraded")));
        let migrated: serde_json::Value = serde_json::from_slice(&fs::read(&state_path)?)?;
        assert_eq!(migrated["version"], STATE_VERSION);

        fs::remove_dir_all(directory)?;
        Ok(())
    }

    #[test]
    fn corrupted_state_uses_defaults_with_a_specific_notice(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let directory = std::env::temp_dir().join(format!("tex-persistence-corrupt-{unique}"));
        fs::create_dir_all(&directory)?;
        let state_path = directory.join("state.json");
        fs::write(&state_path, b"{not-json")?;

        let startup = load_startup_state_from_path(&state_path)?;
        assert!(startup.last_workspace.is_none());
        assert!(startup.recent_projects.is_empty());
        assert!(startup
            .restoration_notice
            .is_some_and(|notice| notice.contains("could not be read")));

        fs::remove_dir_all(directory)?;
        Ok(())
    }

    #[test]
    fn newer_schema_falls_back_without_becoming_writable() -> Result<(), Box<dyn std::error::Error>>
    {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let directory = std::env::temp_dir().join(format!("tex-persistence-newer-{unique}"));
        fs::create_dir_all(&directory)?;
        let state_path = directory.join("state.json");
        fs::write(
            &state_path,
            br#"{"version":99,"recentProjects":[],"lastWorkspace":null}"#,
        )?;

        let startup = load_startup_state_from_path(&state_path)?;
        assert!(startup.last_workspace.is_none());
        assert!(startup
            .restoration_notice
            .is_some_and(|notice| notice.contains("unsupported version")));
        assert!(read_state(&state_path).is_err());

        fs::remove_dir_all(directory)?;
        Ok(())
    }

    #[test]
    fn milestone_one_workspace_context_round_trips() -> Result<(), Box<dyn std::error::Error>> {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let directory = std::env::temp_dir().join(format!("tex-persistence-context-{unique}"));
        fs::create_dir_all(&directory)?;
        let state_path = directory.join("state.json");
        let workspace = WorkspaceState {
            project_path: directory.to_string_lossy().into_owned(),
            pinned_files: vec!["main.tex".to_owned()],
            selected_root: Some("main.tex".to_owned()),
            selected_file: Some("main.tex".to_owned()),
            sidebar_width: 312,
            editor_font_size: 16,
            pdf_pane_open: false,
            pdf_pane_width: 560,
            build_panel_open: true,
            build_panel_height: 280,
            sidebar_tab: ProjectSidebarTab::References,
            build_panel_tab: BuildPanelTab::Problems,
            bottom_panel_tab: BottomPanelTab::Terminal,
            build_profile: BuildProfile::LuaLatex,
            selected_pdf: Some("main.pdf".to_owned()),
            pdf_viewer_states: HashMap::from([(
                "main.pdf".to_owned(),
                PdfViewerState {
                    page: 3,
                    position: 0.4,
                    zoom: 1.25,
                    rotation: 90,
                    layout: PdfLayoutMode::Single,
                    sidebar: PdfSidebarMode::Outline,
                },
            )]),
            editor_viewer_states: HashMap::from([(
                "main.tex".to_owned(),
                EditorViewerState {
                    line: 42,
                    column: 7,
                    scroll_top: 900.0,
                    scroll_left: 12.0,
                },
            )]),
        };
        write_state(
            &state_path,
            &PersistedState {
                version: STATE_VERSION,
                recent_projects: Vec::new(),
                last_workspace: Some(workspace.clone()),
                preferences: AppPreferences::default(),
            },
        )?;

        assert_eq!(read_state(&state_path)?.last_workspace, Some(workspace));

        fs::remove_dir_all(directory)?;
        Ok(())
    }
}
