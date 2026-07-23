use std::{
    collections::{HashMap, VecDeque},
    env,
    ffi::OsString,
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
    bounded_io,
    build_diagnostics::{diagnostic_from_stream_line, diagnostics_from_log, BuildDiagnostic},
    project_access::ProjectAccess,
    project_config::{
        load_configuration_for_project, validate_configuration, BibliographyMode,
        EnvironmentSetting, ProjectBuildConfiguration,
    },
    source_read::resolve_latex_source_path,
};

const BUILD_EVENT: &str = "tex://build-event";
const MAX_RETAINED_RUNS: usize = 10;
const MAX_RETAINED_ENTRIES: usize = 500;
const MAX_RETAINED_LOG_BYTES: usize = 512 * 1024;
const MAX_LOG_LINE_BYTES: usize = 4 * 1024;
/// A `.log` from a large document runs to a few megabytes. Reading is bounded
/// so a crafted project cannot make TeX allocate without limit.
const MAX_ENGINE_LOG_BYTES: u64 = 16 * 1024 * 1024;
const OUTPUT_CHANNEL_CAPACITY: usize = 256;
const MAX_PROJECT_HISTORIES: usize = 16;
const MAX_BUILD_DURATION: Duration = Duration::from_secs(30 * 60);
static NEXT_RUN_ID: AtomicU64 = AtomicU64::new(1);

/// A profile the user selects. Three drive `latexmk`, which reruns LaTeX and the
/// bibliography tools until references resolve; `PdfLatex` is the single-pass
/// diagnostic mode and answers only what one engine run reports.
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
    bibliography: BibliographyMode,
    /// False for the single-pass profile, so the panel can say plainly that
    /// cross-references, the table of contents, and citations will not resolve.
    resolves_references: bool,
    custom: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildProfile {
    engine: BuildEngine,
    label: &'static str,
    description: &'static str,
    executable: &'static str,
    /// False for the single-pass profile. The panel states this rather than
    /// letting a document build "successfully" full of `??`.
    resolves_references: bool,
    recommended: bool,
    available: bool,
}

/// What a run turned out to be.
///
/// Not the exit code: `latexmk` can exit 0 having written nothing, and an
/// engine in `nonstopmode` routinely exits non-zero having written a usable
/// PDF. The artifact decides, and the exit code is one input among several.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BuildStatus {
    Running,
    Succeeded,
    SucceededWithProblems,
    Failed,
    Cancelled,
    TimedOut,
}

/// Whether this run left a PDF a reader can open.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PdfState {
    /// Written at or after the run started.
    Fresh,
    /// Present, but left over from an earlier run.
    Stale,
    Missing,
}

struct Outcome {
    status: BuildStatus,
    reason: String,
    pdf_fresh: bool,
}

/// What the run is doing right now, read from output the engine already
/// produces. `ui-ux-requirements.md` forbids an indefinite spinner as the only
/// evidence of work, and a LaTeX build is long enough for that to matter.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildProgress {
    /// `latexmk` announces each rule it runs; 0 before the first announcement.
    pass: u32,
    /// The tool that pass is running, as latexmk named it.
    tool: Option<String>,
    /// Pages shipped so far, from the engine's `[n]` markers.
    pages: u32,
    /// The engine's own closing summary, once it prints one.
    summary: Option<String>,
}

impl BuildProgress {
    /// Folds one output line into the run's progress. Returns whether anything
    /// changed, so an unchanged progress does not cost an IPC event.
    fn observe(&mut self, text: &str) -> bool {
        if let Some(rule) = latexmk_rule(text) {
            self.pass = self.pass.saturating_add(1);
            self.tool = Some(rule);
            return true;
        }
        if let Some(summary) = output_summary(text) {
            self.summary = Some(summary);
            return true;
        }
        let shipped = shipped_pages(text);
        if shipped > 0 {
            self.pages = self.pages.saturating_add(shipped);
            return true;
        }
        false
    }
}

/// `Latexmk: Run number 2 of rule 'pdflatex'` names the tool of the next pass.
fn latexmk_rule(text: &str) -> Option<String> {
    let marker = text.find("of rule '")?;
    let rest = text.get(marker + "of rule '".len()..)?;
    let end = rest.find('\'')?;
    let rule = rest.get(..end)?;
    (!rule.is_empty()).then(|| rule.to_owned())
}

/// `Output written on main.pdf (14 pages, 482913 bytes).`
fn output_summary(text: &str) -> Option<String> {
    let marker = text.find("Output written on ")?;
    let rest = text.get(marker..)?.trim_end();
    Some(rest.trim_end_matches('.').to_owned())
}

/// Counts the `[12]` page markers an engine emits as it ships pages. Only a
/// bracket opening on digits counts, so `[]` and `[pdftex.def]` do not.
fn shipped_pages(text: &str) -> u32 {
    let mut pages = 0_u32;
    let bytes = text.as_bytes();
    for (index, byte) in bytes.iter().enumerate() {
        if *byte != b'[' {
            continue;
        }
        if bytes.get(index + 1).is_some_and(u8::is_ascii_digit) {
            pages = pages.saturating_add(1);
        }
    }
    pages
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
pub struct BuildRun {
    id: String,
    project_path: String,
    invocation: BuildInvocation,
    status: BuildStatus,
    /// One sentence explaining a terminal status. `None` while running —
    /// "Failed" on its own is a word, not an outcome.
    reason: Option<String>,
    /// True when this run wrote the PDF. A failed run that still produced one
    /// is worth showing, labelled, rather than leaving a stale PDF unexplained.
    pdf_fresh: bool,
    started_at: u64,
    finished_at: Option<u64>,
    exit_code: Option<i32>,
    entries: Vec<BuildLogEntry>,
    diagnostics: Vec<BuildDiagnostic>,
    /// Lines dropped from the middle of an over-long log, so the panel can say
    /// so instead of presenting a truncated log as complete.
    elided_entries: u64,
    progress: BuildProgress,
    #[serde(skip)]
    retained_log_bytes: usize,
    #[serde(skip)]
    next_sequence: u64,
    /// Where the engine writes its `.log` and `.pdf`, resolved once at
    /// validation so the supervisor does not re-derive the output directory.
    #[serde(skip)]
    log_path: PathBuf,
    #[serde(skip)]
    pdf_path: PathBuf,
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
        /// One flush of output, in order. Batched because a real document
        /// produces thousands of lines and each event costs a round trip.
        entries: Vec<BuildLogEntry>,
        diagnostics: Vec<BuildDiagnostic>,
        /// Present only when this batch changed what the run is doing.
        progress: Option<BuildProgress>,
    },
    Finished {
        project_path: String,
        run_id: String,
        status: BuildStatus,
        /// One sentence explaining the status. Never absent on a finished run.
        reason: String,
        pdf_fresh: bool,
        finished_at: u64,
        exit_code: Option<i32>,
        /// The authoritative set read from the engine's `.log`. It replaces
        /// whatever the live stream produced.
        diagnostics: Vec<BuildDiagnostic>,
    },
}

/// A failure the panel can explain. The message is owned so it can name the
/// thing that failed: a single shared sentence for every cause is why a user
/// whose custom command was deleted used to read the same words as a poisoned
/// mutex.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildError {
    code: &'static str,
    message: String,
}

impl BuildError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
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
    log_path: PathBuf,
    pdf_path: PathBuf,
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
        unix_millis(),
        NEXT_RUN_ID.fetch_add(1, Ordering::Relaxed)
    );
    let stop_requested = Arc::new(AtomicBool::new(false));
    let run = BuildRun {
        id: run_id.clone(),
        project_path: validated.project_root.to_string_lossy().into_owned(),
        invocation: validated.invocation,
        status: BuildStatus::Running,
        reason: None,
        pdf_fresh: false,
        started_at: unix_millis(),
        finished_at: None,
        exit_code: None,
        entries: Vec::new(),
        diagnostics: Vec::new(),
        elided_entries: 0,
        progress: BuildProgress::default(),
        retained_log_bytes: 0,
        next_sequence: 1,
        log_path: validated.log_path,
        pdf_path: validated.pdf_path,
    };

    let child = {
        let mut projects = lock_projects(&controller)?;
        reserve_project_history(&mut projects, &validated.project_root)?;
        let project = projects.entry(validated.project_root.clone()).or_default();
        if project.active.is_some() {
            return Err(BuildError::new(
                "build-already-running",
                "A build is already running for this project. Stop it before starting another.",
            ));
        }
        // The executable existed when the invocation was validated. Failing to
        // start it now is a different condition from not having it at all.
        let child = command.group_spawn().map_err(|error| {
            BuildError::new(
                "build-spawn-failed",
                format!(
                    "TeX found the build tool but could not start it ({}). No build is running.",
                    error.kind()
                ),
            )
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
        return Err(BuildError::new(
            "build-supervisor-unavailable",
            "TeX could not supervise the build process. No build remains running.",
        ));
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
    let project_root = access
        .resolve(&project_path)
        .map_err(|_| project_unavailable())?;
    let projects = lock_projects(&controller)?;
    let active = projects
        .get(&project_root)
        .and_then(|project| project.active.as_ref())
        .ok_or_else(|| {
            BuildError::new(
                "build-not-running",
                "There is no active build to stop for this project.",
            )
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
    let project_root = access
        .resolve(&project_path)
        .map_err(|_| project_unavailable())?;
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
        .map_err(|_| project_unavailable())?
        .to_string_lossy()
        .into_owned();
    Ok(request)
}

fn configuration_for_request(
    app: &AppHandle,
    request: &BuildRequest,
) -> Result<ProjectBuildConfiguration, BuildError> {
    load_configuration_for_project(app, Path::new(&request.project_path))
        .map_err(|error| BuildError::new(error.code, error.message))
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
    validate_configuration(&project_root, &configuration)
        .map_err(|error| BuildError::new(error.code, error.message))?;
    let root_file = configuration.root_file.clone().unwrap_or(request.root_file);
    let relative_root = Path::new(&root_file);
    if relative_root.extension().and_then(|value| value.to_str()) != Some("tex") {
        return Err(invalid_root());
    }
    resolve_latex_source_path(&project_root, relative_root).map_err(|_| invalid_root())?;

    let (executable, arguments, custom) = if let Some(command) = &configuration.custom_command {
        let executable = Path::new(&command.executable)
            .canonicalize()
            .map_err(|_| custom_command_missing(&command.executable))?;
        (
            executable.to_string_lossy().into_owned(),
            command.arguments.clone(),
            true,
        )
    } else {
        let executable_name = request.engine.executable();
        let executable = executable_resolver(executable_name).ok_or_else(|| {
            BuildError::new(
                "build-tool-unavailable",
                match request.engine {
                    BuildEngine::PdfLatex => {
                        "pdfLaTeX is not installed or is unavailable on PATH. Install a TeX distribution, or choose another profile."
                    }
                    _ => {
                        "latexmk is not installed or is unavailable on PATH. Install it to build with this profile."
                    }
                },
            )
        })?;
        let mut arguments: Vec<String> = request
            .engine
            .leading_arguments()
            .iter()
            .map(|argument| (*argument).to_owned())
            .collect();
        arguments.extend(
            FIXED_ENGINE_ARGUMENTS
                .iter()
                .map(|argument| (*argument).to_owned()),
        );
        // `latexmk` runs the engine repeatedly, so it is the only profile that
        // has a bibliography sequence to control. A single pass has none.
        if request.engine.uses_latexmk() {
            if let Some(flag) = bibliography_argument(configuration.bibliography) {
                arguments.push(flag.to_owned());
            }
        }
        // Consent was recorded in a native dialog `validate_configuration`
        // re-checks, so reaching here means the user approved this project.
        if configuration.shell_escape {
            arguments.push("-shell-escape".to_owned());
        }
        if let Some(output) = &configuration.output_directory {
            let argument = if request.engine.uses_latexmk() {
                format!("-outdir={output}")
            } else {
                format!("-output-directory={output}")
            };
            arguments.push(argument);
        }
        // Prefix the validated relative root with `./` so a filename beginning
        // with `-` cannot be reinterpreted by the engine (notably latexmk) as an
        // option token. `root_file` is guaranteed relative by `resolve_latex_source_path`.
        arguments.push(format!("./{root_file}"));
        (executable.to_string_lossy().into_owned(), arguments, false)
    };

    let log_path = engine_output_path(
        &project_root,
        &root_file,
        configuration.output_directory.as_deref(),
        "log",
    );
    let pdf_path = engine_output_path(
        &project_root,
        &root_file,
        configuration.output_directory.as_deref(),
        "pdf",
    );
    Ok(ValidatedBuild {
        project_root: project_root.clone(),
        log_path,
        pdf_path,
        invocation: BuildInvocation {
            executable,
            arguments,
            working_directory: project_root.to_string_lossy().into_owned(),
            root_file,
            engine: request.engine,
            environment: output_environment(
                configuration.environment,
                configuration.output_directory.as_deref(),
            ),
            bibliography: configuration.bibliography,
            resolves_references: !custom && request.engine.uses_latexmk(),
            custom,
        },
    })
}

/// Extends `TEXINPUTS` with the output directory.
///
/// With `-output-directory`, the engine writes `.aux` there and then cannot
/// find it on the next pass, so a multi-pass document never resolves its own
/// references. The trailing `:` keeps the distribution's default search path.
/// A project that set `TEXINPUTS` itself is left alone: its value is the more
/// specific instruction.
fn output_environment(
    mut environment: Vec<EnvironmentSetting>,
    output_directory: Option<&str>,
) -> Vec<EnvironmentSetting> {
    let Some(output) = output_directory else {
        return environment;
    };
    if environment
        .iter()
        .any(|setting| setting.name == "TEXINPUTS")
    {
        return environment;
    }
    environment.push(EnvironmentSetting {
        name: "TEXINPUTS".to_owned(),
        value: format!(".:{output}:"),
    });
    environment
}

/// Where the engine writes one of its outputs: beside the root file, or inside
/// the configured output directory. The path is derived from values already
/// validated as inside the project.
fn engine_output_path(
    project_root: &Path,
    root_file: &str,
    output_directory: Option<&str>,
    extension: &str,
) -> PathBuf {
    let relative = Path::new(root_file);
    let stem = relative.file_stem().map_or_else(
        || root_file.to_owned(),
        |stem| stem.to_string_lossy().into_owned(),
    );
    let directory = match output_directory {
        Some(output) => project_root.join(output),
        None => relative.parent().map_or_else(
            || project_root.to_path_buf(),
            |parent| project_root.join(parent),
        ),
    };
    directory.join(format!("{stem}.{extension}"))
}

/// Decides what a finished run was, from the artifact first and the exit code
/// second.
///
/// Cancellation and the deadline outrank everything, because both stopped the
/// run before it could say what it would have produced. Otherwise a fresh PDF
/// means the document built: reported errors downgrade that to
/// `SucceededWithProblems`, they do not erase a PDF that exists on disk.
fn derive_outcome(
    cancelled: bool,
    timed_out: bool,
    exit_success: bool,
    pdf: PdfState,
    errors: usize,
    pdf_name: &str,
) -> Outcome {
    let fresh = pdf == PdfState::Fresh;
    if cancelled {
        return Outcome {
            status: BuildStatus::Cancelled,
            reason: "The build was stopped before it finished. Generated files may be incomplete."
                .to_owned(),
            pdf_fresh: fresh,
        };
    }
    if timed_out {
        return Outcome {
            status: BuildStatus::TimedOut,
            reason: "The build reached the 30-minute limit and was stopped.".to_owned(),
            pdf_fresh: fresh,
        };
    }
    match (fresh, errors) {
        (true, 0) if exit_success => Outcome {
            status: BuildStatus::Succeeded,
            reason: format!("{pdf_name} is up to date."),
            pdf_fresh: true,
        },
        (true, 0) => Outcome {
            status: BuildStatus::SucceededWithProblems,
            reason: format!(
                "{pdf_name} was written, but the build tool reported a problem. The log has the detail."
            ),
            pdf_fresh: true,
        },
        (true, count) => Outcome {
            status: BuildStatus::SucceededWithProblems,
            reason: format!(
                "{pdf_name} was written, but {count} {} remain unresolved.",
                if count == 1 { "error" } else { "errors" }
            ),
            pdf_fresh: true,
        },
        (false, _) if exit_success => Outcome {
            status: BuildStatus::Failed,
            reason: "The build tool reported success but wrote no PDF.".to_owned(),
            pdf_fresh: false,
        },
        (false, 0) => Outcome {
            status: BuildStatus::Failed,
            reason: match pdf {
                PdfState::Stale => format!(
                    "No PDF was written, so {pdf_name} is still from an earlier build."
                ),
                _ => "The build stopped without writing a PDF.".to_owned(),
            },
            pdf_fresh: false,
        },
        (false, count) => Outcome {
            status: BuildStatus::Failed,
            reason: format!(
                "No PDF was written. {count} {} to resolve.",
                if count == 1 { "error" } else { "errors" }
            ),
            pdf_fresh: false,
        },
    }
}

/// Whether the PDF on disk belongs to this run. `started_at` is the run's own
/// clock, so a PDF an editor wrote mid-build still reads as fresh — which is
/// the honest answer: something updated it during this run.
fn pdf_state(path: &Path, started_at: u64) -> PdfState {
    let Ok(metadata) = path.metadata() else {
        return PdfState::Missing;
    };
    if !metadata.is_file() {
        return PdfState::Missing;
    }
    let written = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| {
            u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
        });
    // A filesystem with one-second timestamp granularity reports a file
    // written during this run as up to a second early, so the comparison
    // tolerates that rather than calling a fresh PDF stale.
    if written.saturating_add(1_000) >= started_at {
        PdfState::Fresh
    } else {
        PdfState::Stale
    }
}

/// Applied to every engine invocation. `-interaction=nonstopmode` keeps TeX off
/// a terminal that does not exist, `-file-line-error` produces the only
/// locatable error format, `-synctex=1` backs two-way navigation, and
/// `-recorder` records which files the run actually read.
const FIXED_ENGINE_ARGUMENTS: [&str; 4] = [
    "-interaction=nonstopmode",
    "-file-line-error",
    "-synctex=1",
    "-recorder",
];

fn bibliography_argument(mode: BibliographyMode) -> Option<&'static str> {
    match mode {
        BibliographyMode::Automatic => Some("-bibtex-cond"),
        BibliographyMode::Always => Some("-bibtex"),
        BibliographyMode::Never => Some("-bibtex-"),
    }
}

impl BuildEngine {
    const ALL: [Self; 4] = [
        Self::LatexmkPdf,
        Self::PdfLatex,
        Self::XeLatex,
        Self::LuaLatex,
    ];

    /// `latexmk` reruns the engine and the bibliography tools until references
    /// resolve. The single-pass profile deliberately does not.
    fn uses_latexmk(self) -> bool {
        !matches!(self, Self::PdfLatex)
    }

    fn executable(self) -> &'static str {
        if self.uses_latexmk() {
            "latexmk"
        } else {
            "pdflatex"
        }
    }

    fn leading_arguments(self) -> &'static [&'static str] {
        match self {
            Self::LatexmkPdf => &["-pdf"],
            Self::XeLatex => &["-pdfxe"],
            Self::LuaLatex => &["-pdflua"],
            Self::PdfLatex => &[],
        }
    }

    fn profile(self) -> BuildProfile {
        let (label, description, recommended) = match self {
            Self::LatexmkPdf => (
                "pdfLaTeX",
                "Reruns pdfLaTeX and the bibliography tools until cross-references, the table of contents, and citations resolve.",
                true,
            ),
            Self::XeLatex => (
                "XeLaTeX",
                "Reruns XeLaTeX and the bibliography tools until references resolve. Use for system fonts and OpenType.",
                false,
            ),
            Self::LuaLatex => (
                "LuaLaTeX",
                "Reruns LuaLaTeX and the bibliography tools until references resolve. Use for LuaTeX features.",
                false,
            ),
            Self::PdfLatex => (
                "Single pass (pdfLaTeX)",
                "One pdfLaTeX run, for reading what the engine reports right now. Cross-references, the table of contents, and citations will not resolve.",
                false,
            ),
        };
        BuildProfile {
            engine: self,
            label,
            description,
            executable: self.executable(),
            resolves_references: self.uses_latexmk(),
            recommended,
            available: executable_available(self.executable()),
        }
    }
}

fn executable_available(executable: &str) -> bool {
    resolve_executable(executable).is_some()
}

pub(crate) fn resolve_executable(executable: &str) -> Option<PathBuf> {
    resolve_executable_in(executable, search_directories().into_iter())
}

/// `PATH` first, then the fixed locations a platform TeX distribution installs
/// into. A desktop application launched from the dock inherits a minimal `PATH`
/// that omits them, so without this a freshly installed distribution would look
/// missing until the session was restarted.
fn search_directories() -> Vec<PathBuf> {
    let mut directories: Vec<PathBuf> = env::var_os("PATH")
        .map(|path| env::split_paths(&path).collect())
        .unwrap_or_default();
    for candidate in distribution_directories() {
        if !directories.contains(&candidate) {
            directories.push(candidate);
        }
    }
    directories
}

#[cfg(target_os = "macos")]
fn distribution_directories() -> Vec<PathBuf> {
    vec![PathBuf::from("/Library/TeX/texbin")]
}

#[cfg(windows)]
fn distribution_directories() -> Vec<PathBuf> {
    // MiKTeX installs per user under `Programs` and machine-wide directly
    // under `Program Files`.
    [("LOCALAPPDATA", true), ("ProgramFiles", false)]
        .iter()
        .filter_map(|(variable, per_user)| {
            env::var_os(variable).map(|root| {
                let base = Path::new(&root);
                let base = if *per_user {
                    base.join("Programs")
                } else {
                    base.to_path_buf()
                };
                base.join("MiKTeX").join("miktex").join("bin").join("x64")
            })
        })
        .collect()
}

#[cfg(all(unix, not(target_os = "macos")))]
fn distribution_directories() -> Vec<PathBuf> {
    Vec::new()
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
    if let Some(path) = sibling_tool_path(Path::new(&invocation.executable)) {
        command.env("PATH", path);
    }
    for (name, value) in LOG_FIDELITY_ENVIRONMENT {
        command.env(name, value);
    }
    // The allowlist in `project_config` excludes every variable set above, so a
    // project cannot weaken the search path or the log format.
    for setting in &invocation.environment {
        command.env(&setting.name, &setting.value);
    }
    command
}

/// TeX wraps its log at 79 columns, which splits a diagnostic away from the
/// `l.NN` context line that locates it. These are web2c settings: TeX Live
/// honours them and other distributions may not, so the log parser rejoins
/// wrapped lines regardless and treats this only as improved fidelity.
const LOG_FIDELITY_ENVIRONMENT: [(&str, &str); 3] = [
    ("max_print_line", "10000"),
    ("error_line", "254"),
    ("half_error_line", "238"),
];

/// A TeX distribution's tools invoke each other by bare name: `latexmk` spawns
/// `pdflatex`, `biber`, and `bibtex`. When the engine was resolved from a
/// directory the inherited `PATH` does not contain, that directory has to be on
/// the child's `PATH` or the build fails looking for its own siblings. Only the
/// directory of the executable already chosen is added.
fn sibling_tool_path(executable: &Path) -> Option<OsString> {
    let directory = executable.parent()?;
    let inherited = env::var_os("PATH").unwrap_or_default();
    if env::split_paths(&inherited).any(|entry| entry == directory) {
        return None;
    }
    let entries = std::iter::once(directory.to_path_buf()).chain(env::split_paths(&inherited));
    env::join_paths(entries).ok()
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
        append_logs(
            app,
            controller,
            project_root,
            run_id,
            vec![(
                BuildLogStream::Stderr,
                "Build stopped because output supervision was unavailable.".to_owned(),
            )],
        );
        finish_run(
            app,
            controller,
            project_root,
            run_id,
            false,
            false,
            false,
            None,
        );
        return;
    };

    let deadline = Instant::now() + MAX_BUILD_DURATION;
    let mut timed_out = false;
    // Latched when TeX decides to stop the run, not read afterwards. Reading
    // the flag after the wait reports a build the user stopped a moment *after*
    // it had already succeeded as cancelled.
    let mut cancelled = false;
    let mut interrupted_at: Option<Instant> = None;
    let exit_status = loop {
        drain_output(&receiver, app, controller, project_root, run_id);
        timed_out |= Instant::now() >= deadline;
        let stopping = stop_requested.load(Ordering::Acquire) || timed_out;
        match interrupted_at {
            None if stopping => {
                cancelled = !timed_out;
                request_interrupt(child);
                interrupted_at = Some(Instant::now());
            }
            // The engine was asked to stop and did not. Escalate once.
            Some(sent) if sent.elapsed() >= GRACEFUL_STOP_GRACE => {
                let _ = child.kill();
                interrupted_at = Some(Instant::now() + GRACEFUL_STOP_GRACE);
            }
            _ => {}
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
        append_logs(
            app,
            controller,
            project_root,
            run_id,
            vec![(
                BuildLogStream::Stderr,
                "Build stopped after reaching the 30-minute execution limit.".to_owned(),
            )],
        );
    }

    let exit_code = exit_status
        .as_ref()
        .and_then(std::process::ExitStatus::code);
    let exit_success = exit_status
        .as_ref()
        .is_some_and(std::process::ExitStatus::success);
    finish_run(
        app,
        controller,
        project_root,
        run_id,
        cancelled,
        timed_out,
        exit_success,
        exit_code,
    );
}

/// How long the engine gets to stop on its own before it is killed.
const GRACEFUL_STOP_GRACE: Duration = Duration::from_secs(2);

/// Asks the process group to stop, rather than killing it outright.
///
/// `latexmk` maintains a `.fdb_latexmk` database across runs. Killed mid-write,
/// it leaves that database describing a run that never completed, and the next
/// build replays a stored failure instead of compiling — the state the panel
/// already has to explain. An interrupt lets latexmk close its own files.
#[cfg(unix)]
fn request_interrupt(child: &mut GroupChild) {
    // `group_spawn` makes the child its own process-group leader, so its pid is
    // the group id. Signalling the group needs `libc`, and this crate forbids
    // `unsafe`; `/bin/kill` reaches the same call without either.
    let mut command = Command::new("/bin/kill");
    command
        .args(["-INT", &format!("-{}", child.id())])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if crate::process_support::run_status(&mut command, GRACEFUL_STOP_GRACE).is_err() {
        let _ = child.kill();
    }
}

/// Windows has no interrupt equivalent for a detached process group, so the
/// group is terminated and the auxiliary state is treated as suspect.
#[cfg(not(unix))]
fn request_interrupt(child: &mut GroupChild) {
    let _ = child.kill();
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

pub(crate) fn read_bounded_line(
    reader: &mut impl BufRead,
) -> std::io::Result<Option<(Vec<u8>, bool)>> {
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

/// Moves everything the readers have produced into the run, as one event.
///
/// A real document emits five to twenty thousand log lines. One IPC event per
/// line is that many JSON round-trips and reducer passes, so lines are gathered
/// and flushed together; the flush interval is short enough that the panel
/// still reads as live.
fn drain_output(
    receiver: &mpsc::Receiver<(BuildLogStream, String)>,
    app: &AppHandle,
    controller: &BuildController,
    project_root: &Path,
    run_id: &str,
) {
    let batch: Vec<(BuildLogStream, String)> = receiver.try_iter().collect();
    if batch.is_empty() {
        return;
    }
    append_logs(app, controller, project_root, run_id, batch);
}

fn append_logs(
    app: &AppHandle,
    controller: &BuildController,
    project_root: &Path,
    run_id: &str,
    batch: Vec<(BuildLogStream, String)>,
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
        let timestamp = unix_millis();
        let mut entries = Vec::with_capacity(batch.len());
        let mut diagnostics = Vec::new();
        let mut progressed = false;
        for (stream, text) in batch {
            let sequence = run.next_sequence;
            run.next_sequence = run.next_sequence.saturating_add(1);
            progressed |= run.progress.observe(&text);
            let entry = BuildLogEntry {
                sequence,
                timestamp,
                stream,
                text,
            };
            if let Some(diagnostic) = diagnostic_from_stream_line(&entry.text, project_root) {
                diagnostics.push(BuildDiagnostic {
                    log_sequence: Some(sequence),
                    ..diagnostic
                });
            }
            run.retained_log_bytes = run.retained_log_bytes.saturating_add(entry.text.len());
            run.entries.push(entry.clone());
            entries.push(entry);
        }
        retain_head_and_tail(run);
        // Diagnostics are retained independently of the log. A long build
        // evicts the lines that carried its first error, and dropping the
        // diagnostic with the line would empty the panel of the very problem
        // the reader needs.
        run.diagnostics.extend(diagnostics.iter().cloned());
        while run.diagnostics.len() > MAX_RETAINED_ENTRIES {
            run.diagnostics.remove(0);
        }
        BuildEvent::Log {
            project_path: project_root.to_string_lossy().into_owned(),
            run_id: run_id.to_owned(),
            entries,
            diagnostics,
            progress: progressed.then(|| run.progress.clone()),
        }
    };
    let _ = app.emit(BUILD_EVENT, event);
}

/// Keeps the beginning and the end of a long log rather than the end alone.
///
/// LaTeX reports its first error early and then cascades; evicting the oldest
/// lines evicts exactly the part worth reading. The elided middle is replaced
/// by one entry that says how much was dropped, so the log never silently
/// pretends to be complete.
fn retain_head_and_tail(run: &mut BuildRun) {
    if run.entries.len() <= MAX_RETAINED_ENTRIES && run.retained_log_bytes <= MAX_RETAINED_LOG_BYTES
    {
        return;
    }
    let head = MAX_RETAINED_ENTRIES / 4;
    // The notice occupies an entry of its own, so one slot is reserved for it
    // unless a previous trim already left one in place.
    let carries_notice = run
        .entries
        .get(head)
        .is_some_and(|entry| entry.sequence == 0);
    let limit = if carries_notice {
        MAX_RETAINED_ENTRIES
    } else {
        MAX_RETAINED_ENTRIES.saturating_sub(1)
    };
    let mut removed = 0_usize;
    while run.entries.len() > limit || run.retained_log_bytes > MAX_RETAINED_LOG_BYTES {
        if run.entries.len() <= head + 1 {
            break;
        }
        let position = if carries_notice { head + 1 } else { head };
        let entry = run.entries.remove(position);
        run.retained_log_bytes = run.retained_log_bytes.saturating_sub(entry.text.len());
        removed += 1;
    }
    if removed == 0 {
        return;
    }
    let elision = run.elided_entries.saturating_add(removed as u64);
    run.elided_entries = elision;
    let notice = BuildLogEntry {
        sequence: 0,
        timestamp: unix_millis(),
        stream: BuildLogStream::Stdout,
        text: format!("… {elision} lines omitted from the middle of this log …"),
    };
    match run.entries.get_mut(head) {
        Some(existing) if existing.sequence == 0 => *existing = notice,
        _ => run.entries.insert(head, notice),
    }
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
        .ok_or_else(|| {
            BuildError::new(
                "build-capacity-reached",
                "Too many projects are building at once. Stop a build before starting another.",
            )
        })?;
    projects.remove(&candidate);
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn finish_run(
    app: &AppHandle,
    controller: &BuildController,
    project_root: &Path,
    run_id: &str,
    cancelled: bool,
    timed_out: bool,
    exit_success: bool,
    exit_code: Option<i32>,
) {
    let finished_at = unix_millis();
    // Read before taking the lock for the status update: the log is the
    // authoritative diagnostic set and the panel adopts it in the same event
    // that reports the outcome, so the two never disagree.
    let diagnostics = adopt_log_diagnostics(controller, project_root, run_id);
    let errors = diagnostics
        .iter()
        .filter(|item| item.severity == crate::build_diagnostics::DiagnosticSeverity::Error)
        .count();
    let outcome = {
        let artifact = controller.projects.lock().ok().and_then(|projects| {
            projects
                .get(project_root)
                .and_then(|project| project.runs.iter().find(|run| run.id == run_id))
                .map(|run| (run.pdf_path.clone(), run.started_at))
        });
        match artifact {
            Some((path, started_at)) => {
                let name = path.file_name().map_or_else(
                    || "The PDF".to_owned(),
                    |name| name.to_string_lossy().into_owned(),
                );
                derive_outcome(
                    cancelled,
                    timed_out,
                    exit_success,
                    pdf_state(&path, started_at),
                    errors,
                    &name,
                )
            }
            None => derive_outcome(
                cancelled,
                timed_out,
                exit_success,
                PdfState::Missing,
                errors,
                "The PDF",
            ),
        }
    };
    let status = outcome.status;
    if let Ok(mut projects) = controller.projects.lock() {
        if let Some(project) = projects.get_mut(project_root) {
            if let Some(run) = project.runs.iter_mut().find(|run| run.id == run_id) {
                run.status = status;
                run.reason = Some(outcome.reason.clone());
                run.pdf_fresh = outcome.pdf_fresh;
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
            reason: outcome.reason,
            pdf_fresh: outcome.pdf_fresh,
            finished_at,
            exit_code,
            diagnostics,
        },
    );
}

/// Replaces the run's diagnostics with the set read from the engine's `.log`.
///
/// The stream produced diagnostics while the run was going so the panel was
/// never empty, but it saw wrapped lines, no `l.NN` context, and every pass
/// separately. The log is the same text intact, so it decides what the run
/// reported. A log TeX never wrote leaves the streamed set in place rather
/// than clearing a panel that had something useful in it.
fn adopt_log_diagnostics(
    controller: &BuildController,
    project_root: &Path,
    run_id: &str,
) -> Vec<BuildDiagnostic> {
    let log_path = {
        let Ok(projects) = controller.projects.lock() else {
            return Vec::new();
        };
        let Some(run) = projects
            .get(project_root)
            .and_then(|project| project.runs.iter().find(|run| run.id == run_id))
        else {
            return Vec::new();
        };
        run.log_path.clone()
    };
    let Ok(bytes) = bounded_io::read(&log_path, MAX_ENGINE_LOG_BYTES) else {
        return current_diagnostics(controller, project_root, run_id);
    };
    let mut diagnostics = diagnostics_from_log(&String::from_utf8_lossy(&bytes), project_root);
    if diagnostics.is_empty() {
        return current_diagnostics(controller, project_root, run_id);
    }
    let Ok(mut projects) = controller.projects.lock() else {
        return diagnostics;
    };
    let Some(run) = projects
        .get_mut(project_root)
        .and_then(|project| project.runs.iter_mut().find(|run| run.id == run_id))
    else {
        return diagnostics;
    };
    link_to_log_entries(&mut diagnostics, &run.entries);
    run.diagnostics = diagnostics.clone();
    diagnostics
}

fn current_diagnostics(
    controller: &BuildController,
    project_root: &Path,
    run_id: &str,
) -> Vec<BuildDiagnostic> {
    controller.projects.lock().map_or_else(
        |_| Vec::new(),
        |projects| {
            projects
                .get(project_root)
                .and_then(|project| project.runs.iter().find(|run| run.id == run_id))
                .map_or_else(Vec::new, |run| run.diagnostics.clone())
        },
    )
}

/// Points each log-derived diagnostic at the streamed line that carried it, so
/// the panel can still jump into the raw output. A diagnostic whose line was
/// elided keeps its own `raw` text and simply offers no jump.
fn link_to_log_entries(diagnostics: &mut [BuildDiagnostic], entries: &[BuildLogEntry]) {
    let mut by_text: HashMap<&str, u64> = HashMap::with_capacity(entries.len());
    for entry in entries {
        by_text.entry(entry.text.trim()).or_insert(entry.sequence);
    }
    for diagnostic in diagnostics {
        diagnostic.log_sequence = by_text.get(diagnostic.raw.trim()).copied();
    }
}

fn canonical_project_root(path: &Path) -> Result<PathBuf, BuildError> {
    let root = path.canonicalize().map_err(|_| project_unavailable())?;
    if root.is_dir() {
        Ok(root)
    } else {
        Err(root_not_a_directory())
    }
}

fn lock_projects(
    controller: &BuildController,
) -> Result<MutexGuard<'_, HashMap<PathBuf, ProjectBuildState>>, BuildError> {
    controller
        .projects
        .lock()
        .map_err(|_| controller_unavailable())
}

fn invalid_root() -> BuildError {
    BuildError::new(
        "invalid-build-root",
        "Choose an available LaTeX root file inside this project before building.",
    )
}

/// Each cause gets its own sentence. The code stays stable for the frontend;
/// the wording tells the reader which of these actually happened.
fn project_unavailable() -> BuildError {
    BuildError::new(
        "build-project-unavailable",
        "TeX no longer has access to this project folder. Reopen the project to build it.",
    )
}

fn root_not_a_directory() -> BuildError {
    BuildError::new(
        "build-project-unavailable",
        "The project path is not a folder TeX can build in.",
    )
}

fn custom_command_missing(executable: &str) -> BuildError {
    BuildError::new(
        "custom-command-missing",
        format!(
            "The custom build command {executable} no longer exists. Update it in build settings."
        ),
    )
}

fn controller_unavailable() -> BuildError {
    BuildError::new(
        "build-unavailable",
        "TeX lost track of this project's builds. Your source files were not changed.",
    )
}

/// Milliseconds since the epoch. Whole seconds cannot express the duration of
/// a build, and a build tool that cannot state its own elapsed time reads as
/// unfinished.
fn unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| {
            u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
        })
}

#[cfg(test)]
mod tests {
    use std::{fs, io::Cursor, path::Path};

    use super::{
        derive_outcome, engine_output_path, executable_available_in, read_bounded_line,
        resolve_executable_in, retain_head_and_tail, sibling_tool_path, validate_build,
        validate_build_with_resolver, BuildEngine, BuildEvent, BuildLogEntry, BuildLogStream,
        BuildRequest, BuildRun, BuildStatus, PdfState,
    };
    use crate::project_config::{
        BibliographyMode, CustomCommand, EnvironmentSetting, ProjectBuildConfiguration,
    };

    fn fixture_root() -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/root-detection")
    }

    /// `latexmk` resolved outside `PATH` still has to find `pdflatex` beside
    /// it, so its directory is prepended for the child process.
    #[test]
    fn engine_directory_joins_the_child_search_path() -> Result<(), Box<dyn std::error::Error>> {
        let inherited = std::env::var_os("PATH").unwrap_or_default();
        let unlisted = std::env::split_paths(&inherited).next().map_or_else(
            || "/tex/bin".to_owned(),
            |entry| format!("{}-tex-distribution", entry.to_string_lossy()),
        );

        let Some(joined) = sibling_tool_path(Path::new(&unlisted).join("latexmk").as_path()) else {
            return Err("an unlisted engine directory must extend PATH".into());
        };
        let mut entries = std::env::split_paths(&joined);

        assert_eq!(entries.next(), Some(Path::new(&unlisted).to_path_buf()));
        assert_eq!(
            entries.count(),
            std::env::split_paths(&inherited).count(),
            "the inherited PATH is preserved after the engine directory"
        );
        Ok(())
    }

    #[test]
    fn a_listed_engine_directory_leaves_the_search_path_untouched() {
        let Some(listed) = std::env::var_os("PATH")
            .map(|path| std::env::split_paths(&path).next())
            .unwrap_or_default()
        else {
            return;
        };

        assert!(sibling_tool_path(listed.join("latexmk").as_path()).is_none());
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

    fn validated_arguments(
        engine: BuildEngine,
        configuration: ProjectBuildConfiguration,
    ) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        let validated = validate_build_with_resolver(
            BuildRequest {
                project_path: fixture_root().to_string_lossy().into_owned(),
                root_file: "main.tex".to_owned(),
                engine,
            },
            configuration,
            |name| Some(std::path::PathBuf::from(format!("/usr/bin/{name}"))),
        )
        .map_err(|_| "validation failed")?;
        Ok(validated.invocation.arguments)
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
                "-recorder",
                "-bibtex-cond",
                "./main.tex"
            ]
        );
        assert!(validated.invocation.resolves_references);
        Ok(())
    }

    /// Every reference-resolving profile drives latexmk. A document with a
    /// table of contents or a `\ref` cannot be built by one engine run, and a
    /// profile that ran one anyway would report success on a broken PDF.
    #[test]
    fn reference_resolving_profiles_drive_latexmk() -> Result<(), Box<dyn std::error::Error>> {
        for (engine, flag) in [
            (BuildEngine::LatexmkPdf, "-pdf"),
            (BuildEngine::XeLatex, "-pdfxe"),
            (BuildEngine::LuaLatex, "-pdflua"),
        ] {
            let validated = validate_build_with_resolver(
                BuildRequest {
                    project_path: fixture_root().to_string_lossy().into_owned(),
                    root_file: "main.tex".to_owned(),
                    engine,
                },
                ProjectBuildConfiguration::default(),
                |name| Some(std::path::PathBuf::from(format!("/usr/bin/{name}"))),
            )
            .map_err(|_| "validation failed")?;

            assert!(validated.invocation.executable.ends_with("latexmk"));
            assert_eq!(
                validated.invocation.arguments.first().map(String::as_str),
                Some(flag)
            );
            assert!(validated.invocation.resolves_references);
        }
        Ok(())
    }

    /// The single-pass profile runs the engine once and says so. It carries no
    /// bibliography flag because it has no rerun sequence to control.
    #[test]
    fn the_single_pass_profile_runs_one_engine_pass() -> Result<(), Box<dyn std::error::Error>> {
        let validated = validate_build_with_resolver(
            BuildRequest {
                project_path: fixture_root().to_string_lossy().into_owned(),
                root_file: "main.tex".to_owned(),
                engine: BuildEngine::PdfLatex,
            },
            ProjectBuildConfiguration {
                bibliography: BibliographyMode::Always,
                ..ProjectBuildConfiguration::default()
            },
            |name| Some(std::path::PathBuf::from(format!("/usr/bin/{name}"))),
        )
        .map_err(|_| "validation failed")?;

        assert!(validated.invocation.executable.ends_with("pdflatex"));
        assert!(!validated.invocation.resolves_references);
        assert!(!validated
            .invocation
            .arguments
            .iter()
            .any(|argument| argument.starts_with("-bibtex")));
        Ok(())
    }

    /// Shell escape reaches the standard invocation, so a `minted` document
    /// keeps SyncTeX, `-file-line-error`, and the injection guard instead of
    /// having to abandon them for a custom command.
    #[test]
    fn applies_consented_shell_escape_to_the_safe_engine() -> Result<(), Box<dyn std::error::Error>>
    {
        let arguments = validated_arguments(
            BuildEngine::LatexmkPdf,
            ProjectBuildConfiguration {
                shell_escape: true,
                shell_escape_consent: true,
                ..ProjectBuildConfiguration::default()
            },
        )?;

        assert!(arguments.iter().any(|argument| argument == "-shell-escape"));
        assert!(arguments.iter().any(|argument| argument == "-synctex=1"));
        assert!(arguments
            .iter()
            .any(|argument| argument == "-file-line-error"));
        assert_eq!(arguments.last().map(String::as_str), Some("./main.tex"));
        Ok(())
    }

    #[test]
    fn omits_shell_escape_by_default() -> Result<(), Box<dyn std::error::Error>> {
        let arguments = validated_arguments(
            BuildEngine::LatexmkPdf,
            ProjectBuildConfiguration::default(),
        )?;

        assert!(!arguments.iter().any(|argument| argument == "-shell-escape"));
        Ok(())
    }

    /// With `-output-directory` the engine writes `.aux` into the output
    /// directory and cannot find it on the next pass, so a multi-pass document
    /// never resolves its own references.
    #[test]
    fn extends_the_search_path_for_an_output_directory() {
        let extended = super::output_environment(Vec::new(), Some("build"));
        assert_eq!(
            extended
                .iter()
                .find(|setting| setting.name == "TEXINPUTS")
                .map(|setting| setting.value.as_str()),
            Some(".:build:")
        );

        assert!(super::output_environment(Vec::new(), None).is_empty());

        // A project that set TEXINPUTS itself gave the more specific
        // instruction, and TeX does not overrule it.
        let configured = vec![EnvironmentSetting {
            name: "TEXINPUTS".to_owned(),
            value: "styles:".to_owned(),
        }];
        assert_eq!(
            super::output_environment(configured, Some("build"))
                .first()
                .map(|setting| setting.value.as_str()),
            Some("styles:")
        );
    }

    /// Each bibliography mode reaches latexmk as a distinct flag. The setting
    /// this replaced produced identical commands for two of its four values.
    #[test]
    fn every_bibliography_mode_changes_the_command() -> Result<(), Box<dyn std::error::Error>> {
        let flag = |mode| -> Result<String, Box<dyn std::error::Error>> {
            let arguments = validated_arguments(
                BuildEngine::LatexmkPdf,
                ProjectBuildConfiguration {
                    bibliography: mode,
                    ..ProjectBuildConfiguration::default()
                },
            )?;
            Ok(arguments
                .into_iter()
                .find(|argument| argument.starts_with("-bibtex"))
                .ok_or("no bibliography flag")?)
        };

        assert_eq!(flag(BibliographyMode::Automatic)?, "-bibtex-cond");
        assert_eq!(flag(BibliographyMode::Always)?, "-bibtex");
        assert_eq!(flag(BibliographyMode::Never)?, "-bibtex-");
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
    fn serializes_event_fields_for_the_typescript_contract() {
        let event = BuildEvent::Finished {
            project_path: "/project".to_owned(),
            run_id: "run-1".to_owned(),
            status: BuildStatus::Succeeded,
            reason: "main.pdf is up to date.".to_owned(),
            pdf_fresh: true,
            finished_at: 42,
            exit_code: Some(0),
            diagnostics: Vec::new(),
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
            assert_eq!(value.get("diagnostics"), Some(&serde_json::json!([])));
            assert!(value.get("project_path").is_none());
        }
    }

    /// The engine writes its `.log` beside the root file, or into the output
    /// directory when one is configured. Reading the wrong one leaves the panel
    /// with no diagnostics for a build that plainly failed.
    #[test]
    fn resolves_the_engine_log_beside_the_root_or_in_the_output_directory() {
        let root = Path::new("/projects/thesis");

        assert_eq!(
            engine_output_path(root, "main.tex", None, "log"),
            root.join("main.log")
        );
        assert_eq!(
            engine_output_path(root, "sources/paper.tex", None, "log"),
            root.join("sources").join("paper.log")
        );
        assert_eq!(
            engine_output_path(root, "main.tex", Some("build"), "log"),
            root.join("build").join("main.log")
        );
        assert_eq!(
            engine_output_path(root, "main.tex", Some("build"), "pdf"),
            root.join("build").join("main.pdf")
        );
    }

    fn log_run(entries: usize) -> BuildRun {
        let mut run = BuildRun {
            id: "run-1".to_owned(),
            project_path: "/project".to_owned(),
            invocation: super::BuildInvocation {
                executable: "/usr/bin/latexmk".to_owned(),
                arguments: Vec::new(),
                working_directory: "/project".to_owned(),
                root_file: "main.tex".to_owned(),
                engine: BuildEngine::LatexmkPdf,
                environment: Vec::new(),
                bibliography: BibliographyMode::Automatic,
                resolves_references: true,
                custom: false,
            },
            status: BuildStatus::Running,
            reason: None,
            pdf_fresh: false,
            started_at: 0,
            finished_at: None,
            exit_code: None,
            entries: Vec::new(),
            diagnostics: Vec::new(),
            elided_entries: 0,
            progress: super::BuildProgress::default(),
            retained_log_bytes: 0,
            next_sequence: 1,
            log_path: std::path::PathBuf::new(),
            pdf_path: std::path::PathBuf::new(),
        };
        for sequence in 1..=entries {
            let text = format!("line {sequence}");
            run.retained_log_bytes += text.len();
            run.entries.push(BuildLogEntry {
                sequence: sequence as u64,
                timestamp: 0,
                stream: BuildLogStream::Stdout,
                text,
            });
        }
        run
    }

    /// LaTeX reports its first error early and then cascades. Evicting the
    /// oldest lines evicts exactly the part worth reading, so the head is kept
    /// and the gap is stated rather than hidden.
    #[test]
    fn retains_the_head_of_an_over_long_log_and_states_the_gap() {
        let mut run = log_run(super::MAX_RETAINED_ENTRIES + 200);

        retain_head_and_tail(&mut run);

        assert!(run.entries.len() <= super::MAX_RETAINED_ENTRIES);
        assert_eq!(
            run.entries.first().map(|entry| entry.text.as_str()),
            Some("line 1")
        );
        assert_eq!(
            run.entries.last().map(|entry| entry.text.as_str()),
            Some(format!("line {}", super::MAX_RETAINED_ENTRIES + 200).as_str())
        );
        assert!(run
            .entries
            .iter()
            .any(|entry| entry.text.contains("lines omitted from the middle")));
        assert!(run.elided_entries > 0);
    }

    /// `latexmk` can exit 0 having written nothing, and an engine in
    /// `nonstopmode` routinely exits non-zero having written a usable PDF. The
    /// artifact decides the outcome; the exit code is one input.
    #[test]
    fn judges_a_run_by_its_artifact_rather_than_its_exit_code() {
        let succeeded = derive_outcome(false, false, true, PdfState::Fresh, 0, "main.pdf");
        assert_eq!(succeeded.status, BuildStatus::Succeeded);
        assert!(succeeded.pdf_fresh);
        assert_eq!(succeeded.reason, "main.pdf is up to date.");

        // Exit 0, no PDF: the tool claimed success and produced nothing.
        let empty = derive_outcome(false, false, true, PdfState::Missing, 0, "main.pdf");
        assert_eq!(empty.status, BuildStatus::Failed);
        assert!(!empty.pdf_fresh);

        // Non-zero exit with a PDF this run wrote: the document exists, and the
        // errors are stated rather than hiding it.
        let partial = derive_outcome(false, false, false, PdfState::Fresh, 2, "main.pdf");
        assert_eq!(partial.status, BuildStatus::SucceededWithProblems);
        assert!(partial.pdf_fresh);
        assert!(partial.reason.contains("2 errors"));
    }

    /// A stale PDF is named as stale. Reporting only "Failed" leaves the reader
    /// looking at a PDF from an earlier build with no way to know it.
    #[test]
    fn says_when_the_visible_pdf_predates_the_run() {
        let outcome = derive_outcome(false, false, false, PdfState::Stale, 0, "main.pdf");

        assert_eq!(outcome.status, BuildStatus::Failed);
        assert!(!outcome.pdf_fresh);
        assert_eq!(
            outcome.reason,
            "No PDF was written, so main.pdf is still from an earlier build."
        );
    }

    /// A timeout is its own outcome. Reporting it as a plain failure buries the
    /// only fact that explains it.
    #[test]
    fn separates_a_timeout_and_a_cancellation_from_a_failure() {
        let timed_out = derive_outcome(false, true, false, PdfState::Missing, 0, "main.pdf");
        assert_eq!(timed_out.status, BuildStatus::TimedOut);
        assert!(timed_out.reason.contains("30-minute limit"));

        // Cancellation outranks the deadline: the user acted first.
        let cancelled = derive_outcome(true, true, false, PdfState::Missing, 0, "main.pdf");
        assert_eq!(cancelled.status, BuildStatus::Cancelled);
        assert!(cancelled.reason.contains("stopped before it finished"));
    }

    /// Every terminal outcome carries a sentence. "Failed" is a word, not an
    /// explanation.
    #[test]
    fn every_outcome_explains_itself() {
        for (cancelled, timed_out, success, pdf, errors) in [
            (false, false, true, PdfState::Fresh, 0),
            (false, false, false, PdfState::Fresh, 1),
            (false, false, false, PdfState::Missing, 0),
            (false, false, false, PdfState::Missing, 3),
            (false, true, false, PdfState::Stale, 0),
            (true, false, false, PdfState::Stale, 0),
        ] {
            let outcome = derive_outcome(cancelled, timed_out, success, pdf, errors, "main.pdf");
            assert!(outcome.reason.ends_with('.'), "{}", outcome.reason);
            assert!(outcome.reason.len() > 20, "{}", outcome.reason);
            assert!(!outcome.reason.contains(" you "), "{}", outcome.reason);
        }
    }

    /// An indefinite spinner is not evidence of work. Everything the panel
    /// needs to say what a build is doing is already in the output.
    #[test]
    fn reads_progress_out_of_the_engine_output() {
        let mut progress = super::BuildProgress::default();

        assert!(progress.observe("Latexmk: Run number 1 of rule 'pdflatex'"));
        assert_eq!(progress.pass, 1);
        assert_eq!(progress.tool.as_deref(), Some("pdflatex"));

        assert!(progress.observe("[1] [2] [3]"));
        assert_eq!(progress.pages, 3);

        assert!(progress.observe("Latexmk: Run number 2 of rule 'biber'"));
        assert_eq!(progress.pass, 2);
        assert_eq!(progress.tool.as_deref(), Some("biber"));

        assert!(progress.observe("Output written on main.pdf (14 pages, 482913 bytes)."));
        assert_eq!(
            progress.summary.as_deref(),
            Some("Output written on main.pdf (14 pages, 482913 bytes)")
        );
    }

    /// Verbatim from a real `latexmk` run of the `nasa-technical-report`
    /// fixture. latexmk prints the rule line without its own prefix, and the
    /// summary once per pass — the last one describes the delivered PDF.
    #[test]
    fn reads_progress_from_real_latexmk_output() {
        let mut progress = super::BuildProgress::default();

        for line in [
            "Run number 1 of rule 'pdflatex'",
            "Output written on main.pdf (12 pages, 102739 bytes).",
            "Run number 2 of rule 'pdflatex'",
            "Output written on main.pdf (12 pages, 108142 bytes).",
        ] {
            progress.observe(line);
        }

        assert_eq!(progress.pass, 2);
        assert_eq!(progress.tool.as_deref(), Some("pdflatex"));
        assert_eq!(
            progress.summary.as_deref(),
            Some("Output written on main.pdf (12 pages, 108142 bytes)")
        );
    }

    /// A bracket that opens a file name is not a shipped page. Counting them
    /// would report a page count no reader could reconcile with the PDF.
    #[test]
    fn counts_only_page_markers() {
        let mut progress = super::BuildProgress::default();

        assert!(!progress.observe("(/usr/local/texlive/tex/latex/graphics/pdftex.def"));
        assert!(!progress.observe("[]"));
        assert!(!progress.observe("LaTeX Font Info: checking [x]"));
        assert_eq!(progress.pages, 0);

        assert!(progress.observe("[12]"));
        assert_eq!(progress.pages, 1);
    }

    /// A log that fits is left exactly as it is; no notice, no reordering.
    #[test]
    fn leaves_a_short_log_untouched() {
        let mut run = log_run(10);

        retain_head_and_tail(&mut run);

        assert_eq!(run.entries.len(), 10);
        assert_eq!(run.elided_entries, 0);
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
