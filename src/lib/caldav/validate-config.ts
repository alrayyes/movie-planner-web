import { InvalidCaldavUrlError } from "./errors";
import type { CaldavConfig } from "./types";

// caldav-proxy spec, "HTTPS-only CalDAV targets": reject before any outbound
// call, not after a failed connection attempt.
export function validateCaldavConfig(config: CaldavConfig): void {
  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    throw new InvalidCaldavUrlError(`"${config.baseUrl}" is not a valid URL`);
  }

  if (url.protocol !== "https:") {
    throw new InvalidCaldavUrlError("the CalDAV base URL must use https://");
  }

  if (!config.username) {
    throw new InvalidCaldavUrlError("a CalDAV username is required");
  }
}
