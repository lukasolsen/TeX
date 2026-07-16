use std::{
    collections::HashMap,
    fs, io,
    path::{Path, PathBuf},
    sync::Mutex,
};

/// Rust-owned authority for project roots approved during this application session.
///
/// A frontend path never grants authority. Roots enter this registry only after a
/// native folder selection or validation of persisted state. Resolution compares
/// filesystem identity as well as the canonical path so replacing a project root
/// at the same pathname invalidates the approval.
#[derive(Default)]
pub struct ProjectAccess {
    roots: Mutex<HashMap<PathBuf, RootIdentity>>,
}

impl ProjectAccess {
    /// Registers a canonical directory selected by the user or restored from app state.
    pub fn approve(&self, path: &Path) -> io::Result<PathBuf> {
        let canonical = canonical_directory(path)?;
        let identity = RootIdentity::read(&canonical)?;
        self.roots
            .lock()
            .map_err(|_| io::Error::other("project access registry unavailable"))?
            .insert(canonical.clone(), identity);
        Ok(canonical)
    }

    /// Resolves a frontend path only when it still identifies an approved root.
    pub fn resolve(&self, path: &str) -> io::Result<PathBuf> {
        let canonical = canonical_directory(Path::new(path))?;
        let identity = RootIdentity::read(&canonical)?;
        let roots = self
            .roots
            .lock()
            .map_err(|_| io::Error::other("project access registry unavailable"))?;
        match roots.get(&canonical) {
            Some(approved) if approved == &identity => Ok(canonical),
            _ => Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "project root is not approved",
            )),
        }
    }

    /// Removes session authority for a project that the user forgot.
    pub fn revoke(&self, path: &str) {
        let Ok(canonical) = Path::new(path).canonicalize() else {
            return;
        };
        if let Ok(mut roots) = self.roots.lock() {
            roots.remove(&canonical);
        }
    }
}

fn canonical_directory(path: &Path) -> io::Result<PathBuf> {
    let canonical = path.canonicalize()?;
    if canonical.is_dir() {
        Ok(canonical)
    } else {
        Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "project root is not a directory",
        ))
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct RootIdentity {
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
    #[cfg(windows)]
    volume: Option<u32>,
    #[cfg(windows)]
    file_index: Option<u64>,
}

impl RootIdentity {
    fn read(path: &Path) -> io::Result<Self> {
        let metadata = fs::metadata(path)?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            Ok(Self {
                device: metadata.dev(),
                inode: metadata.ino(),
            })
        }

        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            Ok(Self {
                volume: metadata.volume_serial_number(),
                file_index: metadata.file_index(),
            })
        }

        #[cfg(not(any(unix, windows)))]
        {
            let _ = metadata;
            Ok(Self {})
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, time::SystemTime};

    use super::ProjectAccess;

    fn temporary_root(name: &str) -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
        let unique = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_nanos();
        let root = std::env::temp_dir().join(format!("tex-project-access-{name}-{unique}"));
        fs::create_dir(&root)?;
        Ok(root)
    }

    #[test]
    fn rejects_a_root_that_was_not_approved() -> Result<(), Box<dyn std::error::Error>> {
        let root = temporary_root("unapproved")?;
        let access = ProjectAccess::default();

        assert!(access.resolve(&root.to_string_lossy()).is_err());
        fs::remove_dir(root)?;
        Ok(())
    }

    #[test]
    fn invalidates_approval_when_the_root_is_replaced() -> Result<(), Box<dyn std::error::Error>> {
        let root = temporary_root("replacement")?;
        let access = ProjectAccess::default();
        access.approve(&root)?;
        assert!(access.resolve(&root.to_string_lossy()).is_ok());

        fs::remove_dir(&root)?;
        fs::create_dir(&root)?;

        assert!(access.resolve(&root.to_string_lossy()).is_err());
        fs::remove_dir(root)?;
        Ok(())
    }
}
