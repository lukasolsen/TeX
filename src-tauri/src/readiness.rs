use serde::Serialize;

/// Reports the local guarantees available to the presentation layer.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseZeroReadiness {
    pub local_first: bool,
    pub project_access_enabled: bool,
    pub build_execution_enabled: bool,
}

/// Returns capability flags for the frontend without exposing broad filesystem access.
#[tauri::command]
pub fn phase_zero_readiness() -> PhaseZeroReadiness {
    PhaseZeroReadiness {
        local_first: true,
        project_access_enabled: true,
        build_execution_enabled: false,
    }
}

#[cfg(test)]
mod tests {
    use super::phase_zero_readiness;

    #[test]
    fn enables_project_access_without_build_execution() {
        let readiness = phase_zero_readiness();

        assert!(readiness.local_first);
        assert!(readiness.project_access_enabled);
        assert!(!readiness.build_execution_enabled);
    }
}
