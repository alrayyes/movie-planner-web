import type { APIRoute } from "astro";
import { createViewing } from "../../../../lib/caldav/client";
import { jsonHandler } from "../../../../lib/caldav/http";
import type { CaldavConfig, NewViewing } from "../../../../lib/caldav/types";

export const prerender = false;

export const POST: APIRoute = jsonHandler<{ config: CaldavConfig; viewing: NewViewing }>(
  ({ config, viewing }) => createViewing(config, viewing),
);
