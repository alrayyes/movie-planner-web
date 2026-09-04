import type { APIRoute } from "astro";
import { lookupMovie } from "../../../lib/omdb/client";

export const prerender = false;

// OMDb calls happen from the proxy, not the browser — see design.md's
// Decisions. Errors here fail soft (null) since the movie-log spec never
// blocks logging on OMDb being unreachable, only on the credential being
// present at all.
export const POST: APIRoute = async ({ request }) => {
  let body: { apiKey?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "the request body must be valid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.apiKey || !body.title) {
    return new Response(JSON.stringify({ error: "apiKey and title are both required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const metadata = await lookupMovie(body.apiKey, body.title).catch(() => null);
  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
