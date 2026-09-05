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
}

export interface CredentialsStore {
  get(): Promise<Credentials | null>;
  save(credentials: Credentials): Promise<void>;
}
