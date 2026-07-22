use std::{
    collections::{BTreeSet, HashMap},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, Mutex, MutexGuard,
    },
    thread,
    time::{Duration, Instant},
};

use notify::{
    event::ModifyKind, Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::{
    project_access::ProjectAccess,
    project_config::{load_configuration_for_project, validate_configuration},
};

const WATCH_EVENT: &str = "tex://watch-event";
const PROJECT_FILES_EVENT: &str = "tex://project-files-event";
const DEBOUNCE: Duration = Duration::from_millis(350);
/// Ceiling on the trailing debounce: even under a continuous stream of changes
/// (e.g. a long build churning files) a batch is flushed at least this often
/// rather than being starved until the activity finally quiesces.
const MAX_DEBOUNCE: Duration = Duration::from_secs(2);
const WATCH_CHANNEL_CAPACITY: usize = 1_024;
const MAX_PENDING_PATHS: usize = 1_024;
const MAX_ACTIVE_WATCHES: usize = 16;
const GENERATED_DIRECTORIES: [&str; 7] =
    [".git", ".cache", "build", "dist", "out", "output", "target"];
const GENERATED_EXTENSIONS: [&str; 19] = [
    "aux",
    "bbl",
    "bcf",
    "blg",
    "fdb_latexmk",
    "fls",
    "glg",
    "glo",
    "gls",
    "idx",
    "ilg",
    "ind",
    "lof",
    "log",
    "lot",
    "nav",
    "out",
    "snm",
    "toc",
];
const BUILD_INPUT_EXTENSIONS: [&str; 7] = ["bib", "bst", "cls", "ltx", "sty", "tex", "tikz"];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WatchStatus {
    Off,
    Starting,
    Watching,
    BuildQueued,
    Stopping,
    Error,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "camelCase")]
enum ProjectChangeKind {
    Create,
    Modify,
    Remove,
    Rename,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum WatchEvent {
    Status {
        project_path: String,
        status: WatchStatus,
        message: Option<&'static str>,
    },
    Changed {
        project_path: String,
        changes: Vec<ProjectChangeKind>,
        paths: Vec<String>,
        truncated: bool,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchError {
    code: &'static str,
    message: &'static str,
}

#[derive(Clone, Default)]
pub struct WatchController {
    projects: Arc<Mutex<HashMap<PathBuf, ActiveWatch>>>,
    tree_projects: Arc<Mutex<HashMap<PathBuf, ActiveTreeWatch>>>,
    next_tree_generation: Arc<AtomicU64>,
}

struct ActiveWatch {
    status: WatchStatus,
    stop: mpsc::Sender<()>,
}

struct ActiveTreeWatch {
    /// Distinguishes successive watchers for the same project so a worker that
    /// is shutting down never evicts the registration of its replacement.
    generation: u64,
    stop: mpsc::Sender<()>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFilesEvent {
    project_path: String,
}

/// Starts a lightweight watcher that keeps the project tree current without triggering builds.
#[tauri::command]
pub fn start_project_tree_watch(
    project_path: String,
    app: AppHandle,
    controller: State<'_, WatchController>,
    access: State<'_, ProjectAccess>,
) -> Result<(), WatchError> {
    let root = access
        .resolve(&project_path)
        .map_err(|_| watch_unavailable())?;
    let (stop_sender, stop_receiver) = mpsc::channel();
    let generation = controller
        .next_tree_generation
        .fetch_add(1, Ordering::Relaxed);
    {
        let mut projects = controller
            .tree_projects
            .lock()
            .map_err(|_| watch_unavailable())?;
        if projects.contains_key(&root) {
            return Ok(());
        }
        if projects.len() >= MAX_ACTIVE_WATCHES {
            return Err(watch_capacity());
        }
        projects.insert(
            root.clone(),
            ActiveTreeWatch {
                generation,
                stop: stop_sender,
            },
        );
    }

    let owned = controller.inner().clone();
    let worker_root = root.clone();
    if thread::Builder::new()
        .name("tex-project-tree-watch".to_owned())
        .spawn(move || run_tree_watch(app, owned, worker_root, generation, stop_receiver))
        .is_err()
    {
        remove_tree_watch(&controller, &root, generation);
        return Err(watch_unavailable());
    }
    Ok(())
}

#[tauri::command]
pub fn stop_project_tree_watch(
    project_path: String,
    controller: State<'_, WatchController>,
    access: State<'_, ProjectAccess>,
) -> Result<(), WatchError> {
    let root = access
        .resolve(&project_path)
        .map_err(|_| watch_unavailable())?;
    let mut projects = controller
        .tree_projects
        .lock()
        .map_err(|_| watch_unavailable())?;
    // Deregister before signalling: the worker only notices the stop on its next
    // poll, and until then a restart for the same project would be swallowed as
    // "already watching" and leave the tree with no watcher at all.
    if let Some(watch) = projects.remove(&root) {
        let _ = watch.stop.send(());
    }
    Ok(())
}

#[tauri::command]
pub fn start_project_watch(
    project_path: String,
    app: AppHandle,
    controller: State<'_, WatchController>,
    access: State<'_, ProjectAccess>,
) -> Result<(), WatchError> {
    let root = access
        .resolve(&project_path)
        .map_err(|_| watch_unavailable())?;
    let configuration =
        load_configuration_for_project(&app, &root).map_err(|_| watch_unavailable())?;
    validate_configuration(&root, &configuration).map_err(|_| watch_unavailable())?;
    let mut excluded_directories = configuration.generated_directories;
    if let Some(output) = configuration.output_directory {
        excluded_directories.push(output);
    }
    let (stop_sender, stop_receiver) = mpsc::channel();
    {
        let mut projects = lock_projects(&controller)?;
        if projects.contains_key(&root) {
            return Ok(());
        }
        if projects.len() >= MAX_ACTIVE_WATCHES {
            return Err(watch_capacity());
        }
        projects.insert(
            root.clone(),
            ActiveWatch {
                status: WatchStatus::Starting,
                stop: stop_sender,
            },
        );
    }
    emit_status(&app, &root, WatchStatus::Starting, None);

    let owned = controller.inner().clone();
    let worker_app = app.clone();
    let worker_root = root.clone();
    if thread::Builder::new()
        .name("tex-project-watch".to_owned())
        .spawn(move || {
            run_watch(
                worker_app,
                owned,
                worker_root,
                excluded_directories,
                stop_receiver,
            );
        })
        .is_err()
    {
        remove_watch(&controller, &root);
        emit_status(
            &app,
            &root,
            WatchStatus::Error,
            Some("Project watching could not start."),
        );
        return Err(watch_unavailable());
    }
    Ok(())
}

#[tauri::command]
pub fn stop_project_watch(
    project_path: String,
    app: AppHandle,
    controller: State<'_, WatchController>,
    access: State<'_, ProjectAccess>,
) -> Result<(), WatchError> {
    let root = access
        .resolve(&project_path)
        .map_err(|_| watch_unavailable())?;
    let mut projects = lock_projects(&controller)?;
    let active = projects.get_mut(&root).ok_or(WatchError {
        code: "watch-not-running",
        message: "Project watch mode is already off.",
    })?;
    active.status = WatchStatus::Stopping;
    emit_status(&app, &root, WatchStatus::Stopping, None);
    active.stop.send(()).map_err(|_| watch_unavailable())
}

#[tauri::command]
pub fn get_project_watch_status(
    project_path: String,
    controller: State<'_, WatchController>,
    access: State<'_, ProjectAccess>,
) -> Result<WatchStatus, WatchError> {
    let root = access
        .resolve(&project_path)
        .map_err(|_| watch_unavailable())?;
    let projects = lock_projects(&controller)?;
    Ok(projects
        .get(&root)
        .map_or(WatchStatus::Off, |watch| watch.status))
}

/// Acknowledges that the queued change set has been handed to the build controller.
#[tauri::command]
pub fn acknowledge_project_watch_build(
    project_path: String,
    app: AppHandle,
    controller: State<'_, WatchController>,
    access: State<'_, ProjectAccess>,
) -> Result<(), WatchError> {
    let root = access
        .resolve(&project_path)
        .map_err(|_| watch_unavailable())?;
    let mut projects = lock_projects(&controller)?;
    let active = projects.get_mut(&root).ok_or(WatchError {
        code: "watch-not-running",
        message: "Project watch mode is already off.",
    })?;
    if active.status == WatchStatus::BuildQueued {
        active.status = WatchStatus::Watching;
        emit_status(&app, &root, WatchStatus::Watching, None);
    }
    Ok(())
}

fn run_watch(
    app: AppHandle,
    controller: WatchController,
    root: PathBuf,
    excluded_directories: Vec<String>,
    stop_receiver: mpsc::Receiver<()>,
) {
    let (event_sender, event_receiver) = mpsc::sync_channel(WATCH_CHANNEL_CAPACITY);
    let channel_overflowed = Arc::new(AtomicBool::new(false));
    let callback_overflowed = Arc::clone(&channel_overflowed);
    let watcher = RecommendedWatcher::new(
        move |event| {
            if event_sender.try_send(event).is_err() {
                callback_overflowed.store(true, Ordering::Release);
            }
        },
        Config::default(),
    );
    let Ok(mut watcher) = watcher else {
        finish_with_error(&app, &controller, &root);
        return;
    };
    if watcher.watch(&root, RecursiveMode::Recursive).is_err() {
        finish_with_error(&app, &controller, &root);
        return;
    }
    set_status(&app, &controller, &root, WatchStatus::Watching, None);

    let mut pending = PendingChanges::default();
    loop {
        if stop_receiver.try_recv().is_ok() {
            remove_watch(&controller, &root);
            emit_status(&app, &root, WatchStatus::Off, None);
            return;
        }
        match event_receiver.recv_timeout(Duration::from_millis(50)) {
            Ok(Ok(event)) => pending.record(&root, &excluded_directories, event),
            Ok(Err(_)) => {
                finish_with_error(&app, &controller, &root);
                return;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                finish_with_error(&app, &controller, &root);
                return;
            }
        }
        if channel_overflowed.swap(false, Ordering::AcqRel) {
            pending.record_overflow();
        }
        if pending.is_ready() {
            let build_relevant = pending.build_relevant;
            let event = pending.take_event(&root);
            let _ = app.emit(WATCH_EVENT, event);
            if build_relevant {
                set_status(&app, &controller, &root, WatchStatus::BuildQueued, None);
            }
        }
    }
}

fn run_tree_watch(
    app: AppHandle,
    controller: WatchController,
    root: PathBuf,
    generation: u64,
    stop_receiver: mpsc::Receiver<()>,
) {
    let (event_sender, event_receiver) = mpsc::sync_channel(WATCH_CHANNEL_CAPACITY);
    let channel_overflowed = Arc::new(AtomicBool::new(false));
    let callback_overflowed = Arc::clone(&channel_overflowed);
    let watcher = RecommendedWatcher::new(
        move |event| {
            if event_sender.try_send(event).is_err() {
                callback_overflowed.store(true, Ordering::Release);
            }
        },
        Config::default(),
    );
    let Ok(mut watcher) = watcher else {
        remove_tree_watch(&controller, &root, generation);
        return;
    };
    if watcher.watch(&root, RecursiveMode::Recursive).is_err() {
        remove_tree_watch(&controller, &root, generation);
        return;
    }

    let mut last_event = None;
    let mut first_event = None;
    loop {
        if stop_receiver.try_recv().is_ok() {
            remove_tree_watch(&controller, &root, generation);
            return;
        }
        match event_receiver.recv_timeout(Duration::from_millis(50)) {
            Ok(Ok(event))
                if classify_event(&event.kind).is_some()
                    && event.paths.iter().any(|path| {
                        path.strip_prefix(&root)
                            .is_ok_and(|relative| !is_structurally_ignored(relative, &[]))
                    }) =>
            {
                last_event = Some(Instant::now());
                first_event.get_or_insert_with(Instant::now);
            }
            Ok(Ok(_)) | Err(mpsc::RecvTimeoutError::Timeout) => {}
            Ok(Err(_)) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                remove_tree_watch(&controller, &root, generation);
                return;
            }
        }
        if channel_overflowed.swap(false, Ordering::AcqRel) {
            last_event = Some(Instant::now());
            first_event.get_or_insert_with(Instant::now);
        }
        let settled = last_event.is_some_and(|event| event.elapsed() >= DEBOUNCE);
        let ceiling = first_event.is_some_and(|event: Instant| event.elapsed() >= MAX_DEBOUNCE);
        if settled || ceiling {
            last_event = None;
            first_event = None;
            let _ = app.emit(
                PROJECT_FILES_EVENT,
                ProjectFilesEvent {
                    project_path: root.to_string_lossy().into_owned(),
                },
            );
        }
    }
}

#[derive(Default)]
struct PendingChanges {
    kinds: BTreeSet<ProjectChangeKind>,
    paths: BTreeSet<String>,
    build_relevant: bool,
    last_event: Option<Instant>,
    first_event: Option<Instant>,
    truncated: bool,
}

impl PendingChanges {
    fn record(&mut self, root: &Path, excluded_directories: &[String], event: Event) {
        let Some(kind) = classify_event(&event.kind) else {
            return;
        };
        for path in event.paths {
            let Ok(relative) = path.strip_prefix(root) else {
                continue;
            };
            if is_ignored(relative, excluded_directories) {
                continue;
            }
            // Skip events for symlink entries themselves so watching never
            // follows a link out of the project. (The previous guard combined
            // exists() with symlink_metadata().is_err(), which is never true.)
            if matches!(kind, ProjectChangeKind::Create | ProjectChangeKind::Modify)
                && path
                    .symlink_metadata()
                    .is_ok_and(|metadata| metadata.file_type().is_symlink())
            {
                continue;
            }
            self.build_relevant |= is_build_input(relative);
            if self.paths.len() < MAX_PENDING_PATHS {
                self.paths.insert(relative.to_string_lossy().into_owned());
            } else {
                self.truncated = true;
                self.build_relevant = true;
            }
            self.kinds.insert(kind);
            self.last_event = Some(Instant::now());
            self.first_event.get_or_insert_with(Instant::now);
        }
    }

    fn is_ready(&self) -> bool {
        if self.paths.is_empty() && !self.truncated {
            return false;
        }
        let trailing_settled = self
            .last_event
            .is_some_and(|last_event| last_event.elapsed() >= DEBOUNCE);
        let ceiling_reached = self
            .first_event
            .is_some_and(|first_event| first_event.elapsed() >= MAX_DEBOUNCE);
        trailing_settled || ceiling_reached
    }

    fn take_event(&mut self, root: &Path) -> WatchEvent {
        let changes = std::mem::take(&mut self.kinds).into_iter().collect();
        let paths = std::mem::take(&mut self.paths).into_iter().collect();
        self.last_event = None;
        self.first_event = None;
        self.build_relevant = false;
        let truncated = std::mem::take(&mut self.truncated);
        WatchEvent::Changed {
            project_path: root.to_string_lossy().into_owned(),
            changes,
            paths,
            truncated,
        }
    }

    fn record_overflow(&mut self) {
        self.kinds.insert(ProjectChangeKind::Modify);
        self.build_relevant = true;
        self.truncated = true;
        self.last_event = Some(Instant::now());
        self.first_event.get_or_insert_with(Instant::now);
    }
}

fn classify_event(kind: &EventKind) -> Option<ProjectChangeKind> {
    match kind {
        EventKind::Create(_) => Some(ProjectChangeKind::Create),
        EventKind::Modify(ModifyKind::Name(_)) => Some(ProjectChangeKind::Rename),
        EventKind::Modify(_) => Some(ProjectChangeKind::Modify),
        EventKind::Remove(_) => Some(ProjectChangeKind::Remove),
        _ => None,
    }
}

/// Directory-level exclusions only. The project tree uses this rather than
/// [`is_ignored`] because the tree must refresh when a generated file appears:
/// whether that file is *shown* is a user preference resolved in the UI, and a
/// tree that never learned the file exists could not honour it.
fn is_structurally_ignored(path: &Path, excluded_directories: &[String]) -> bool {
    path.components().any(|component| match component {
        Component::Normal(value) => GENERATED_DIRECTORIES.iter().any(|name| value == *name),
        _ => false,
    }) || excluded_directories
        .iter()
        .any(|directory| path.starts_with(Path::new(directory)))
}

/// Build-watch exclusions. Generated extensions stay ignored here regardless of
/// display preferences: a build writes its own `.aux`/`.log`, so reacting to
/// them would make watch mode rebuild forever.
fn is_ignored(path: &Path, excluded_directories: &[String]) -> bool {
    is_structurally_ignored(path, excluded_directories)
        || path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|extension| GENERATED_EXTENSIONS.contains(&extension))
}

fn is_build_input(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| BUILD_INPUT_EXTENSIONS.contains(&extension))
}

fn set_status(
    app: &AppHandle,
    controller: &WatchController,
    root: &Path,
    status: WatchStatus,
    message: Option<&'static str>,
) {
    if let Ok(mut projects) = controller.projects.lock() {
        if let Some(watch) = projects.get_mut(root) {
            watch.status = status;
        }
    }
    emit_status(app, root, status, message);
}

fn finish_with_error(app: &AppHandle, controller: &WatchController, root: &Path) {
    remove_watch(controller, root);
    emit_status(
        app,
        root,
        WatchStatus::Error,
        Some("Project watching became unavailable. Manual builds still work."),
    );
}

fn remove_watch(controller: &WatchController, root: &Path) {
    if let Ok(mut projects) = controller.projects.lock() {
        projects.remove(root);
    }
}

/// Deregisters a tree watcher, leaving any newer registration for the same
/// project untouched so a restart survives the previous worker's shutdown.
fn remove_tree_watch(controller: &WatchController, root: &Path, generation: u64) {
    if let Ok(mut projects) = controller.tree_projects.lock() {
        if projects
            .get(root)
            .is_some_and(|watch| watch.generation == generation)
        {
            projects.remove(root);
        }
    }
}

fn emit_status(app: &AppHandle, root: &Path, status: WatchStatus, message: Option<&'static str>) {
    let _ = app.emit(
        WATCH_EVENT,
        WatchEvent::Status {
            project_path: root.to_string_lossy().into_owned(),
            status,
            message,
        },
    );
}

fn lock_projects(
    controller: &WatchController,
) -> Result<MutexGuard<'_, HashMap<PathBuf, ActiveWatch>>, WatchError> {
    controller.projects.lock().map_err(|_| watch_unavailable())
}

fn watch_unavailable() -> WatchError {
    WatchError {
        code: "watch-unavailable",
        message: "TeX could not watch this project. Manual builds remain available.",
    }
}

fn watch_capacity() -> WatchError {
    WatchError {
        code: "watch-capacity-reached",
        message: "Too many projects are being watched. Stop one watcher before starting another.",
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use notify::{
        event::{AccessKind, AccessMode, CreateKind},
        EventKind,
    };

    use super::{
        classify_event, is_build_input, is_ignored, PendingChanges, ProjectChangeKind, WatchEvent,
    };

    #[test]
    fn overflow_produces_a_truthful_refresh_and_build_event() {
        let mut pending = PendingChanges::default();
        pending.record_overflow();
        assert!(pending.build_relevant);

        let event = pending.take_event(Path::new("/project"));
        assert!(matches!(
            event,
            WatchEvent::Changed {
                truncated: true,
                ..
            }
        ));
    }

    #[test]
    fn ignores_generated_outputs_and_cache_directories() {
        assert!(is_ignored(Path::new(".git/index"), &[]));
        assert!(is_ignored(Path::new("output/main.aux"), &[]));
        assert!(is_ignored(Path::new("main.log"), &[]));
        assert!(is_ignored(
            Path::new("generated/figure.tex"),
            &["generated".to_owned()]
        ));
        assert!(!is_ignored(Path::new("sections/results.tex"), &[]));
    }

    #[test]
    fn only_source_inputs_queue_builds() {
        assert!(is_build_input(Path::new("chapters/result.tex")));
        assert!(is_build_input(Path::new("references.bib")));
        assert!(!is_build_input(Path::new("figure.png")));
    }

    #[test]
    fn models_create_events_explicitly() {
        assert_eq!(
            classify_event(&EventKind::Create(CreateKind::File)),
            Some(ProjectChangeKind::Create)
        );
    }

    #[test]
    fn ignores_non_mutating_access_events() {
        assert_eq!(
            classify_event(&EventKind::Access(AccessKind::Open(AccessMode::Read))),
            None
        );
    }
}
