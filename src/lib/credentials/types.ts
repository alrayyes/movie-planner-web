export interface Credentials {
  caldavUrl: string;
  caldavUsername: string;
  caldavPassword: string;
  omdbApiKey?: string;
  // #80: pauses every OMDb call (log, refresh, refresh all) without
  // clearing omdbApiKey — lets a visitor stay under OMDb's free-tier
  // daily request limit while logging/importing in bulk, then flip it
  // back on and refresh deliberately. Absent/false means normal,
  // enabled behavior — existing stored credentials with no opinion on
  // this default to still working exactly as before.
  omdbPaused?: boolean;
  // #360/#400: same optional/opt-in, graceful-degradation treatment as
  // omdbApiKey — no key configured means no TMDb calls at all, never a
  // hard failure. TMDb only ever runs once OMDb has already resolved an
  // IMDb ID, so this has no pause flag of its own: pausing OMDb already
  // stops every TMDb call downstream of it too.
  tmdbApiKey?: string;
  // #667: off by default — a WebMCP-aware in-browser agent can discover
  // and call log/edit/delete/search tools that reuse this app's own
  // CalDAV client, and delete/bulk-import are genuinely destructive.
  // WebMCP's own `consequentialHint` only asks the *agent's* UI to
  // confirm, not something this app enforces, so registering tools at
  // all is this app's own explicit opt-in, same reasoning as omdbPaused
  // being a visible, deliberate control rather than an always-on default.
  webMcpEnabled?: boolean;
}

export interface CredentialsStore {
  get(): Promise<Credentials | null>;
  save(credentials: Credentials): Promise<void>;
}
