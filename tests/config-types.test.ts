import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateConfigPayload } from "../src/utils/security";

const BASE = process.cwd();

describe("validateConfigPayload type validation", () => {
  test("rejects wrong types", () => {
    assert.equal(validateConfigPayload({ temperature: "high" }, BASE).ok, false);
    assert.equal(validateConfigPayload({ top_k: "bad" }, BASE).ok, false);
    assert.equal(validateConfigPayload({ top_k: 2.5 }, BASE).ok, false);
    assert.equal(validateConfigPayload({ git_enabled: "yes" }, BASE).ok, false);
    assert.equal(validateConfigPayload({ provider: 123 }, BASE).ok, false);
    assert.equal(validateConfigPayload({ model: true }, BASE).ok, false);
  });

  test("accepts correct types", () => {
    const result = validateConfigPayload(
      { temperature: 0.7, top_k: 5, chunk_size: 100, chunk_overlap: 10, git_enabled: true, provider: "gemini", model: "test" },
      BASE
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.config.temperature, 0.7);
      assert.equal(result.config.top_k, 5);
    }
  });
});
