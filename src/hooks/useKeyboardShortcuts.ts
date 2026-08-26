import { useEffect } from "react";

export type TabId =
  | "terminal"
  | "diff"
  | "explorer"
  | "retrieval"
  | "watchdog"
  | "batch"
  | "tests"
  | "audit";

export const TAB_ORDER: TabId[] = [
  "terminal",
  "diff",
  "explorer",
  "retrieval",
  "watchdog",
  "batch",
  "tests",
  "audit",
];

interface ShortcutOptions {
  onSelectTab: (tab: TabId) => void;
  onQuickUndo: () => void;
  onShowNotification?: (message: string) => void;
}

/** Minimal shape of the event fields the shortcut logic reads. */
export interface ShortcutKeyEvent {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
  code?: string;
  target?: { tagName?: string; isContentEditable?: boolean } | null;
}

export type ShortcutDecision =
  | { action: "none" }
  | { action: "selectTab"; tab: TabId; digit: number }
  | { action: "quickUndo" };

/**
 * True when the event originated from a text-editing surface, which must keep
 * the browser's native Ctrl+Z instead of triggering a file-level revert.
 */
export function isTextEditingTarget(
  target: ShortcutKeyEvent["target"]
): boolean {
  if (!target) return false;
  const tag = (target.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable === true;
}

/**
 * Pure shortcut resolution, extracted so it can be unit-tested without a DOM.
 * The hook below only wires this to real keydown events.
 */
export function resolveShortcut(e: ShortcutKeyEvent): ShortcutDecision {
  // 1. Alt + [1-8] switches tabs.
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    let digit: number | null = null;

    if (e.key >= "1" && e.key <= "8") {
      digit = parseInt(e.key, 10);
    } else if (e.code && e.code.startsWith("Digit")) {
      const num = parseInt(e.code.replace("Digit", ""), 10);
      if (num >= 1 && num <= 8) digit = num;
    } else if (e.code && e.code.startsWith("Numpad")) {
      const num = parseInt(e.code.replace("Numpad", ""), 10);
      if (num >= 1 && num <= 8) digit = num;
    }

    if (digit !== null && digit >= 1 && digit <= 8) {
      return { action: "selectTab", tab: TAB_ORDER[digit - 1], digit };
    }
  }

  // 2. Ctrl/Cmd + Z triggers the file-level quick undo — but never while the
  // user is editing text, where it would clobber the field's own undo history
  // and revert a file they never asked to revert.
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
    const isKeyZ = e.key === "z" || e.key === "Z" || e.code === "KeyZ";
    if (isKeyZ) {
      if (isTextEditingTarget(e.target)) {
        return { action: "none" };
      }
      return { action: "quickUndo" };
    }
  }

  return { action: "none" };
}

export function useKeyboardShortcuts({
  onSelectTab,
  onQuickUndo,
  onShowNotification,
}: ShortcutOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const decision = resolveShortcut({
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        key: e.key,
        code: e.code,
        target: e.target as unknown as ShortcutKeyEvent["target"],
      });

      if (decision.action === "selectTab") {
        e.preventDefault();
        e.stopPropagation();
        onSelectTab(decision.tab);
        onShowNotification?.(
          `Switched to tab ${decision.digit}: ${decision.tab.toUpperCase()} [Alt+${decision.digit}]`
        );
        return;
      }

      if (decision.action === "quickUndo") {
        e.preventDefault();
        e.stopPropagation();
        onQuickUndo();
        onShowNotification?.("Triggered Quick Undo (:undo) [Ctrl+Z]");
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onSelectTab, onQuickUndo, onShowNotification]);
}
