// Every page the README shows a screenshot of, and how to reach each one with
// demo data loaded. tests/page-gallery.spec.ts takes the pictures; the unit
// test beside this file fails when a page appears under src/pages/ without an
// entry here or a place on the footer list below.

import {
  ATTRIBUTES,
  type AttributeKind,
  attributeHref,
  attributeValues,
} from "../src/lib/attribute/attributes";
import type { LoggedViewing } from "../src/lib/caldav/types";
import { mediumHref } from "../src/lib/medium/display";
import { movieHref } from "../src/lib/movie-log/movie-link";
import { encodeSharedState, toSharedViewing } from "../src/lib/share/encode";
import { venueHref } from "../src/lib/venue/display";

// The moment every screenshot is taken at, so a regenerated image only differs
// where the app does. tests/page-gallery.spec.ts fixes the browser's clock to it.
export const GALLERY_NOW = "2026-10-10T12:00:00.000Z";

// The pages the footer links to, and the 404 page nobody navigates to. They're
// text, so a picture of them says nothing the page doesn't.
export const FOOTER_ROUTES = ["about", "disclaimer", "privacy", "changelog", "404"];

type Resolve = (viewings: LoggedViewing[]) => string | Promise<string>;

export interface GalleryPage {
  // File name stem: docs/screenshots/pages/<slug>-<light|dark>.png.
  slug: string;
  // Alt text and the heading in the README.
  name: string;
  // The file under src/pages/ that serves it.
  route: string;
  // False for the first screen a visitor with no calendar connected sees.
  connected: boolean;
  path: string | Resolve;
}

const first = (values: (string | undefined)[]) => values.find(Boolean) ?? "";

function attributePages(): GalleryPage[] {
  return (Object.keys(ATTRIBUTES) as AttributeKind[]).flatMap((kind) => {
    const config = ATTRIBUTES[kind];
    const listing = config.listingPath.slice(1);
    const detail = config.detailPath.slice(1);
    return [
      {
        slug: listing,
        name: config.plural,
        route: listing,
        connected: true,
        path: config.listingPath,
      },
      {
        slug: detail,
        name: config.singular,
        route: detail,
        connected: true,
        path: (viewings: LoggedViewing[]) =>
          attributeHref(kind, first(viewings.flatMap((v) => attributeValues(v, kind)))),
      },
    ];
  });
}

export const PAGES: GalleryPage[] = [
  { slug: "overview", name: "Overview", route: "index", connected: true, path: "/" },
  { slug: "connect", name: "Connect a calendar", route: "index", connected: false, path: "/" },
  { slug: "log", name: "Log a viewing", route: "log", connected: true, path: "/log" },
  { slug: "import", name: "Import", route: "import", connected: true, path: "/import" },
  { slug: "settings", name: "Settings", route: "settings", connected: true, path: "/settings" },
  { slug: "activity", name: "Activity", route: "activity", connected: true, path: "/activity" },
  { slug: "calendar", name: "Calendar", route: "calendar", connected: true, path: "/calendar" },
  {
    slug: "missing-data",
    name: "Missing data",
    route: "missing-data",
    connected: true,
    path: "/missing-data",
  },
  { slug: "venues", name: "Venues", route: "venues", connected: true, path: "/venues" },
  {
    slug: "venue",
    name: "Venue",
    route: "venue",
    connected: true,
    path: (viewings) => venueHref(first(viewings.map((v) => v.venue))),
  },
  { slug: "mediums", name: "Mediums", route: "mediums", connected: true, path: "/mediums" },
  {
    slug: "medium",
    name: "Medium",
    route: "medium",
    connected: true,
    path: (viewings) => mediumHref(first(viewings.map((v) => v.medium))),
  },
  ...attributePages(),
  {
    slug: "movie",
    name: "Movie details",
    route: "movie",
    connected: true,
    path: (viewings) => movieHref(first(viewings.map((v) => v.uid))),
  },
  {
    slug: "shared",
    name: "Shared viewings",
    route: "shared",
    connected: true,
    path: async (viewings) => {
      const state = { sharedAt: GALLERY_NOW, viewings: viewings.map(toSharedViewing) };
      return `/shared?state=${await encodeSharedState(state)}`;
    },
  },
];

export async function pagePath(page: GalleryPage, viewings: LoggedViewing[]): Promise<string> {
  return typeof page.path === "string" ? page.path : page.path(viewings);
}
