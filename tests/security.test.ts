import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { assertInsideWorkspace, getSafeWorkspacePath, parseReplaceInstruction } from "../src/utils/security";

describe("Security Unit Tests - assertInsideWorkspace Utility", () => {
  const testWorkspaceDir = path.resolve(process.cwd(), "test_workspace_sandbox");
  const testValidFile = "valid_sample_document.md";
  const testNestedFile = "subfolder/nested_guide.txt";
  const symlinkEscapingFile = "symlink_leak_outside.txt";

  before(() => {
    // Set up test workspace sandbox directory
    if (!fs.existsSync(testWorkspaceDir)) {
      fs.mkdirSync(testWorkspaceDir, { recursive: true });
    }
    const subfolder = path.join(testWorkspaceDir, "subfolder");
    if (!fs.existsSync(subfolder)) {
      fs.mkdirSync(subfolder, { recursive: true });
    }

    fs.writeFileSync(path.join(testWorkspaceDir, testValidFile), "# Valid Document\nContent", "utf-8");
    fs.writeFileSync(path.join(testWorkspaceDir, testNestedFile), "Nested document content", "utf-8");

    // Create symlink pointing to an external file (e.g. package.json in parent directory)
    const targetOutside = path.resolve(process.cwd(), "package.json");
    const symlinkPath = path.join(testWorkspaceDir, symlinkEscapingFile);
    try {
      if (fs.existsSync(symlinkPath)) {
        fs.unlinkSync(symlinkPath);
      }
      fs.symlinkSync(targetOutside, symlinkPath);
    } catch {
      // Symlinks may require elevated permissions on some environments
    }
  });

  after(() => {
    // Clean up temporary test sandbox
    try {
      if (fs.existsSync(testWorkspaceDir)) {
        fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe("Valid Workspace Paths", () => {
    test("allows standard relative file path within workspace", () => {
      const resolved = assertInsideWorkspace(testValidFile, testWorkspaceDir);
      assert.equal(resolved, path.join(testWorkspaceDir, testValidFile));
    });

    test("allows nested relative file paths within workspace", () => {
      const resolved = assertInsideWorkspace(testNestedFile, testWorkspaceDir);
      assert.equal(resolved, path.join(testWorkspaceDir, testNestedFile));
    });

    test("allows prefixed current-directory paths (e.g., ./file.md)", () => {
      const resolved = assertInsideWorkspace(`./${testValidFile}`, testWorkspaceDir);
      assert.equal(resolved, path.join(testWorkspaceDir, testValidFile));
    });

    test("allows referencing the workspace root itself", () => {
      const resolved = assertInsideWorkspace(".", testWorkspaceDir);
      assert.equal(resolved, testWorkspaceDir);
    });

    test("allows new non-existent files targeted strictly within workspace", () => {
      const newFileRel = "new_created_doc.md";
      const resolved = assertInsideWorkspace(newFileRel, testWorkspaceDir);
      assert.equal(resolved, path.join(testWorkspaceDir, newFileRel));
    });
  });

  describe("Directory Traversal Rejection ('../.env', '../../etc/passwd')", () => {
    test("rejects single parent traversal attempt '../.env'", () => {
      assert.throws(
        () => assertInsideWorkspace("../.env", testWorkspaceDir),
        /Access denied/
      );
    });

    test("rejects multi-level parent traversal attempt '../../etc/passwd'", () => {
      assert.throws(
        () => assertInsideWorkspace("../../etc/passwd", testWorkspaceDir),
        /Access denied/
      );
    });

    test("rejects deep parent traversal attempt '../../../../root/.ssh/id_rsa'", () => {
      assert.throws(
        () => assertInsideWorkspace("../../../../root/.ssh/id_rsa", testWorkspaceDir),
        /Access denied/
      );
    });

    test("rejects traversal nested inside subdirectories (e.g., 'subfolder/../../.env')", () => {
      assert.throws(
        () => assertInsideWorkspace("subfolder/../../.env", testWorkspaceDir),
        /Access denied/
      );
    });

    test("rejects absolute system paths outside workspace (e.g., '/etc/passwd')", () => {
      assert.throws(
        () => assertInsideWorkspace("/etc/passwd", testWorkspaceDir),
        /Access denied/
      );
    });
  });

  describe("URL-Encoded Traversal Variants", () => {
    const encodedPayloads = [
      "..%2f.env",
      "..%2f..%2fetc%2fpasswd",
      "..%2f..%2f..%2fetc%2fpasswd",
      "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
      "%2e%2e%2f.env",
      "subfolder%2f..%2f..%2f.env",
      "..%5c..%5cetc%5cpasswd",
      "%252e%252e%252f.env", // Double URL encoding
    ];

    encodedPayloads.forEach((payload) => {
      test(`rejects URL-encoded traversal variant: '${payload}'`, () => {
        assert.throws(
          () => assertInsideWorkspace(payload, testWorkspaceDir),
          /Access denied/
        );
      });
    });
  });

  describe("Null-Byte and Malformed Inputs", () => {
    test("rejects null-byte injection attempts", () => {
      assert.throws(
        () => assertInsideWorkspace("doc.md\0.exe", testWorkspaceDir),
        /Access denied/
      );
      assert.throws(
        () => assertInsideWorkspace("valid.txt\0/../../.env", testWorkspaceDir),
        /Access denied/
      );
    });

    test("rejects empty or non-string paths", () => {
      assert.throws(
        () => assertInsideWorkspace("", testWorkspaceDir),
        /Access denied/
      );
      assert.throws(
        () => assertInsideWorkspace(null as any, testWorkspaceDir),
        /Access denied/
      );
    });
  });

  describe("Symlink Traversal Prevention", () => {
    test("rejects symlink pointing outside the workspace sandbox", () => {
      const symlinkPath = path.join(testWorkspaceDir, symlinkEscapingFile);
      if (fs.existsSync(symlinkPath)) {
        assert.throws(
          () => assertInsideWorkspace(symlinkEscapingFile, testWorkspaceDir),
          /Access denied/
        );
      }
    });
  });

  describe("getSafeWorkspacePath Helper Validation", () => {
    test("returns resolved path string for valid workspace inputs", () => {
      const safe = getSafeWorkspacePath(testValidFile, testWorkspaceDir);
      assert.equal(safe, path.join(testWorkspaceDir, testValidFile));
    });

    test("returns null for all traversal and invalid attempts", () => {
      assert.equal(getSafeWorkspacePath("../.env", testWorkspaceDir), null);
      assert.equal(getSafeWorkspacePath("../../etc/passwd", testWorkspaceDir), null);
      assert.equal(getSafeWorkspacePath("..%2f.env", testWorkspaceDir), null);
      assert.equal(getSafeWorkspacePath("%2e%2e%2fetc%2fpasswd", testWorkspaceDir), null);
      assert.equal(getSafeWorkspacePath("doc.md\0.exe", testWorkspaceDir), null);
    });
  });

  describe("Replacement Instruction Parser Tests", () => {
    test("parses target with embedded 'with' correctly", () => {
      const res = parseReplaceInstruction("replace 'username with password' with 'credentials'");
      assert.deepEqual(res, ["username with password", "credentials"]);
    });

    test("parses words containing with like 'width' correctly", () => {
      const res = parseReplaceInstruction("replace 'width' with 'height'");
      assert.deepEqual(res, ["width", "height"]);
    });

    test("handles trailing instructions and comments cleanly", () => {
      const res = parseReplaceInstruction("replace 'a' with 'b' and add comment");
      assert.deepEqual(res, ["a", "b"]);
    });

    test("handles unquoted bare words", () => {
      const res = parseReplaceInstruction("replace width with height");
      assert.deepEqual(res, ["width", "height"]);
    });
  });
});
