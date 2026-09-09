## MODIFIED Requirements

### Requirement: Best-effort OMDb enrichment

The system SHALL, when an OMDb API key is stored, look up a
best-matching result for a logged title and attach it to the entry
automatically, without prompting the visitor to disambiguate. This
holds for the successful case only: a confident single match always
attaches without a prompt.

When that match resolves an IMDb ID and the visitor also has a TMDb key
stored, the system SHALL also fetch TMDb's data for that IMDb ID and
attach it alongside the OMDb match: a trailer URL, collection,
certification, keywords, and budget/popularity, plus overwriting the
actors and website fields when TMDb has richer data than OMDb's. The
system SHALL NOT search TMDb by title — the TMDb lookup only ever runs
off an IMDb ID already resolved by OMDb.

#### Scenario: Confident single match

- **WHEN** a logged title's lookup finds a single confident OMDb match
- **THEN** the system SHALL attach it automatically, with no disambiguation prompt; a visitor who still gets a wrong match SHALL be able to correct it by adjusting the logged title (movie-editing capability) to something OMDb's search resolves more precisely, then refreshing — the OMDb-sourced fields themselves aren't directly editable, since re-running the lookup against the same unchanged title would just repeat the same match

#### Scenario: TMDb data attached alongside a confident OMDb match

- **WHEN** a visitor with both an OMDb key and a TMDb key set logs a title that finds a single confident OMDb match with an IMDb ID
- **THEN** the system SHALL also fetch and attach TMDb's trailer, collection, certification, keywords, and budget/popularity for that IMDb ID, overwriting actors/website with TMDb's data where TMDb has it

#### Scenario: Logging with no TMDb key set

- **WHEN** a visitor with an OMDb key but no TMDb key set logs a title
- **THEN** the system SHALL behave exactly as it does today — OMDb only, no TMDb call attempted

### Requirement: Disambiguation picker on no confident match

The system SHALL, when the best-effort lookup finds no confident
match for a logged (or refreshed) title, search OMDb for candidate
titles and, if any are found, show the visitor a picker listing each
candidate's poster, title, and release year, rather than silently
logging the entry with no metadata. Selecting a candidate SHALL fetch
that title's full details and attach them, the same as an automatic
match would — including the same TMDb enrichment step described under
"Best-effort OMDb enrichment", when the selected candidate resolves an
IMDb ID and the visitor has a TMDb key set. The system SHALL let the
visitor dismiss the picker and continue without OMDb metadata, matching
the outcome of finding no candidates at all.

#### Scenario: No confident match, candidates found

- **WHEN** a visitor with an OMDb key set logs or refreshes a title with no single confident OMDb match, and OMDb's search returns candidates
- **THEN** the system SHALL show a picker of those candidates' posters, titles, and years, and attach the visitor's chosen candidate's full details on selection

#### Scenario: No candidates at all

- **WHEN** a visitor with an OMDb key set logs or refreshes a title OMDb's search returns no candidates for
- **THEN** the system SHALL leave the entry without OMDb metadata, with no picker shown, matching the CLI's original best-effort-or-nothing behaviour

#### Scenario: Picker dismissed

- **WHEN** a visitor dismisses the disambiguation picker without choosing a candidate
- **THEN** the system SHALL leave the entry without OMDb metadata, the same as if no candidates had been found

#### Scenario: TMDb data attached on picker selection

- **WHEN** a visitor with both an OMDb key and a TMDb key set selects a candidate from the disambiguation picker, and the selected candidate has an IMDb ID
- **THEN** the system SHALL also fetch and attach TMDb's data for that IMDb ID, the same as the automatic-match case
