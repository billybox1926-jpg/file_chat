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
 * Config keys whose values are filesystem paths written to by the engine.
 * These must stay inside the project directory: audit_log and session_dir are
 * consumed by file_chat.py, which resolves them relative to its own cwd, so an
 * unvalidated value lets a config write place files anywhere on disk.
 */
export const PATH_CONFIG_KEYS = ["audit_log", "session_dir"] as const;

/** Keys the server accepts on POST /api/config. Anything else is dropped. */
export const ALLOWED_CONFIG_KEYS = [
  "model",
  "ollama_url",
  "provider",
  "temperature",
  "top_k",
  "chunk_size",
  "chunk_overlap",
  "git_enabled",
  "audit_log",
  "session_dir",
  "watchdog_auto_index",
  "watch_debounce_ms",
  "retrieval_mode",
] as const;

/**
 * True when a config path value stays inside baseDir once resolved.
 * Rejects absolute paths, parent traversal, URL-encoded escapes and null bytes.
 */
export function isSafeConfigPath(value: unknown, baseDir: string = process.cwd()): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.includes("\0")) return false;

  let decoded = value;
  try {
    while (decoded.includes("%")) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return false;
  }
  if (decoded.includes("\0")) return false;

  decoded = decoded.replace(/\\/g, "/");
  if (path.isAbsolute(decoded) || /^[a-zA-Z]:/.test(decoded)) return false;

  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, decoded);
  return resolved !== base && resolved.startsWith(base + path.sep);
}

/**
 * Validates an incoming config payload. Unknown keys are dropped rather than
 * persisted, and path-valued keys must resolve inside baseDir.
 * Returns the sanitized config, or an error naming the offending key.
 */
export function validateConfigPayload(
  payload: unknown,
  baseDir: string = process.cwd()
): { ok: true; config: Record<string, unknown> } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Config must be a JSON object" };
  }

  const incoming = payload as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const key of Object.keys(incoming)) {
    if (!(ALLOWED_CONFIG_KEYS as readonly string[]).includes(key)) {
      continue; // drop unknown keys instead of persisting them
    }
    const value = incoming[key];
    if ((PATH_CONFIG_KEYS as readonly string[]).includes(key)) {
      if (!isSafeConfigPath(value, baseDir)) {
        return {
          ok: false,
          error: `Config key '${key}' must be a relative path inside the project directory`,
        };
      }
    }
    sanitized[key] = value;
  }

  return { ok: true, config: sanitized };
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

