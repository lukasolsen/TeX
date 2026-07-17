use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};

use crate::source_read::{
    resolve_source_path, revision_for_content, SourceDocument, SourceRevision, MAX_SOURCE_BYTES,
};
use crate::{bounded_io, project_access::ProjectAccess};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceEditError {
    pub code: &'static str,
    pub message: &'static str,
}

/// Serializes source writes per canonical path so a save's read-check-write
/// (optimistic-concurrency) sequence is atomic with respect to other saves of the
/// same file. Without this, two saves starting from the same expected revision
/// could both pass the external-change guard and the second would silently
/// overwrite the first.
#[derive(Default)]
pub struct SourceWriteLocks {
    locks: Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>,
}

impl SourceWriteLocks {
    fn lock_for(&self, path: &Path) -> Arc<Mutex<()>> {
        let mut map = self.locks.lock().unwrap_or_else(|error| error.into_inner());
        // Drop locks no longer held by an in-flight save so the map cannot grow
        // without bound across a long editing session.
        map.retain(|_, lock| Arc::strong_count(lock) > 1);
        Arc::clone(map.entry(path.to_path_buf()).or_default())
    }
}

/// Upper bound for a serialized recovery draft. The draft content is itself
/// capped at `MAX_SOURCE_BYTES`, but JSON escaping can expand each byte up to
/// sixfold (control characters become `\uXXXX`), so the envelope is sized to that
/// worst case plus metadata. Save and load share this bound so a draft that was
/// written can always be read back.
const MAX_DRAFT_BYTES: u64 = MAX_SOURCE_BYTES * 6 + 64 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveryDraft {
    pub project_path: String,
    pub relative_path: String,
    pub content: String,
    pub base_revision: SourceRevision,
    pub saved_at: u64,
}

/// Atomically writes source only when the caller's revision still matches disk.
#[tauri::command]
pub fn save_project_source(
    app: AppHandle,
    project_path: String,
    relative_path: String,
    content: String,
    expected_revision: SourceRevision,
    access: State<'_, ProjectAccess>,
    write_locks: State<'_, SourceWriteLocks>,
) -> Result<SourceDocument, SourceEditError> {
    if content.len() as u64 > MAX_SOURCE_BYTES {
        return Err(too_large());
    }
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    let canonical_project_path = root.to_string_lossy().into_owned();
    let relative = Path::new(&relative_path);
    let path = resolve_source_path(&root, relative).map_err(|_| unavailable())?;
    // Hold the per-file lock across the whole read-check-write so a concurrent
    // save cannot slip between the external-change guard and the write.
    let file_lock = write_locks.lock_for(&path);
    let _write_guard = file_lock.lock().unwrap_or_else(|error| error.into_inner());
    let current = bounded_io::read(&path, MAX_SOURCE_BYTES).map_err(|_| unavailable())?;
    if revision_for_content(&current) != expected_revision {
        return Err(SourceEditError {
            code: "external-change",
            message:
                "This file changed on disk. Review both versions before choosing which one to keep.",
        });
    }

    atomic_write(&path, content.as_bytes())?;
    let _ = remove_recovery(&app, &canonical_project_path, &relative_path);
    Ok(SourceDocument {
        path: relative_path,
        byte_length: content.len() as u64,
        revision: revision_for_content(content.as_bytes()),
        content,
    })
}

/// Stores a bounded recovery draft outside the user's project tree.
#[tauri::command]
pub fn save_recovery_draft(
    app: AppHandle,
    project_path: String,
    relative_path: String,
    content: String,
    base_revision: SourceRevision,
    access: State<'_, ProjectAccess>,
) -> Result<(), SourceEditError> {
    if content.len() as u64 > MAX_SOURCE_BYTES {
        return Err(too_large());
    }
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    resolve_source_path(&root, Path::new(&relative_path)).map_err(|_| unavailable())?;
    let draft = RecoveryDraft {
        project_path: root.to_string_lossy().into_owned(),
        relative_path,
        content,
        base_revision,
        saved_at: now_millis(),
    };
    let encoded = serde_json::to_vec(&draft).map_err(|_| unavailable())?;
    if encoded.len() as u64 > MAX_DRAFT_BYTES {
        return Err(too_large());
    }
    let path = recovery_path(&app, &draft.project_path, &draft.relative_path)?;
    atomic_write(&path, &encoded)
}

#[tauri::command]
pub fn load_recovery_draft(
    app: AppHandle,
    project_path: String,
    relative_path: String,
    access: State<'_, ProjectAccess>,
) -> Result<Option<RecoveryDraft>, SourceEditError> {
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    resolve_source_path(&root, Path::new(&relative_path)).map_err(|_| unavailable())?;
    let canonical_project_path = root.to_string_lossy().into_owned();
    let path = recovery_path(&app, &canonical_project_path, &relative_path)?;
    let encoded = match bounded_io::read(&path, MAX_DRAFT_BYTES) {
        Ok(encoded) => encoded,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(unavailable()),
    };
    let draft: RecoveryDraft = serde_json::from_slice(&encoded).map_err(|_| unavailable())?;
    if draft.project_path == canonical_project_path && draft.relative_path == relative_path {
        Ok(Some(draft))
    } else {
        Err(unavailable())
    }
}

#[tauri::command]
pub fn discard_recovery_draft(
    app: AppHandle,
    project_path: String,
    relative_path: String,
    access: State<'_, ProjectAccess>,
) -> Result<(), SourceEditError> {
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    resolve_source_path(&root, Path::new(&relative_path)).map_err(|_| unavailable())?;
    remove_recovery(&app, &root.to_string_lossy(), &relative_path)
}

pub(crate) fn atomic_write(path: &Path, content: &[u8]) -> Result<(), SourceEditError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| unavailable())?;
    }
    let mut file = AtomicWriteFile::open(path).map_err(|_| unavailable())?;
    file.write_all(content).map_err(|_| unavailable())?;
    file.commit().map_err(|_| unavailable())
}

fn recovery_path(
    app: &AppHandle,
    project_path: &str,
    relative_path: &str,
) -> Result<PathBuf, SourceEditError> {
    let mut hasher = Sha256::new();
    hasher.update(project_path.as_bytes());
    hasher.update([0_u8]);
    hasher.update(relative_path.as_bytes());
    let hash = hasher.finalize();
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| unavailable())?
        .join("recovery");
    fs::create_dir_all(&directory).map_err(|_| unavailable())?;
    Ok(directory.join(format!("{hash:x}.json")))
}

fn remove_recovery(
    app: &AppHandle,
    project_path: &str,
    relative_path: &str,
) -> Result<(), SourceEditError> {
    match fs::remove_file(recovery_path(app, project_path, relative_path)?) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(unavailable()),
    }
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
        .unwrap_or(u64::MAX)
}

fn too_large() -> SourceEditError {
    SourceEditError {
        code: "source-too-large",
        message: "This source file is too large to save safely.",
    }
}

fn unavailable() -> SourceEditError {
    SourceEditError {
        code: "source-write-unavailable",
        message: "TeX could not save this file. Your edits remain open in TeX; keep the app open and try again.",
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, time::SystemTime};

    use super::atomic_write;

    #[test]
    fn atomic_write_replaces_complete_content() -> Result<(), Box<dyn std::error::Error>> {
        let unique = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("tex-source-edit-{unique}"));
        fs::create_dir(&directory)?;
        let path = directory.join("main.tex");
        fs::write(&path, "old")?;
        atomic_write(&path, b"new").map_err(|_| "atomic write failed")?;
        assert_eq!(fs::read_to_string(&path)?, "new");
        fs::remove_dir_all(directory)?;
        Ok(())
    }
}
