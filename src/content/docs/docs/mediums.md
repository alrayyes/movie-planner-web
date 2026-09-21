---
title: Mediums
description: Every medium you've logged a viewing with, or added to your saved list, with a count.
---

The "Mediums" page lists every medium you've ever logged a viewing
with — cinema, Netflix, Blu-ray, whatever you've used — along with any
medium you've saved but not logged anything with yet, each with a
count of logged viewings. Clicking a medium takes you to a dedicated
page for that medium alone — its own results and pagination, with no
filter controls. Reach it from Settings' "More" list.

## Cinema is always there

Cinema is always on the list, even before you've added anything, and
starts every count at zero rather than being absent. It's the default
for a viewing with no medium recorded at all — every viewing logged
through [movie-planner](https://github.com/alrayyes/movie-planner) (the
command-line tool) has no medium recorded, since the command-line tool
doesn't write one, so those always count toward Cinema here and
everywhere else this app shows a medium.

## Where the list comes from

A medium shows up here two ways: from a calendar entry that has it as
its medium, or from adding it through the log or edit form's "Add
medium" button. The medium field itself is always a select, offering
only mediums you've already added or logged with; a genuinely new one
always goes through "Add medium" first, and becomes selectable
immediately after. The two sources are merged, so a medium you've
saved but haven't logged anything with yet still shows here with a
count of zero.
