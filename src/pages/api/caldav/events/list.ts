import type { APIRoute } from "astro";
import { listViewings } from "../../../../lib/caldav/client";
import { jsonHandler } from "../../../../lib/caldav/http";
import type { CaldavConfig, DateRange } from "../../../../lib/caldav/types";

export const prerender = false;

export const POST: APIRoute = jsonHandler<{ config: CaldavConfig; range: DateRange }>(
  ({ config, range }) => listViewings(config, range),
);
