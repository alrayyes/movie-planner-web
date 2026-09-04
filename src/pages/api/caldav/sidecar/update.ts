import type { APIRoute } from "astro";
import { updatePicklists } from "../../../../lib/caldav/client";
import { jsonHandler } from "../../../../lib/caldav/http";
import type { CaldavConfig, Picklists } from "../../../../lib/caldav/types";

export const prerender = false;

export const POST: APIRoute = jsonHandler<{ config: CaldavConfig; picklists: Picklists }>(
  ({ config, picklists }) => updatePicklists(config, picklists),
);
