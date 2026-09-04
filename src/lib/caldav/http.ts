import {
  CaldavRequestFailedError,
  CaldavRequestTimeoutError,
  CaldavResponseTooLargeError,
  InvalidCaldavUrlError,
} from "./errors";

// Shared JSON-in/JSON-out wrapper for the caldav-proxy's Astro API routes —
// keeps error-status mapping in one place rather than repeated per route.
export function jsonHandler<TBody>(handle: (body: TBody) => Promise<unknown>) {
  return async ({ request }: { request: Request }): Promise<Response> => {
    let body: TBody;
    try {
      body = (await request.json()) as TBody;
    } catch {
      return errorResponse(400, "the request body must be valid JSON");
    }

    try {
      const result = await handle(body);
      return new Response(result === undefined ? null : JSON.stringify(result), {
        status: result === undefined ? 204 : 200,
        headers: result === undefined ? {} : { "Content-Type": "application/json" },
      });
    } catch (error) {
      if (error instanceof InvalidCaldavUrlError) return errorResponse(400, error.message);
      if (error instanceof CaldavRequestTimeoutError) return errorResponse(504, error.message);
      if (error instanceof CaldavResponseTooLargeError) return errorResponse(502, error.message);
      if (error instanceof CaldavRequestFailedError) return errorResponse(502, error.message);
      return errorResponse(500, error instanceof Error ? error.message : "unknown error");
    }
  };
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
