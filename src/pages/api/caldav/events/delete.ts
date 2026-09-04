import type { APIRoute } from "astro";
import { deleteViewing } from "../../../../lib/caldav/client";
import { jsonHandler } from "../../../../lib/caldav/http";
import type { CaldavConfig } from "../../../../lib/caldav/types";

export const prerender = false;

export const POST: APIRoute = jsonHandler<{ config: CaldavConfig; uid: string }>(
  ({ config, uid }) => deleteViewing(config, uid),
);
