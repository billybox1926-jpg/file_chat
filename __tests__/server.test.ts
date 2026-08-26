import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import http from "http";

// Ensure test environment before importing app
process.env.NODE_ENV = "test";
import { app, getSafeWorkspacePath, WORKSPACE_DIR } from "../server.ts";

describe("Workspace Directory Traversal & Security Tests", () => {
  let server: http.Server;
  let baseUrl: string;
  const testFileName = "test_valid_doc.md";
  const testFileRelPath = testFileName;
  const testFileFullPath = path.join(WORKSPACE_DIR, testFileName);
  const symlinkName = "symlink_outside_leak.txt";
  const symlinkFullPath = path.join(WORKSPACE_DIR, symlinkName);

  before(async () => {
    // Setup workspace directory and a valid test file
    if (!fs.existsSync(WORKSPACE_DIR)) {
      fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    }
    fs.writeFileSync(testFileFullPath, "# Test Content\nValid workspace file.", "utf-8");

    // Create a symlink pointing outside the workspace (to package.json in parent dir)
    const targetOutside = path.resolve(process.cwd(), "package.json");
    try {
      if (fs.existsSync(symlinkFullPath)) {
        fs.unlinkSync(symlinkFullPath);
      }
      fs.symlinkSync(targetOutside, symlinkFullPath);
    } catch (err) {
      console.warn("Could not create symlink for test:", err);
    }

    // Start ephemeral server
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Clean up created test files & symlinks
    if (fs.existsSync(testFileFullPath)) {
      fs.unlinkSync(testFileFullPath);
    }
    if (fs.existsSync(symlinkFullPath)) {
      try {
        fs.unlinkSync(symlinkFullPath);
      } catch {}
    }

    // Close HTTP server
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("GET /api/files/content allows valid files inside workspace", async () => {
    const res = await fetch(`${baseUrl}/api/files/content?path=${testFileRelPath}`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { content: string; path: string };
    assert.equal(data.path, testFileRelPath);
    assert.match(data.content, /Valid workspace file/);
  });

  test("GET /api/files/content rejects parent traversal to ../.env with 403", async () => {
    const res = await fetch(`${baseUrl}/api/files/content?path=../.env`);
    assert.equal(res.status, 403);
    const data = (await res.json()) as { error: string };
    assert.equal(data.error, "Access denied");
  });

  test("GET /api/files/content rejects parent traversal to ../../etc/passwd with 403", async () => {
    const res = await fetch(`${baseUrl}/api/files/content?path=../../etc/passwd`);
    assert.equal(res.status, 403);
    const data = (await res.json()) as { error: string };
    assert.equal(data.error, "Access denied");
  });

  test("GET /api/files/content rejects URL-encoded traversal sequences with 403", async () => {
    const encodedPayloads = [
      "..%2f.env",
      "..%2f..%2fetc%2fpasswd",
      "..%2f..%2f..%2fetc%2fpasswd",
      "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
      "subdir/..%2f..%2f.env",
      "..%5c..%5cetc%5cpasswd",
    ];

    for (const payload of encodedPayloads) {
      const res = await fetch(`${baseUrl}/api/files/content?path=${payload}`);
      assert.equal(
        res.status === 403 || res.status === 404,
        true,
        `Expected 403 or 404 for ${payload}, got ${res.status}`
      );
      if (res.status === 403) {
        const data = (await res.json()) as { error: string };
        assert.equal(data.error, "Access denied");
      }
    }
  });

  test("GET /api/files/content rejects symlink pointing outside workspace with 403", async () => {
    if (fs.existsSync(symlinkFullPath)) {
      const res = await fetch(`${baseUrl}/api/files/content?path=${symlinkName}`);
      assert.equal(res.status, 403);
      const data = (await res.json()) as { error: string };
      assert.equal(data.error, "Access denied");
    }
  });

  test("POST /api/files/save rejects traversal path with 403", async () => {
    const res = await fetch(`${baseUrl}/api/files/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "../escaped_secret.txt", content: "malicious write" }),
    });
    assert.equal(res.status, 403);
    const data = (await res.json()) as { error: string };
    assert.equal(data.error, "Access denied");
  });

  test("DELETE /api/files/delete rejects traversal path with 403", async () => {
    const res = await fetch(`${baseUrl}/api/files/delete?path=../../package.json`, {
      method: "DELETE",
    });
    assert.equal(res.status, 403);
    const data = (await res.json()) as { error: string };
    assert.equal(data.error, "Access denied");
  });

  test("POST /api/edit/preview rejects traversal path with 403", async () => {
    const res = await fetch(`${baseUrl}/api/edit/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: "../.env", instruction: "modify secret" }),
    });
    assert.equal(res.status, 403);
    const data = (await res.json()) as { error: string };
    assert.equal(data.error, "Access denied");
  });

  test("POST /api/edit/apply rejects traversal path with 403", async () => {
    const res = await fetch(`${baseUrl}/api/edit/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: "../../etc/passwd", instruction: "modify passwd" }),
    });
    assert.equal(res.status, 403);
    const data = (await res.json()) as { error: string };
    assert.equal(data.error, "Access denied");
  });

  test("Unit test: getSafeWorkspacePath function validation", () => {
    // Escapes
    assert.equal(getSafeWorkspacePath("../.env"), null);
    assert.equal(getSafeWorkspacePath("../../etc/passwd"), null);
    assert.equal(getSafeWorkspacePath("../../../root/.ssh/id_rsa"), null);
    assert.equal(getSafeWorkspacePath("foo/../../bar"), null);
    assert.equal(getSafeWorkspacePath("/etc/passwd"), null);
    assert.equal(getSafeWorkspacePath("doc.md\0.exe"), null);

    // Valid paths
    const validResolved = getSafeWorkspacePath("doc.md");
    assert.notEqual(validResolved, null);
    assert.equal(validResolved, path.join(WORKSPACE_DIR, "doc.md"));

    const validNested = getSafeWorkspacePath("nested/folder/doc.md");
    assert.notEqual(validNested, null);
    assert.equal(validNested, path.join(WORKSPACE_DIR, "nested/folder/doc.md"));
  });
});
