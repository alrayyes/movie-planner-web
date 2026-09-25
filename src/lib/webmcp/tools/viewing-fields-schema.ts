// Shared by log_viewing and edit_viewing — the writable subset of
// NewViewing (src/lib/caldav/types.ts) an agent has any business setting
// directly. Deliberately excludes every OMDb/TMDb-enriched field
// (ratings, posterUrl, synopsis, ...): those are populated by this app's
// own enrichment step, never typed in by a visitor or an agent.
export const VIEWING_FIELD_PROPERTIES = {
  title: { type: "string", description: 'The title as watched, e.g. "Dune: Part Two".' },
  start: { type: "string", description: "When it started, ISO 8601." },
  end: { type: "string", description: "When it ended, ISO 8601." },
  medium: { type: "string", description: 'How it was watched, e.g. "cinema" or "streaming".' },
  venue: { type: "string", description: "Where it was watched, if applicable." },
  notes: { type: "string", description: "Personal notes — who it was watched with, a reaction." },
  director: { type: "string", description: "Comma-separated if more than one." },
  actors: { type: "string", description: "Comma-separated if more than one." },
  genre: { type: "string", description: "Comma-separated if more than one." },
  year: { type: "string", description: "The title's release year." },
} as const;

export interface ViewingFieldsInput {
  title?: string;
  start?: string;
  end?: string;
  medium?: string;
  venue?: string;
  notes?: string;
  director?: string;
  actors?: string;
  genre?: string;
  year?: string;
}

const FIELD_KEYS = Object.keys(VIEWING_FIELD_PROPERTIES) as (keyof ViewingFieldsInput)[];

// Only the fields the caller actually supplied — used by edit_viewing to
// shallow-merge onto an existing viewing without clobbering anything it
// didn't mean to touch.
export function pickSuppliedFields(input: ViewingFieldsInput): Partial<ViewingFieldsInput> {
  const picked: Partial<ViewingFieldsInput> = {};
  for (const key of FIELD_KEYS) {
    const value = input[key];
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}
