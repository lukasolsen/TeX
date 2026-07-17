use std::{
    collections::{HashMap, VecDeque},
    env,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, Mutex, MutexGuard,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use command_group::{CommandGroup, GroupChild};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::{
    project_access::ProjectAccess,
    project_config::{
        load_configuration_for_project, validate_configuration, BibliographyTool,
        EnvironmentSetting, ProjectBuildConfiguration,
    },
    source_read::{resolve_source_path, valid_relative_path},
};

const BUILD_EVENT: &str = "tex://build-event";
const MAX_RETAINED_RUNS: usize = 10;
const MAX_RETAINED_ENTRIES: usize = 500;
const MAX_RETAINED_LOG_BYTES: usize = 512 * 1024;
const MAX_LOG_LINE_BYTES: usize = 4 * 1024;
const OUTPUT_CHANNEL_CAPACITY: usize = 256;
const MAX_PROJECT_HISTORIES: usize = 16;
const MAX_BUILD_DURATION: Duration = Duration::from_secs(30 * 60);
static NEXT_RUN_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BuildEngine {
    LatexmkPdf,
    PdfLatex,
    XeLatex,
    LuaLatex,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildRequest {
    project_path: String,
    root_file: String,
    engine: BuildEngine,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInvocation {
    executable: String,
    arguments: Vec<String>,
    working_directory: String,
    root_file: String,
    engine: BuildEngine,
    environment: Vec<EnvironmentSetting>,
    bibliography_tool: BibliographyTool,
    custom: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildProfile {
    engine: BuildEngine,
    label: &'static str,
    description: &'static str,
    executable: &'static str,
    recommended: bool,
    available: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BuildStatus {
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BuildLogStream {
    Stdout,
    Stderr,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildLogEntry {
    sequence: u64,
    timestamp: u64,
    stream: BuildLogStream,
    text: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildDiagnostic {
    severity: DiagnosticSeverity,
    message: String,
    file: Option<String>,
    line: Option<u32>,
    mapping_uncertain: bool,
    log_sequence: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildRun {
    id: String,
    project_path: String,
    invocation: BuildInvocation,
    status: BuildStatus,
    started_at: u64,
    finished_at: Option<u64>,
    exit_code: Option<i32>,
    entries: Vec<BuildLogEntry>,
    diagnostics: Vec<BuildDiagnostic>,
    #[serde(skip)]
    retained_log_bytes: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum BuildEvent {
    Log {
        project_path: String,
        run_id: String,
        entry: BuildLogEntry,
        diagnostic: Option<BuildDiagnostic>,
    },
    Finished {
        project_path: String,
        run_id: String,
        status: BuildStatus,
        finished_at: u64,
        exit_code: Option<i32>,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildError {
    code: &'static str,
    message: &'static str,
}

#[derive(Clone, Default)]
pub struct BuildController {
    projects: Arc<Mutex<HashMap<PathBuf, ProjectBuildState>>>,
}

#[derive(Default)]
struct ProjectBuildState {
    active: Option<ActiveBuild>,
    runs: VecDeque<BuildRun>,
}

struct ActiveBuild {
    run_id: String,
    stop_requested: Arc<AtomicBool>,
}

struct ValidatedBuild {
    project_root: PathBuf,
    invocation: BuildInvocation,
}

/// Returns the exact safe command TeX will execute without starting a process.
#[tauri::command]
pub fn preview_build(
    request: BuildRequest,
    app: AppHandle,
    access: State<'_, ProjectAccess>,
) -> Result<BuildInvocation, BuildError> {
    let request = authorize_request(request, &access)?;
    let configuration = configuration_for_request(&app, &request)?;
    Ok(validate_build(request, configuration)?.invocation)
}

/// Reports installed build tools without executing project code or compiler processes.
#[tauri::command]
pub fn get_build_profiles() -> Vec<BuildProfile> {
    BuildEngine::ALL
        .iter()
        .map(|engine| engine.profile())
        .collect()
}

/// Starts one validated build process when the project does not already have one running.
#[tauri::command]
pub fn start_build(
    request: BuildRequest,
    app: AppHandle,
    controller: State<'_, BuildController>,
    access: State<'_, ProjectAccess>,
) -> Result<BuildRun, BuildError> {
    let request = authorize_request(request, &access)?;
    let configuration = configuration_for_request(&app, &request)?;
    let validated = validate_build(request, configuration)?;
    let mut command = command_for(&validated.invocation);

    let run_id = format!(
        "{}-{}",
        unix_timestamp(),
        NEXT_RUN_ID.fetch_add(1, Ordering::Relaxed)
    );
    let stop_requested = Arc::new(AtomicBool::new(false));
    let run = BuildRun {
        id: run_id.clone(),
        project_path: validated.project_root.to_string_lossy().into_owned(),
        invocation: validated.invocation,
        status: BuildStatus::Running,
        started_at: unix_timestamp(),
        finished_at: None,
        exit_code: None,
        entries: Vec::new(),
        diagnostics: Vec::new(),
        retained_log_bytes: 0,
    };

    let child = {
        let mut projects = lock_projects(&controller)?;
        reserve_project_history(&mut projects, &validated.project_root)?;
        let project = projects.entry(validated.project_root.clone()).or_default();
        if project.active.is_some() {
            return Err(BuildError {
                code: "build-already-running",
                message:
                    "A build is already running for this project. Stop it before starting another.",
            });
        }
        let child = command.group_spawn().map_err(|_| BuildError {
            code: "build-tool-unavailable",
            message:
                "The selected LaTeX build tool is unavailable. Install it or choose another engine.",
        })?;
        project.active = Some(ActiveBuild {
            run_id: run_id.clone(),
            stop_requested: Arc::clone(&stop_requested),
        });
        project.runs.push_front(run.clone());
        project.runs.truncate(MAX_RETAINED_RUNS);
        child
    };

    let owned_controller = controller.inner().clone();
    let project_root = validated.project_root;
    let shared_child = Arc::new(Mutex::new(Some(child)));
    let worker_child = Arc::clone(&shared_child);
    let worker_run_id = run_id.clone();
    let worker_root = project_root.clone();
    let worker_stop = Arc::clone(&stop_requested);
    if thread::Builder::new()
        .name("tex-build-supervisor".to_owned())
        .spawn(move || {
            let Ok(mut guard) = worker_child.lock() else {
                return;
            };
            let Some(mut child) = guard.take() else {
                return;
            };
            drop(guard);
            supervise_build(
                &mut child,
                &app,
                &owned_controller,
                &worker_root,
                &worker_run_id,
                &worker_stop,
            );
        })
        .is_err()
    {
        if let Ok(mut guard) = shared_child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        discard_run(&controller, &project_root, &run_id);
        return Err(BuildError {
            code: "build-supervisor-unavailable",
            message: "TeX could not supervise the build process. No build remains running.",
        });
    }

    Ok(run)
}

fn discard_run(controller: &BuildController, project_root: &Path, run_id: &str) {
    if let Ok(mut projects) = controller.projects.lock() {
        if let Some(project) = projects.get_mut(project_root) {
            if project
                .active
                .as_ref()
                .is_some_and(|active| active.run_id == run_id)
            {
                project.active = None;
            }
            project.runs.retain(|run| run.id != run_id);
        }
    }
}

/// Requests cancellation without blocking the UI while the child process exits.
#[tauri::command]
pub fn stop_build(
    project_path: String,
    controller: State<'_, BuildController>,
    access: State<'_, ProjectAccess>,
) -> Result<(), BuildError> {
    let project_root = access.resolve(&project_path).map_err(|_| unavailable())?;
    let projects = lock_projects(&controller)?;
    let active = projects
        .get(&project_root)
        .and_then(|project| project.active.as_ref())
        .ok_or(BuildError {
            code: "build-not-running",
            message: "There is no active build to stop for this project.",
        })?;
    active.stop_requested.store(true, Ordering::Release);
    Ok(())
}

/// Returns bounded run history so reopening the panel does not erase failure evidence.
#[tauri::command]
pub fn get_build_history(
    project_path: String,
    controller: State<'_, BuildController>,
    access: State<'_, ProjectAccess>,
) -> Result<Vec<BuildRun>, BuildError> {
    let project_root = access.resolve(&project_path).map_err(|_| unavailable())?;
    let projects = lock_projects(&controller)?;
    Ok(projects
        .get(&project_root)
        .map_or_else(Vec::new, |project| project.runs.iter().cloned().collect()))
}

fn authorize_request(
    mut request: BuildRequest,
    access: &ProjectAccess,
) -> Result<BuildRequest, BuildError> {
    request.project_path = access
        .resolve(&request.project_path)
        .map_err(|_| unavailable())?
        .to_string_lossy()
        .into_owned();
    Ok(request)
}

fn configuration_for_request(
    app: &AppHandle,
    request: &BuildRequest,
) -> Result<ProjectBuildConfiguration, BuildError> {
    load_configuration_for_project(app, Path::new(&request.project_path)).map_err(|error| {
        BuildError {
            code: error.code,
            message: error.message,
        }
    })
}

fn validate_build(
    request: BuildRequest,
    configuration: ProjectBuildConfiguration,
) -> Result<ValidatedBuild, BuildError> {
    validate_build_with_resolver(request, configuration, resolve_executable)
}

fn validate_build_with_resolver(
    request: BuildRequest,
    configuration: ProjectBuildConfiguration,
    executable_resolver: impl Fn(&str) -> Option<PathBuf>,
) -> Result<ValidatedBuild, BuildError> {
    let project_root = canonical_project_root(Path::new(&request.project_path))?;
    validate_configuration(&project_root, &configuration).map_err(|error| BuildError {
        code: error.code,
        message: error.message,
    })?;
    let root_file = configuration.root_file.clone().unwrap_or(request.root_file);
    let relative_root = Path::new(&root_file);
    if relative_root.extension().and_then(|value| value.to_str()) != Some("tex") {
        return Err(invalid_root());
    }
    resolve_source_path(&project_root, relative_root).map_err(|_| invalid_root())?;

    let (executable, arguments, custom) = if let Some(command) = &configuration.custom_command {
        let executable = Path::new(&command.executable)
            .canonicalize()
            .map_err(|_| unavailable())?;
        (
            executable.to_string_lossy().into_owned(),
            command.arguments.clone(),
            true,
        )
    } else {
        let (executable_name, mut arguments) = match request.engine {
            BuildEngine::LatexmkPdf => ("latexmk", vec!["-pdf"]),
            BuildEngine::PdfLatex => ("pdflatex", Vec::new()),
            BuildEngine::XeLatex => ("xelatex", Vec::new()),
            BuildEngine::LuaLatex => ("lualatex", Vec::new()),
        };
        let executable = executable_resolver(executable_name).ok_or(BuildError {
            code: "build-tool-unavailable",
            message: "The selected LaTeX build tool is not installed or is unavailable on PATH.",
        })?;
        arguments.extend(["-interaction=nonstopmode", "-file-line-error", "-synctex=1"]);
        let mut arguments: Vec<String> = arguments.into_iter().map(str::to_owned).collect();
        if let Some(output) = &configuration.output_directory {
            let argument = match request.engine {
                BuildEngine::LatexmkPdf => format!("-outdir={output}"),
                _ => format!("-output-directory={output}"),
            };
            arguments.push(argument);
        }
        // Prefix the validated relative root with `./` so a filename beginning
        // with `-` cannot be reinterpreted by the engine (notably latexmk) as an
        // option token. `root_file` is guaranteed relative by `resolve_source_path`.
        arguments.push(format!("./{root_file}"));
        (executable.to_string_lossy().into_owned(), arguments, false)
    };

    Ok(ValidatedBuild {
        project_root: project_root.clone(),
        invocation: BuildInvocation {
            executable,
            arguments,
            working_directory: project_root.to_string_lossy().into_owned(),
            root_file,
            engine: request.engine,
            environment: configuration.environment,
            bibliography_tool: configuration.bibliography_tool,
            custom,
        },
    })
}

impl BuildEngine {
    const ALL: [Self; 4] = [
        Self::LatexmkPdf,
        Self::PdfLatex,
        Self::XeLatex,
        Self::LuaLatex,
    ];

    fn profile(self) -> BuildProfile {
        let (label, description, executable, recommended) = match self {
            Self::LatexmkPdf => (
                "latexmk (PDF)",
                "Recommended; reruns LaTeX and bibliography tools as needed.",
                "latexmk",
                true,
            ),
            Self::PdfLatex => (
                "pdfLaTeX",
                "Single compiler pass; references may require additional runs.",
                "pdflatex",
                false,
            ),
            Self::XeLatex => (
                "XeLaTeX",
                "Single compiler pass with system-font support.",
                "xelatex",
                false,
            ),
            Self::LuaLatex => (
                "LuaLaTeX",
                "Single compiler pass with LuaTeX features.",
                "lualatex",
                false,
            ),
        };
        BuildProfile {
            engine: self,
            label,
            description,
            executable,
            recommended,
            available: executable_available(executable),
        }
    }
}

fn executable_available(executable: &str) -> bool {
    resolve_executable(executable).is_some()
}

pub(crate) fn resolve_executable(executable: &str) -> Option<PathBuf> {
    env::var_os("PATH").and_then(|path| resolve_executable_in(executable, env::split_paths(&path)))
}

fn resolve_executable_in(
    executable: &str,
    mut directories: impl Iterator<Item = PathBuf>,
) -> Option<PathBuf> {
    directories.find_map(|directory| {
        executable_candidates(&directory, executable)
            .into_iter()
            .find(|candidate| is_executable_file(candidate))
    })
}

#[cfg(test)]
fn executable_available_in(executable: &str, directories: impl Iterator<Item = PathBuf>) -> bool {
    resolve_executable_in(executable, directories).is_some()
}

#[cfg(not(windows))]
fn executable_candidates(directory: &Path, executable: &str) -> Vec<PathBuf> {
    vec![directory.join(executable)]
}

#[cfg(windows)]
fn executable_candidates(directory: &Path, executable: &str) -> Vec<PathBuf> {
    let extensions = env::var_os("PATHEXT")
        .map(|value| {
            value
                .to_string_lossy()
                .split(';')
                .filter(|extension| !extension.is_empty())
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| vec![".EXE".to_owned(), ".CMD".to_owned(), ".BAT".to_owned()]);
    extensions
        .into_iter()
        .map(|extension| directory.join(format!("{executable}{extension}")))
        .collect()
}

#[cfg(unix)]
fn is_executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    path.metadata()
        .is_ok_and(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
}

#[cfg(windows)]
fn is_executable_file(path: &Path) -> bool {
    path.is_file()
}

fn command_for(invocation: &BuildInvocation) -> Command {
    let mut command = Command::new(&invocation.executable);
    command
        .args(&invocation.arguments)
        .current_dir(&invocation.working_directory)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for setting in &invocation.environment {
        command.env(&setting.name, &setting.value);
    }
    command
}

fn supervise_build(
    child: &mut GroupChild,
    app: &AppHandle,
    controller: &BuildController,
    project_root: &Path,
    run_id: &str,
    stop_requested: &AtomicBool,
) {
    let (sender, receiver) = mpsc::sync_channel(OUTPUT_CHANNEL_CAPACITY);
    let stdout_reader = child
        .inner()
        .stdout
        .take()
        .map(|stdout| spawn_output_reader(stdout, BuildLogStream::Stdout, sender.clone()))
        .transpose();
    let stderr_reader = child
        .inner()
        .stderr
        .take()
        .map(|stderr| spawn_output_reader(stderr, BuildLogStream::Stderr, sender))
        .transpose();
    let (Ok(stdout_reader), Ok(stderr_reader)) = (stdout_reader, stderr_reader) else {
        let _ = child.kill();
        let _ = child.wait();
        append_log(
            app,
            controller,
            project_root,
            run_id,
            BuildLogStream::Stderr,
            "Build stopped because output supervision was unavailable.".to_owned(),
        );
        finish_run(
            app,
            controller,
            project_root,
            run_id,
            BuildStatus::Failed,
            None,
        );
        return;
    };

    let deadline = Instant::now() + MAX_BUILD_DURATION;
    let mut timed_out = false;
    let mut termination_sent = false;
    let exit_status = loop {
        drain_output(&receiver, app, controller, project_root, run_id);
        timed_out |= Instant::now() >= deadline;
        if (stop_requested.load(Ordering::Acquire) || timed_out) && !termination_sent {
            let _ = child.kill();
            termination_sent = true;
        }
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => thread::sleep(Duration::from_millis(30)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
        }
    };

    if let Some(reader) = stdout_reader {
        let _ = reader.join();
    }
    if let Some(reader) = stderr_reader {
        let _ = reader.join();
    }
    drain_output(&receiver, app, controller, project_root, run_id);
    if timed_out {
        append_log(
            app,
            controller,
            project_root,
            run_id,
            BuildLogStream::Stderr,
            "Build stopped after reaching the 30-minute execution limit.".to_owned(),
        );
    }

    let cancelled = stop_requested.load(Ordering::Acquire);
    let exit_code = exit_status
        .as_ref()
        .and_then(std::process::ExitStatus::code);
    let status = if cancelled {
        BuildStatus::Cancelled
    } else if exit_status
        .as_ref()
        .is_some_and(std::process::ExitStatus::success)
    {
        BuildStatus::Succeeded
    } else {
        BuildStatus::Failed
    };
    finish_run(app, controller, project_root, run_id, status, exit_code);
}

fn spawn_output_reader<R: Read + Send + 'static>(
    stream: R,
    kind: BuildLogStream,
    sender: mpsc::SyncSender<(BuildLogStream, String)>,
) -> std::io::Result<thread::JoinHandle<()>> {
    thread::Builder::new()
        .name("tex-build-output".to_owned())
        .spawn(move || {
            let mut reader = BufReader::new(stream);
            while let Ok(Some((bytes, truncated))) = read_bounded_line(&mut reader) {
                let mut text = String::from_utf8_lossy(&bytes)
                    .trim_end_matches(['\r', '\n'])
                    .to_owned();
                if truncated {
                    text.push_str(" … [line truncated]");
                }
                if sender.send((kind.clone(), text)).is_err() {
                    break;
                }
            }
        })
}

fn read_bounded_line(reader: &mut impl BufRead) -> std::io::Result<Option<(Vec<u8>, bool)>> {
    let mut bytes = Vec::new();
    let mut observed = false;
    let mut truncated = false;
    loop {
        let available = reader.fill_buf()?;
        if available.is_empty() {
            return Ok(observed.then_some((bytes, truncated)));
        }
        observed = true;
        let consumed = available
            .iter()
            .position(|byte| *byte == b'\n')
            .map_or(available.len(), |position| position + 1);
        let remaining = MAX_LOG_LINE_BYTES.saturating_sub(bytes.len());
        let copied = consumed.min(remaining);
        bytes.extend_from_slice(&available[..copied]);
        truncated |= copied < consumed;
        let complete = available.get(consumed.saturating_sub(1)) == Some(&b'\n');
        reader.consume(consumed);
        if complete {
            return Ok(Some((bytes, truncated)));
        }
    }
}

fn drain_output(
    receiver: &mpsc::Receiver<(BuildLogStream, String)>,
    app: &AppHandle,
    controller: &BuildController,
    project_root: &Path,
    run_id: &str,
) {
    for (stream, text) in receiver.try_iter() {
        append_log(app, controller, project_root, run_id, stream, text);
    }
}

fn append_log(
    app: &AppHandle,
    controller: &BuildController,
    project_root: &Path,
    run_id: &str,
    stream: BuildLogStream,
    text: String,
) {
    let event = {
        let Ok(mut projects) = controller.projects.lock() else {
            return;
        };
        let Some(run) = projects
            .get_mut(project_root)
            .and_then(|project| project.runs.iter_mut().find(|run| run.id == run_id))
        else {
            return;
        };
        let sequence = run.entries.last().map_or(1, |entry| entry.sequence + 1);
        let entry = BuildLogEntry {
            sequence,
            timestamp: unix_timestamp(),
            stream,
            text,
        };
        let diagnostic = parse_diagnostic(&entry, project_root);
        run.retained_log_bytes = run.retained_log_bytes.saturating_add(entry.text.len());
        run.entries.push(entry.clone());
        while run.entries.len() > MAX_RETAINED_ENTRIES
            || run.retained_log_bytes > MAX_RETAINED_LOG_BYTES
        {
            let removed = run.entries.remove(0);
            run.retained_log_bytes = run.retained_log_bytes.saturating_sub(removed.text.len());
        }
        if let Some(item) = diagnostic.clone() {
            run.diagnostics.push(item);
            if run.diagnostics.len() > MAX_RETAINED_ENTRIES {
                run.diagnostics.remove(0);
            }
        }
        BuildEvent::Log {
            project_path: project_root.to_string_lossy().into_owned(),
            run_id: run_id.to_owned(),
            entry,
            diagnostic,
        }
    };
    let _ = app.emit(BUILD_EVENT, event);
}

fn reserve_project_history(
    projects: &mut HashMap<PathBuf, ProjectBuildState>,
    root: &Path,
) -> Result<(), BuildError> {
    if projects.contains_key(root) || projects.len() < MAX_PROJECT_HISTORIES {
        return Ok(());
    }
    let candidate = projects
        .iter()
        .filter(|(_, state)| state.active.is_none())
        .min_by_key(|(_, state)| state.runs.front().map_or(0, |run| run.started_at))
        .map(|(path, _)| path.clone())
        .ok_or(BuildError {
            code: "build-capacity-reached",
            message:
                "Too many projects are building at once. Stop a build before starting another.",
        })?;
    projects.remove(&candidate);
    Ok(())
}

fn finish_run(
    app: &AppHandle,
    controller: &BuildController,
    project_root: &Path,
    run_id: &str,
    status: BuildStatus,
    exit_code: Option<i32>,
) {
    let finished_at = unix_timestamp();
    if let Ok(mut projects) = controller.projects.lock() {
        if let Some(project) = projects.get_mut(project_root) {
            if let Some(run) = project.runs.iter_mut().find(|run| run.id == run_id) {
                run.status = status.clone();
                run.finished_at = Some(finished_at);
                run.exit_code = exit_code;
            }
            if project
                .active
                .as_ref()
                .is_some_and(|active| active.run_id == run_id)
            {
                project.active = None;
            }
        }
    }
    let _ = app.emit(
        BUILD_EVENT,
        BuildEvent::Finished {
            project_path: project_root.to_string_lossy().into_owned(),
            run_id: run_id.to_owned(),
            status,
            finished_at,
            exit_code,
        },
    );
}

fn parse_diagnostic(entry: &BuildLogEntry, project_root: &Path) -> Option<BuildDiagnostic> {
    let Some((file, line, message)) = file_line_message(&entry.text) else {
        let message = entry.text.trim().trim_start_matches('!').trim();
        let lowered = message.to_ascii_lowercase();
        let severity = if entry.text.trim_start().starts_with('!')
            || lowered.contains("error:")
            || lowered.contains("fatal error")
        {
            DiagnosticSeverity::Error
        } else if lowered.contains("warning:")
            || lowered.contains(" warning ")
            || lowered.starts_with("overfull ")
            || lowered.starts_with("underfull ")
        {
            DiagnosticSeverity::Warning
        } else {
            return None;
        };
        return Some(BuildDiagnostic {
            severity,
            message: message.to_owned(),
            file: None,
            line: None,
            mapping_uncertain: true,
            log_sequence: entry.sequence,
        });
    };
    let message = message.trim();
    let lowered = message.to_ascii_lowercase();
    let severity = if lowered.contains("warning") {
        DiagnosticSeverity::Warning
    } else {
        DiagnosticSeverity::Error
    };
    let candidate = Path::new(file);
    let mapped = if candidate.is_absolute() {
        candidate.strip_prefix(project_root).ok()
    } else {
        Some(candidate)
    }
    .filter(|path| valid_relative_path(path));

    Some(BuildDiagnostic {
        severity,
        message: message.to_owned(),
        file: mapped.map(|path| path.to_string_lossy().into_owned()),
        line: Some(line.max(1)),
        mapping_uncertain: mapped.is_none(),
        log_sequence: entry.sequence,
    })
}

fn file_line_message(text: &str) -> Option<(&str, u32, &str)> {
    for (first, _) in text.match_indices(':') {
        let remainder = text.get(first + 1..)?;
        let second = remainder.find(':')?;
        let line = remainder.get(..second)?.parse::<u32>();
        if let Ok(line) = line {
            return Some((text.get(..first)?, line, remainder.get(second + 1..)?));
        }
    }
    None
}

fn canonical_project_root(path: &Path) -> Result<PathBuf, BuildError> {
    let root = path.canonicalize().map_err(|_| unavailable())?;
    if root.is_dir() {
        Ok(root)
    } else {
        Err(unavailable())
    }
}

fn lock_projects(
    controller: &BuildController,
) -> Result<MutexGuard<'_, HashMap<PathBuf, ProjectBuildState>>, BuildError> {
    controller.projects.lock().map_err(|_| unavailable())
}

fn invalid_root() -> BuildError {
    BuildError {
        code: "invalid-build-root",
        message: "Choose an available LaTeX root file inside this project before building.",
    }
}

fn unavailable() -> BuildError {
    BuildError {
        code: "build-unavailable",
        message: "TeX could not prepare this build. Your source files were not changed.",
    }
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs())
}

#[cfg(test)]
mod tests {
    use std::{fs, io::Cursor, path::Path};

    use super::{
        executable_available_in, file_line_message, parse_diagnostic, read_bounded_line,
        resolve_executable_in, validate_build, validate_build_with_resolver, BuildEngine,
        BuildEvent, BuildLogEntry, BuildLogStream, BuildRequest, BuildStatus, DiagnosticSeverity,
    };
    use crate::project_config::{CustomCommand, ProjectBuildConfiguration};

    fn fixture_root() -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/root-detection")
    }

    #[test]
    fn truncates_one_log_line_and_preserves_the_next() -> Result<(), Box<dyn std::error::Error>> {
        let mut input = vec![b'x'; super::MAX_LOG_LINE_BYTES + 100];
        input.extend_from_slice(b"\nnext\n");
        let mut reader = Cursor::new(input);

        let Some((first, truncated)) = read_bounded_line(&mut reader)? else {
            return Err("first line missing".into());
        };
        let Some((second, second_truncated)) = read_bounded_line(&mut reader)? else {
            return Err("second line missing".into());
        };
        assert_eq!(first.len(), super::MAX_LOG_LINE_BYTES);
        assert!(truncated);
        assert_eq!(second, b"next\n");
        assert!(!second_truncated);
        Ok(())
    }

    #[test]
    fn constructs_a_safe_latexmk_invocation() -> Result<(), Box<dyn std::error::Error>> {
        let root = fixture_root();
        let validated = validate_build_with_resolver(
            BuildRequest {
                project_path: root.to_string_lossy().into_owned(),
                root_file: "main.tex".to_owned(),
                engine: BuildEngine::LatexmkPdf,
            },
            ProjectBuildConfiguration::default(),
            |_| Some(std::path::PathBuf::from("/usr/bin/latexmk")),
        )
        .map_err(|_| "validation failed")?;

        assert!(Path::new(&validated.invocation.executable).is_absolute());
        assert_eq!(
            validated.invocation.arguments,
            [
                "-pdf",
                "-interaction=nonstopmode",
                "-file-line-error",
                "-synctex=1",
                "main.tex"
            ]
        );
        Ok(())
    }

    #[test]
    fn preserves_custom_executable_and_argument_boundaries(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let executable = std::env::current_exe()?;
        let configuration = ProjectBuildConfiguration {
            root_file: Some("main.tex".to_owned()),
            custom_command: Some(CustomCommand {
                executable: executable.to_string_lossy().into_owned(),
                arguments: vec!["argument with spaces".to_owned(), "main.tex".to_owned()],
            }),
            custom_command_consent: true,
            ..ProjectBuildConfiguration::default()
        };
        let validated = validate_build_with_resolver(
            BuildRequest {
                project_path: fixture_root().to_string_lossy().into_owned(),
                root_file: "main.tex".to_owned(),
                engine: BuildEngine::LatexmkPdf,
            },
            configuration,
            |_| Some(std::path::PathBuf::from("/usr/bin/latexmk")),
        )
        .map_err(|_| "validation failed")?;

        assert_eq!(
            validated.invocation.executable,
            executable.to_string_lossy()
        );
        assert_eq!(
            validated.invocation.arguments,
            ["argument with spaces", "main.tex"]
        );
        assert!(validated.invocation.custom);
        Ok(())
    }

    #[test]
    fn rejects_frontend_supplied_build_configuration() -> Result<(), Box<dyn std::error::Error>> {
        let request = serde_json::from_value::<BuildRequest>(serde_json::json!({
            "projectPath": fixture_root().to_string_lossy(),
            "rootFile": "main.tex",
            "engine": "latexmkPdf",
            "configuration": {
                "schemaVersion": 1,
                "customCommand": {
                    "executable": "/tmp/forged-command",
                    "arguments": []
                },
                "customCommandConsent": true,
                "shellEscapeConsent": true
            }
        }));

        assert!(request.is_err());
        Ok(())
    }

    #[test]
    fn rejects_roots_outside_the_project() -> Result<(), Box<dyn std::error::Error>> {
        let root = fixture_root();
        let parent = root.parent().ok_or("fixture has no parent")?;
        let outside = parent.join("outside-build.tex");
        fs::write(&outside, "\\documentclass{article}")?;
        let result = validate_build(
            BuildRequest {
                project_path: root.to_string_lossy().into_owned(),
                root_file: "../outside-build.tex".to_owned(),
                engine: BuildEngine::PdfLatex,
            },
            ProjectBuildConfiguration::default(),
        );
        fs::remove_file(outside)?;

        assert!(result.is_err());
        Ok(())
    }

    #[test]
    fn parses_file_line_diagnostics_without_claiming_uncertain_paths() {
        let root = fixture_root();
        let entry = BuildLogEntry {
            sequence: 7,
            timestamp: 0,
            stream: BuildLogStream::Stderr,
            text: "chapters/results.tex:42: LaTeX Error: Missing \\begin{document}".to_owned(),
        };
        let diagnostic = parse_diagnostic(&entry, &root);

        assert!(diagnostic.is_some());
        if let Some(diagnostic) = diagnostic {
            assert!(matches!(diagnostic.severity, DiagnosticSeverity::Error));
            assert_eq!(diagnostic.file.as_deref(), Some("chapters/results.tex"));
            assert_eq!(diagnostic.line, Some(42));
            assert!(!diagnostic.mapping_uncertain);
        }
    }

    #[test]
    fn parses_windows_file_line_locations() {
        assert_eq!(
            file_line_message(r"C:\work\main.tex:12: Undefined control sequence"),
            Some((r"C:\work\main.tex", 12, " Undefined control sequence"))
        );
    }

    #[test]
    fn does_not_map_traversing_diagnostic_paths() {
        let root = fixture_root();
        let entry = BuildLogEntry {
            sequence: 9,
            timestamp: 0,
            stream: BuildLogStream::Stderr,
            text: "../outside.tex:3: error: escaped path".to_owned(),
        };
        let diagnostic = parse_diagnostic(&entry, &root);

        assert!(diagnostic.is_some_and(|item| item.file.is_none() && item.mapping_uncertain));
    }

    #[test]
    fn classifies_unmapped_tex_errors_and_warnings() {
        let root = fixture_root();
        let error = parse_diagnostic(
            &BuildLogEntry {
                sequence: 1,
                timestamp: 0,
                stream: BuildLogStream::Stdout,
                text: "! LaTeX Error: File `missing.sty' not found.".to_owned(),
            },
            &root,
        );
        let warning = parse_diagnostic(
            &BuildLogEntry {
                sequence: 2,
                timestamp: 0,
                stream: BuildLogStream::Stdout,
                text: "LaTeX Warning: Reference undefined.".to_owned(),
            },
            &root,
        );

        assert!(error.is_some_and(|item| matches!(item.severity, DiagnosticSeverity::Error)));
        assert!(warning.is_some_and(|item| matches!(item.severity, DiagnosticSeverity::Warning)));
    }

    #[test]
    fn serializes_event_fields_for_the_typescript_contract() {
        let event = BuildEvent::Finished {
            project_path: "/project".to_owned(),
            run_id: "run-1".to_owned(),
            status: BuildStatus::Succeeded,
            finished_at: 42,
            exit_code: Some(0),
        };
        let value = serde_json::to_value(event);

        assert!(value.is_ok());
        if let Ok(value) = value {
            assert_eq!(value.get("kind"), Some(&serde_json::json!("finished")));
            assert_eq!(
                value.get("projectPath"),
                Some(&serde_json::json!("/project"))
            );
            assert_eq!(value.get("runId"), Some(&serde_json::json!("run-1")));
            assert_eq!(value.get("finishedAt"), Some(&serde_json::json!(42)));
            assert_eq!(value.get("exitCode"), Some(&serde_json::json!(0)));
            assert!(value.get("project_path").is_none());
        }
    }

    #[cfg(unix)]
    #[test]
    fn detects_only_executable_tools_on_the_search_path() -> Result<(), Box<dyn std::error::Error>>
    {
        use std::os::unix::fs::PermissionsExt;

        let directory = std::env::temp_dir().join(format!(
            "tex-build-tools-{}",
            super::NEXT_RUN_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir(&directory)?;
        let executable = directory.join("available-tex");
        let unavailable = directory.join("unavailable-tex");
        fs::write(&executable, "#!/bin/sh\n")?;
        fs::write(&unavailable, "#!/bin/sh\n")?;
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o700))?;

        assert!(executable_available_in(
            "available-tex",
            [directory.clone()].into_iter()
        ));
        assert!(!executable_available_in(
            "unavailable-tex",
            [directory.clone()].into_iter()
        ));
        fs::remove_dir_all(directory)?;
        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn preserves_a_latex_engine_symlink_path() -> Result<(), Box<dyn std::error::Error>> {
        use std::os::unix::fs::{symlink, PermissionsExt};

        let directory = std::env::temp_dir().join(format!(
            "tex-build-engine-link-{}",
            super::NEXT_RUN_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir(&directory)?;
        let target = directory.join("xetex");
        let latex_engine = directory.join("xelatex");
        fs::write(&target, "#!/bin/sh\n")?;
        fs::set_permissions(&target, fs::Permissions::from_mode(0o700))?;
        symlink(&target, &latex_engine)?;

        let resolved = resolve_executable_in("xelatex", [directory.clone()].into_iter());

        assert_eq!(resolved.as_deref(), Some(latex_engine.as_path()));
        fs::remove_dir_all(directory)?;
        Ok(())
    }
}
