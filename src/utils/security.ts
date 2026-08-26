import fs from "fs";
import path from "path";

export const DEFAULT_WORKSPACE_DIR = path.resolve(process.cwd(), "workspace_docs");

/**
 * Asserts that a target file path resolves strictly within the workspace directory.
 * Throws an Error if the path attempts traversal, escapes workspace, or uses null-byte injection.
 * Returns the validated, resolved absolute path if valid.
 */
export function assertInsideWorkspace(
  targetPath: string,
  workspaceDir: string = DEFAULT_WORKSPACE_DIR
): string {
  if (!targetPath || typeof targetPath !== "string") {
    throw new Error("Access denied: Invalid file path");
  }

  // Handle URL-encoded traversal sequences (e.g. %2e%2e%2f, ..%2f, ..%5c)
  let decoded = targetPath;
  try {
    while (decoded.includes("%")) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    throw new Error("Access denied: Invalid path encoding");
  }

  // Normalize Windows/backslash directory separators to forward slashes
  decoded = decoded.replace(/\\/g, "/");

  // Reject null-byte injection
  if (decoded.includes("\0") || targetPath.includes("\0")) {
    throw new Error("Access denied: Null-byte injection detected");
  }

  const baseDir = path.resolve(workspaceDir);
  const resolved = path.resolve(baseDir, decoded);

  // Must strictly start with baseDir + path separator or equal baseDir
  if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
    throw new Error(`Access denied: Path '${targetPath}' escapes workspace directory '${baseDir}'`);
  }

  // If file/path exists, prevent symlink traversal to outside workspace
  if (fs.existsSync(resolved)) {
    try {
      const realResolved = fs.realpathSync(resolved);
      const realBase = fs.realpathSync(baseDir);
      if (!realResolved.startsWith(realBase + path.sep) && realResolved !== realBase) {
        throw new Error(`Access denied: Symlink '${targetPath}' points outside workspace directory`);
      }
    } catch (err: any) {
      if (err?.message?.includes("Access denied")) throw err;
      throw new Error("Access denied: Cannot resolve real path");
    }
  }

  return resolved;
}

/**
 * Safe wrapper around assertInsideWorkspace that returns null instead of throwing.
 */
export function getSafeWorkspacePath(
  relPath: string,
  workspaceDir: string = DEFAULT_WORKSPACE_DIR
): string | null {
  try {
    return assertInsideWorkspace(relPath, workspaceDir);
  } catch {
    return null;
  }
}
