/** How long a message stays on screen. */
const DURATION_MS = 3000;

let container: HTMLElement | null = null;

/**
 * Short message floating at the right edge of the screen. It disappears on
 * its own. Screen readers announce it through the live region.
 */
export function toast(message: string, kind: "info" | "error" = "info"): void {
  if (!container) {
    container = document.createElement("div");
    container.className = "toasts";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    document.body.append(container);
  }

  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  container.append(el);
  setTimeout(() => el.remove(), DURATION_MS);
}
