import type { LoggedViewing } from "../caldav/types";
import { CINEMA, mediumDisplay, mediumKey } from "./display";

export interface MediumInfo {
  medium: string;
  count: number;
}

// #755: one row per medium however its casing was stored. A row is labelled with
// the spelling on the visitor's own list when there is one, otherwise with the
// first spelling seen. The default medium is always listed, even before anyone
// has used it, and so is every medium on the list.
export function groupMediums(viewings: LoggedViewing[], listed: string[]): MediumInfo[] {
  const byKey = new Map<string, MediumInfo>();
  for (const medium of [CINEMA, ...listed]) {
    const key = mediumKey(medium);
    if (!byKey.has(key)) byKey.set(key, { medium, count: 0 });
  }
  for (const viewing of viewings) {
    const key = mediumKey(viewing.medium);
    const info = byKey.get(key) ?? { medium: mediumDisplay(viewing.medium).trim(), count: 0 };
    info.count += 1;
    byKey.set(key, info);
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.medium.localeCompare(b.medium));
}
