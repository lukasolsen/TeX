use std::collections::{HashMap, HashSet};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use crate::project_search::ignored_name;
use crate::source_read::{read_source, valid_relative_path};

const MAX_SCAN_FILES: usize = 2_048;
const MAX_SCAN_ENTRIES: usize = 4_096;
const MAX_SCAN_DEPTH: usize = 32;

pub(crate) struct ProjectSources {
    pub files: Vec<PathBuf>,
    pub texts: Vec<(PathBuf, String)>,
}

/// Caches parsed-from-disk source text per project root so repeated completion
/// requests do not re-read and re-parse the whole tree on every keystroke. Each
/// entry is validated on insertion by `read_source` and reused only while the
/// file's modification time and length are unchanged. Arc-backed so the whole
/// cache can be cloned cheaply and moved onto a blocking worker thread.
#[derive(Clone, Default)]
pub struct ScanCache {
    roots: Arc<Mutex<HashMap<PathBuf, HashMap<PathBuf, CachedFile>>>>,
}

struct CachedFile {
    modified: Option<SystemTime>,
    len: u64,
    content: String,
}

/// Walks the project once (bounded, skipping symlinks and ignored directories),
/// then reads `.tex`/`.bib` contents with the active file's unsaved buffer
/// overlaid over its on-disk copy. A new active file absent on disk is still
/// represented by its buffer. File contents whose modification time and length
/// are unchanged since a prior scan are reused from `cache` rather than re-read,
/// so repeated completion requests do not re-read and re-parse the whole tree.
pub(crate) fn scan_project_cached(
    cache: &ScanCache,
    root: &Path,
    active_relative: &Path,
    active_content: &str,
) -> ProjectSources {
    let mut files = Vec::new();
    let mut entries = 0_usize;
    collect(root, 0, &mut entries, &mut files);

    if valid_relative_path(active_relative) && !files.iter().any(|path| path == active_relative) {
        files.push(active_relative.to_path_buf());
    }

    let mut roots = cache.roots.lock().unwrap_or_else(|error| error.into_inner());
    let store = roots.entry(root.to_path_buf()).or_default();

    let mut texts = Vec::new();
    for relative in &files {
        if !is_text_source(relative) {
            continue;
        }
        let content = if relative == active_relative {
            active_content.to_owned()
        } else {
            match cached_content(store, root, relative) {
                Some(content) => content,
                None => continue,
            }
        };
        texts.push((relative.clone(), content));
    }

    // Drop cache entries for files that no longer exist so the map cannot grow
    // without bound across the lifetime of a project.
    let present: HashSet<&PathBuf> = files.iter().collect();
    store.retain(|key, _| present.contains(key));

    ProjectSources { files, texts }
}

/// Returns the source text for `relative`, serving a cached copy when the file's
/// modification time and length match the cached entry and re-reading (through the
/// symlink-checked, bounded `read_source`) otherwise.
fn cached_content(
    store: &mut HashMap<PathBuf, CachedFile>,
    root: &Path,
    relative: &Path,
) -> Option<String> {
    let metadata = std::fs::metadata(root.join(relative)).ok();
    let modified = metadata.as_ref().and_then(|data| data.modified().ok());
    let len = metadata.as_ref().map_or(0, std::fs::Metadata::len);

    if metadata.is_some() {
        if let Some(entry) = store.get(relative) {
            if entry.modified == modified && entry.len == len {
                return Some(entry.content.clone());
            }
        }
    }

    let content = read_source(root, relative).ok()?.content;
    store.insert(
        relative.to_path_buf(),
        CachedFile {
            modified,
            len,
            content: content.clone(),
        },
    );
    Some(content)
}

fn collect(root: &Path, depth: usize, entries: &mut usize, files: &mut Vec<PathBuf>) {
    collect_dir(root, root, depth, entries, files);
}

fn collect_dir(
    root: &Path,
    directory: &Path,
    depth: usize,
    entries: &mut usize,
    files: &mut Vec<PathBuf>,
) {
    if files.len() >= MAX_SCAN_FILES || depth > MAX_SCAN_DEPTH {
        return;
    }
    let Ok(read) = std::fs::read_dir(directory) else {
        return;
    };
    for entry in read.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() || ignored_name(&entry.file_name()) {
            continue;
        }
        *entries += 1;
        if *entries > MAX_SCAN_ENTRIES {
            return;
        }
        if file_type.is_dir() {
            collect_dir(root, &entry.path(), depth + 1, entries, files);
        } else if file_type.is_file() {
            if let Ok(relative) = entry.path().strip_prefix(root) {
                files.push(relative.to_path_buf());
            }
        }
        if files.len() >= MAX_SCAN_FILES {
            return;
        }
    }
}

fn is_text_source(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(OsStr::to_str)
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("tex") | Some("bib")
    )
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{scan_project_cached, ScanCache};

    fn temp_root(tag: &str) -> Result<PathBuf, Box<dyn std::error::Error>> {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let root = std::env::temp_dir().join(format!("tex-scan-{tag}-{unique}"));
        fs::create_dir(&root)?;
        Ok(root)
    }

    #[test]
    fn overlays_the_active_buffer_over_stale_disk() -> Result<(), Box<dyn std::error::Error>> {
        let root = temp_root("overlay")?;
        fs::write(root.join("main.tex"), "\\label{old}")?;
        let sources =
            scan_project_cached(&ScanCache::default(), &root, Path::new("main.tex"), "\\label{new}");
        let text = sources
            .texts
            .iter()
            .find(|(path, _)| path == Path::new("main.tex"))
            .map(|(_, content)| content.as_str())
            .ok_or("active text present")?;
        assert!(text.contains("new"));
        assert!(!text.contains("old"));
        fs::remove_dir_all(root).ok();
        Ok(())
    }

    #[test]
    fn represents_an_unsaved_active_file_absent_on_disk() -> Result<(), Box<dyn std::error::Error>>
    {
        let root = temp_root("unsaved")?;
        let sources = scan_project_cached(
            &ScanCache::default(),
            &root,
            Path::new("draft.tex"),
            "\\label{fresh}",
        );
        assert!(sources
            .files
            .iter()
            .any(|path| path == Path::new("draft.tex")));
        assert!(sources
            .texts
            .iter()
            .any(|(path, content)| path == Path::new("draft.tex") && content.contains("fresh")));
        fs::remove_dir_all(root).ok();
        Ok(())
    }

    #[test]
    fn gathers_files_and_texts_across_the_tree() -> Result<(), Box<dyn std::error::Error>> {
        let root = temp_root("tree")?;
        fs::create_dir(root.join("chapters"))?;
        fs::write(root.join("refs.bib"), "@book{key,}")?;
        fs::write(root.join("chapters/intro.tex"), "\\label{sec:intro}")?;
        fs::write(root.join("plot.png"), [0x89_u8, 0x50, 0x4e, 0x47])?;
        let sources = scan_project_cached(&ScanCache::default(), &root, Path::new("main.tex"), "");

        assert!(sources
            .files
            .iter()
            .any(|path| path == Path::new("plot.png")));
        assert!(sources
            .texts
            .iter()
            .any(|(path, _)| path == Path::new("chapters/intro.tex")));
        assert!(sources
            .texts
            .iter()
            .any(|(path, content)| path == Path::new("refs.bib") && content.contains("key")));
        assert!(!sources
            .texts
            .iter()
            .any(|(path, _)| path == Path::new("plot.png")));
        fs::remove_dir_all(root).ok();
        Ok(())
    }
}
