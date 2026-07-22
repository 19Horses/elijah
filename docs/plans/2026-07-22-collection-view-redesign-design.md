# Collection view redesign: from overlay modal to a DOM top-strip + bottom panel

## Problem

Clicking a collection today opens `CollectionViewer` as a full-screen dark-overlay
modal, disconnected from the timeline underneath. We want collecting to feel like
part of the timeline instead of a modal interruption.

## Design

An earlier attempt built this by extending the p5.js timeline canvas engine
(straightening the user's branch in-canvas, fading the main lane, etc.). That
work was scrapped — this design deliberately avoids touching the canvas at all,
in favour of a plain DOM/CSS treatment layered on top of it.

When a collection is clicked (`CollectionCountdown` in `Home.tsx`):

1. **Canvas fades out as one block.** `TimelineCanvas`, `TimelineDetailOverlay`,
   and the `UserCard` wrapper are grouped in one new container. A CSS class
   toggled by `viewerOpen` fades that whole container to `opacity: 0` with
   `pointer-events: none` — main timeline, every branch, and `UserCard` recede
   together. No p5/canvas-internal state is touched. Because the canvas layer
   becomes fully inert while the panel is open, there's no possibility of the
   cross-trigger desync bug the p5.js approach ran into (`UserCard` can't be
   clicked while invisible).
2. **New DOM strip** in the top ~15vh band shows the current user's own
   collected-items branch: an evenly-spaced row of thumbnails joined by a
   straight line and dot nodes, tinted with the user's colour
   (`getStoredColour()`, the same source `CollectionCountdown` already uses).
   Data comes directly from `useCollectedTimeline()`'s `CollectedUserRow[]`
   (already fetched in `Home.tsx`) — filtered to the row matching
   `currentUsername`. Empty state (nothing collected yet): a dashed-border
   rectangle in the user's colour, no thumbnails.
3. **`CollectionViewer` bottom panel**: same non-modal, bottom ~85vh band,
   lighter scrim than the original full-screen modal, item track left-aligned
   (not centered) — carrying forward the refinements validated in the earlier
   (scrapped) attempt, since those were CSS/JSX details independent of the
   canvas rework.
4. **Trigger**: `CollectionCountdown`'s `onClick` is just `setViewerOpen(true)`;
   `CollectionViewer`'s `onClose` is just `setViewerOpen(false)`. No refs into
   the canvas.

## Why

Purely a UX/visual redesign — no functional/data-model change. `collectItem.ts`
(the write path) and `Collection`/`CollectionContent` types are unchanged.
Avoiding the p5.js canvas entirely was an explicit ask after trying the
canvas-based approach — it keeps this feature's code fully isolated from the
much larger, harder-to-verify canvas engine.
