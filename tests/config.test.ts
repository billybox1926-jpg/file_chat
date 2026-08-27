import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import {
  isSafeConfigPath,
  validateConfigPayload,
  ALLOWED_CONFIG_KEYS,
  PROTECTED_PATHS,
} from "../src/utils/security";

const BASE = path.resolve("/project/root");

describe("isSafeConfigPath rejects escaping path values", () => {
  test("accepts plain relative filenames and subpaths", () => {
    assert.equal(isSafeConfigPath("audit.log", BASE), true);
    assert.equal(isSafeConfigPath(".filechat_sessions", BASE), true);
    assert.equal(isSafeConfigPath("logs/audit.log", BASE), true);
    assert.equal(isSafeConfigPath("./audit.log", BASE), true);
  });

  test("rejects parent traversal", () => {
    assert.equal(isSafeConfigPath("../audit.log", BASE), false);
    assert.equal(isSafeConfigPath("../../../pwned_audit.log", BASE), false);
    assert.equal(isSafeConfigPath("logs/../../escape.log", BASE), false);
  });

  test("rejects absolute paths on both platforms", () => {
    assert.equal(isSafeConfigPath("/etc/passwd", BASE), false);
    assert.equal(isSafeConfigPath("C:/Windows/system32/evil.log", BASE), false);
    assert.equal(isSafeConfigPath("C:\\Windows\\evil.log", BASE), false);
  });

  test("rejects backslash traversal", () => {
    assert.equal(isSafeConfigPath("..\\..\\escape.log", BASE), false);
  });

  test("rejects URL-encoded and double-encoded traversal", () => {
    assert.equal(isSafeConfigPath("..%2faudit.log", BASE), false);
    assert.equal(isSafeConfigPath("%2e%2e%2fescape.log", BASE), false);
    assert.equal(isSafeConfigPath("%252e%252e%252fescape.log", BASE), false);
  });

  test("rejects null bytes, empties and non-strings", () => {
    assert.equal(isSafeConfigPath("audit\0.log", BASE), false);
    assert.equal(isSafeConfigPath("", BASE), false);
    assert.equal(isSafeConfigPath(null, BASE), false);
    assert.equal(isSafeConfigPath(undefined, BASE), false);
    assert.equal(isSafeConfigPath(42, BASE), false);
    assert.equal(isSafeConfigPath({}, BASE), false);
  });

  test("rejects a value resolving to the base dir itself", () => {
    assert.equal(isSafeConfigPath(".", BASE), false);
  });
});

describe("validateConfigPayload", () => {
  test("rejects the audit_log escape that redirected engine writes off-disk", () => {
    const result = validateConfigPayload(
      { audit_log: "../../../pwned_audit.log" },
      BASE
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /audit_log/);
  });

  test("rejects an escaping session_dir", () => {
    const result = validateConfigPayload(
      { session_dir: "../../../pwned_sessions" },
      BASE
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /session_dir/);
  });

  test("accepts a legitimate full config", () => {
    const result = validateConfigPayload(
      {
        provider: "ollama",
        temperature: 0.5,
        audit_log: "audit.log",
        session_dir: ".filechat_sessions",
      },
      BASE
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.config.provider, "ollama");
      assert.equal(result.config.temperature, 0.5);
    }
  });

  test("drops unknown keys instead of persisting them", () => {
    const result = validateConfigPayload(
      { provider: "offline", __proto__polluted: "x", evil_key: "y" },
      BASE
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.config.provider, "offline");
      assert.equal("evil_key" in result.config, false);
      assert.equal("__proto__polluted" in result.config, false);
    }
  });

  test("rejects non-object payloads", () => {
    assert.equal(validateConfigPayload(null, BASE).ok, false);
    assert.equal(validateConfigPayload("string", BASE).ok, false);
    assert.equal(validateConfigPayload([1, 2], BASE).ok, false);
  });

  test("every documented config key is accepted", () => {
    for (const key of ALLOWED_CONFIG_KEYS) {
      const payload: Record<string, unknown> =
        key === "audit_log"
          ? { audit_log: "audit.log" }
          : key === "session_dir"
          ? { session_dir: ".sessions" }
          : { [key]: "value" };
      const result = validateConfigPayload(payload, BASE);
      assert.equal(result.ok, true, `key ${key} should be accepted`);
    }
  });
});

describe("isSafeConfigPath rejects protected project files", () => {
  for (const file of PROTECTED_PATHS) {
    test(`rejects targeting ${file}`, () => {
      assert.equal(isSafeConfigPath(file, BASE), false);
      assert.equal(isSafeConfigPath(`./${file}`, BASE), false);
      assert.equal(isSafeConfigPath(`subdir/${file}`, BASE), false);
    });
  }

  test("accepts a logs/ subdir for audit_log", () => {
    assert.equal(isSafeConfigPath("logs/audit.log", BASE), true);
    assert.equal(isSafeConfigPath("logs/sub/dir.log", BASE), true);
  });

  test("accepts default audit.log and .filechat_sessions", () => {
    assert.equal(isSafeConfigPath("audit.log", BASE), true);
    assert.equal(isSafeConfigPath(".filechat_sessions", BASE), true);
  });
});
