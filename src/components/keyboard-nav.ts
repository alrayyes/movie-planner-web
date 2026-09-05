import { DoubleKeyTracker, isTypingTarget } from "../lib/keyboard-nav/bindings";
import { BUTTON_SECONDARY, BUTTON_SM } from "../lib/ui/classes";

const SCROLL_STEP_PX = 100;

const BINDINGS: [string, string][] = [
  ["j", "Scroll down"],
  ["k", "Scroll up"],
  ["gg", "Jump to the top"],
  ["G", "Jump to the bottom"],
  ["?", "Toggle this help"],
  ["Esc", "Close this help"],
];

// #68: vim-style page navigation, plus the help overlay that documents
// it — a vanilla Web Component (design.md: no frontend framework),
// mounted once in Layout.astro's header. The typing-target check and
// the "gg" double-press timing live in ../lib/keyboard-nav/bindings.ts,
// split out purely so they're unit-testable without a real browser.
export class KeyboardNav extends HTMLElement {
  private dialog: HTMLDialogElement | undefined;
  private readonly gTracker = new DoubleKeyTracker();

  connectedCallback() {
    this.innerHTML = "";

    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_SM;
    button.textContent = "?";
    button.setAttribute("aria-label", "Keyboard shortcuts");
    button.addEventListener("click", () => this.toggleHelp());

    const dialog = document.createElement("dialog");
    dialog.className =
      "max-w-sm rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-lg backdrop:bg-slate-900/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
    dialog.setAttribute("aria-label", "Keyboard shortcuts");
    // Closable by clicking outside its content: the padding belongs to
    // the dialog element itself, not the inner content div, so a click
    // that lands on that padding (not on the content div a real click
    // on visible text would hit) reaches the dialog element directly —
    // that's what "outside" means here, distinct from the gaps between
    // the content div's own children, which stay "inside".
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });

    const content = document.createElement("div");
    content.className = "flex flex-col gap-3";

    const heading = document.createElement("h2");
    heading.className = "text-base font-semibold text-slate-900 dark:text-slate-100";
    heading.textContent = "Keyboard shortcuts";
    content.appendChild(heading);

    const list = document.createElement("dl");
    list.className = "grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm";
    for (const [key, description] of BINDINGS) {
      const dt = document.createElement("dt");
      dt.className = "font-mono font-medium text-slate-500 dark:text-slate-400";
      dt.textContent = key;
      const dd = document.createElement("dd");
      dd.className = "text-slate-900 dark:text-slate-100";
      dd.textContent = description;
      list.append(dt, dd);
    }
    content.appendChild(list);

    const close = document.createElement("button");
    close.type = "button";
    close.className = BUTTON_SECONDARY;
    close.textContent = "Close";
    close.addEventListener("click", () => dialog.close());
    content.appendChild(close);

    dialog.appendChild(content);
    this.append(button, dialog);
    this.dialog = dialog;

    window.addEventListener("keydown", this.handleKeydown);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.handleKeydown);
  }

  private toggleHelp() {
    if (!this.dialog) return;
    if (this.dialog.open) {
      this.dialog.close();
    } else {
      this.dialog.showModal();
    }
  }

  private readonly handleKeydown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;

    if (event.key === "?") {
      event.preventDefault();
      this.toggleHelp();
      return;
    }

    // The help overlay being open takes over j/k/g/G too — a visitor
    // reading the shortcut list shouldn't have the page scroll under it.
    if (!this.dialog || this.dialog.open) return;

    if (event.key === "j") {
      window.scrollBy({ top: SCROLL_STEP_PX, behavior: "smooth" });
    } else if (event.key === "k") {
      window.scrollBy({ top: -SCROLL_STEP_PX, behavior: "smooth" });
    } else if (event.key === "G") {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    } else if (event.key === "g") {
      if (this.gTracker.press(Date.now())) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  };
}

customElements.define("keyboard-nav", KeyboardNav);
