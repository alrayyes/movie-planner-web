<script lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { ERROR_TOAST, ERROR_TOAST_DISMISS } from "../lib/ui/classes";

// #442: the one shared treatment every genuine-error call site renders
// through, instead of five one-off implementations — role="alert" so
// assistive technology interrupts and announces it immediately (ARIA19),
// color + icon + its own bordered box so it doesn't blend into
// STATUS_TEXT's plain, quiet style, and a manual dismiss button rather
// than an auto-dismiss timer, since a visitor needs time to actually
// read and act on it. See movie-planner-web#442 and
// openspec/changes/add-error-toast-notifications/ for the full design.
interface Props {
	message: string;
	onDismiss: () => void;
}
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
let { message, onDismiss }: Props = $props();
</script>

<div role="alert" class={ERROR_TOAST}>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    class="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400"
  >
    <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.15" />
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" />
    <line x1="12" y1="7.5" x2="12" y2="13" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
    <circle cx="12" cy="16.25" r="1" fill="currentColor" />
  </svg>
  <p class="min-w-0 flex-1 break-words">{message}</p>
  <button type="button" class={ERROR_TOAST_DISMISS} onclick={onDismiss} aria-label="Dismiss error">
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" class="h-4 w-4">
      <line x1="5" y1="5" x2="15" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <line x1="15" y1="5" x2="5" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  </button>
</div>
