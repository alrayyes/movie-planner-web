## Purpose

Lets a visitor see where their logged viewings happened geographically —
one map per venue on a viewing's details page, and one map pinning every
located viewing across the whole history — using real, recognizable
map tiles (OpenStreetMap) rather than an abstract stand-in, so a pin
actually means something at a glance.

## Requirements

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

### Requirement: Maps render real, recognizable geography

The system SHALL render both the global map and the per-venue map using
real map tiles from a third-party tile provider (OpenStreetMap),
correctly attributed per that provider's own usage policy, rather than
an abstract stand-in — a deliberate reversal of this capability's
original zero-network-call design, made after real use showed an
abstract outline read as unrecognizable and unhelpful. Opening either
map SHALL make a live network request to the tile provider as a
result; this is disclosed on the privacy page, alongside the existing
Nominatim disclosure.

#### Scenario: Opening a map loads real map tiles

- **WHEN** a visitor opens `/map` or a details page showing a per-venue map
- **THEN** the system SHALL render real, correctly-positioned map tiles from the configured tile provider, attributed per its usage policy

### Requirement: A pin links out to a full, precise external map

The system SHALL offer an "Open in Maps" link alongside each pin, linking
to an external map service at that venue's exact coordinates, for a
visitor who wants more precision or a different view (satellite,
street-level) than the tile map itself gives.

#### Scenario: Following the external link

- **WHEN** a visitor activates "Open in Maps" next to a pin
- **THEN** the system SHALL open an external map service at that pin's exact coordinates in a new tab
