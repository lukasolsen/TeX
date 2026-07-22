import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"

/**
 * Joins a canonical project root with a project-relative path for display
 * (e.g. copy-as-path). The separator follows the root's platform: a Windows
 * root keeps backslashes, everything else uses `/`.
 */
export function absoluteDisplayPath(
  projectPath: CanonicalProjectPath,
  relativePath: ProjectRelativePath
): string {
  const windowsPath = projectPath.includes("\\") && !projectPath.includes("/")
  const separator = windowsPath ? "\\" : "/"
  const root = projectPath.replace(/[\\/]$/, "")
  const child = windowsPath ? relativePath.replaceAll("/", "\\") : relativePath
  return `${root}${separator}${child}`
}
