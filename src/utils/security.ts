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

/**
 * Parses natural language replacement instructions like:
 *   replace <target> with <replacement> [optional trailing text]
 * Handles quoted strings, embedded "with", trailing text, and unquoted strings.
 */
export function parseReplaceInstruction(instruction: string): [string, string] | null {
  if (!instruction || typeof instruction !== "string") return null;
  const instr = instruction.trim();
  if (!/^replace\b/i.test(instr)) return null;

  const rest = instr.slice(7).trim();

  // Case 1: Quoted target
  if (rest.startsWith("'") || rest.startsWith('"')) {
    const q = rest[0];
    const endIdx = rest.indexOf(q, 1);
    if (endIdx !== -1) {
      const target = rest.slice(1, endIdx);
      const afterTarget = rest.slice(endIdx + 1).trim();
      const withMatch = afterTarget.match(/^with\b\s*/i);
      if (withMatch) {
        const afterWith = afterTarget.slice(withMatch[0].length).trim();
        if (afterWith.startsWith("'") || afterWith.startsWith('"')) {
          const rq = afterWith[0];
          const rendIdx = afterWith.indexOf(rq, 1);
          const replacement = rendIdx !== -1 ? afterWith.slice(1, rendIdx) : afterWith.slice(1);
          return [target, replacement];
        } else {
          const parts = afterWith.split(/\s+(?:and|in|on|to)\s+/i);
          return [target, parts[0].trim().replace(/^['"]|['"]$/g, "")];
        }
      }
    }
  }

  // Case 2: Unquoted target
  const withMatch = rest.match(/\bwith\b/i);
  if (withMatch && withMatch.index !== undefined) {
    const target = rest.slice(0, withMatch.index).trim().replace(/^['"]|['"]$/g, "");
    if (!target) return null;
    const afterWith = rest.slice(withMatch.index + withMatch[0].length).trim();
    if (afterWith.startsWith("'") || afterWith.startsWith('"')) {
      const rq = afterWith[0];
      const rendIdx = afterWith.indexOf(rq, 1);
      const replacement = rendIdx !== -1 ? afterWith.slice(1, rendIdx) : afterWith.slice(1);
      return [target, replacement];
    } else {
      const parts = afterWith.split(/\s+(?:and|in|on|to)\s+/i);
      return [target, parts[0].trim().replace(/^['"]|['"]$/g, "")];
    }
  }

  return null;
}

