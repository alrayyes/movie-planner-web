import type { APIRoute } from "astro";
import { getPicklists } from "../../../../lib/caldav/client";
import { jsonHandler } from "../../../../lib/caldav/http";
import type { CaldavConfig } from "../../../../lib/caldav/types";

export const prerender = false;

export const POST: APIRoute = jsonHandler<{ config: CaldavConfig }>(({ config }) =>
  getPicklists(config),
);
