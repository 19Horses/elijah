# Timeline 'e' fan-out menu — design

## Summary

Add a large lowercase 'e' (EB Garamond, matching the site's serif face) fixed
to the bottom-right corner of the main timeline screen (`Home.tsx`). It fades
in once the timeline's own entrance animation finishes. Hovering (or, on
touch, tapping) the 'e' reveals three menu items — Shop, Login, Mailing list —
arranged along an arc sweeping up and to the left, fading/sliding in
staggered.

## The 'e'

- New component, rendered as a sibling inside `.home` alongside `UserCard` /
  `CollectionCountdown` / `TimelineDetailOverlay`.
- `position: fixed; bottom: 1.5rem; right: 1.5rem`, large serif glyph
  (EB Garamond, ~4rem), translucent white to sit on the dark canvas.
- Starts at `opacity: 0`. Fades in only after the timeline canvas's own
  staggered entrance (item + connector fade-in) completes — not a guessed
  fixed delay, since entrance duration depends on item count.
- Fade uses the same `isVisible` state + CSS class-toggle idiom already used
  by `CollectionCountdown` / `UserCard`.

### Entrance-complete plumbing

The canvas has no existing "entrance finished" signal — `drawFrame.ts`
computes staggered per-item/connector alpha every frame from
`runtime.loadStartMs` and the `LOAD_*` constants in `constants.ts`, but never
reports completion outward. Add a one-shot callback, mirroring the existing
sketch → React ref pattern (`onDetailLayoutStartRef`, `onBranchFocusRef`):

- `types.ts`: add `onEntranceCompleteRef` to `TimelineSketchRefs`, and an
  `entranceComplete: boolean` flag on `TimelineRuntime` (guards against
  firing more than once).
- `drawFrame.ts`: once `elapsed` passes the last connector's fade-out point
  (the existing `collectedConnectorBaseStart` + stagger + `LOAD_CONNECTOR_FADE_MS`
  computation), and `runtime.entranceComplete` is still false, set it true and
  invoke the ref callback.
- `createTimelineSketch.ts`: wire the ref through same as the others.
- `TimelineCanvas.tsx`: accept `onEntranceComplete?: () => void` prop, store
  it in the ref.
- `Home.tsx`: track `timelineReady` state, flip it in the callback, pass down
  to the new 'e' component.

## Fan-out menu

- Three items: Shop, Login, Mailing list.
- Absolutely positioned around the 'e', each at its own fixed angle/distance
  along an arc sweeping up-and-left (hardcoded per-item offsets — only 3 items,
  no need for generalized trig/config).
- Reveal trigger: hover (`onMouseEnter`/`onMouseLeave`) **and** tap-to-toggle
  (click flips an `open` boolean), so it works on both desktop and touch.
- Staggered fade + slide-in on open (~60–80ms apart), staggered fade-out on
  close, using the site's existing `cubic-bezier(0.4, 0, 0.2, 1)` easing.
- Respects `prefers-reduced-motion` (existing convention in `index.css`) —
  disable stagger/slide, just cross-fade.

### Item behavior

- **Shop** → `NavLink`/navigate to existing `/shop` route.
- **Login** → placeholder (no destination yet; the codebase currently only
  has an inline login/signup flow via `SignUpForm` on the Landing page, no
  standalone `/login` route).
- **Mailing list** → placeholder (no mailing-list capture feature exists yet).

## Files touched

- `frontend/src/components/timelineCanvas/types.ts`
- `frontend/src/components/timelineCanvas/createTimelineSketch.ts`
- `frontend/src/components/timelineCanvas/sketch/drawFrame.ts`
- `frontend/src/components/timelineCanvas/TimelineCanvas.tsx`
- `frontend/src/pages/Home.tsx`
- `frontend/src/components/EMenu.tsx` (new)
- `frontend/src/index.css`

## Out of scope

- Actual destinations for Login and Mailing list (placeholders only).
- Any dedicated mailing-list capture backend/feature.
