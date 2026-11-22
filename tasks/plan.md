# Implementation Plan: Player Focus team browser

## Overview

Add a collapsible conference-grouped team browser above Player Focus. Selecting a team applies the existing team filter; each row links to its ESPN, CBS, Yahoo, and Rotowire team page in a new tab.

## Architecture Decisions

- Store source URLs in a season-specific checked-in CSV, loaded server-side.
- Reuse the existing `team` URL filter and Player Focus server filtering.
- Do not embed external sites or replace existing filters.

## Task List

- [x] Add the 78-team source-link CSV and tested URL helpers.
- [x] Add the collapsible conference browser and connect it to Player Focus filtering.
- [x] Verify data coverage, UI behavior, and production build.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Source URLs change | Keep the season CSV as the editable source of truth. |
| Missing external mapping | Render only validated links and preserve filtering. |
