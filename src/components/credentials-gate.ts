import "./calendar-overview";
import type { CaldavConfig } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import type { Credentials } from "../lib/credentials/types";

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
    const link = document.createElement("a");
    link.href = "/settings";
    link.textContent = "Settings";

    const overview = document.createElement("calendar-overview");
    (overview as unknown as { config: CaldavConfig }).config = {
      baseUrl: credentials.caldavUrl,
      username: credentials.caldavUsername,
      password: credentials.caldavPassword,
    };

    this.append(link, overview);
  }
}

customElements.define("credentials-gate", CredentialsGate);

export function buildCredentialsForm(options: {
  submitLabel: string;
  values?: Credentials;
}): HTMLFormElement {
  const { submitLabel, values } = options;
  const form = document.createElement("form");

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
  );

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = submitLabel;
  form.appendChild(submit);

  return form;
}

function labelledField(
  id: string,
  labelText: string,
  type: string,
  value: string,
  required: boolean,
): HTMLDivElement {
  const wrapper = document.createElement("div");
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = labelText;
  const input = document.createElement("input");
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
  };
}
