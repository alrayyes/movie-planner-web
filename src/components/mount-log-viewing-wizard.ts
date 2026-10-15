import { mount } from "svelte";
import LogViewingWizard from "./LogViewingWizard.svelte";

// #920: imported on the first click of the "Log a viewing" button, so a page
// load doesn't pay for the wizard, its venue picker or the Nominatim client.
// Mounts into the one persisted placeholder SiteHeader.astro renders, so a
// ClientRouter navigation keeps the same instance (and its single window
// listener) instead of leaving a dialog behind in a swapped-out <body>.
const target = document.querySelector("[data-log-wizard-root]");
if (!target) throw new Error("SiteHeader's [data-log-wizard-root] is missing");
mount(LogViewingWizard, { target });
