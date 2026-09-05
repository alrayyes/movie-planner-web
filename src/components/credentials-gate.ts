import { mount } from "svelte";
import { getCredentialsStore } from "../lib/credentials/store";
import type { Credentials } from "../lib/credentials/types";
import {
  BUTTON_PRIMARY,
  FIELD_WRAPPER,
  FORM,
  INPUT,
  LABEL,
  NAV,
  NAV_LINK,
} from "../lib/ui/classes";
import CalendarOverview from "./CalendarOverview.svelte";

// The first thing a visitor with no stored credentials sees, and what a
// returning visitor's stored credentials skip past — see the `credentials`
// capability spec. Settings-screen editing lives in <credentials-settings-form>
// (settings.astro), which shares nothing with this element beyond the store.
export class CredentialsGate extends HTMLElement {
  async connectedCallback() {
    const store = getCredentialsStore();
    const credentials = await store.get();
    if (credentials) {
      this.renderConnected(credentials);
    } else {
      this.renderForm();
    }
  }

  private renderForm() {
    this.innerHTML = "";
    const form = buildCredentialsForm({ submitLabel: "Connect" });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const credentials = readCredentialsForm(form);
      await getCredentialsStore().save(credentials);
      this.renderConnected(credentials);
    });
    this.appendChild(form);
  }

  private renderConnected(credentials: Credentials) {
    this.innerHTML = "";
    const nav = document.createElement("nav");
    nav.className = NAV;
    const logLink = document.createElement("a");
    logLink.className = NAV_LINK;
    logLink.href = "/log";
    logLink.textContent = "Log a viewing";
    const importLink = document.createElement("a");
    importLink.className = NAV_LINK;
    importLink.href = "/import";
    importLink.textContent = "Import";
    const venuesLink = document.createElement("a");
    venuesLink.className = NAV_LINK;
    venuesLink.href = "/venues";
    venuesLink.textContent = "Venues";
    const link = document.createElement("a");
    link.className = NAV_LINK;
    link.href = "/settings";
    link.textContent = "Settings";
    nav.append(logLink, importLink, venuesLink, link);

    const overviewTarget = document.createElement("div");
    this.append(nav, overviewTarget);
    // #102: an Astro/Svelte island mounted imperatively rather than
    // through an Astro page's own client directive — this element
    // decides at runtime, from stored credentials, whether the
    // overview mounts at all, which a static client:only slot can't
    // express.
    mount(CalendarOverview, {
      target: overviewTarget,
      props: {
        config: {
          baseUrl: credentials.caldavUrl,
          username: credentials.caldavUsername,
          password: credentials.caldavPassword,
        },
        omdbApiKey: credentials.omdbApiKey,
        omdbPaused: credentials.omdbPaused,
      },
    });
  }
}

customElements.define("credentials-gate", CredentialsGate);

export function buildCredentialsForm(options: {
  submitLabel: string;
  values?: Credentials;
}): HTMLFormElement {
  const { submitLabel, values } = options;
  const form = document.createElement("form");
  form.className = FORM;

  form.append(
    labelledField("caldav-url", "CalDAV server URL", "url", values?.caldavUrl ?? "", true),
    labelledField("caldav-username", "CalDAV username", "text", values?.caldavUsername ?? "", true),
    labelledField(
      "caldav-password",
      "CalDAV password",
      "password",
      values?.caldavPassword ?? "",
      true,
    ),
    labelledField(
      "omdb-api-key",
      "OMDb API key (optional)",
      "text",
      values?.omdbApiKey ?? "",
      false,
    ),
    omdbPausedField(values?.omdbPaused ?? false),
  );

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = BUTTON_PRIMARY;
  submit.textContent = submitLabel;
  form.appendChild(submit);

  return form;
}

// #80: a checkbox, not the text-input labelledField shape — plus an
// inline hint (this app's whole UI has no popover/tooltip mechanism, so
// a plain caption line under the control is the "explain this" pattern
// used everywhere else, e.g. the Pathé-email field's own label text).
function omdbPausedField(checked: boolean): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = FIELD_WRAPPER;
  const row = document.createElement("label");
  row.className = "flex items-center gap-2";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = "omdb-paused";
  input.name = "omdb-paused";
  input.checked = checked;
  const text = document.createElement("span");
  text.className = LABEL;
  text.textContent = "Pause OMDb lookups";
  row.append(input, text);
  const hint = document.createElement("p");
  hint.className = "text-xs text-slate-500 dark:text-slate-400";
  hint.textContent =
    "OMDb's free tier allows 1,000 requests a day. Pause this while logging or " +
    "importing a batch of viewings, then turn it back on and refresh deliberately.";
  wrapper.append(row, hint);
  return wrapper;
}

function labelledField(
  id: string,
  labelText: string,
  type: string,
  value: string,
  required: boolean,
): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = FIELD_WRAPPER;
  const label = document.createElement("label");
  label.className = LABEL;
  label.htmlFor = id;
  label.textContent = labelText;
  const input = document.createElement("input");
  input.className = INPUT;
  input.id = id;
  input.name = id;
  input.type = type;
  input.value = value;
  input.required = required;
  wrapper.append(label, input);
  return wrapper;
}

export function readCredentialsForm(form: HTMLFormElement): Credentials {
  const data = new FormData(form);
  const omdbApiKey = String(data.get("omdb-api-key") ?? "").trim();
  return {
    caldavUrl: String(data.get("caldav-url") ?? "").trim(),
    caldavUsername: String(data.get("caldav-username") ?? "").trim(),
    caldavPassword: String(data.get("caldav-password") ?? ""),
    ...(omdbApiKey ? { omdbApiKey } : {}),
    ...(data.get("omdb-paused") ? { omdbPaused: true } : {}),
  };
}
