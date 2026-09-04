import type { APIRoute } from "astro";
import { updateViewing } from "../../../../lib/caldav/client";
import { jsonHandler } from "../../../../lib/caldav/http";
import type { CaldavConfig, NewViewing } from "../../../../lib/caldav/types";

export const prerender = false;

export const POST: APIRoute = jsonHandler<{
  config: CaldavConfig;
  uid: string;
  viewing: NewViewing;
}>(({ config, uid, viewing }) => updateViewing(config, uid, viewing));
