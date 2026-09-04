import type { APIRoute } from "astro";
import { getViewing } from "../../../../lib/caldav/client";
import { jsonHandler } from "../../../../lib/caldav/http";
import type { CaldavConfig } from "../../../../lib/caldav/types";

export const prerender = false;

export const POST: APIRoute = jsonHandler<{ config: CaldavConfig; uid: string }>(
  ({ config, uid }) => getViewing(config, uid),
);
