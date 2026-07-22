# DOM Collection View Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the full-screen dark-overlay `CollectionViewer` modal with: the whole p5.js canvas fading to invisible as one block, a new plain-DOM "your timeline" strip appearing in the top ~15vh band, and `CollectionViewer` repositioned as a non-modal, left-aligned bottom panel — with zero changes to any file under `frontend/src/components/timelineCanvas/`.

**Architecture:** One new presentational component (`CollectedBranchStrip`) reading data already fetched in `Home.tsx` (`useCollectedTimeline()`), plus a wrapping `<div>` around the existing canvas/detail-overlay/UserCard trio whose CSS class (driven by `viewerOpen`) fades it out. `CollectionViewer`'s CSS is repositioned from a full-screen scrim to a bottom band with a left-aligned item track (both changes validated in an earlier, now-reverted attempt at this feature).

**Tech Stack:** React + TypeScript, Vitest + `@testing-library/react` (already used by `EMenu.test.tsx` — mirror that pattern), Vite. No canvas/p5.js code is touched by this plan.

---

### Task 1: `CollectedBranchStrip` component (TDD)

**Files:**
- Create: `frontend/src/components/CollectedBranchStrip.tsx`
- Test: `frontend/src/components/CollectedBranchStrip.test.tsx`

**Step 1: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import CollectedBranchStrip from './CollectedBranchStrip';
import type { CollectedRowItem } from '../queries/collectedContent';
import type { MainTimelineItem } from '../queries/mainTimeline';

function makeItem(
  overrides: Partial<MainTimelineItem> = {}
): CollectedRowItem {
  return {
    collectedAt: '2026-01-01T00:00:00.000Z',
    content: {
      _id: 'item-1',
      _type: 'imageAsset',
      title: 'A collected item',
      slug: 'a-collected-item',
      imageUrl: 'https://example.com/image.jpg',
      unlockTime: null,
      expiryTime: null,
      ...overrides,
    } as MainTimelineItem,
  };
}

describe('CollectedBranchStrip', () => {
  test('renders an empty dashed placeholder when there are no items', () => {
    const { container } = render(
      <CollectedBranchStrip items={[]} colour="#ff0000" />
    );
    const root = container.querySelector('.collected-branch-strip');
    expect(root).toBeTruthy();
    expect(root?.classList.contains('collected-branch-strip--empty')).toBe(
      true
    );
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  test('renders one node per collected item, in order', () => {
    const items = [
      makeItem({ _id: 'a', title: 'First' }),
      makeItem({ _id: 'b', title: 'Second' }),
    ] as CollectedRowItem[];
    const { container } = render(
      <CollectedBranchStrip items={items} colour="#00ff00" />
    );
    const nodes = container.querySelectorAll(
      '.collected-branch-strip__node'
    );
    expect(nodes).toHaveLength(2);
    expect(screen.getByAltText('First')).toBeTruthy();
    expect(screen.getByAltText('Second')).toBeTruthy();
  });

  test('shows a text fallback instead of an image when imageUrl is missing', () => {
    const items = [
      makeItem({ imageUrl: null, title: 'No image here' }),
    ] as CollectedRowItem[];
    render(<CollectedBranchStrip items={items} colour="#0000ff" />);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.getByText('No image here')).toBeTruthy();
  });

  test('applies the given colour as a CSS custom property', () => {
    const { container } = render(
      <CollectedBranchStrip items={[]} colour="#abcdef" />
    );
    const root = container.querySelector(
      '.collected-branch-strip'
    ) as HTMLElement;
    expect(root.style.getPropertyValue('--branch-colour')).toBe('#abcdef');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && yarn test CollectedBranchStrip --run`
Expected: FAIL — `Cannot find module './CollectedBranchStrip'` (component doesn't exist yet).

**Step 3: Write the component**

```tsx
import type { CollectedRowItem } from '../queries/collectedContent';

type CollectedBranchStripProps = {
  items: CollectedRowItem[];
  colour: string;
};

function CollectedBranchStrip({ items, colour }: CollectedBranchStripProps) {
  const style = { '--branch-colour': colour } as React.CSSProperties;

  if (items.length === 0) {
    return (
      <div
        className="collected-branch-strip collected-branch-strip--empty"
        style={style}
      />
    );
  }

  return (
    <div className="collected-branch-strip" style={style}>
      <div className="collected-branch-strip__line" />
      {items.map(({ content }) => (
        <div className="collected-branch-strip__node" key={content._id}>
          <span className="collected-branch-strip__dot" />
          <div className="collected-branch-strip__thumb">
            {content.imageUrl ? (
              <img src={content.imageUrl} alt={content.title} />
            ) : (
              <span className="collected-branch-strip__thumb-fallback">
                {content.title}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default CollectedBranchStrip;
```

**Step 4: Run tests to verify they pass**

Run: `cd frontend && yarn test CollectedBranchStrip --run`
Expected: PASS (4/4 tests)

**Step 5: Commit**

```bash
git add frontend/src/components/CollectedBranchStrip.tsx frontend/src/components/CollectedBranchStrip.test.tsx
git commit -m "Add CollectedBranchStrip component for the DOM-based collection view"
```

---

### Task 2: Wire `Home.tsx` — fade the canvas layer, mount the strip, hide the countdown while open

**Files:**
- Modify: `frontend/src/pages/Home.tsx`

**Step 1: Add the colour import and derive the current user's row + colour**

Add to the import block (alongside the existing `../services/userStorage` import):
```ts
import { DEFAULT_COLOUR, getStoredColour } from '../services/userColor';
```

After the existing `const currentUsername = useMemo(...)` line, add:
```ts
  const branchColour = getStoredColour() ?? DEFAULT_COLOUR;
  const collectedRow =
    collectedRows?.find((row) => row.username === currentUsername) ?? null;
```

**Step 2: Restructure the returned JSX**

Change the `return (...)` block from:
```tsx
  return (
    <section className="home">
      <TimelineCanvas
        items={timeline.items}
        collectedRows={collectedRows}
        colour={timeline.colour}
        currentUsername={currentUsername}
        highlightedType={highlightedType}
        hoverOwnBranch={ownBranchHover}
        isolateControlRef={isolateOwnBranchRef}
        onFocusFadeChange={handleFocusFadeChange}
        onContentFocus={handleContentFocus}
        onContentUnfocus={handleContentUnfocus}
        onDetailLayoutStart={handleDetailLayoutStart}
        onDetailImageRect={handleDetailImageRect}
        onEntranceComplete={onEntranceComplete}
      />
      <TimelineDetailOverlay
        detail={timelineDetail}
        imageRect={detailImageRect}
      />
      {statusChecked && activeCollection && !alreadyCollected && (
        <CollectionCountdown
          collection={activeCollection}
          onClick={() => setViewerOpen(true)}
        />
      )}
      {viewerOpen && activeCollection && (
        <CollectionViewer
          collection={activeCollection}
          onClose={() => setViewerOpen(false)}
          onCollected={handleCollected}
        />
      )}
      <div ref={userCardWrapRef}>
        <UserCard
          refreshSignal={collectedSignal}
          onActivate={() => isolateOwnBranchRef.current?.()}
          onHoverChange={setOwnBranchHover}
        />
      </div>
    </section>
  );
```
to:
```tsx
  return (
    <section className="home">
      <div
        className={`home__canvas-layer${
          viewerOpen ? ' home__canvas-layer--hidden' : ''
        }`}
      >
        <TimelineCanvas
          items={timeline.items}
          collectedRows={collectedRows}
          colour={timeline.colour}
          currentUsername={currentUsername}
          highlightedType={highlightedType}
          hoverOwnBranch={ownBranchHover}
          isolateControlRef={isolateOwnBranchRef}
          onFocusFadeChange={handleFocusFadeChange}
          onContentFocus={handleContentFocus}
          onContentUnfocus={handleContentUnfocus}
          onDetailLayoutStart={handleDetailLayoutStart}
          onDetailImageRect={handleDetailImageRect}
          onEntranceComplete={onEntranceComplete}
        />
        <TimelineDetailOverlay
          detail={timelineDetail}
          imageRect={detailImageRect}
        />
        <div ref={userCardWrapRef}>
          <UserCard
            refreshSignal={collectedSignal}
            onActivate={() => isolateOwnBranchRef.current?.()}
            onHoverChange={setOwnBranchHover}
          />
        </div>
      </div>
      {statusChecked &&
        activeCollection &&
        !alreadyCollected &&
        !viewerOpen && (
          <CollectionCountdown
            collection={activeCollection}
            onClick={() => setViewerOpen(true)}
          />
        )}
      {viewerOpen && activeCollection && (
        <>
          <div className="collection-top-band">
            <CollectedBranchStrip
              items={collectedRow?.items ?? []}
              colour={branchColour}
            />
          </div>
          <CollectionViewer
            collection={activeCollection}
            onClose={() => setViewerOpen(false)}
            onCollected={handleCollected}
          />
        </>
      )}
    </section>
  );
```

**Step 3: Import the new component**

Add near the other component imports:
```ts
import CollectedBranchStrip from '../components/CollectedBranchStrip';
```

**Step 4: Typecheck**

Run: `cd frontend && yarn build`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/pages/Home.tsx
git commit -m "Fade the canvas layer and mount the collected-branch strip when a collection opens"
```

---

### Task 3: CSS — canvas fade, top band, and reposition `CollectionViewer` to a left-aligned bottom band

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/CollectionViewer.tsx`

**Step 1: Canvas-layer fade and top band**

Add after `.timeline-canvas canvas { ... }` (just before the `.collection-countdown` rule, around `index.css:520-526`):
```css
.home__canvas-layer {
  transition: opacity 0.4s ease;
}

.home__canvas-layer--hidden {
  opacity: 0;
  pointer-events: none;
}

.collection-top-band {
  align-items: center;
  display: flex;
  height: 15vh;
  justify-content: center;
  left: 0;
  position: absolute;
  right: 0;
  top: 0;
  z-index: 15;
}
```

**Step 2: `CollectedBranchStrip` styles**

Add after the block from Step 1 (still before `.collection-countdown`):
```css
.collected-branch-strip {
  align-items: center;
  display: flex;
  gap: 2.5rem;
  height: 100%;
  justify-content: center;
  padding: 0 4rem;
  position: relative;
  width: 100%;
}

.collected-branch-strip__line {
  background: var(--branch-colour, #ffffff);
  height: 2px;
  left: 4rem;
  position: absolute;
  right: 4rem;
  top: 50%;
  transform: translateY(-50%);
}

.collected-branch-strip__node {
  position: relative;
  z-index: 1;
}

.collected-branch-strip__dot {
  background: var(--branch-colour, #ffffff);
  border-radius: 50%;
  height: 8px;
  left: 50%;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
}

.collected-branch-strip__thumb {
  background: #111;
  border: 2px solid var(--branch-colour, #ffffff);
  border-radius: 8px;
  height: 3.5rem;
  overflow: hidden;
  width: 3.5rem;
}

.collected-branch-strip__thumb img {
  display: block;
  height: 100%;
  object-fit: cover;
  width: 100%;
}

.collected-branch-strip__thumb-fallback {
  align-items: center;
  color: rgba(255, 255, 255, 0.6);
  display: flex;
  font-size: 0.5rem;
  height: 100%;
  justify-content: center;
  padding: 0.25rem;
  text-align: center;
  width: 100%;
}

.collected-branch-strip--empty {
  border: 1px dashed var(--branch-colour, #ffffff);
  border-radius: 8px;
  height: calc(100% - 3rem);
  margin: 1.5rem 4rem;
  width: calc(100% - 8rem);
}
```

**Step 3: Reposition the `CollectionViewer` overlay to a bottom band**

Change (`.collection-viewer__overlay` / `.collection-viewer__overlay--visible`, currently):
```css
.collection-viewer__overlay {
  background: rgba(0, 0, 0, 0);
  inset: 0;
  position: absolute;
  transition: background 0.4s ease;
  z-index: 20;
}

.collection-viewer__overlay--visible {
  background: rgba(0, 0, 0, 0.72);
}
```
to:
```css
.collection-viewer__overlay {
  background: rgba(0, 0, 0, 0);
  top: 15vh;
  right: 0;
  bottom: 0;
  left: 0;
  position: absolute;
  transition: background 0.4s ease;
  z-index: 20;
}

.collection-viewer__overlay--visible {
  background: rgba(0, 0, 0, 0.35);
}
```

**Step 4: Left-align the item track**

Change `.collection-viewer__track`'s `left: 50%;` to `left: 4rem;` (every other property in that rule unchanged).

In `frontend/src/components/CollectionViewer.tsx`, change the inline style:
```tsx
            style={{
              transform: `translateX(calc(-1 * (${activeIndex} + 0.5) * var(--cv-slot)))`,
            }}
```
to:
```tsx
            style={{
              transform: `translateX(calc(-1 * ${activeIndex} * var(--cv-slot)))`,
            }}
```

**Step 5: Typecheck**

Run: `cd frontend && yarn build`
Expected: PASS

**Step 6: Run the full test suite**

Run: `cd frontend && yarn test --run`
Expected: PASS (all tests, including Task 1's new ones)

**Step 7: Commit**

```bash
git add frontend/src/index.css frontend/src/components/CollectionViewer.tsx
git commit -m "Reposition collection viewer to a left-aligned bottom band; style the top-band strip"
```

---

### Task 4: Lint check

**Files:** none (verification only)

**Step 1:** Run: `cd frontend && yarn lint`
Expected: PASS (no new warnings/errors — 3 pre-existing warnings in `contentDetail.ts` are unrelated and expected to remain).

**Step 2:** If anything new shows up, fix it and commit:
```bash
git add -A
git commit -m "Fix lint issues from the DOM collection view redesign"
```
