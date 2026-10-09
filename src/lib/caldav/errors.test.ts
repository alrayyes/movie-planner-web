import { describe, expect, test } from "bun:test";
import {
  CaldavRequestFailedError,
  CaldavRequestTimeoutError,
  CaldavResponseTooLargeError,
  InvalidCaldavUrlError,
} from "./errors";

describe("CalDAV errors", () => {
  test.each([
    [InvalidCaldavUrlError, "InvalidCaldavUrlError"],
    [CaldavRequestTimeoutError, "CaldavRequestTimeoutError"],
    [CaldavResponseTooLargeError, "CaldavResponseTooLargeError"],
  ])("%p carries its name and message", (ErrorClass, name) => {
    const error = new ErrorClass("boom");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(name);
    expect(error.message).toBe("boom");
  });

  test("CaldavRequestFailedError carries its name, message and status", () => {
    const error = new CaldavRequestFailedError("nope", 403);
    expect(error.name).toBe("CaldavRequestFailedError");
    expect(error.message).toBe("nope");
    expect(error.status).toBe(403);
  });
});
