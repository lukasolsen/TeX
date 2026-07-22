use std::{
    collections::{HashMap, VecDeque},
    io::{Read, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, MutexGuard,
    },
    thread,
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use portable_pty::{Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::project_access::ProjectAccess;

const TERMINAL_EVENT: &str = "tex://terminal-event";
const MAX_SCROLLBACK_BYTES: usize = 256 * 1024;
const READ_BUFFER_BYTES: usize = 8 * 1024;
const MAX_SESSIONS: usize = 8;
const MIN_DIMENSION: u16 = 1;
const MAX_DIMENSION: u16 = 2_000;
const WRITE_LIMIT_BYTES: usize = 64 * 1024;

static NEXT_TERMINAL_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenTerminalRequest {
    project_path: String,
    cols: u16,
    rows: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WriteTerminalRequest {
    terminal_id: String,
    base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResizeTerminalRequest {
    terminal_id: String,
    cols: u16,
    rows: u16,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalDescriptor {
    terminal_id: String,
    base64_snapshot: String,
    running: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum TerminalEvent {
    Data {
        terminal_id: String,
        base64: String,
    },
    Exit {
        terminal_id: String,
        exit_code: Option<i32>,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalError {
    code: &'static str,
    message: &'static str,
}

#[derive(Clone, Default)]
pub struct TerminalController {
    sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

struct TerminalSession {
    project_root: PathBuf,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    scrollback: Arc<Mutex<VecDeque<u8>>>,
    running: Arc<AtomicBool>,
}

/// Opens (or returns the existing) project-scoped shell running inside a PTY.
///
/// The child process is spawned with its working directory fixed to the approved
/// project root, mirroring the trust boundary the build system already enforces.
#[tauri::command]
pub fn open_terminal(
    request: OpenTerminalRequest,
    app: AppHandle,
    controller: State<'_, TerminalController>,
    access: State<'_, ProjectAccess>,
) -> Result<TerminalDescriptor, TerminalError> {
    let project_root = access
        .resolve(&request.project_path)
        .map_err(|_| unavailable())?;
    let cols = clamp_dimension(request.cols);
    let rows = clamp_dimension(request.rows);

    let mut sessions = lock_sessions(&controller)?;
    // A session whose shell has exited but has not yet been reaped must not be
    // handed back (it is a dead descriptor) nor counted against capacity.
    if let Some((terminal_id, session)) = sessions.iter().find(|(_, session)| {
        session.project_root == project_root && session.running.load(Ordering::Acquire)
    }) {
        return Ok(TerminalDescriptor {
            terminal_id: terminal_id.clone(),
            base64_snapshot: snapshot(&session.scrollback),
            running: true,
        });
    }
    if sessions
        .values()
        .filter(|session| session.running.load(Ordering::Acquire))
        .count()
        >= MAX_SESSIONS
    {
        return Err(TerminalError {
            code: "terminal-capacity-reached",
            message: "Too many terminals are open. Close one before opening another.",
        });
    }

    let terminal_id = format!(
        "terminal-{}",
        NEXT_TERMINAL_ID.fetch_add(1, Ordering::Relaxed)
    );
    let session = spawn_session(
        &app,
        controller.inner(),
        &project_root,
        &terminal_id,
        cols,
        rows,
    )?;
    let descriptor = TerminalDescriptor {
        terminal_id: terminal_id.clone(),
        base64_snapshot: String::new(),
        running: true,
    };
    sessions.insert(terminal_id, session);
    Ok(descriptor)
}

/// Forwards user keystrokes to the shell without interpreting them.
#[tauri::command]
pub fn write_terminal(
    request: WriteTerminalRequest,
    controller: State<'_, TerminalController>,
) -> Result<(), TerminalError> {
    if request.base64.len() > WRITE_LIMIT_BYTES {
        return Err(write_failed());
    }
    let bytes = STANDARD
        .decode(request.base64.as_bytes())
        .map_err(|_| write_failed())?;
    let mut sessions = lock_sessions(&controller)?;
    let session = sessions
        .get_mut(&request.terminal_id)
        .ok_or_else(not_found)?;
    session
        .writer
        .write_all(&bytes)
        .map_err(|_| write_failed())?;
    session.writer.flush().map_err(|_| write_failed())?;
    Ok(())
}

/// Resizes the pseudo-terminal so full-screen programs reflow to the panel.
#[tauri::command]
pub fn resize_terminal(
    request: ResizeTerminalRequest,
    controller: State<'_, TerminalController>,
) -> Result<(), TerminalError> {
    let sessions = lock_sessions(&controller)?;
    let session = sessions.get(&request.terminal_id).ok_or_else(not_found)?;
    session
        .master
        .resize(PtySize {
            rows: clamp_dimension(request.rows),
            cols: clamp_dimension(request.cols),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|_| TerminalError {
            code: "terminal-resize-failed",
            message: "TeX could not resize the terminal.",
        })?;
    Ok(())
}

/// Terminates the shell and forgets the session. The reader thread emits the exit.
#[tauri::command]
pub fn close_terminal(
    terminal_id: String,
    controller: State<'_, TerminalController>,
) -> Result<(), TerminalError> {
    let mut sessions = lock_sessions(&controller)?;
    if let Some(mut session) = sessions.remove(&terminal_id) {
        let _ = session.killer.kill();
    }
    Ok(())
}

fn spawn_session(
    app: &AppHandle,
    controller: &TerminalController,
    project_root: &std::path::Path,
    terminal_id: &str,
    cols: u16,
    rows: u16,
) -> Result<TerminalSession, TerminalError> {
    let pty_system = portable_pty::native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|_| spawn_failed())?;

    let mut command = CommandBuilder::new(default_shell());
    command.cwd(project_root);
    command.env("TERM", "xterm-256color");

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|_| spawn_failed())?;
    // Dropping the slave releases the child's controlling handle from this process;
    // the child retains its own end through the spawned session.
    drop(pair.slave);

    let killer = child.clone_killer();
    let reader = pair.master.try_clone_reader().map_err(|_| spawn_failed())?;
    let writer = pair.master.take_writer().map_err(|_| spawn_failed())?;

    let scrollback = Arc::new(Mutex::new(VecDeque::new()));
    let running = Arc::new(AtomicBool::new(true));

    let worker_app = app.clone();
    let worker_controller = controller.clone();
    let worker_scrollback = Arc::clone(&scrollback);
    let worker_running = Arc::clone(&running);
    let worker_id = terminal_id.to_owned();
    thread::Builder::new()
        .name("tex-terminal-output".to_owned())
        .spawn(move || {
            supervise_terminal(
                reader,
                child,
                &worker_app,
                &worker_controller,
                &worker_id,
                &worker_scrollback,
                &worker_running,
            );
        })
        .map_err(|_| spawn_failed())?;

    Ok(TerminalSession {
        project_root: project_root.to_owned(),
        master: pair.master,
        writer,
        killer,
        scrollback,
        running,
    })
}

fn supervise_terminal(
    mut reader: Box<dyn Read + Send>,
    mut child: Box<dyn Child + Send + Sync>,
    app: &AppHandle,
    controller: &TerminalController,
    terminal_id: &str,
    scrollback: &Arc<Mutex<VecDeque<u8>>>,
    running: &AtomicBool,
) {
    let mut buffer = [0_u8; READ_BUFFER_BYTES];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => {
                let chunk = &buffer[..read];
                retain_scrollback(scrollback, chunk);
                let _ = app.emit(
                    TERMINAL_EVENT,
                    TerminalEvent::Data {
                        terminal_id: terminal_id.to_owned(),
                        base64: STANDARD.encode(chunk),
                    },
                );
            }
            Err(_) => break,
        }
    }

    running.store(false, Ordering::Release);
    let exit_code = child
        .wait()
        .ok()
        .map(|status| i32::try_from(status.exit_code()).unwrap_or(-1));
    // Reap the session so its PTY handle and slot are released once the shell
    // exits on its own, rather than lingering until an explicit close_terminal.
    if let Ok(mut sessions) = controller.sessions.lock() {
        sessions.remove(terminal_id);
    }
    let _ = app.emit(
        TERMINAL_EVENT,
        TerminalEvent::Exit {
            terminal_id: terminal_id.to_owned(),
            exit_code,
        },
    );
}

fn retain_scrollback(scrollback: &Arc<Mutex<VecDeque<u8>>>, chunk: &[u8]) {
    let Ok(mut buffer) = scrollback.lock() else {
        return;
    };
    buffer.extend(chunk.iter().copied());
    while buffer.len() > MAX_SCROLLBACK_BYTES {
        buffer.pop_front();
    }
}

fn snapshot(scrollback: &Arc<Mutex<VecDeque<u8>>>) -> String {
    scrollback.lock().map_or_else(
        |_| String::new(),
        |buffer| STANDARD.encode(buffer.iter().copied().collect::<Vec<u8>>()),
    )
}

fn clamp_dimension(value: u16) -> u16 {
    value.clamp(MIN_DIMENSION, MAX_DIMENSION)
}

#[cfg(not(windows))]
fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_owned())
}

#[cfg(windows)]
fn default_shell() -> String {
    std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_owned())
}

fn lock_sessions(
    controller: &TerminalController,
) -> Result<MutexGuard<'_, HashMap<String, TerminalSession>>, TerminalError> {
    controller.sessions.lock().map_err(|_| TerminalError {
        code: "terminal-unavailable",
        message: "The terminal registry is unavailable.",
    })
}

fn unavailable() -> TerminalError {
    TerminalError {
        code: "terminal-unavailable",
        message: "TeX could not open a terminal for this project.",
    }
}

fn spawn_failed() -> TerminalError {
    TerminalError {
        code: "terminal-spawn-failed",
        message: "TeX could not start a shell. Check that a shell is installed.",
    }
}

fn write_failed() -> TerminalError {
    TerminalError {
        code: "terminal-write-failed",
        message: "TeX could not send input to the terminal.",
    }
}

fn not_found() -> TerminalError {
    TerminalError {
        code: "terminal-not-found",
        message: "This terminal is no longer available.",
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::VecDeque,
        sync::{Arc, Mutex},
    };

    use super::{
        clamp_dimension, retain_scrollback, snapshot, TerminalEvent, MAX_SCROLLBACK_BYTES,
    };
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    #[test]
    fn scrollback_stays_within_the_retention_cap() {
        let scrollback = Arc::new(Mutex::new(VecDeque::new()));
        retain_scrollback(&scrollback, &vec![b'x'; MAX_SCROLLBACK_BYTES + 4_096]);

        let length = scrollback.lock().map(|buffer| buffer.len()).unwrap_or(0);
        assert_eq!(length, MAX_SCROLLBACK_BYTES);
    }

    #[test]
    fn snapshot_round_trips_retained_bytes() -> Result<(), Box<dyn std::error::Error>> {
        let scrollback = Arc::new(Mutex::new(VecDeque::new()));
        retain_scrollback(&scrollback, b"hello\x1b[0m");

        let decoded = STANDARD.decode(snapshot(&scrollback))?;
        assert_eq!(decoded, b"hello\x1b[0m");
        Ok(())
    }

    #[test]
    fn clamps_dimensions_into_a_safe_range() {
        assert_eq!(clamp_dimension(0), 1);
        assert_eq!(clamp_dimension(80), 80);
        assert_eq!(clamp_dimension(u16::MAX), 2_000);
    }

    #[cfg(unix)]
    #[test]
    fn spawns_a_shell_and_streams_its_output() -> Result<(), Box<dyn std::error::Error>> {
        use std::io::{Read, Write};
        use std::time::{Duration, Instant};

        use portable_pty::{CommandBuilder, PtySize};

        let pair = portable_pty::native_pty_system().openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        let mut child = pair.slave.spawn_command(CommandBuilder::new("/bin/sh"))?;
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader()?;
        let mut writer = pair.master.take_writer()?;
        writer.write_all(b"printf 'terminal-ready\\n'\nexit\n")?;
        writer.flush()?;
        drop(writer);

        let deadline = Instant::now() + Duration::from_secs(10);
        let mut output = Vec::new();
        let mut buffer = [0_u8; 1_024];
        while Instant::now() < deadline {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => output.extend_from_slice(&buffer[..read]),
                Err(_) => break,
            }
        }
        let _ = child.wait();

        assert!(String::from_utf8_lossy(&output).contains("terminal-ready"));
        Ok(())
    }

    #[test]
    fn serializes_events_for_the_typescript_contract() {
        let data = serde_json::to_value(TerminalEvent::Data {
            terminal_id: "terminal-1".to_owned(),
            base64: "aGk=".to_owned(),
        });
        let exit = serde_json::to_value(TerminalEvent::Exit {
            terminal_id: "terminal-1".to_owned(),
            exit_code: Some(0),
        });

        if let Ok(value) = data {
            assert_eq!(value.get("kind"), Some(&serde_json::json!("data")));
            assert_eq!(
                value.get("terminalId"),
                Some(&serde_json::json!("terminal-1"))
            );
            assert_eq!(value.get("base64"), Some(&serde_json::json!("aGk=")));
        } else {
            assert!(data.is_ok());
        }
        if let Ok(value) = exit {
            assert_eq!(value.get("kind"), Some(&serde_json::json!("exit")));
            assert_eq!(value.get("exitCode"), Some(&serde_json::json!(0)));
        } else {
            assert!(exit.is_ok());
        }
    }
}
