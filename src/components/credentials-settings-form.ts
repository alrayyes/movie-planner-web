import { getCredentialsStore } from "../lib/credentials/store";
import { buildCredentialsForm, readCredentialsForm } from "./credentials-gate";

// The settings screen a returning visitor edits stored credentials from —
// see the `credentials` capability spec's "Settings screen for editing
// credentials" requirement.
export class CredentialsSettingsForm extends HTMLElement {
  async connectedCallback() {
    const store = getCredentialsStore();
    const values = (await store.get()) ?? undefined;
    this.innerHTML = "";

    const form = buildCredentialsForm({ submitLabel: "Save", values });
    const status = document.createElement("p");
    status.setAttribute("role", "status");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const credentials = readCredentialsForm(form);
      await store.save(credentials);
      status.textContent = "Saved.";
    });

    this.append(form, status);
  }
}

customElements.define("credentials-settings-form", CredentialsSettingsForm);
