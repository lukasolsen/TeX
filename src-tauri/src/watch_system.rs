use std::{
    collections::{BTreeSet, HashMap},
    path::{Component, Path, PathBuf},
    sync::{mpsc, Arc, Mutex, MutexGuard},
    thread,
    time::{Duration, Instant},
};

use notify::{
    event::ModifyKind, Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

const WATCH_EVENT: &str = "tex://watch-event";
const DEBOUNCE: Duration = Duration::from_millis(350);
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
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchError {
    code: &'static str,
    message: &'static str,
}

#[derive(Clone, Default)]
pub struct WatchController {
    projects: Arc<Mutex<HashMap<PathBuf, ActiveWatch>>>,
}

struct ActiveWatch {
    status: WatchStatus,
    stop: mpsc::Sender<()>,
}

#[tauri::command]
pub fn start_project_watch(
    project_path: String,
    app: AppHandle,
    controller: State<'_, WatchController>,
) -> Result<(), WatchError> {
    let root = canonical_project_root(Path::new(&project_path))?;
    let (stop_sender, stop_receiver) = mpsc::channel();
    {
        let mut projects = lock_projects(&controller)?;
        if projects.contains_key(&root) {
            return Ok(());
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
    thread::spawn(move || run_watch(app, owned, root, stop_receiver));
    Ok(())
}

#[tauri::command]
pub fn stop_project_watch(
    project_path: String,
    app: AppHandle,
    controller: State<'_, WatchController>,
) -> Result<(), WatchError> {
    let root = canonical_project_root(Path::new(&project_path))?;
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
) -> Result<WatchStatus, WatchError> {
    let root = canonical_project_root(Path::new(&project_path))?;
    let projects = lock_projects(&controller)?;
    Ok(projects
        .get(&root)
        .map_or(WatchStatus::Off, |watch| watch.status))
}

fn run_watch(
    app: AppHandle,
    controller: WatchController,
    root: PathBuf,
    stop_receiver: mpsc::Receiver<()>,
) {
    let (event_sender, event_receiver) = mpsc::channel();
    let watcher = RecommendedWatcher::new(
        move |event| {
            let _ = event_sender.send(event);
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
            Ok(Ok(event)) => pending.record(&root, event),
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

#[derive(Default)]
struct PendingChanges {
    kinds: BTreeSet<ProjectChangeKind>,
    paths: BTreeSet<String>,
    build_relevant: bool,
    last_event: Option<Instant>,
}

impl PendingChanges {
    fn record(&mut self, root: &Path, event: Event) {
        let Some(kind) = classify_event(&event.kind) else {
            return;
        };
        for path in event.paths {
            let Ok(relative) = path.strip_prefix(root) else {
                continue;
            };
            if is_ignored(relative) {
                continue;
            }
            if matches!(kind, ProjectChangeKind::Create | ProjectChangeKind::Modify)
                && path.exists()
                && path.symlink_metadata().is_err()
            {
                continue;
            }
            self.build_relevant |= is_build_input(relative);
            self.paths.insert(relative.to_string_lossy().into_owned());
            self.kinds.insert(kind);
            self.last_event = Some(Instant::now());
        }
    }

    fn is_ready(&self) -> bool {
        !self.paths.is_empty()
            && self
                .last_event
                .is_some_and(|last_event| last_event.elapsed() >= DEBOUNCE)
    }

    fn take_event(&mut self, root: &Path) -> WatchEvent {
        let changes = std::mem::take(&mut self.kinds).into_iter().collect();
        let paths = std::mem::take(&mut self.paths).into_iter().collect();
        self.last_event = None;
        self.build_relevant = false;
        WatchEvent::Changed {
            project_path: root.to_string_lossy().into_owned(),
            changes,
            paths,
        }
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

fn is_ignored(path: &Path) -> bool {
    path.components().any(|component| match component {
        Component::Normal(value) => GENERATED_DIRECTORIES.iter().any(|name| value == *name),
        _ => false,
    }) || path
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

fn canonical_project_root(path: &Path) -> Result<PathBuf, WatchError> {
    let root = path.canonicalize().map_err(|_| watch_unavailable())?;
    if root.is_dir() {
        Ok(root)
    } else {
        Err(watch_unavailable())
    }
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

#[cfg(test)]
mod tests {
    use std::path::Path;

    use notify::{event::CreateKind, EventKind};

    use super::{classify_event, is_build_input, is_ignored, ProjectChangeKind};

    #[test]
    fn ignores_generated_outputs_and_cache_directories() {
        assert!(is_ignored(Path::new(".git/index")));
        assert!(is_ignored(Path::new("output/main.aux")));
        assert!(is_ignored(Path::new("main.log")));
        assert!(!is_ignored(Path::new("sections/results.tex")));
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
}
