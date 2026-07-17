use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use regex::{NoExpand, Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};

use crate::{
    bounded_io,
    project_access::ProjectAccess,
    source_edit::atomic_write,
    source_read::{
        is_readable_source, read_source, revision_for_content, SourceRevision, MAX_SOURCE_BYTES,
    },
};

const MAX_SEARCH_RESULTS: usize = 500;
const MAX_SEARCH_FILES: usize = 2_048;
const MAX_SEARCH_ENTRIES: usize = 4_096;
const MAX_SEARCH_DEPTH: usize = 32;
const MAX_REPLACE_FILES: usize = 128;
const MAX_REPLACE_TOTAL_BYTES: usize = 32 * 1024 * 1024;
const MAX_REPLACEMENT_BYTES: usize = 64 * 1024;
const MAX_TRANSACTION_BYTES: u64 = 40 * 1024 * 1024;
const TRANSACTION_ID_LENGTH: usize = 64;
const MAX_TRANSACTION_HISTORY: usize = 50;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub path: String,
    pub line: usize,
    pub column: usize,
    pub context: String,
    pub revision: SourceRevision,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSearchResponse {
    pub results: Vec<SearchMatch>,
    pub total_matches: usize,
    pub searched_files: usize,
    pub truncated: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileRevisionExpectation {
    pub path: String,
    pub revision: SourceRevision,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceResponse {
    pub transaction_id: String,
    pub changed_files: usize,
    pub replaced_matches: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchError {
    pub code: &'static str,
    pub message: &'static str,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReplaceTransaction {
    project_path: String,
    files: Vec<ReplaceBackup>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReplaceBackup {
    path: String,
    content: String,
    after_revision: SourceRevision,
}

#[derive(Debug)]
struct PendingReplacement {
    relative_path: String,
    absolute_path: PathBuf,
    before: String,
    after: String,
    after_revision: SourceRevision,
    matches: usize,
}

#[derive(Debug, Eq, PartialEq)]
enum WriteSetFailure {
    Restored,
    Incomplete,
}

/// Searches bounded text sources without sending project-wide file access to the webview.
#[tauri::command]
pub async fn search_project_sources(
    project_path: String,
    query: String,
    case_sensitive: bool,
    access: State<'_, ProjectAccess>,
) -> Result<ProjectSearchResponse, SearchError> {
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    let matcher = literal_matcher(&query, case_sensitive)?;
    // Offload the recursive traversal + per-file regex to a blocking worker so a
    // large project cannot freeze the UI/IPC thread for the duration.
    tauri::async_runtime::spawn_blocking(move || search(&root, &matcher))
        .await
        .map_err(|_| unavailable())?
}

/// Applies a previewed replacement only if every source revision still matches.
#[tauri::command]
pub async fn replace_project_sources(
    app: AppHandle,
    project_path: String,
    query: String,
    replacement: String,
    case_sensitive: bool,
    expected_files: Vec<FileRevisionExpectation>,
    access: State<'_, ProjectAccess>,
) -> Result<ReplaceResponse, SearchError> {
    let root = access.resolve(&project_path).map_err(|_| unavailable())?;
    let matcher = literal_matcher(&query, case_sensitive)?;
    if replacement.len() > MAX_REPLACEMENT_BYTES || expected_files.len() > MAX_REPLACE_FILES {
        return Err(replace_too_large());
    }
    // Offload the reads, regex replacement, and atomic writes to a blocking worker
    // so a large replacement set cannot freeze the UI/IPC thread.
    tauri::async_runtime::spawn_blocking(move || {
        run_replace(&app, &root, &matcher, &replacement, expected_files)
    })
    .await
    .map_err(|_| unavailable())?
}

fn run_replace(
    app: &AppHandle,
    root: &Path,
    matcher: &Regex,
    replacement: &str,
    expected_files: Vec<FileRevisionExpectation>,
) -> Result<ReplaceResponse, SearchError> {
    let mut pending = Vec::new();
    let mut seen = HashSet::new();
    let mut pending_bytes = 0_usize;

    for expected in expected_files {
        if !seen.insert(expected.path.clone()) {
            return Err(unavailable());
        }
        let document = read_source(root, Path::new(&expected.path)).map_err(|_| unavailable())?;
        if document.revision != expected.revision {
            return Err(changed());
        }
        let matches = matcher.find_iter(&document.content).count();
        if matches == 0 {
            continue;
        }
        let after = matcher
            .replace_all(&document.content, NoExpand(replacement))
            .into_owned();
        pending_bytes = pending_bytes
            .checked_add(document.content.len())
            .and_then(|total| total.checked_add(after.len()))
            .ok_or_else(replace_too_large)?;
        if after.len() as u64 > MAX_SOURCE_BYTES || pending_bytes > MAX_REPLACE_TOTAL_BYTES {
            return Err(replace_too_large());
        }
        let absolute_path = root
            .join(&expected.path)
            .canonicalize()
            .map_err(|_| unavailable())?;
        // Re-assert containment: canonicalize follows symlinks, so a component
        // swapped between the read above and this write must not escape the root.
        if !absolute_path.starts_with(root) {
            return Err(unavailable());
        }
        pending.push(PendingReplacement {
            relative_path: expected.path,
            absolute_path,
            before: document.content,
            after_revision: revision_for_content(after.as_bytes()),
            after,
            matches,
        });
    }

    if pending.is_empty() {
        return Err(SearchError {
            code: "replace-empty",
            message: "No current matches are available to replace.",
        });
    }

    let canonical_project_path = root.to_string_lossy().into_owned();
    let transaction_id = transaction_id(&canonical_project_path);
    let transaction = ReplaceTransaction {
        project_path: canonical_project_path,
        files: pending
            .iter()
            .map(|item| ReplaceBackup {
                path: item.relative_path.clone(),
                content: item.before.clone(),
                after_revision: item.after_revision.clone(),
            })
            .collect(),
    };
    persist_transaction(app, &transaction_id, &transaction)?;

    if let Err(failure) = apply_write_set(
        &pending,
        |item| atomic_write(&item.absolute_path, item.after.as_bytes()).map_err(|_| ()),
        |item| atomic_write(&item.absolute_path, item.before.as_bytes()).map_err(|_| ()),
    ) {
        return Err(match failure {
            WriteSetFailure::Restored => {
                // Every file was rolled back to its original content, so the
                // persisted backup is now an orphan whose after_revision can never
                // match disk and which undo could never consume. Remove it.
                if let Ok(path) = transaction_path(app, &transaction_id) {
                    let _ = fs::remove_file(path);
                }
                unavailable()
            }
            WriteSetFailure::Incomplete => replace_incomplete(),
        });
    }

    prune_transaction_history(app);
    Ok(ReplaceResponse {
        transaction_id,
        changed_files: pending.len(),
        replaced_matches: pending.iter().map(|item| item.matches).sum(),
    })
}

/// Restores a replacement transaction unless any changed file has since been edited again.
#[tauri::command]
pub fn undo_project_replace(
    app: AppHandle,
    transaction_id: String,
    access: State<'_, ProjectAccess>,
) -> Result<ReplaceResponse, SearchError> {
    if transaction_id.len() != TRANSACTION_ID_LENGTH
        || !transaction_id
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err(unavailable());
    }
    let path = transaction_path(&app, &transaction_id)?;
    let encoded = bounded_io::read(&path, MAX_TRANSACTION_BYTES).map_err(|_| unavailable())?;
    let transaction: ReplaceTransaction =
        serde_json::from_slice(&encoded).map_err(|_| unavailable())?;
    if transaction.files.is_empty() || transaction.files.len() > MAX_REPLACE_FILES {
        return Err(unavailable());
    }
    let root = access
        .resolve(&transaction.project_path)
        .map_err(|_| unavailable())?;

    let mut targets = Vec::new();
    for backup in &transaction.files {
        let document = read_source(&root, Path::new(&backup.path)).map_err(|_| unavailable())?;
        if document.revision != backup.after_revision {
            return Err(changed());
        }
        let absolute = root
            .join(&backup.path)
            .canonicalize()
            .map_err(|_| unavailable())?;
        if !absolute.starts_with(&root) {
            return Err(unavailable());
        }
        targets.push((absolute, backup, document.content));
    }
    if let Err(failure) = apply_write_set(
        &targets,
        |(target, backup, _)| atomic_write(target, backup.content.as_bytes()).map_err(|_| ()),
        |(target, _, after)| atomic_write(target, after.as_bytes()).map_err(|_| ()),
    ) {
        return Err(match failure {
            WriteSetFailure::Restored => unavailable(),
            WriteSetFailure::Incomplete => replace_incomplete(),
        });
    }
    fs::remove_file(path).map_err(|_| unavailable())?;

    Ok(ReplaceResponse {
        transaction_id,
        changed_files: targets.len(),
        replaced_matches: 0,
    })
}

fn apply_write_set<T>(
    items: &[T],
    mut apply: impl FnMut(&T) -> Result<(), ()>,
    mut rollback: impl FnMut(&T) -> Result<(), ()>,
) -> Result<(), WriteSetFailure> {
    for (written, item) in items.iter().enumerate() {
        if apply(item).is_err() {
            let mut restored = true;
            for completed in items.iter().take(written).rev() {
                if rollback(completed).is_err() {
                    restored = false;
                }
            }
            return Err(if restored {
                WriteSetFailure::Restored
            } else {
                WriteSetFailure::Incomplete
            });
        }
    }
    Ok(())
}

fn search(root: &Path, matcher: &Regex) -> Result<ProjectSearchResponse, SearchError> {
    let mut files = Vec::new();
    let mut visited_entries = 0_usize;
    let traversal_truncated =
        collect_source_files(root, root, 0, &mut visited_entries, &mut files)?;
    let searched_files = files.len();
    let mut results = Vec::new();
    let mut total_matches = 0;

    for relative in files {
        let document = match read_source(root, &relative) {
            Ok(document) => document,
            Err(_) => continue,
        };
        for (line_index, line) in document.content.lines().enumerate() {
            for found in matcher.find_iter(line) {
                total_matches += 1;
                if results.len() < MAX_SEARCH_RESULTS {
                    results.push(SearchMatch {
                        path: document.path.clone(),
                        line: line_index + 1,
                        column: line[..found.start()].chars().count() + 1,
                        context: compact_context(line),
                        revision: document.revision.clone(),
                    });
                }
            }
        }
    }

    Ok(ProjectSearchResponse {
        truncated: traversal_truncated || total_matches > results.len(),
        results,
        total_matches,
        searched_files,
    })
}

fn collect_source_files(
    root: &Path,
    directory: &Path,
    depth: usize,
    visited_entries: &mut usize,
    files: &mut Vec<PathBuf>,
) -> Result<bool, SearchError> {
    if files.len() >= MAX_SEARCH_FILES || depth > MAX_SEARCH_DEPTH {
        return Ok(true);
    }
    let mut truncated = false;
    let entries = fs::read_dir(directory).map_err(|_| unavailable())?;
    for entry in entries {
        let entry = entry.map_err(|_| unavailable())?;
        let file_type = entry.file_type().map_err(|_| unavailable())?;
        if file_type.is_symlink() || ignored_name(&entry.file_name()) {
            continue;
        }
        *visited_entries += 1;
        if *visited_entries > MAX_SEARCH_ENTRIES {
            truncated = true;
            break;
        }
        if file_type.is_dir() {
            truncated |=
                collect_source_files(root, &entry.path(), depth + 1, visited_entries, files)?;
        } else if file_type.is_file() && is_readable_source(&entry.path()) {
            if let Ok(relative) = entry.path().strip_prefix(root) {
                files.push(relative.to_path_buf());
            }
        }
        if files.len() >= MAX_SEARCH_FILES || *visited_entries >= MAX_SEARCH_ENTRIES {
            truncated = true;
            break;
        }
    }
    Ok(truncated)
}

fn literal_matcher(query: &str, case_sensitive: bool) -> Result<Regex, SearchError> {
    if query.trim().is_empty() || query.chars().count() > 256 {
        return Err(SearchError {
            code: "invalid-search",
            message: "Enter a search term between 1 and 256 characters.",
        });
    }
    RegexBuilder::new(&regex::escape(query))
        .case_insensitive(!case_sensitive)
        .size_limit(1_000_000)
        .build()
        .map_err(|_| unavailable())
}

fn compact_context(line: &str) -> String {
    let trimmed = line.trim();
    let mut context: String = trimmed.chars().take(180).collect();
    if trimmed.chars().count() > 180 {
        context.push('…');
    }
    context
}

fn persist_transaction(
    app: &AppHandle,
    transaction_id: &str,
    transaction: &ReplaceTransaction,
) -> Result<(), SearchError> {
    let path = transaction_path(app, transaction_id)?;
    let encoded = serde_json::to_vec(transaction).map_err(|_| unavailable())?;
    if encoded.len() as u64 > MAX_TRANSACTION_BYTES {
        return Err(replace_too_large());
    }
    atomic_write(&path, &encoded).map_err(|_| unavailable())
}

fn transaction_path(app: &AppHandle, transaction_id: &str) -> Result<PathBuf, SearchError> {
    if transaction_id.len() != TRANSACTION_ID_LENGTH
        || !transaction_id
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err(unavailable());
    }
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| unavailable())?
        .join("replace-history");
    fs::create_dir_all(&directory).map_err(|_| unavailable())?;
    Ok(directory.join(format!("{transaction_id}.json")))
}

/// Caps the replace-history directory at the most recent transactions so backups
/// that are never undone cannot grow without bound.
fn prune_transaction_history(app: &AppHandle) {
    let Ok(directory) = app.path().app_data_dir() else {
        return;
    };
    let directory = directory.join("replace-history");
    let Ok(read) = fs::read_dir(&directory) else {
        return;
    };
    let mut entries: Vec<(SystemTime, PathBuf)> = read
        .flatten()
        .filter_map(|entry| {
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((modified, entry.path()))
        })
        .collect();
    if entries.len() <= MAX_TRANSACTION_HISTORY {
        return;
    }
    entries.sort_by_key(|(modified, _)| *modified);
    let excess = entries.len() - MAX_TRANSACTION_HISTORY;
    for (_, path) in entries.into_iter().take(excess) {
        let _ = fs::remove_file(path);
    }
}

static TRANSACTION_SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn transaction_id(project_path: &str) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_nanos());
    // Mix in a monotonic counter so two replaces on the same project within the
    // same clock tick cannot produce the same id (which would overwrite the
    // earlier backup).
    let nonce = TRANSACTION_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let mut digest = Sha256::new();
    digest.update(timestamp.to_le_bytes());
    digest.update(nonce.to_le_bytes());
    digest.update(project_path.as_bytes());
    format!("{:x}", digest.finalize())
}

pub(crate) fn ignored_name(name: &std::ffi::OsStr) -> bool {
    matches!(
        name.to_str(),
        Some(
            ".git"
                | ".cache"
                | ".texpadtmp"
                | "node_modules"
                | "target"
                | "build"
                | "dist"
                | "out"
                | "_build"
        )
    )
}

fn changed() -> SearchError {
    SearchError {
        code: "search-results-changed",
        message: "One or more files changed after the preview. Search again before replacing.",
    }
}

fn replace_too_large() -> SearchError {
    SearchError {
        code: "replace-too-large",
        message: "This replacement affects too much source at once. Narrow the search and preview a smaller change.",
    }
}

fn replace_incomplete() -> SearchError {
    SearchError {
        code: "replace-incomplete",
        message: "Replacement stopped and at least one file could not be restored automatically. Review the matched files before continuing; TeX retained the local replacement backup.",
    }
}

fn unavailable() -> SearchError {
    SearchError {
        code: "search-unavailable",
        message:
            "TeX could not complete project search safely. Your source files were not changed.",
    }
}

#[cfg(test)]
mod tests {
    use std::{cell::RefCell, fs, path::Path, time::SystemTime};

    use super::{
        apply_write_set, literal_matcher, search, transaction_id, WriteSetFailure,
        TRANSACTION_ID_LENGTH,
    };

    #[test]
    fn replacement_transaction_ids_are_fixed_length_hex() {
        let id = transaction_id("/approved/project");
        assert_eq!(id.len(), TRANSACTION_ID_LENGTH);
        assert!(id.chars().all(|character| character.is_ascii_hexdigit()));
    }

    #[test]
    fn rollback_attempts_every_completed_write_after_a_failure() {
        let applied = RefCell::new(Vec::new());
        let rolled_back = RefCell::new(Vec::new());
        let result = apply_write_set(
            &[0, 1, 2, 3],
            |item| {
                applied.borrow_mut().push(*item);
                (*item != 3).then_some(()).ok_or(())
            },
            |item| {
                rolled_back.borrow_mut().push(*item);
                (*item != 2).then_some(()).ok_or(())
            },
        );

        assert_eq!(result, Err(WriteSetFailure::Incomplete));
        assert_eq!(*applied.borrow(), vec![0, 1, 2, 3]);
        assert_eq!(*rolled_back.borrow(), vec![2, 1, 0]);
    }

    #[test]
    fn search_reports_file_line_context_and_count() -> Result<(), Box<dyn std::error::Error>> {
        let unique = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("tex-search-{unique}"));
        fs::create_dir(&directory)?;
        fs::write(
            directory.join("main.tex"),
            "first needle\nneedle twice needle",
        )?;
        let matcher = literal_matcher("needle", true).map_err(|_| "matcher failed")?;
        let response = search(&directory, &matcher).map_err(|_| "search failed")?;
        assert_eq!(response.total_matches, 3);
        assert_eq!(response.results[0].line, 1);
        assert_eq!(response.results[0].column, 7);
        assert_eq!(response.results[0].path, "main.tex");
        fs::remove_dir_all(directory)?;
        Ok(())
    }

    #[test]
    fn searches_across_a_realistic_multi_file_report() -> Result<(), Box<dyn std::error::Error>> {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/latex-projects/nasa-technical-report");
        let matcher = literal_matcher("fictional", false).map_err(|_| "matcher failed")?;
        let response = search(&root, &matcher).map_err(|_| "search failed")?;

        assert_eq!(response.searched_files, 11);
        assert_eq!(response.total_matches, 7);
        assert!(response
            .results
            .iter()
            .any(|result| result.path == "main.tex"));
        assert!(response
            .results
            .iter()
            .any(|result| result.path == "sections/results.tex"));
        assert!(!response.truncated);
        Ok(())
    }
}
