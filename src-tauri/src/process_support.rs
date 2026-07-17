use std::{
    io::{self, Read},
    process::{Command, ExitStatus, Stdio},
    thread,
    time::{Duration, Instant},
};

use command_group::CommandGroup;

pub(crate) struct BoundedOutput {
    pub(crate) status: ExitStatus,
    pub(crate) stdout: Vec<u8>,
}

pub(crate) fn run_status(command: &mut Command, timeout: Duration) -> io::Result<ExitStatus> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut child = command.group_spawn()?;
    wait_for_group(&mut child, timeout)
}

/// Runs a non-interactive process group with bounded capture and a hard deadline.
pub(crate) fn run_bounded(
    command: &mut Command,
    timeout: Duration,
    stream_limit: usize,
) -> io::Result<BoundedOutput> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.group_spawn()?;
    let stdout = child
        .inner()
        .stdout
        .take()
        .ok_or_else(|| io::Error::other("process stdout unavailable"))?;
    let stderr = child
        .inner()
        .stderr
        .take()
        .ok_or_else(|| io::Error::other("process stderr unavailable"))?;
    let stdout_reader = match spawn_stream_reader(stdout, stream_limit) {
        Ok(reader) => reader,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    let stderr_reader = match spawn_stream_reader(stderr, stream_limit) {
        Ok(reader) => reader,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            let _ = join_reader(stdout_reader);
            return Err(error);
        }
    };
    let status = match wait_for_group(&mut child, timeout) {
        Ok(status) => status,
        Err(error) => {
            // wait_for_group already killed the group (closing the pipes); join the
            // drain threads so they are not abandoned before we return the error.
            let _ = join_reader(stdout_reader);
            let _ = join_reader(stderr_reader);
            return Err(error);
        }
    };

    let stdout = join_reader(stdout_reader)?;
    let stderr = join_reader(stderr_reader)?;
    if stdout.truncated || stderr.truncated {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "process output exceeded its capture limit",
        ));
    }
    Ok(BoundedOutput {
        status,
        stdout: stdout.bytes,
    })
}

fn spawn_stream_reader(
    stream: impl Read + Send + 'static,
    limit: usize,
) -> io::Result<thread::JoinHandle<io::Result<CapturedStream>>> {
    thread::Builder::new()
        .name("tex-process-output".to_owned())
        .spawn(move || drain_bounded(stream, limit))
}

fn wait_for_group(
    child: &mut command_group::GroupChild,
    timeout: Duration,
) -> io::Result<ExitStatus> {
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(20)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "process exceeded its deadline",
                ));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        }
    }
}

struct CapturedStream {
    bytes: Vec<u8>,
    truncated: bool,
}

fn drain_bounded(mut stream: impl Read, limit: usize) -> io::Result<CapturedStream> {
    let mut bytes = Vec::with_capacity(limit.min(16 * 1024));
    let mut buffer = [0_u8; 8 * 1024];
    let mut truncated = false;
    loop {
        let read = stream.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        let remaining = limit.saturating_sub(bytes.len());
        let copied = read.min(remaining);
        bytes.extend_from_slice(&buffer[..copied]);
        truncated |= copied < read;
    }
    Ok(CapturedStream { bytes, truncated })
}

fn join_reader(
    reader: thread::JoinHandle<io::Result<CapturedStream>>,
) -> io::Result<CapturedStream> {
    reader
        .join()
        .map_err(|_| io::Error::other("process output reader failed"))?
}

#[cfg(test)]
mod tests {
    use std::{
        io::Cursor,
        process::Command,
        time::{Duration, Instant},
    };

    use super::{drain_bounded, run_bounded};

    #[test]
    fn drains_excess_output_without_retaining_it() -> Result<(), Box<dyn std::error::Error>> {
        let captured = drain_bounded(Cursor::new(vec![b'x'; 8_192]), 512)?;

        assert_eq!(captured.bytes.len(), 512);
        assert!(captured.truncated);
        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn timeout_terminates_the_process_group() {
        let started = Instant::now();
        let result = run_bounded(
            Command::new("/bin/sh").args(["-c", "sleep 30 & wait"]),
            Duration::from_millis(100),
            1024,
        );

        assert!(result.is_err());
        assert!(started.elapsed() < Duration::from_secs(3));
    }
}
