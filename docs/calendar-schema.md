# Calendar schema

What this app reads and writes on the CalDAV calendar it's pointed at —
the counterpart to the
[movie-planner CLI's own `docs/calendar-schema.md`](https://github.com/alrayyes/movie-planner/blob/main/docs/calendar-schema.md),
which documents the CLI's side of the same calendar. The two overlap but
aren't identical: this app writes a handful of `X-*` properties the CLI
never does, and reads a CLI-only `DESCRIPTION` format the CLI itself
never has to parse back. All of this lives in
[`src/lib/caldav/ical.ts`](../src/lib/caldav/ical.ts).

## A viewing (VEVENT)

Every logged viewing is one `VEVENT`. The standard RFC 5545 properties:

| Property      | Maps to             | Notes                                         |
| ------------- | ------------------- | --------------------------------------------- |
| `UID`         | `uid`               | Stable identity; never regenerated on edit.   |
| `DTSTART`     | `start`             | See "DTSTART/DTEND shapes" below.             |
| `DTEND`       | `end`               | Optional — defaults to `DTSTART` when absent. |
| `SUMMARY`     | `title`             | The movie's title.                            |
| `LOCATION`    | `venue`             | Optional.                                     |
| `GEO`         | `geo` (`lat`/`lon`) | A native `FLOAT` pair, not TEXT — see below.  |
| `DESCRIPTION` | (fallback only)     | See "The DESCRIPTION fallback" below.         |

Everything else rides in `X-*` extension properties (RFC 5545 permits
any `X-`-prefixed property name). The full map, from
`ical.ts`'s `X_PROPERTIES`:

```text
X-MEDIUM                 medium
X-DIRECTOR                director
X-ACTORS                  actors
X-RATING-IMDB             ratingImdb
X-RATING-ROTTEN-TOMATOES  ratingRottenTomatoes
X-RATING-METACRITIC       ratingMetacritic
X-GENRE                   genre
X-YEAR                    year
X-POSTER-URL              posterUrl
X-IMDB-ID                 imdbId
X-SYNOPSIS                synopsis
X-BOOKING-REF             bookingRef
X-ROW                     row
X-SEAT                    seat
X-LETTERBOXD-URL          letterboxdUrl
X-LETTERBOXD-RATING       letterboxdRating
X-NOTES                   notes
X-CITY                    city
X-COUNTRY                 country
X-STREET-ADDRESS          streetAddress
X-POSTAL-CODE             postalCode
X-RATED                   rated
X-RUNTIME                 runtime
X-MOVIE-LANGUAGE          movieLanguage
X-MOVIE-COUNTRY           movieCountry
X-METASCORE                metascore
X-IMDB-VOTES              imdbVotes
X-DVD                      dvd
X-BOX-OFFICE                boxOffice
X-PRODUCTION               production
X-WEBSITE                  website
X-RELEASED                 released
X-AWARDS                   awards
X-TRAILER-URL               trailerUrl
X-LAST-MODIFIED-BY          lastModifiedBy
```

`X-LAST-MODIFIED-BY` is this app's own write attribution (#432,
`web` | `cli`) rather than movie metadata — `client.ts`'s `putViewing`
always forces it to `web` before serializing, overriding whatever a
caller passed. It's what the diff-on-sync activity log (see
[`docs/activity.md`](../src/content/docs/docs/activity.md)) reads to
tell a change this app made itself apart from one made by the CLI or
another device, so it can skip logging a self-made change twice. It's
a single current-state property, not a history — deleting a `VEVENT`
doesn't destroy anything this design depends on, because the _log
entry_ for that deletion lives in this app's own local snapshot, not
on the resource that's gone.

`X-RELEASED`, `X-AWARDS` and `X-TRAILER-URL` are this app's own
additions — the CLI never writes them (it only puts `Released`/`Awards`
in `DESCRIPTION` text, and has no `X-TRAILER-URL` equivalent at all,
since it has no TMDb integration). Once this app parses one of those out
of a `DESCRIPTION` and the viewing is saved again, it round-trips as a
structured `X-*` property from then on, same as `letterboxdUrl`/`notes`
already did.

Any property on an existing `VEVENT` this app doesn't recognize —
something a future CLI version added that this app hasn't caught up to
yet — is preserved verbatim across an edit (`extractUnknownProperties`),
rather than silently dropped.

## DTSTART/DTEND shapes

Three real shapes exist in the wild, all handled:

1. **Date-only, all-day** (RFC 5545 §3.3.4 `DATE` value, no time
   component, no `DTEND`) — treated as midnight UTC of that date.
2. **Date and time, both `DTSTART` and `DTEND` present** — the common
   case for a manually logged or Pathé-imported viewing.
3. **Date and time, `DTSTART` only, no `DTEND` at all** — a real
   `DATE-TIME` value with nothing to pair it with. `DTEND` is optional
   per RFC 5545; a `VEVENT` in this shape used to make this app throw
   and silently drop the whole entry (see #278) — the fix defaults the
   missing end to the start time, matching this app's own write path
   (`LogViewingForm.svelte`'s identical rule for a manually logged
   viewing with no end time given).

## GEO is a native property, not escaped TEXT

`GEO:52.3665062;4.8947073` is a `FLOAT` pair per RFC 5545 §3.8.1.6 — the
semicolon is a real value separator, not something TEXT's escaping rules
apply to. Writing it through the same `escapeText` path every other
property goes through would wrongly turn it into
`GEO:52.3665062\;4.8947073`; `geoProperty()` bypasses that.

## The DESCRIPTION fallback

The CLI's own `build_vevent` writes ratings and links as plain
`DESCRIPTION` lines (`IMDb: 8.5 (https://...)`, `Rotten Tomatoes: 92%`,
`Released: 15 Mar 2024`, `Plot: ...`, `Awards: ...`,
`Letterboxd: https://... (4.2)`, `Notes: ...`) rather than this app's
own `X-*` properties — the CLI never reads the calendar back (other than
`sync pull`), so it has no reason to know about them.
`parseDescriptionMetadata` is how a CLI-logged viewing shows this data
here without a fresh, possibly different OMDb lookup. It's a fallback,
never an override: any `X-*` property already present always wins.

## The picklist sidecar (VJOURNAL)

The media/venue picklists live in a single fixed-`UID` `VJOURNAL`
(`SIDECAR_UID = "movie-planner-web-config"`), with the picklist data as
a JSON blob in its own `DESCRIPTION`. Missing or unparsable — a
CalDAV collection that's never had this app write to it before — falls
back to empty picklists rather than throwing; nothing about this app's
core function depends on the sidecar existing.

`media` is a plain `string[]`, offered as autocomplete suggestions on
the log form's Medium field. `venues` is an array of structured
entries — `{name, streetAddress?, postalCode?, city?, country?, geo?}`
— populating the log and edit forms' Venue `<select>` (never free
text) and read directly for a selected venue's city/country/geo/
address, rather than this app scanning prior viewings for a match.
`parsePicklistsFromVJournal` still accepts a bare string in place of an
entry, read as `{name: value}` — the shape every venue held before this
schema grew structured fields, and still written by nothing but read
forever for backward compatibility.
