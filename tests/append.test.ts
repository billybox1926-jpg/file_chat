import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";

process.env.NODE_ENV = "test";
import { app } from "../server.ts";

describe("/api/files/append endpoint", () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(() => server.close());

  test("appends text to a file without reading first", async () => {
    const headers = { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" };

    const createRes = await fetch(`${baseUrl}/api/files/save`, {
      method: "POST",
      headers,
      body: JSON.stringify({ path: "append_test.md", content: "line1" }),
    });
    assert.equal(createRes.status, 200);

    const appendRes = await fetch(`${baseUrl}/api/files/append`, {
      method: "POST",
      headers,
      body: JSON.stringify({ path: "append_test.md", text: "\nline2" }),
    });
    assert.equal(appendRes.status, 200);

    const readRes = await fetch(`${baseUrl}/api/files/content?path=append_test.md`);
    const data = await readRes.json();
    assert.equal(data.content, "line1\nline2");
  });

  test("rejects append with no path", async () => {
    const res = await fetch(`${baseUrl}/api/files/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ text: "hello" }),
    });
    assert.equal(res.status, 400);
  });

  test("rejects append outside workspace", async () => {
    const res = await fetch(`${baseUrl}/api/files/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ path: "../etc/passwd", text: "x" }),
    });
    assert.equal(res.status, 403);
  });
});
