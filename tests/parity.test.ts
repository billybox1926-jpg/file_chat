import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";

process.env.NODE_ENV = "test";

const cases: Array<[string, [string, string] | null]> = [
  ["replace 'a' with 'b'", ["a", "b"]],
  ["replace width with height", ["width", "height"]],
  ["replace width with height in the config", ["width", "height"]],
  ["replace width with height on line 5", ["width", "height"]],
  ["replace width with height to fix it", ["width", "height"]],
  ["replace width with height then do something", ["width", "height"]],
  ["replace width with height and add comment", ["width", "height"]],
  ["replace 'username with password' with 'credentials'", ["username with password", "credentials"]],
  ["replace foo", null],
  ["explain this file", null],
  ["", null],
];

describe("parseReplaceInstruction parity with Python", () => {
  test("matches the reference Python implementation", async () => {
    const script = `
from file_chat import parse_replace_instruction as p
import json
cases = ${JSON.stringify(cases.map(([c]) => c))}
print(json.dumps([p(c) for c in cases]))
`;
    const result = execFileSync("python", ["-c", script], { encoding: "utf-8" });
    const pythonResults = JSON.parse(result.trim());

    // Use dynamic import to get the TS function
    const security = await import("../src/utils/security");
    const { parseReplaceInstruction } = security;

    for (let i = 0; i < cases.length; i++) {
      const [input, expected] = cases[i];
      const tsResult = parseReplaceInstruction(input);
      assert.deepEqual(tsResult, expected, `TS result for ${JSON.stringify(input)}`);
      assert.deepEqual(tsResult, pythonResults[i], `Parity check for ${JSON.stringify(input)}`);
    }
  });
});
