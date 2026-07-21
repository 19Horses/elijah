# Timeline 'e' Fan-Out Menu Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a large serif 'e' to the bottom-right of the main timeline screen that fades in once the timeline's entrance animation finishes, and reveals a fan-out menu (Shop / Login / Mailing list) on hover or tap.

**Architecture:** A one-shot "entrance complete" signal is threaded out of the p5 timeline sketch (`drawFrame.ts`) through the existing sketch→React ref-callback convention, up through `TimelineCanvas` to `Home.tsx`. Once fired, `Home.tsx` mounts a new self-contained `EMenu` component that manages its own fade-in and open/closed fan-out state, styled with plain CSS following the codebase's existing fixed-overlay + staggered-entrance conventions (see `.collection-viewer__slot` / `--anim-index` pattern).

**Tech Stack:** React 18 + TypeScript, react-router-dom, plain global CSS (`index.css`, BEM-ish classes), vitest + @testing-library/react for tests, p5.js for the canvas (untouched except for the new signal).

**Design doc:** `docs/plans/2026-07-21-timeline-e-menu-design.md`

---

### Task 1: Thread an "entrance complete" signal out of the timeline canvas

**Files:**
- Modify: `frontend/src/components/timelineCanvas/types.ts`
- Modify: `frontend/src/components/timelineCanvas/timelineRuntime.ts`
- Modify: `frontend/src/components/timelineCanvas/sketch/drawFrame.ts`
- Modify: `frontend/src/components/timelineCanvas/TimelineCanvas.tsx`

No new test file here — the p5 sketch/canvas internals have no existing unit test coverage anywhere in this codebase (verified: no `*.test.*` files under `timelineCanvas/`), so this task is verified manually in Task 5 instead of with a unit test.

**Step 1: Add the runtime flag and ref type**

In `frontend/src/components/timelineCanvas/types.ts`, add a field to `TimelineRuntime` (near `loadStartMs`):

```ts
  loadStartMs: number;
  // Set once the staggered entrance (images + connectors) has fully faded
  // in, so the one-shot onEntranceComplete callback only fires once.
  entranceComplete: boolean;
```

Add a new ref to `TimelineSketchRefs` (alongside `onDetailLayoutStartRef`):

```ts
  // Sketch → React: fires once, after the timeline's staggered entrance
  // animation has fully finished.
  onEntranceCompleteRef: RefObject<(() => void) | undefined>;
```

Add the new prop to `TimelineCanvasProps` (alongside `onDetailLayoutStart`):

```ts
  onEntranceComplete?: () => void;
```

**Step 2: Initialize the flag**

In `frontend/src/components/timelineCanvas/timelineRuntime.ts`, in `createTimelineRuntime()`'s returned object, add `entranceComplete: false,` next to `loadStartMs: 0,`.

**Step 3: Fire the callback when the entrance finishes**

In `frontend/src/components/timelineCanvas/sketch/drawFrame.ts`, find where `collectedConnectorBaseStart` is computed (currently around line 208-210):

```ts
    const collectedConnectorBaseStart =
      connectorBaseStart +
      Math.max(0, deps.processed.length - 1) * LOAD_CONNECTOR_STAGGER_MS;
```

Immediately after it, add:

```ts
    // The collected-lane connectors (or, if there are none, the main-lane
    // connectors) are the last thing to fade in — once they're done, the
    // whole entrance sequence is complete.
    const totalEntranceMs =
      collectedConnectorBaseStart +
      Math.max(0, deps.processedCollected.length - 1) *
        LOAD_CONNECTOR_STAGGER_MS +
      LOAD_CONNECTOR_FADE_MS;
    if (!runtime.entranceComplete && elapsed >= totalEntranceMs) {
      runtime.entranceComplete = true;
      deps.refs.onEntranceCompleteRef.current?.();
    }
```

(`elapsed`, `LOAD_CONNECTOR_FADE_MS`, and `runtime` are already in scope at this point in the function — no new imports needed.)

**Step 4: Wire the prop through `TimelineCanvas.tsx`**

In `frontend/src/components/timelineCanvas/TimelineCanvas.tsx`:

- Add `onEntranceComplete,` to the destructured props (after `onDetailImageRect,`).
- Add a ref for it (after `onDetailImageRectRef`):
  ```ts
  const onEntranceCompleteRef = useRef(onEntranceComplete);
  ```
- Add a sync effect (after the `onDetailImageRect` one):
  ```ts
  useEffect(() => {
    onEntranceCompleteRef.current = onEntranceComplete;
  }, [onEntranceComplete]);
  ```
- Add `onEntranceCompleteRef,` to the `refs` object passed into `createTimelineSketch(...)` (alongside `onDetailImageRectRef,`).

**Step 5: Type-check**

Run: `cd frontend && yarn tsc --noEmit`
Expected: no errors.

**Step 6: Commit**

```bash
git add frontend/src/components/timelineCanvas/types.ts \
  frontend/src/components/timelineCanvas/timelineRuntime.ts \
  frontend/src/components/timelineCanvas/sketch/drawFrame.ts \
  frontend/src/components/timelineCanvas/TimelineCanvas.tsx
git commit -m "Add one-shot entrance-complete signal to timeline canvas"
```

---

### Task 2: Build the `EMenu` component (TDD)

**Files:**
- Create: `frontend/src/components/EMenu.tsx`
- Test: `frontend/src/components/EMenu.test.tsx`

This codebase's test suite has no `@testing-library/jest-dom` matchers installed (only plain vitest assertions are used in the existing tests), so these tests stick to `toBeNull()` / `toBeTruthy()` / attribute checks rather than `toBeInTheDocument()`.

**Step 1: Write the failing tests**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import EMenu from './EMenu';

function renderMenu() {
  return render(
    <MemoryRouter>
      <EMenu />
    </MemoryRouter>
  );
}

describe('EMenu', () => {
  test('the menu items are not exposed until the e is opened', () => {
    renderMenu();
    expect(screen.queryByRole('menuitem', { name: 'Shop' })).toBeNull();
  });

  test('hovering the e reveals all three menu items', () => {
    renderMenu();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'e' }));
    expect(screen.getByRole('menuitem', { name: 'Shop' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Login' })).toBeTruthy();
    expect(
      screen.getByRole('menuitem', { name: 'Mailing list' })
    ).toBeTruthy();
  });

  test('the mouse leaving the e closes the menu again', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'e' });
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('menuitem', { name: 'Shop' })).toBeNull();
  });

  test('clicking the e toggles the menu open and closed, for touch devices', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'e' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'Shop' })).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByRole('menuitem', { name: 'Shop' })).toBeNull();
  });

  test('the Shop item links to the existing /shop route', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'e' }));
    const shopLink = screen.getByRole('menuitem', { name: 'Shop' });
    expect(shopLink.getAttribute('href')).toBe('/shop');
  });
});
```

**Step 2: Run the tests to verify they fail**

Run: `cd frontend && yarn vitest run src/components/EMenu.test.tsx`
Expected: FAIL — `Cannot find module './EMenu'` (component doesn't exist yet).

**Step 3: Write the component**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

function EMenu() {
  const [isVisible, setIsVisible] = useState(false);
  const [open, setOpen] = useState(false);

  // Mirrors the CollectionCountdown/UserCard entrance idiom: flip a class on
  // the next tick so the CSS transition actually plays instead of starting
  // in its end state.
  useEffect(() => {
    const id = window.setTimeout(() => setIsVisible(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div
      className={`e-menu${isVisible ? ' e-menu--visible' : ''}${
        open ? ' e-menu--open' : ''
      }`}
    >
      <button
        type="button"
        className="e-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((current) => !current)}
      >
        e
      </button>
      <div className="e-menu__items" role="menu" aria-hidden={!open}>
        <Link
          to="/shop"
          role="menuitem"
          className="e-menu__item e-menu__item--shop"
          tabIndex={open ? 0 : -1}
        >
          Shop
        </Link>
        <button
          type="button"
          role="menuitem"
          className="e-menu__item e-menu__item--login"
          tabIndex={open ? 0 : -1}
        >
          Login
        </button>
        <button
          type="button"
          role="menuitem"
          className="e-menu__item e-menu__item--mailing"
          tabIndex={open ? 0 : -1}
        >
          Mailing list
        </button>
      </div>
    </div>
  );
}

export default EMenu;
```

(Login and Mailing list are intentionally inert placeholder buttons — no destination has been decided yet, per the design doc.)

**Step 4: Run the tests to verify they pass**

Run: `cd frontend && yarn vitest run src/components/EMenu.test.tsx`
Expected: PASS (5 tests).

**Step 5: Commit**

```bash
git add frontend/src/components/EMenu.tsx frontend/src/components/EMenu.test.tsx
git commit -m "Add EMenu component with hover/tap fan-out menu"
```

---

### Task 3: Wire `EMenu` into `Home.tsx` behind the entrance signal

**Files:**
- Modify: `frontend/src/pages/Home.tsx`

**Step 1: Add the ready flag and callback**

In `frontend/src/pages/Home.tsx`, add an import:

```ts
import EMenu from '../components/EMenu';
```

Add state near the other `useState` calls:

```ts
const [timelineReady, setTimelineReady] = useState(false);
```

Add a callback near `handleDetailLayoutStart`:

```ts
const handleEntranceComplete = useCallback(() => {
  setTimelineReady(true);
}, []);
```

**Step 2: Pass the callback to `TimelineCanvas` and render `EMenu`**

Add `onEntranceComplete={handleEntranceComplete}` to the `<TimelineCanvas ... />` element's props.

Render the menu as a sibling of the other fixed overlays, near the end of the `<section className="home">`:

```tsx
{timelineReady && <EMenu />}
```

**Step 3: Type-check**

Run: `cd frontend && yarn tsc --noEmit`
Expected: no errors.

**Step 4: Commit**

```bash
git add frontend/src/pages/Home.tsx
git commit -m "Mount EMenu on the timeline screen once entrance completes"
```

---

### Task 4: Style the 'e' and fan-out menu

**Files:**
- Modify: `frontend/src/index.css`

**Step 1: Add the styles**

Append a new section to `frontend/src/index.css` (e.g. after the `.user-card` / `.content-legend` block, before the `@media (prefers-reduced-motion: reduce)` block at the end):

```css
/* ── E menu ────────────────────────── */

.e-menu {
  bottom: 1.5rem;
  position: fixed;
  right: 1.5rem;
  z-index: 12;
  opacity: 0;
}

.e-menu--visible {
  animation: e-menu-fade-in 0.8s ease forwards;
}

@keyframes e-menu-fade-in {
  to {
    opacity: 1;
  }
}

.e-menu__trigger {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  display: block;
  font-family: 'EB Garamond', 'Times New Roman', Times, serif;
  font-size: 4.5rem;
  line-height: 1;
  padding: 0;
  position: relative;
  z-index: 1;
}

.e-menu__items {
  bottom: 0;
  pointer-events: none;
  position: absolute;
  right: 0;
}

.e-menu--open .e-menu__items {
  pointer-events: auto;
}

.e-menu__item {
  background: rgba(17, 24, 39, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  bottom: 0;
  color: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  font-family: 'EB Garamond', 'Times New Roman', Times, serif;
  font-size: 1rem;
  opacity: 0;
  padding: 0.5rem 1.25rem;
  position: absolute;
  right: 0;
  text-decoration: none;
  transform: translate(0, 0) scale(0.85);
  transition: opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

/* Cascades outward from the e: the nearest item moves first. */
.e-menu__item--mailing {
  transition-delay: 0ms;
}

.e-menu__item--login {
  transition-delay: 70ms;
}

.e-menu__item--shop {
  transition-delay: 140ms;
}

.e-menu--open .e-menu__item--mailing {
  opacity: 1;
  transform: translate(-64px, -56px) scale(1);
}

.e-menu--open .e-menu__item--login {
  opacity: 1;
  transform: translate(-118px, -132px) scale(1);
}

.e-menu--open .e-menu__item--shop {
  opacity: 1;
  transform: translate(-150px, -218px) scale(1);
}
```

**Step 2: Respect reduced motion**

In the existing `@media (prefers-reduced-motion: reduce)` block at the bottom of `index.css`, add:

```css
  .e-menu--visible {
    animation: none;
    opacity: 1;
  }

  .e-menu__item {
    transition: none;
  }
```

(add `.e-menu--visible` and `.e-menu__item` into that media query alongside the existing selectors)

**Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "Style the timeline e and its fan-out menu"
```

---

### Task 5: Manual verification in the browser

No automated test can drive the p5 canvas's real entrance timing or CSS animation, so this is verified by hand.

**Step 1: Start the dev server**

Run: `cd frontend && yarn start`

**Step 2: Verify in the browser**

- Load `/#/home` with a timeline that has several items.
- Confirm the 'e' is invisible initially, and fades in only after the timeline's own item/connector entrance animation has finished (not before, not on a fixed short timer regardless of item count).
- Hover the 'e': confirm Shop, Login, and Mailing list fan out along an arc up-and-left, fading/sliding in staggered (nearest item first).
- Move the mouse away: confirm the items fade back out.
- Click the 'e' (simulating touch): confirm it toggles the menu open, and clicking again closes it.
- Click "Shop": confirm it navigates to `/shop`.
- Resize the window / check it doesn't collide with the debug panel (bottom-left) or media player (bottom-center) when a track is playing.
- In devtools, emulate `prefers-reduced-motion: reduce` and confirm the 'e' and menu items appear without sliding/staggering.

**Step 3: Report results**

Note any visual tuning needed (e.g. arc distances/angles) — adjust the `translate()` values in `index.css` from Task 4 if the fan doesn't read well at actual screen sizes.

---

### Task 6: Final checks

**Step 1: Run the full test suite**

Run: `cd frontend && yarn test run`
Expected: all tests pass, including the new `EMenu.test.tsx`.

**Step 2: Lint and format**

Run: `cd frontend && yarn lint && yarn check-format`
Expected: no errors. If `check-format` fails, run `yarn fix-format` and review the diff.

**Step 3: Build**

Run: `cd frontend && yarn build`
Expected: succeeds (this also runs `tsc`).

**Step 4: Commit if the above steps produced any changes (e.g. formatting fixes)**

```bash
git add -A
git commit -m "Fix formatting"
```
