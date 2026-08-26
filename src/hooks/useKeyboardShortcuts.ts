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

export function useKeyboardShortcuts({
  onSelectTab,
  onQuickUndo,
  onShowNotification,
}: ShortcutOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Alt + [1-8] for Tab Switching
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
          e.preventDefault();
          e.stopPropagation();
          const targetTab = TAB_ORDER[digit - 1];
          onSelectTab(targetTab);
          if (onShowNotification) {
            onShowNotification(`Switched to tab ${digit}: ${targetTab.toUpperCase()} [Alt+${digit}]`);
          }
          return;
        }
      }

      // 2. Ctrl + Z (or Cmd + Z) for Quick Undo
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        const isKeyZ = e.key === "z" || e.key === "Z" || e.code === "KeyZ";
        if (isKeyZ) {
          // Check if active element is an input or textarea that should retain standard browser undo
          const target = e.target as HTMLElement | null;
          const isInputElement =
            target &&
            (target.tagName === "INPUT" ||
              target.tagName === "TEXTAREA" ||
              target.isContentEditable);

          // If focused on an input but user wants quick undo, we trigger quick undo if not in multi-line editing
          // Or execute quick undo globally
          e.preventDefault();
          e.stopPropagation();
          onQuickUndo();
          if (onShowNotification) {
            onShowNotification("Triggered Quick Undo (:undo) [Ctrl+Z]");
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onSelectTab, onQuickUndo, onShowNotification]);
}
