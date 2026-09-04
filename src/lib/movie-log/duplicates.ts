import { token_sort_ratio } from "fuzzball";

// Ported from movie-planner's own src/movie_planner/duplicates.py — same
// normalization, same threshold, same same-day gating (a legitimate
// rewatch on a different day is never flagged).
const DEFAULT_THRESHOLD = 90;

const NOISE_SUFFIXES = [" - movies"];
const PUNCTUATION_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;
const WHITESPACE_RE = /\s+/g;

export function normalizeTitle(title: string): string {
  let normalized = title.trim().toLowerCase();
  for (const suffix of NOISE_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
    }
  }
  normalized = normalized.replace(PUNCTUATION_RE, "");
  normalized = normalized.replace(WHITESPACE_RE, " ").trim();
  return normalized;
}

// Same-day-only: `existing` should already be scoped to candidates worth
// comparing (the caller's job — this module just judges title similarity).
export function isLikelyDuplicateTitle(
  title: string,
  otherTitle: string,
  threshold = DEFAULT_THRESHOLD,
): boolean {
  const score = token_sort_ratio(normalizeTitle(title), normalizeTitle(otherTitle));
  return score >= threshold;
}
