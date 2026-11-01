import { useEffect } from "react";

export function useKeyboardShortcuts(
  enabled: boolean,
  onOpenSettings: () => void,
): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case ",":
          event.preventDefault();
          onOpenSettings();
          break;
        case "l":
          event.preventDefault();
          document.getElementById("chat-composer")?.focus();
          break;
        case "n":
          event.preventDefault();
          document.getElementById("new-chat-button")?.click();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onOpenSettings]);
}
