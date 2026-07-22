//! Guided installation of a LaTeX distribution through the platform package
//! manager the user already trusts.
//!
//! Every command this module can execute is chosen from a fixed compile-time
//! table: the requested method selects a table entry, and arguments are passed
//! to `Command` individually. No part of a command is assembled from caller
//! input, project content, or the filesystem.

use std::{
    io::BufReader,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, Mutex, MutexGuard,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use command_group::CommandGroup;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::build_system::{read_bounded_line, resolve_executable};

const INSTALL_EVENT: &str = "tex://latex-install-event";
const MAX_RETAINED_LOG_ENTRIES: usize = 400;
const STEP_TIMEOUT: Duration = Duration::from_secs(60 * 60);
const OUTPUT_CHANNEL_CAPACITY: usize = 256;
const VERIFIED_TOOLS: [&str; 4] = ["latexmk", "pdflatex", "xelatex", "lualatex"];
static NEXT_INSTALLATION_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallMethod {
    Homebrew,
    Winget,
    Pacman,
    Apt,
    Dnf,
    Zypper,
}

/// How the user is asked to authorize a system-wide package installation.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Elevation {
    /// A polkit agent shows the system authorization dialog.
    Polkit,
    /// The operating system prompts for an administrator password.
    SystemPassword,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallStepPlan {
    title: String,
    command: String,
    /// An optional step improves the result but does not decide it. Failure
    /// marks the step skipped and the installation continues to verification.
    optional: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOption {
    method: InstallMethod,
    manager: &'static str,
    distribution: &'static str,
    summary: &'static str,
    packages: Vec<&'static str>,
    download_estimate: &'static str,
    elevation: Elevation,
    recommended: bool,
    steps: Vec<InstallStepPlan>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualInstruction {
    summary: &'static str,
    command: Option<String>,
    documentation: &'static str,
}

/// A route TeX knows about on this platform but cannot run right now. Naming
/// the missing prerequisite is more useful than silently hiding the route.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnavailableOption {
    manager: &'static str,
    distribution: &'static str,
    reason: String,
    documentation: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSupport {
    platform: &'static str,
    options: Vec<InstallOption>,
    unavailable: Vec<UnavailableOption>,
    manual: ManualInstruction,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StepStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
    Skipped,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallStatus {
    Running,
    Succeeded,
    /// The package manager finished, but the tools are not visible to this
    /// process until it is restarted with a refreshed environment.
    RestartRequired,
    Failed,
    Cancelled,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallStepState {
    title: String,
    command: String,
    optional: bool,
    status: StepStatus,
    detail: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallLogEntry {
    sequence: u64,
    text: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    id: String,
    method: InstallMethod,
    status: InstallStatus,
    steps: Vec<InstallStepState>,
    active_step: Option<usize>,
    started_at: u64,
    finished_at: Option<u64>,
    message: Option<String>,
    available_tools: Vec<String>,
    log: Vec<InstallLogEntry>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum InstallEvent {
    Step {
        installation_id: String,
        index: usize,
        status: StepStatus,
        detail: Option<String>,
    },
    Log {
        installation_id: String,
        entry: InstallLogEntry,
    },
    Finished {
        installation_id: String,
        status: InstallStatus,
        finished_at: u64,
        message: String,
        available_tools: Vec<String>,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallError {
    code: &'static str,
    message: &'static str,
}

#[derive(Clone, Default)]
pub struct LatexInstallController {
    active: Arc<Mutex<Option<Installation>>>,
}

struct Installation {
    progress: InstallProgress,
    stop_requested: Arc<AtomicBool>,
    next_sequence: u64,
}

/// A step the supervisor can execute. Commands are fixed by the method table.
struct PreparedStep {
    title: String,
    command: String,
    optional: bool,
    action: StepAction,
}

enum StepAction {
    Run(CommandSpec),
    /// Resolved only after the distribution is installed, because `tlmgr`
    /// does not exist on the machine until then.
    Tlmgr {
        askpass: PathBuf,
        arguments: Vec<&'static str>,
    },
    VerifyTools,
}

enum Availability {
    Ready(InstallOption),
    Blocked(UnavailableOption),
    NotApplicable,
}

struct CommandSpec {
    executable: PathBuf,
    arguments: Vec<String>,
    environment: Vec<(String, String)>,
}

/// Reports the package managers actually present on this machine.
#[tauri::command]
pub fn get_latex_installation_support() -> InstallSupport {
    let mut options = Vec::new();
    let mut unavailable = Vec::new();
    for method in InstallMethod::ALL {
        match method.availability() {
            Availability::Ready(option) => options.push(option),
            Availability::Blocked(blocked) => unavailable.push(blocked),
            Availability::NotApplicable => {}
        }
    }
    InstallSupport {
        platform: platform_label(),
        options,
        unavailable,
        manual: manual_instruction(),
    }
}

/// Returns the installation this process is running or last ran, if any.
#[tauri::command]
pub fn get_latex_installation_progress(
    controller: State<'_, LatexInstallController>,
) -> Result<Option<InstallProgress>, InstallError> {
    Ok(lock_installation(&controller)?
        .as_ref()
        .map(|installation| installation.progress.clone()))
}

/// Starts the fixed package-manager command for `method` after the user has
/// seen and accepted the exact command in the interface.
#[tauri::command]
pub fn start_latex_installation(
    method: InstallMethod,
    app: AppHandle,
    controller: State<'_, LatexInstallController>,
) -> Result<InstallProgress, InstallError> {
    let steps = method.prepare(&app)?;
    let id = format!(
        "{}-{}",
        unix_timestamp(),
        NEXT_INSTALLATION_ID.fetch_add(1, Ordering::Relaxed)
    );
    let stop_requested = Arc::new(AtomicBool::new(false));
    let progress = InstallProgress {
        id: id.clone(),
        method,
        status: InstallStatus::Running,
        steps: steps
            .iter()
            .map(|step| InstallStepState {
                title: step.title.clone(),
                command: step.command.clone(),
                optional: step.optional,
                status: StepStatus::Pending,
                detail: None,
            })
            .collect(),
        active_step: None,
        started_at: unix_timestamp(),
        finished_at: None,
        message: None,
        available_tools: Vec::new(),
        log: Vec::new(),
    };

    {
        let mut active = lock_installation(&controller)?;
        if active
            .as_ref()
            .is_some_and(|installation| installation.progress.status == InstallStatus::Running)
        {
            return Err(InstallError {
                code: "install-already-running",
                message: "A LaTeX installation is already running. Wait for it to finish or stop it first.",
            });
        }
        *active = Some(Installation {
            progress: progress.clone(),
            stop_requested: Arc::clone(&stop_requested),
            next_sequence: 1,
        });
    }

    let worker_controller = controller.inner().clone();
    let worker_id = id.clone();
    if thread::Builder::new()
        .name("tex-latex-install".to_owned())
        .spawn(move || {
            supervise_installation(&app, &worker_controller, &worker_id, steps, &stop_requested);
        })
        .is_err()
    {
        if let Ok(mut active) = controller.active.lock() {
            *active = None;
        }
        return Err(InstallError {
            code: "install-supervisor-unavailable",
            message: "TeX could not supervise the installation. Nothing was installed.",
        });
    }

    Ok(progress)
}

/// Requests cancellation of the running installation without blocking the UI.
#[tauri::command]
pub fn stop_latex_installation(
    controller: State<'_, LatexInstallController>,
) -> Result<(), InstallError> {
    let active = lock_installation(&controller)?;
    let installation = active
        .as_ref()
        .filter(|installation| installation.progress.status == InstallStatus::Running)
        .ok_or(InstallError {
            code: "install-not-running",
            message: "There is no running LaTeX installation to stop.",
        })?;
    installation.stop_requested.store(true, Ordering::Release);
    Ok(())
}

fn supervise_installation(
    app: &AppHandle,
    controller: &LatexInstallController,
    id: &str,
    steps: Vec<PreparedStep>,
    stop_requested: &AtomicBool,
) {
    let mut installed_tools = Vec::new();
    for (index, step) in steps.into_iter().enumerate() {
        if stop_requested.load(Ordering::Acquire) {
            mark_step(app, controller, id, index, StepStatus::Skipped, None);
            finish(
                app,
                controller,
                id,
                InstallStatus::Cancelled,
                "Installation cancelled. Nothing further was installed.".to_owned(),
                available_tools(),
            );
            return;
        }
        mark_step(app, controller, id, index, StepStatus::Running, None);
        let verifying = matches!(step.action, StepAction::VerifyTools);
        let outcome = match step.action {
            StepAction::Run(spec) => run_step(app, controller, id, index, &spec, stop_requested),
            StepAction::Tlmgr { askpass, arguments } => run_tlmgr(
                app,
                controller,
                id,
                index,
                &askpass,
                &arguments,
                stop_requested,
            ),
            StepAction::VerifyTools => {
                installed_tools = available_tools();
                if installed_tools.is_empty() {
                    Err("no LaTeX tool is visible on this application's search path".to_owned())
                } else {
                    Ok(installed_tools.join(", "))
                }
            }
        };
        let detail = match outcome {
            Ok(detail) => {
                mark_step(
                    app,
                    controller,
                    id,
                    index,
                    StepStatus::Succeeded,
                    Some(detail),
                );
                continue;
            }
            Err(detail) => detail,
        };
        if stop_requested.load(Ordering::Acquire) {
            mark_step(app, controller, id, index, StepStatus::Skipped, None);
            finish(
                app,
                controller,
                id,
                InstallStatus::Cancelled,
                "Installation cancelled. The package manager may have left a partial installation."
                    .to_owned(),
                available_tools(),
            );
            return;
        }
        if step.optional {
            mark_step(
                app,
                controller,
                id,
                index,
                StepStatus::Skipped,
                Some(format!("Skipped: {detail}")),
            );
            continue;
        }
        mark_step(
            app,
            controller,
            id,
            index,
            StepStatus::Failed,
            Some(detail.clone()),
        );
        // Only verification can fail after the packages are already installed;
        // a freshly installed distribution is often invisible to an already
        // running process until its environment is refreshed.
        let (status, message) = if verifying {
            (
                InstallStatus::RestartRequired,
                "The package manager finished, but no LaTeX tool is visible to this session yet. Restart TeX, then build again.".to_owned(),
            )
        } else {
            (
                InstallStatus::Failed,
                format!("Installation stopped because {detail}. Your project was not changed."),
            )
        };
        finish(app, controller, id, status, message, available_tools());
        return;
    }
    let message = if installed_tools.iter().any(|tool| tool == "latexmk") {
        format!(
            "LaTeX is ready. latexmk and {} more tools are available.",
            installed_tools.len().saturating_sub(1)
        )
    } else {
        format!(
            "LaTeX is installed, but latexmk could not be added. The single-pass engines are available: {}.",
            installed_tools.join(", ")
        )
    };
    finish(
        app,
        controller,
        id,
        InstallStatus::Succeeded,
        message,
        installed_tools,
    );
}

/// Runs the distribution's own `tlmgr` under `sudo -A`. Both the manager and
/// its elevation are resolved here because neither exists on the machine
/// before the distribution is on disk.
#[allow(
    clippy::too_many_arguments,
    reason = "the supervisor passes its emit context through unchanged"
)]
fn run_tlmgr(
    app: &AppHandle,
    controller: &LatexInstallController,
    id: &str,
    index: usize,
    askpass: &Path,
    arguments: &[&'static str],
    stop_requested: &AtomicBool,
) -> Result<String, String> {
    let tlmgr = resolve_executable("tlmgr")
        .ok_or_else(|| "the distribution did not provide tlmgr".to_owned())?;
    let sudo = resolve_executable("sudo")
        .ok_or_else(|| "sudo is unavailable to elevate tlmgr".to_owned())?;
    let mut command = vec!["-A".to_owned(), tlmgr.to_string_lossy().into_owned()];
    command.extend(arguments.iter().map(|argument| (*argument).to_string()));
    run_step(
        app,
        controller,
        id,
        index,
        &CommandSpec {
            executable: sudo,
            arguments: command,
            environment: vec![(
                "SUDO_ASKPASS".to_owned(),
                askpass.to_string_lossy().into_owned(),
            )],
        },
        stop_requested,
    )
}

fn run_step(
    app: &AppHandle,
    controller: &LatexInstallController,
    id: &str,
    index: usize,
    spec: &CommandSpec,
    stop_requested: &AtomicBool,
) -> Result<String, String> {
    let mut command = Command::new(&spec.executable);
    command
        .args(&spec.arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (name, value) in &spec.environment {
        command.env(name, value);
    }
    let mut child = command
        .group_spawn()
        .map_err(|_| "the package manager could not be started".to_owned())?;

    let (sender, receiver) = mpsc::sync_channel(OUTPUT_CHANNEL_CAPACITY);
    let stdout_reader = child
        .inner()
        .stdout
        .take()
        .and_then(|stream| spawn_reader(stream, sender.clone()).ok());
    let stderr_reader = child
        .inner()
        .stderr
        .take()
        .and_then(|stream| spawn_reader(stream, sender).ok());

    let deadline = Instant::now() + STEP_TIMEOUT;
    let mut timed_out = false;
    let mut terminated = false;
    let status = loop {
        drain(app, controller, id, index, &receiver);
        timed_out |= Instant::now() >= deadline;
        if (stop_requested.load(Ordering::Acquire) || timed_out) && !terminated {
            let _ = child.kill();
            terminated = true;
        }
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => thread::sleep(Duration::from_millis(40)),
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
    drain(app, controller, id, index, &receiver);

    if timed_out {
        return Err("the package manager exceeded its one-hour limit".to_owned());
    }
    match status {
        Some(status) if status.success() => Ok("Completed".to_owned()),
        Some(status) => Err(match status.code() {
            Some(code) => format!("the package manager exited with code {code}"),
            None => "the package manager was terminated".to_owned(),
        }),
        None => Err("the package manager could not be supervised".to_owned()),
    }
}

fn spawn_reader(
    stream: impl std::io::Read + Send + 'static,
    sender: mpsc::SyncSender<String>,
) -> std::io::Result<thread::JoinHandle<()>> {
    thread::Builder::new()
        .name("tex-latex-install-output".to_owned())
        .spawn(move || {
            let mut reader = BufReader::new(stream);
            while let Ok(Some((bytes, truncated))) = read_bounded_line(&mut reader) {
                let mut text = String::from_utf8_lossy(&bytes)
                    .trim_end_matches(['\r', '\n'])
                    .to_owned();
                if truncated {
                    text.push_str(" … [line truncated]");
                }
                if sender.send(text).is_err() {
                    break;
                }
            }
        })
}

fn drain(
    app: &AppHandle,
    controller: &LatexInstallController,
    id: &str,
    index: usize,
    receiver: &mpsc::Receiver<String>,
) {
    for text in receiver.try_iter() {
        append_log(app, controller, id, index, text);
    }
}

fn append_log(
    app: &AppHandle,
    controller: &LatexInstallController,
    id: &str,
    index: usize,
    text: String,
) {
    let events = {
        let Ok(mut active) = controller.active.lock() else {
            return;
        };
        let Some(installation) = active
            .as_mut()
            .filter(|installation| installation.progress.id == id)
        else {
            return;
        };
        let entry = InstallLogEntry {
            sequence: installation.next_sequence,
            text,
        };
        installation.next_sequence = installation.next_sequence.saturating_add(1);
        installation.progress.log.push(entry.clone());
        while installation.progress.log.len() > MAX_RETAINED_LOG_ENTRIES {
            installation.progress.log.remove(0);
        }
        let detail = summarize(&entry.text);
        if let Some(step) = installation.progress.steps.get_mut(index) {
            if detail.is_some() {
                step.detail.clone_from(&detail);
            }
        }
        (
            InstallEvent::Log {
                installation_id: id.to_owned(),
                entry,
            },
            detail.map(|detail| InstallEvent::Step {
                installation_id: id.to_owned(),
                index,
                status: StepStatus::Running,
                detail: Some(detail),
            }),
        )
    };
    let _ = app.emit(INSTALL_EVENT, events.0);
    if let Some(step_event) = events.1 {
        let _ = app.emit(INSTALL_EVENT, step_event);
    }
}

/// Keeps the always-visible step detail readable: only substantive package
/// manager lines replace it, never progress bars or blank output.
fn summarize(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() || trimmed.len() > 160 {
        return None;
    }
    if trimmed.chars().all(|character| {
        character.is_ascii_punctuation() || character.is_whitespace() || character.is_numeric()
    }) {
        return None;
    }
    Some(trimmed.to_owned())
}

fn mark_step(
    app: &AppHandle,
    controller: &LatexInstallController,
    id: &str,
    index: usize,
    status: StepStatus,
    detail: Option<String>,
) {
    {
        let Ok(mut active) = controller.active.lock() else {
            return;
        };
        let Some(installation) = active
            .as_mut()
            .filter(|installation| installation.progress.id == id)
        else {
            return;
        };
        if let Some(step) = installation.progress.steps.get_mut(index) {
            step.status = status;
            if detail.is_some() {
                step.detail.clone_from(&detail);
            }
        }
        installation.progress.active_step = (status == StepStatus::Running).then_some(index);
    }
    let _ = app.emit(
        INSTALL_EVENT,
        InstallEvent::Step {
            installation_id: id.to_owned(),
            index,
            status,
            detail,
        },
    );
}

fn finish(
    app: &AppHandle,
    controller: &LatexInstallController,
    id: &str,
    status: InstallStatus,
    message: String,
    available_tools: Vec<String>,
) {
    let finished_at = unix_timestamp();
    if let Ok(mut active) = controller.active.lock() {
        if let Some(installation) = active
            .as_mut()
            .filter(|installation| installation.progress.id == id)
        {
            installation.progress.status = status;
            installation.progress.finished_at = Some(finished_at);
            installation.progress.message = Some(message.clone());
            installation
                .progress
                .available_tools
                .clone_from(&available_tools);
            installation.progress.active_step = None;
        }
    }
    let _ = app.emit(
        INSTALL_EVENT,
        InstallEvent::Finished {
            installation_id: id.to_owned(),
            status,
            finished_at,
            message,
            available_tools,
        },
    );
}

fn available_tools() -> Vec<String> {
    VERIFIED_TOOLS
        .iter()
        .filter(|tool| resolve_executable(tool).is_some())
        .map(|tool| (*tool).to_owned())
        .collect()
}

impl InstallMethod {
    const ALL: [Self; 6] = [
        Self::Homebrew,
        Self::Winget,
        Self::Pacman,
        Self::Apt,
        Self::Dnf,
        Self::Zypper,
    ];

    fn manager_executable(self) -> &'static str {
        match self {
            Self::Homebrew => "brew",
            Self::Winget => "winget",
            Self::Pacman => "pacman",
            Self::Apt => "apt-get",
            Self::Dnf => "dnf",
            Self::Zypper => "zypper",
        }
    }

    fn packages(self) -> Vec<&'static str> {
        match self {
            Self::Homebrew => vec!["basictex"],
            Self::Winget => vec!["MiKTeX.MiKTeX"],
            Self::Pacman => vec![
                "texlive-basic",
                "texlive-latex",
                "texlive-latexrecommended",
                "texlive-fontsrecommended",
                "texlive-binextra",
            ],
            Self::Apt => vec![
                "texlive-latex-recommended",
                "texlive-fonts-recommended",
                "latexmk",
            ],
            Self::Dnf => vec![
                "texlive-scheme-basic",
                "texlive-collection-latexrecommended",
                "texlive-latexmk",
            ],
            Self::Zypper => vec!["texlive-latex", "texlive-latexmk"],
        }
    }

    fn install_arguments(self) -> Vec<String> {
        let mut arguments: Vec<String> = match self {
            Self::Homebrew => vec!["install".to_owned(), "--cask".to_owned()],
            Self::Winget => vec![
                "install".to_owned(),
                "--exact".to_owned(),
                "--silent".to_owned(),
                "--accept-package-agreements".to_owned(),
                "--accept-source-agreements".to_owned(),
                "--id".to_owned(),
            ],
            Self::Pacman => vec![
                "-S".to_owned(),
                "--needed".to_owned(),
                "--noconfirm".to_owned(),
            ],
            Self::Apt => vec![
                "install".to_owned(),
                "-y".to_owned(),
                "--no-install-recommends".to_owned(),
            ],
            Self::Dnf => vec!["install".to_owned(), "-y".to_owned()],
            Self::Zypper => vec![
                "--non-interactive".to_owned(),
                "install".to_owned(),
                "--no-recommends".to_owned(),
            ],
        };
        arguments.extend(self.packages().iter().map(|package| (*package).to_owned()));
        arguments
    }

    fn elevation(self) -> Elevation {
        match self {
            Self::Homebrew => Elevation::SystemPassword,
            Self::Winget => Elevation::SystemPassword,
            Self::Pacman | Self::Apt | Self::Dnf | Self::Zypper => Elevation::Polkit,
        }
    }

    fn descriptor(self) -> (&'static str, &'static str, &'static str, &'static str) {
        match self {
            Self::Homebrew => (
                "Homebrew",
                "BasicTeX",
                "A compact TeX Live distribution. TeX then adds latexmk, which BasicTeX does not include.",
                "about 135 MB downloaded, 390 MB installed",
            ),
            Self::Winget => (
                "winget",
                "MiKTeX",
                "MiKTeX with latexmk; missing packages are fetched on first use.",
                "about 250 MB downloaded",
            ),
            Self::Pacman => (
                "pacman",
                "TeX Live",
                "The recommended TeX Live package set for Arch Linux, including latexmk.",
                "about 700 MB downloaded",
            ),
            Self::Apt => (
                "apt",
                "TeX Live",
                "The recommended TeX Live package set for Debian and Ubuntu, including latexmk.",
                "about 500 MB downloaded",
            ),
            Self::Dnf => (
                "dnf",
                "TeX Live",
                "The recommended TeX Live package set for Fedora, including latexmk.",
                "about 600 MB downloaded",
            ),
            Self::Zypper => (
                "zypper",
                "TeX Live",
                "The TeX Live LaTeX packages for openSUSE, including latexmk.",
                "about 600 MB downloaded",
            ),
        }
    }

    fn supported_here(self) -> bool {
        match self {
            Self::Homebrew => cfg!(target_os = "macos"),
            Self::Winget => cfg!(windows),
            Self::Pacman | Self::Apt | Self::Dnf | Self::Zypper => {
                cfg!(all(unix, not(target_os = "macos")))
            }
        }
    }

    fn recommended(self) -> bool {
        matches!(self, Self::Homebrew | Self::Winget | Self::Pacman)
    }

    fn documentation(self) -> &'static str {
        match self {
            Self::Homebrew => "https://brew.sh",
            Self::Winget => "https://learn.microsoft.com/windows/package-manager/winget/",
            Self::Pacman | Self::Apt | Self::Dnf | Self::Zypper => {
                "https://tug.org/texlive/quickinstall.html"
            }
        }
    }

    /// Reports the route as runnable, blocked with a named prerequisite, or not
    /// applicable to this operating system. A blocked route stays visible so
    /// the user learns what to install rather than seeing an empty dialog.
    fn availability(self) -> Availability {
        if !self.supported_here() {
            return Availability::NotApplicable;
        }
        let (manager_label, distribution, summary, download_estimate) = self.descriptor();
        let blocked = |reason: String| {
            Availability::Blocked(UnavailableOption {
                manager: manager_label,
                distribution,
                reason,
                documentation: self.documentation(),
            })
        };
        let Some(manager) = self.locate_manager() else {
            return blocked(format!(
                "{manager_label} is not installed on this computer, so TeX cannot install {distribution} for you."
            ));
        };
        if self.elevation() == Elevation::Polkit && resolve_executable("pkexec").is_none() {
            return blocked(format!(
                "{manager_label} is installed, but pkexec is missing, so TeX cannot ask your system to authorize a package installation."
            ));
        }
        Availability::Ready(InstallOption {
            method: self,
            manager: manager_label,
            distribution,
            summary,
            packages: self.packages(),
            download_estimate,
            elevation: self.elevation(),
            recommended: self.recommended(),
            steps: self.step_plans(&manager),
        })
    }

    fn step_plans(self, manager: &Path) -> Vec<InstallStepPlan> {
        let (manager_label, distribution, _, _) = self.descriptor();
        let mut steps = vec![
            InstallStepPlan {
                title: format!("Locate {manager_label}"),
                command: manager.to_string_lossy().into_owned(),
                optional: false,
            },
            InstallStepPlan {
                title: format!("Install {distribution}"),
                command: self.display_command(manager),
                optional: false,
            },
        ];
        for (title, arguments) in self.tlmgr_steps() {
            steps.push(InstallStepPlan {
                title: title.to_owned(),
                command: format!("sudo tlmgr {}", arguments.join(" ")),
                optional: true,
            });
        }
        steps.push(InstallStepPlan {
            title: "Verify the LaTeX tools".to_owned(),
            command: VERIFIED_TOOLS.join(", "),
            optional: false,
        });
        steps
    }

    /// BasicTeX ships a minimal scheme without `latexmk` or any bibliography
    /// tooling, so the recommended build profile and every `\cite` stay broken
    /// unless TeX adds them through `tlmgr`. A freshly installed `tlmgr`
    /// refuses to install anything until it has updated itself, so that update
    /// is part of the sequence.
    fn tlmgr_steps(self) -> Vec<(&'static str, Vec<&'static str>)> {
        if self != Self::Homebrew {
            return Vec::new();
        }
        vec![
            ("Update the TeX package manager", vec!["update", "--self"]),
            (
                "Add latexmk and the bibliography tools",
                vec!["install", "latexmk", "biblatex", "biber"],
            ),
        ]
    }

    fn locate_manager(self) -> Option<PathBuf> {
        resolve_executable(self.manager_executable()).or_else(|| {
            homebrew_fallbacks()
                .into_iter()
                .find(|candidate| self == Self::Homebrew && candidate.is_file())
        })
    }

    fn display_command(self, manager: &Path) -> String {
        let elevation_prefix = if self.elevation() == Elevation::Polkit {
            "pkexec "
        } else {
            ""
        };
        format!(
            "{elevation_prefix}{} {}",
            manager.to_string_lossy(),
            self.install_arguments().join(" ")
        )
    }

    fn prepare(self, app: &AppHandle) -> Result<Vec<PreparedStep>, InstallError> {
        if !self.supported_here() {
            return Err(InstallError {
                code: "install-method-unsupported",
                message: "That installation method is not available on this operating system.",
            });
        }
        let manager = self.locate_manager().ok_or(InstallError {
            code: "install-manager-missing",
            message:
                "The package manager is no longer available. Refresh the installation options.",
        })?;
        let (manager_label, distribution, _, _) = self.descriptor();

        let mut environment: Vec<(String, String)> = Vec::new();
        let mut askpass = None;
        let executable = if self.elevation() == Elevation::Polkit {
            resolve_executable("pkexec").ok_or(InstallError {
                code: "install-elevation-unavailable",
                message: "TeX could not find pkexec to request authorization. Run the shown command in a terminal instead.",
            })?
        } else {
            manager.clone()
        };
        let mut arguments: Vec<String> = Vec::new();
        if self.elevation() == Elevation::Polkit {
            arguments.push(manager.to_string_lossy().into_owned());
        }
        arguments.extend(self.install_arguments());

        if self == Self::Homebrew {
            let helper = write_askpass_helper(app)?;
            environment.push(("NONINTERACTIVE".to_owned(), "1".to_owned()));
            environment.push(("HOMEBREW_NO_ANALYTICS".to_owned(), "1".to_owned()));
            environment.push(("HOMEBREW_NO_ENV_HINTS".to_owned(), "1".to_owned()));
            environment.push((
                "SUDO_ASKPASS".to_owned(),
                helper.to_string_lossy().into_owned(),
            ));
            askpass = Some(helper);
        }

        let mut steps = vec![
            PreparedStep {
                title: format!("Locate {manager_label}"),
                command: manager.to_string_lossy().into_owned(),
                optional: false,
                action: StepAction::Run(CommandSpec {
                    executable: manager.clone(),
                    arguments: vec![self.version_argument().to_owned()],
                    environment: Vec::new(),
                }),
            },
            PreparedStep {
                title: format!("Install {distribution}"),
                command: self.display_command(&manager),
                optional: false,
                action: StepAction::Run(CommandSpec {
                    executable,
                    arguments,
                    environment,
                }),
            },
        ];
        if let Some(helper) = askpass {
            for (title, arguments) in self.tlmgr_steps() {
                steps.push(PreparedStep {
                    title: title.to_owned(),
                    command: format!("sudo tlmgr {}", arguments.join(" ")),
                    optional: true,
                    action: StepAction::Tlmgr {
                        askpass: helper.clone(),
                        arguments,
                    },
                });
            }
        }
        steps.push(PreparedStep {
            title: "Verify the LaTeX tools".to_owned(),
            command: VERIFIED_TOOLS.join(", "),
            optional: false,
            action: StepAction::VerifyTools,
        });
        Ok(steps)
    }

    fn version_argument(self) -> &'static str {
        match self {
            Self::Homebrew | Self::Winget | Self::Zypper => "--version",
            Self::Pacman => "--version",
            Self::Apt | Self::Dnf => "--version",
        }
    }
}

#[cfg(target_os = "macos")]
fn homebrew_fallbacks() -> Vec<PathBuf> {
    vec![
        PathBuf::from("/opt/homebrew/bin/brew"),
        PathBuf::from("/usr/local/bin/brew"),
    ]
}

#[cfg(not(target_os = "macos"))]
fn homebrew_fallbacks() -> Vec<PathBuf> {
    Vec::new()
}

/// Homebrew installs BasicTeX with a `pkg` payload and therefore needs
/// administrator rights. It honours `SUDO_ASKPASS`, so TeX supplies a helper
/// whose only action is to show the operating system's own password dialog.
/// The script body is a compile-time constant; nothing is interpolated.
#[cfg(target_os = "macos")]
fn write_askpass_helper(app: &AppHandle) -> Result<PathBuf, InstallError> {
    use std::{
        fs,
        io::Write,
        os::unix::fs::{OpenOptionsExt, PermissionsExt},
    };

    use tauri::Manager;

    const HELPER: &str = concat!(
        "#!/bin/sh\n",
        "exec /usr/bin/osascript",
        " -e 'display dialog \"TeX needs your macOS administrator password to install the LaTeX distribution with Homebrew.\" with title \"Install LaTeX\" default answer \"\" with hidden answer with icon caution'",
        " -e 'text returned of result'\n"
    );

    let directory = app.path().app_cache_dir().map_err(|_| InstallError {
        code: "install-helper-unavailable",
        message: "TeX could not prepare the administrator prompt. Run the shown command in a terminal instead.",
    })?;
    fs::create_dir_all(&directory).map_err(|_| helper_error())?;
    let path = directory.join("latex-install-askpass.sh");
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o700)
        .open(&path)
        .map_err(|_| helper_error())?;
    file.write_all(HELPER.as_bytes())
        .map_err(|_| helper_error())?;
    file.sync_all().map_err(|_| helper_error())?;
    drop(file);
    fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).map_err(|_| helper_error())?;
    Ok(path)
}

#[cfg(not(target_os = "macos"))]
fn write_askpass_helper(_app: &AppHandle) -> Result<PathBuf, InstallError> {
    Err(helper_error())
}

const fn helper_error() -> InstallError {
    InstallError {
        code: "install-helper-unavailable",
        message: "TeX could not prepare the administrator prompt. Run the shown command in a terminal instead.",
    }
}

const fn platform_label() -> &'static str {
    if cfg!(target_os = "macos") {
        "macOS"
    } else if cfg!(windows) {
        "Windows"
    } else {
        "Linux"
    }
}

fn manual_instruction() -> ManualInstruction {
    if cfg!(target_os = "macos") {
        ManualInstruction {
            summary:
                "Install MacTeX or BasicTeX, then restart TeX so the tools are on the search path.",
            command: Some("brew install --cask basictex".to_owned()),
            documentation: "https://tug.org/mactex/",
        }
    } else if cfg!(windows) {
        ManualInstruction {
            summary: "Install MiKTeX or TeX Live, then restart TeX so the tools are on PATH.",
            command: Some("winget install --exact --id MiKTeX.MiKTeX".to_owned()),
            documentation: "https://miktex.org/download",
        }
    } else {
        ManualInstruction {
            summary: "Install your distribution's TeX Live packages, including latexmk, then restart TeX.",
            command: None,
            documentation: "https://tug.org/texlive/quickinstall.html",
        }
    }
}

fn lock_installation<'state>(
    controller: &'state State<'_, LatexInstallController>,
) -> Result<MutexGuard<'state, Option<Installation>>, InstallError> {
    controller.active.lock().map_err(|_| InstallError {
        code: "install-state-unavailable",
        message: "TeX could not read the installation state. Restart TeX and try again.",
    })
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |value| value.as_secs())
}

#[cfg(test)]
mod tests {
    use super::{summarize, Elevation, InstallMethod, VERIFIED_TOOLS};
    use std::path::Path;

    #[test]
    fn install_arguments_end_with_the_declared_packages() {
        for method in InstallMethod::ALL {
            let arguments = method.install_arguments();
            let packages = method.packages();
            assert!(arguments.len() > packages.len());
            assert_eq!(
                &arguments[arguments.len() - packages.len()..],
                &packages[..]
            );
        }
    }

    #[test]
    fn linux_methods_are_elevated_through_polkit() {
        for method in [
            InstallMethod::Pacman,
            InstallMethod::Apt,
            InstallMethod::Dnf,
            InstallMethod::Zypper,
        ] {
            assert_eq!(method.elevation(), Elevation::Polkit);
            assert!(method
                .display_command(Path::new("/usr/bin/manager"))
                .starts_with("pkexec "));
        }
    }

    #[test]
    fn step_details_reject_noise_and_oversized_lines() {
        assert_eq!(
            summarize("  Fetching basictex  "),
            Some("Fetching basictex".to_owned())
        );
        assert_eq!(summarize("   "), None);
        assert_eq!(summarize("###### 45.2%"), None);
        assert_eq!(summarize(&"x".repeat(200)), None);
    }

    #[test]
    fn latexmk_is_verified_first() {
        assert_eq!(VERIFIED_TOOLS.first(), Some(&"latexmk"));
    }

    #[test]
    fn basictex_updates_tlmgr_before_adding_latexmk() {
        // A freshly installed tlmgr refuses `install` until it self-updates,
        // so the order of these two optional steps is load bearing.
        assert_eq!(
            InstallMethod::Homebrew.tlmgr_steps(),
            vec![
                ("Update the TeX package manager", vec!["update", "--self"]),
                (
                    "Add latexmk and the bibliography tools",
                    vec!["install", "latexmk", "biblatex", "biber"],
                ),
            ]
        );
    }

    #[test]
    fn only_basictex_needs_a_separate_latexmk() {
        for method in [
            InstallMethod::Winget,
            InstallMethod::Pacman,
            InstallMethod::Apt,
            InstallMethod::Dnf,
            InstallMethod::Zypper,
        ] {
            assert!(method.tlmgr_steps().is_empty());
        }
    }

    #[test]
    fn the_latexmk_follow_up_never_stops_the_installation() {
        let steps = InstallMethod::Homebrew.step_plans(Path::new("/opt/homebrew/bin/brew"));
        let latexmk: Vec<_> = steps
            .iter()
            .filter(|step| step.command.starts_with("sudo tlmgr"))
            .collect();

        assert_eq!(latexmk.len(), 2);
        assert!(latexmk.iter().all(|step| step.optional));
        assert!(steps.last().is_some_and(|step| !step.optional));
    }
}
