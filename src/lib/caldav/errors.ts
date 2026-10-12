export class InvalidCaldavUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCaldavUrlError";
  }
}

export class CaldavRequestTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaldavRequestTimeoutError";
  }
}

export class CaldavResponseTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaldavResponseTooLargeError";
  }
}

export class CaldavRequestFailedError extends Error {
  constructor(
    message: string,
    readonly status: number,
    // How long the server asked us to wait (Retry-After), when it said.
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "CaldavRequestFailedError";
  }
}
