<script lang="ts">
// #677: shown under a "Connect first to see …" status so a visitor who
// hasn't connected yet has somewhere to go. The connect form lives on
// the home page (credentials-gate.ts renders it whenever nothing is
// stored), so that's where this points.
import { BREADCRUMB_LINK } from "../lib/ui/classes";
</script>

<p class="mt-2 text-sm">
  <a class={BREADCRUMB_LINK} href="/">Connect your calendar</a>
</p>
