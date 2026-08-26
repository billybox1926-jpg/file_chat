import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveShortcut,
  isTextEditingTarget,
  TAB_ORDER,
  type ShortcutKeyEvent,
} from "../src/hooks/useKeyboardShortcuts";

/** Build a Ctrl+Z event whose target is the given element shape. */
function ctrlZ(target: ShortcutKeyEvent["target"]): ShortcutKeyEvent {
  return {
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    key: "z",
    code: "KeyZ",
    target,
  };
}

function altDigit(digit: number, target: ShortcutKeyEvent["target"] = null): ShortcutKeyEvent {
  return {
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    key: String(digit),
    code: `Digit${digit}`,
    target,
  };
}

describe("Ctrl+Z must not hijack native undo in text-editing surfaces", () => {
  test("does NOT trigger quick undo when focus is in an <input>", () => {
    const decision = resolveShortcut(ctrlZ({ tagName: "INPUT", isContentEditable: false }));
    assert.equal(decision.action, "none");
  });

  test("does NOT trigger quick undo when focus is in a <textarea>", () => {
    const decision = resolveShortcut(ctrlZ({ tagName: "TEXTAREA", isContentEditable: false }));
    assert.equal(decision.action, "none");
  });

  test("does NOT trigger quick undo in a contentEditable element", () => {
    const decision = resolveShortcut(ctrlZ({ tagName: "DIV", isContentEditable: true }));
    assert.equal(decision.action, "none");
  });

  test("DOES trigger quick undo on a non-editable element", () => {
    const decision = resolveShortcut(ctrlZ({ tagName: "DIV", isContentEditable: false }));
    assert.equal(decision.action, "quickUndo");
  });

  test("DOES trigger quick undo when there is no target at all", () => {
    const decision = resolveShortcut(ctrlZ(null));
    assert.equal(decision.action, "quickUndo");
  });

  test("Cmd+Z (metaKey) follows the same input-guard rule", () => {
    const inInput: ShortcutKeyEvent = {
      altKey: false,
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
      key: "z",
      code: "KeyZ",
      target: { tagName: "TEXTAREA" },
    };
    assert.equal(resolveShortcut(inInput).action, "none");

    const onBody: ShortcutKeyEvent = { ...inInput, target: { tagName: "BODY" } };
    assert.equal(resolveShortcut(onBody).action, "quickUndo");
  });

  test("lowercase tagName from a synthetic target is still recognised", () => {
    // Real DOM tagName is uppercase, but guard against synthetic/JSX targets.
    const decision = resolveShortcut(ctrlZ({ tagName: "textarea" }));
    assert.equal(decision.action, "none");
  });

  test("Ctrl+Shift+Z (redo) is not treated as quick undo", () => {
    const decision = resolveShortcut({
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      key: "Z",
      code: "KeyZ",
      target: { tagName: "BODY" },
    });
    assert.equal(decision.action, "none");
  });
});

describe("isTextEditingTarget", () => {
  test("identifies editable surfaces", () => {
    assert.equal(isTextEditingTarget({ tagName: "INPUT" }), true);
    assert.equal(isTextEditingTarget({ tagName: "TEXTAREA" }), true);
    assert.equal(isTextEditingTarget({ tagName: "DIV", isContentEditable: true }), true);
  });

  test("rejects non-editable surfaces and empty targets", () => {
    assert.equal(isTextEditingTarget({ tagName: "DIV" }), false);
    assert.equal(isTextEditingTarget({ tagName: "BUTTON" }), false);
    assert.equal(isTextEditingTarget(null), false);
    assert.equal(isTextEditingTarget(undefined), false);
    assert.equal(isTextEditingTarget({}), false);
  });
});

describe("Alt+[1-8] tab switching still resolves", () => {
  test("maps each digit to the matching tab", () => {
    for (let d = 1; d <= 8; d++) {
      const decision = resolveShortcut(altDigit(d));
      assert.equal(decision.action, "selectTab");
      if (decision.action === "selectTab") {
        assert.equal(decision.tab, TAB_ORDER[d - 1]);
        assert.equal(decision.digit, d);
      }
    }
  });

  test("numpad digits resolve identically", () => {
    const decision = resolveShortcut({
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "Unidentified",
      code: "Numpad3",
      target: null,
    });
    assert.equal(decision.action, "selectTab");
    if (decision.action === "selectTab") assert.equal(decision.tab, TAB_ORDER[2]);
  });

  test("digit 9 is not a tab shortcut", () => {
    const decision = resolveShortcut({
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "9",
      code: "Digit9",
      target: null,
    });
    assert.equal(decision.action, "none");
  });
});
