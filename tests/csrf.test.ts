import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkSameOrigin } from "../server.ts";

describe("CSRF / same-origin protection", () => {
  test("allows same-origin request with matching Origin", () => {
    let passed = false;
    const res = { status: () => ({ json: () => {} }) };
    checkSameOrigin(
      { headers: { origin: "http://localhost:3000" }, path: "/api/files" },
      res,
      () => { passed = true; }
    );
    assert.equal(passed, true);
  });

  test("blocks cross-origin request with unknown Origin", () => {
    let blocked = false;
    const res = { status: (n: number) => ({ json: () => { blocked = n === 403; } }) };
    checkSameOrigin(
      { headers: { origin: "https://evil.example.com" }, path: "/api/files" },
      res,
      () => {}
    );
    assert.equal(blocked, true);
  });

  test("allows same-origin request with X-Requested-With and no Origin", () => {
    let passed = false;
    const res = { status: () => ({ json: () => {} }) };
    checkSameOrigin(
      { headers: { "x-requested-with": "XMLHttpRequest" }, path: "/api/files" },
      res,
      () => { passed = true; }
    );
    assert.equal(passed, true);
  });

  test("blocks cross-origin request with Origin AND X-Requested-With (Origin takes precedence)", () => {
    let blocked = false;
    const res = { status: (n: number) => ({ json: () => { blocked = n === 403; } }) };
    checkSameOrigin(
      { headers: { origin: "https://evil.example.com", "x-requested-with": "XMLHttpRequest" }, path: "/api/files" },
      res,
      () => {}
    );
    assert.equal(blocked, true);
  });

  test("allows /api/health without headers", () => {
    let passed = false;
    const res = { status: () => ({ json: () => {} }) };
    checkSameOrigin(
      { headers: {}, path: "/api/health" },
      res,
      () => { passed = true; }
    );
    assert.equal(passed, true);
  });
});
