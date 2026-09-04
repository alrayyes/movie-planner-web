import { currentTheme, setTheme } from "../lib/theme/store";

const TRACK_BASE =
  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900";
const TRACK_ON = "bg-indigo-600";
const TRACK_OFF = "bg-slate-300 dark:bg-slate-600";
const THUMB_BASE =
  "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform";
const THUMB_ON = "translate-x-6";
const THUMB_OFF = "translate-x-1";

// A visitor's explicit choice (or the OS default, until they choose) is
// applied ASAP by the inline script in Layout.astro's <head> — before
// this element even exists — to avoid a flash of the wrong theme. This
// element only reflects and changes that state from then on.
export class ThemeToggle extends HTMLElement {
  connectedCallback() {
    this.innerHTML = "";
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "switch");
    const thumb = document.createElement("span");
    thumb.setAttribute("aria-hidden", "true");
    button.appendChild(thumb);

    const render = () => {
      const isDark = currentTheme() === "dark";
      button.setAttribute("aria-checked", String(isDark));
      button.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
      button.className = `${TRACK_BASE} ${isDark ? TRACK_ON : TRACK_OFF}`;
      thumb.className = `${THUMB_BASE} ${isDark ? THUMB_ON : THUMB_OFF}`;
    };
    render();

    button.addEventListener("click", () => {
      setTheme(currentTheme() === "dark" ? "light" : "dark");
      render();
    });

    this.appendChild(button);
  }
}

customElements.define("theme-toggle", ThemeToggle);
