import { createViewing, listViewings, updateViewing } from "../caldav/api-client";
import type { CaldavConfig, NewViewing } from "../caldav/types";
import type { Credentials } from "../credentials/types";
import type { PatheBooking } from "./pathe-email";

// Shared write path for both the manual form and the Pathé-email confirm
// step — OMDb enrichment and (for a Pathé booking) re-submission dedup
// both happen here, so neither entry point can forget either one.
async function enrichWithOmdb(
  credentials: Credentials,
  title: string,
): Promise<Partial<NewViewing>> {
  if (!credentials.omdbApiKey) return {};
  try {
    const response = await fetch("/api/omdb/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: credentials.omdbApiKey, title }),
    });
    if (!response.ok) return {};
    const metadata = (await response.json()) as Partial<NewViewing> | null;
    return metadata ?? {};
  } catch {
    return {};
  }
}

export async function logManualViewing(credentials: Credentials, viewing: NewViewing) {
  const config: CaldavConfig = {
    baseUrl: credentials.caldavUrl,
    username: credentials.caldavUsername,
    password: credentials.caldavPassword,
  };
  const enrichment = await enrichWithOmdb(credentials, viewing.title);
  return createViewing(config, { ...viewing, ...enrichment });
}

// movie-log spec, "Re-submitted booking confirmation": a booking number
// already logged updates that entry instead of creating a duplicate.
// Detected by listing the booking's own day and matching on bookingRef —
// no dedicated CalDAV query needed, since the fixed operation set has no
// "find by custom property" operation and doesn't need one for this.
export async function logPatheBooking(credentials: Credentials, booking: PatheBooking) {
  const config: CaldavConfig = {
    baseUrl: credentials.caldavUrl,
    username: credentials.caldavUsername,
    password: credentials.caldavPassword,
  };

  const dayStart = new Date(booking.start);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const existing = await listViewings(config, {
    from: dayStart.toISOString(),
    to: dayEnd.toISOString(),
  });
  const duplicate = existing.find((v) => v.bookingRef === booking.bookingRef);

  const viewing: NewViewing = {
    title: booking.title,
    start: booking.start,
    end: booking.end,
    medium: "cinema",
    venue: booking.cinema,
    bookingRef: booking.bookingRef,
  };
  const enrichment = await enrichWithOmdb(credentials, booking.title);
  const merged = { ...viewing, ...enrichment };

  if (duplicate) {
    return { viewing: await updateViewing(config, duplicate.uid, merged), wasUpdate: true };
  }
  return { viewing: await createViewing(config, merged), wasUpdate: false };
}
