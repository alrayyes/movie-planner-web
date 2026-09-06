import { mount } from "svelte";
import { CREDENTIALS_CONNECTED_EVENT, getCredentialsStore } from "../lib/credentials/store";
import type { Credentials } from "../lib/credentials/types";
import { BUTTON_PRIMARY, FIELD_WRAPPER, FORM, INPUT, LABEL } from "../lib/ui/classes";
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
    // #269: a brand-new visitor's very first screen used to be the bare
    // form — three unexplained fields (URL, username, password) with no
    // context for what CalDAV even is or why this app is asking. This
    // intro answers that before the fields, not after.
    this.appendChild(buildIntro());
    const form = buildCredentialsForm({ submitLabel: "Connect" });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const credentials = readCredentialsForm(form);
      await getCredentialsStore().save(credentials);
      window.dispatchEvent(new Event(CREDENTIALS_CONNECTED_EVENT));
      this.renderConnected(credentials);
    });
    this.appendChild(form);
  }

  private renderConnected(credentials: Credentials) {
    this.innerHTML = "";
    // #127: the nav (Log a viewing/Import/Venues/Settings) used to be
    // built here — moved to <site-nav> (mounted once in Layout.astro)
    // so it shows on every page, not just this one.
    const overviewTarget = document.createElement("div");
    this.append(overviewTarget);
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

// #269: what a brand-new visitor sees before the connect form's own
// fields — what CalDAV is, why this app is asking for it, and where
// those credentials actually go, since the fields alone don't say any
// of that. Kept short: the full picture is one click away on /docs and
// /privacy, not repeated here.
function buildIntro(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "mb-6 flex flex-col gap-3 text-sm text-slate-700 dark:text-slate-300";

  wrap.appendChild(buildRiskNotice());

  const p1 = document.createElement("p");
  p1.textContent =
    "Movie Planner reads and writes your watch history straight to your own " +
    "CalDAV calendar — the same standard protocol most calendar apps already " +
    "speak. There's no account with this service and nothing stored anywhere " +
    "but your own browser: the fields below are your CalDAV server's own " +
    "address and login, the same ones you'd give any calendar app.";
  wrap.appendChild(p1);

  const p2 = document.createElement("p");
  const docsLink = document.createElement("a");
  docsLink.href = "/docs/connecting/";
  docsLink.className = "text-indigo-600 underline dark:text-indigo-400";
  docsLink.textContent = "connecting your CalDAV server";
  const privacyLink = document.createElement("a");
  privacyLink.href = "/privacy";
  privacyLink.className = "text-indigo-600 underline dark:text-indigo-400";
  privacyLink.textContent = "privacy page";
  p2.append(
    "No CalDAV server yet, or not sure what this is asking for? See ",
    docsLink,
    ". These credentials are never sent anywhere except straight to the " +
      "CalDAV server you point them at below — see the ",
    privacyLink,
    " for the full, verifiable claim.",
  );
  wrap.appendChild(p2);

  return wrap;
}

// Shown before a visitor ever fills in real credentials — the point
// they can still decide to use a dedicated calendar rather than one
// they also rely on for anything else. Matches the same warning on
// /disclaimer and docs/connecting.md; keep all three in sync.
function buildRiskNotice(): HTMLDivElement {
  const notice = document.createElement("div");
  notice.className =
    "rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100";
  notice.setAttribute("role", "note");

  const heading = document.createElement("p");
  heading.className = "font-semibold";
  heading.textContent = "Use at your own risk.";
  notice.appendChild(heading);

  const body = document.createElement("p");
  body.className = "mt-1";
  body.textContent =
    "This is beta software, not yet fully tested. It reads, writes, and " +
    "deletes events directly on the CalDAV server you connect below — set " +
    "up a calendar dedicated to your movie viewings rather than pointing " +
    "it at one you also use for anything else, so a bug here can't touch " +
    "anything that matters.";
  notice.appendChild(body);

  return notice;
}

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
