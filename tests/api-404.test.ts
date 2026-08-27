import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";

process.env.NODE_ENV = "test";
import { app } from "../server.ts";

describe("SPA fallback does not catch /api/* 404s", () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(() => server.close());

  test("GET /api/nonexistent returns 404 JSON, not HTML", async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent`, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    const body = await res.text();
    assert.equal(res.status, 404);
    // Must be JSON, not HTML.
    assert.equal(res.headers.get("content-type")?.includes("application/json"), true);
    // Body should parse as JSON with an error field.
    let parsed: any;
    assert.doesNotThrow(() => { parsed = JSON.parse(body); });
    assert.match(parsed.error, /Not found/);
  });

  test("POST /api/nonexistent returns 404 JSON", async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: "{}",
    });
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("content-type")?.includes("application/json"), true);
  });

  test("valid /api route still works", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
  });
});
