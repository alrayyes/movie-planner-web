## Purpose

Lets a visitor see where their logged viewings happened geographically —
one map per venue on a viewing's details page, and one map pinning every
located viewing across the whole history — without this app ever making
an automatic network call to a third-party map or tile service just
because a visitor opened a page.

## ADDED Requirements

### Requirement: Global map of every located viewing

The system SHALL offer a `/map` page showing every logged viewing whose
venue has known coordinates as a pin on one map. A viewing whose venue
has no known coordinates SHALL be omitted from this map rather than
causing an error or a broken pin.

#### Scenario: Global map with a mix of located and unlocated viewings

- **WHEN** a visitor opens `/map` and has some logged viewings with a located venue and some without
- **THEN** the system SHALL show a pin for each viewing with a located venue and SHALL NOT show or error on the ones without

#### Scenario: No located viewings at all

- **WHEN** a visitor opens `/map` and has no logged viewings with a located venue
- **THEN** the system SHALL render the map with no pins, rather than an error

### Requirement: Per-venue map on the details page

The system SHALL show a small map on a logged viewing's details page,
pinning that viewing's own venue, when its venue has known coordinates.
The system SHALL show no map at all when the venue has no known
coordinates, rather than a broken or empty one.

#### Scenario: Details page for a located venue

- **WHEN** a visitor opens the details page for a viewing whose venue has known coordinates
- **THEN** the system SHALL show a map with a single pin at that venue's location

#### Scenario: Details page for an unlocated venue

- **WHEN** a visitor opens the details page for a viewing whose venue has no known coordinates
- **THEN** the system SHALL show no map on that page

### Requirement: Maps render without a live third-party network call

The system SHALL render both the global map and the per-venue map using
a bundled, local static asset as the map surface (not live tiles fetched
from a third-party tile provider), so that viewing either map never
makes an automatic network request to a service outside the visitor's
own configured CalDAV/OMDb servers.

#### Scenario: Opening a map makes no third-party request

- **WHEN** a visitor opens `/map` or a details page showing a per-venue map
- **THEN** the system SHALL NOT make any network request to a map-tile provider or other third-party service as a result

### Requirement: A pin links out to a full, precise external map

The system SHALL offer an "Open in Maps" link alongside each pin, linking
to an external map service at that venue's exact coordinates, for a
visitor who wants a real, detailed, precise view the bundled local
outline can't provide.

#### Scenario: Following the external link

- **WHEN** a visitor activates "Open in Maps" next to a pin
- **THEN** the system SHALL open an external map service at that pin's exact coordinates in a new tab
