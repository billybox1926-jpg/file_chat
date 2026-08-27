import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import http from "http";

process.env.NODE_ENV = "test";
import { app, WORKSPACE_DIR } from "../server.ts";

describe("Batch edit endpoint", () => {
  let server: http.Server;
  let baseUrl: string;
  const jsonFile = "batch_test.json";
  const pyFile = "batch_test.py";

  before(async () => {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    fs.writeFileSync(path.join(WORKSPACE_DIR, jsonFile), '{"key":"value"}', "utf-8");
    fs.writeFileSync(path.join(WORKSPACE_DIR, pyFile), "x = 1\n", "utf-8");
    server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(() => {
    fs.rmSync(path.join(WORKSPACE_DIR, jsonFile), { force: true });
    fs.rmSync(path.join(WORKSPACE_DIR, pyFile), { force: true });
    server.close();
  });

  test("replace instruction transforms Python files", async () => {
    const res = await fetch(`${baseUrl}/api/edit/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction: "replace 'x = 1' with 'x = 2'",
        files: [pyFile],
        dry_run: true,
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    const entry = data.results.find((r: any) => r.file === pyFile);
    assert.equal(entry.changed, true);
    assert.equal(entry.new_content.includes("x = 2"), true);
  });

  test("non-replace instruction does NOT corrupt JSON", async () => {
    const before = fs.readFileSync(path.join(WORKSPACE_DIR, jsonFile), "utf-8");
    const res = await fetch(`${baseUrl}/api/edit/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction: "explain this file",
        files: [jsonFile],
        dry_run: true,
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    const entry = data.results.find((r: any) => r.file === jsonFile);
    assert.equal(entry.changed, false);
    assert.match(entry.error, /replace/);
    // File untouched.
    const after = fs.readFileSync(path.join(WORKSPACE_DIR, jsonFile), "utf-8");
    assert.equal(after, before);
  });

  test("non-replace instruction does NOT corrupt Python files either", async () => {
    const before = fs.readFileSync(path.join(WORKSPACE_DIR, pyFile), "utf-8");
    const res = await fetch(`${baseUrl}/api/edit/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction: "add logging",
        files: [pyFile],
        dry_run: true,
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    const entry = data.results.find((r: any) => r.file === pyFile);
    assert.equal(entry.changed, false);
    const after = fs.readFileSync(path.join(WORKSPACE_DIR, pyFile), "utf-8");
    assert.equal(after, before);
  });
});
