export interface Credentials {
  caldavUrl: string;
  caldavUsername: string;
  caldavPassword: string;
  omdbApiKey?: string;
}

export interface CredentialsStore {
  get(): Promise<Credentials | null>;
  save(credentials: Credentials): Promise<void>;
}
