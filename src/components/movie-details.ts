import { deleteViewing, getViewing, updateViewing } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing, NewViewing } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import { lookupByImdbId, lookupMovie, type OmdbCandidate, searchMovies } from "../lib/omdb/client";
import { imdbUrl, letterboxdSearchUrl, rottenTomatoesSearchUrl } from "../lib/omdb/links";
import { buildOmdbPicker } from "../lib/omdb/picker";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  BUTTON_SM,
  DD,
  DL,
  DT,
  FIELD_WRAPPER,
  INPUT,
  LABEL,
  STATUS_TEXT,
} from "../lib/ui/classes";

const EDITABLE_FIELDS: { key: keyof NewViewing; label: string; type: string }[] = [
  { key: "title", label: "Title", type: "text" },
  { key: "start", label: "Start", type: "datetime-local" },
  { key: "end", label: "End", type: "datetime-local" },
  { key: "medium", label: "Medium", type: "text" },
  { key: "venue", label: "Venue", type: "text" },
];

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// #38: a dedicated page per logged viewing, reached from the overview's
// title link — see calendar-overview.ts's own comment for why this is a
// ?uid= query string rather than a dynamic /movie/[uid] route (this
// build is fully static; a visitor's own private CalDAV UIDs can't be
// known at build time for getStaticPaths to enumerate).
export class MovieDetails extends HTMLElement {
  private config: CaldavConfig | undefined;
  private omdbApiKey: string | undefined;
  private viewing: LoggedViewing | undefined;
  private container: HTMLElement | undefined;
  private statusEl: HTMLElement | undefined;
  private editing = false;

  async connectedCallback() {
    const credentials = await getCredentialsStore().get();
    if (!credentials) {
      throw new Error("<movie-details> requires stored credentials");
    }
    this.config = {
      baseUrl: credentials.caldavUrl,
      username: credentials.caldavUsername,
      password: credentials.caldavPassword,
    };
    this.omdbApiKey = credentials.omdbApiKey;

    this.className = "flex flex-col gap-4";
    this.innerHTML = "";
    this.statusEl = document.createElement("p");
    this.statusEl.className = STATUS_TEXT;
    this.statusEl.setAttribute("role", "status");
    this.container = document.createElement("div");
    this.append(this.container, this.statusEl);

    await this.load();
  }

  private async load() {
    if (!this.config) return;
    const uid = new URLSearchParams(location.search).get("uid");
    if (!uid) {
      this.renderNotFound();
      return;
    }
    try {
      this.viewing = (await getViewing(this.config, uid)) ?? undefined;
    } catch {
      this.viewing = undefined;
    }
    if (!this.viewing) {
      this.renderNotFound();
      return;
    }
    this.render();
  }

  private backLink(): HTMLAnchorElement {
    const back = document.createElement("a");
    back.href = "/";
    back.className = "text-sm text-indigo-600 hover:underline dark:text-indigo-400";
    back.textContent = "Back to overview";
    return back;
  }

  private renderNotFound() {
    if (!this.container) return;
    this.container.innerHTML = "";
    const message = document.createElement("p");
    message.className = "text-slate-700 dark:text-slate-300";
    message.textContent = "Viewing not found.";
    this.container.append(message, this.backLink());
  }

  private render() {
    if (!this.container || !this.viewing) return;
    this.container.innerHTML = "";
    this.container.appendChild(this.backLink());
    this.container.appendChild(
      this.editing ? this.renderEditForm(this.viewing) : this.renderView(this.viewing),
    );
  }

  private renderView(viewing: LoggedViewing): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "mt-4 flex flex-col gap-4 sm:flex-row sm:gap-6";

    if (viewing.posterUrl) {
      const img = document.createElement("img");
      img.src = viewing.posterUrl;
      img.alt = `${viewing.title} poster`;
      // #76: a fixed width + max-w-none, not h-64 w-auto — same fix as
      // the overview's own poster (calendar-overview.ts), so a
      // non-portrait source poster crops to a normal poster shape
      // instead of rendering distorted or getting capped by a narrow
      // container.
      img.className = "h-64 w-40 max-w-none self-start rounded object-cover";
      wrap.appendChild(img);
    }

    const info = document.createElement("div");
    info.className = "flex flex-1 flex-col gap-4";

    const heading = document.createElement("h1");
    heading.className = "text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100";
    heading.textContent = viewing.year ? `${viewing.title} (${viewing.year})` : viewing.title;
    info.appendChild(heading);

    const links = [
      viewing.imdbId && { label: "IMDb", href: imdbUrl(viewing.imdbId) },
      { label: "RT", href: rottenTomatoesSearchUrl(viewing.title) },
      { label: "Letterboxd", href: letterboxdSearchUrl(viewing.title) },
    ].filter((l): l is { label: string; href: string } => Boolean(l));
    const linkRow = document.createElement("div");
    linkRow.className = "flex gap-3 text-sm";
    for (const { label, href } of links) {
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "text-indigo-600 hover:underline dark:text-indigo-400";
      a.textContent = label;
      linkRow.appendChild(a);
    }
    info.appendChild(linkRow);

    const ratings = [
      viewing.ratingImdb && `IMDb ${viewing.ratingImdb}`,
      viewing.ratingRottenTomatoes && `RT ${viewing.ratingRottenTomatoes}`,
      viewing.ratingMetacritic && `Metacritic ${viewing.ratingMetacritic}`,
    ]
      .filter(Boolean)
      .join(", ");

    const dl = document.createElement("dl");
    dl.className = DL;
    const fields: [string, string | undefined][] = [
      ["Start", new Date(viewing.start).toLocaleString()],
      ["End", new Date(viewing.end).toLocaleString()],
      ["Medium", viewing.medium],
      ["Venue", viewing.venue],
      ["Director", viewing.director],
      ["Actors", viewing.actors],
      ["Genre", viewing.genre],
      ["Ratings", ratings],
    ];
    for (const [term, value] of fields) {
      if (!value) continue;
      const dt = document.createElement("dt");
      dt.className = DT;
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.className = DD;
      dd.textContent = value;
      dl.append(dt, dd);
    }
    info.appendChild(dl);

    const actions = document.createElement("div");
    actions.className = "flex gap-2";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = BUTTON_SM;
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => {
      this.editing = true;
      this.render();
    });
    actions.appendChild(editButton);

    if (this.omdbApiKey) {
      const refreshButton = document.createElement("button");
      refreshButton.type = "button";
      refreshButton.className = BUTTON_SM;
      refreshButton.textContent = "Refresh metadata";
      refreshButton.addEventListener("click", () => void this.handleRefresh(viewing));
      actions.appendChild(refreshButton);
    }

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = `${BUTTON_SM} text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950`;
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => void this.handleDelete(viewing));
    actions.appendChild(deleteButton);

    info.appendChild(actions);
    wrap.appendChild(info);
    return wrap;
  }

  private renderEditForm(viewing: LoggedViewing): HTMLElement {
    const form = document.createElement("form");
    form.className = "mt-4 flex flex-col gap-4";
    form.setAttribute("aria-label", "Edit this viewing");

    const grid = document.createElement("div");
    grid.className = "grid grid-cols-1 gap-3 sm:grid-cols-2";
    const inputs = new Map<keyof NewViewing, HTMLInputElement>();
    for (const field of EDITABLE_FIELDS) {
      const wrapper = document.createElement("div");
      wrapper.className = FIELD_WRAPPER;
      const label = document.createElement("label");
      label.className = LABEL;
      const id = `details-${field.key}`;
      label.htmlFor = id;
      label.textContent = field.label;
      const input = document.createElement("input");
      input.className = INPUT;
      input.id = id;
      input.type = field.type;
      const value = viewing[field.key];
      input.value =
        (field.type === "datetime-local" ? toDatetimeLocal(String(value)) : value) ?? "";
      wrapper.append(label, input);
      grid.appendChild(wrapper);
      inputs.set(field.key, input);
    }
    form.appendChild(grid);

    const buttonRow = document.createElement("div");
    buttonRow.className = "flex gap-2";
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = BUTTON_PRIMARY;
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", async () => {
      if (!this.config || !this.statusEl) return;
      const updated: NewViewing = {
        ...viewing,
        title: inputs.get("title")?.value ?? "",
        start: new Date(inputs.get("start")?.value ?? "").toISOString(),
        end: new Date(inputs.get("end")?.value ?? "").toISOString(),
        medium: inputs.get("medium")?.value ?? "",
        venue: inputs.get("venue")?.value || undefined,
      };
      try {
        await updateViewing(this.config, viewing.uid, updated);
        this.editing = false;
        await this.load();
        this.statusEl.textContent = "Saved.";
      } catch (error) {
        this.statusEl.textContent = error instanceof Error ? error.message : "Failed to save.";
      }
    });
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = BUTTON_SECONDARY;
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => {
      this.editing = false;
      this.render();
    });
    buttonRow.append(saveButton, cancelButton);
    form.appendChild(buttonRow);

    return form;
  }

  private async handleRefresh(viewing: LoggedViewing) {
    if (!this.config || !this.omdbApiKey || !this.statusEl) return;
    try {
      const metadata = await lookupMovie(
        this.omdbApiKey,
        viewing.title,
        new Date(viewing.start).getFullYear().toString(),
      );
      if (metadata) {
        await updateViewing(this.config, viewing.uid, { ...viewing, ...metadata });
        await this.load();
        this.statusEl.textContent = "Refreshed.";
        return;
      }
      // #49: no single confident match — offer a disambiguation picker
      // if OMDb's search has candidates, rather than reporting no match
      // outright.
      const candidates = await searchMovies(this.omdbApiKey, viewing.title);
      if (candidates.length > 0) {
        this.showOmdbPicker(viewing, candidates);
        return;
      }
      this.statusEl.textContent = "OMDb had no match for this title.";
    } catch (error) {
      this.statusEl.textContent =
        error instanceof Error ? error.message : "Failed to refresh metadata.";
    }
  }

  private showOmdbPicker(viewing: LoggedViewing, candidates: OmdbCandidate[]) {
    if (!this.container || !this.config || !this.omdbApiKey || !this.statusEl) return;
    this.container.innerHTML = "";
    this.container.appendChild(this.backLink());
    this.container.appendChild(
      buildOmdbPicker(
        candidates,
        async (candidate) => {
          if (!this.config || !this.omdbApiKey || !this.statusEl) return;
          try {
            const metadata = await lookupByImdbId(this.omdbApiKey, candidate.imdbId);
            if (metadata) {
              await updateViewing(this.config, viewing.uid, { ...viewing, ...metadata });
            }
            await this.load();
            this.statusEl.textContent = "Refreshed.";
          } catch (error) {
            this.statusEl.textContent =
              error instanceof Error ? error.message : "Failed to attach the selected match.";
          }
        },
        () => {
          if (this.statusEl) this.statusEl.textContent = "OMDb had no match for this title.";
          this.render();
        },
      ),
    );
  }

  private async handleDelete(viewing: LoggedViewing) {
    if (!this.config || !this.statusEl) return;
    if (!window.confirm(`Delete "${viewing.title}"? This can't be undone.`)) return;
    try {
      await deleteViewing(this.config, viewing.uid);
      this.statusEl.textContent = "Deleted.";
      this.viewing = undefined;
      this.container?.replaceChildren(this.backLink());
    } catch (error) {
      this.statusEl.textContent = error instanceof Error ? error.message : "Failed to delete.";
    }
  }
}

customElements.define("movie-details", MovieDetails);
