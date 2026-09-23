import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CollectedBranchStrip, {
  type BranchStripPreviewItem,
} from '../components/CollectedBranchStrip';
import CollectionCountdown from '../components/CollectionCountdown';
import CollectionViewer from '../components/CollectionViewer';
import MediaPlayer from '../components/MediaPlayer';
import TimelineCanvas from '../components/timelineCanvas';
import type {
  AudioPlayerState,
  DetailImageRect,
  FocusTarget,
} from '../components/timelineCanvas/types';
import TimelineDetailOverlay, {
  type TimelineDetailView,
} from '../components/TimelineDetailOverlay';
import UserCard from '../components/UserCard';
import {
  getContentDetailDateLabel,
  getContentDetailDescription,
  getContentDetailIsSingleImage,
  getContentDetailLink,
  getContentDetailNewsletterContent,
  useContentDetail,
} from '../queries/contentDetail';
import { useCollectedTimeline } from '../queries/collectedContent';
import { useCollections } from '../queries/collection';
import { useMainTimeline } from '../queries/mainTimeline';
import { hasCollectedFrom } from '../services/collectItem';
import { DEBUG_TIMERS_EVENT } from '../services/debugTimers';
import { DEFAULT_COLOUR, getStoredColour } from '../services/userColor';
import { getStoredUser } from '../services/userStorage';
import type { CollectionContent, ContentType } from '../types/content';
import { prefersReducedMotion } from '../utils/motionPreference';

// How long the timeline fades out before the collection view appears, and
// how long the collection view fades out before the timeline reappears.
// Matches EMenu's screen-fade transition duration (index.css's `main`/
// `main--leaving`), so opening/closing a collection reads as the same kind
// of transition as navigating between screens.
const COLLECTION_FADE_MS = 400;

type HomeProps = {
  onEntranceComplete?: () => void;
};

function Home({ onEntranceComplete }: HomeProps) {
  const queryClient = useQueryClient();
  const { data: timeline, isLoading, error } = useMainTimeline();
  const { data: collections } = useCollections();
  const { data: collectedRows, isLoading: isCollectedLoading } =
    useCollectedTimeline();
  const [viewerOpen, setViewerOpen] = useState(false);
  // True from the moment the timeline starts fading out until the collection
  // view is actually mounted, and again from the moment the collection view
  // starts fading out until the timeline reappears — drives the canvas fade
  // and hides the countdown for the whole transition, not just its endpoints.
  const [canvasHidden, setCanvasHidden] = useState(false);
  const [viewerLeaving, setViewerLeaving] = useState(false);
  const [previewItem, setPreviewItem] = useState<BranchStripPreviewItem | null>(
    null
  );
  const collectionTransitionTimeoutRef = useRef<number | undefined>(undefined);
  const [borderFlashActive, setBorderFlashActive] = useState(false);
  // Which collection's badge is currently expanded (showing its item list and
  // driving the canvas merge) — null when none is. Only one at a time.
  const [expandedCollectionId, setExpandedCollectionId] = useState<
    string | null
  >(null);
  // True while isolating via the user card specifically: the collection
  // badges fade out and the isolated timeline shows only the viewer's own
  // collected items, with no collection merged in.
  const [isolatedViaUserCard, setIsolatedViaUserCard] = useState(false);
  // Each collection remembers its own selected item index independently.
  const [selectedItemIndexByCollection, setSelectedItemIndexByCollection] =
    useState<Record<string, number>>({});
  const [hoveredCollectionItemId, setHoveredCollectionItemId] = useState<
    string | null
  >(null);
  // Per-collection "has the viewer already collected from this one" status.
  // A collection id's absence means its status hasn't been checked yet.
  const [collectedStatus, setCollectedStatus] = useState<
    Record<string, boolean>
  >({});
  const [highlightedType] = useState<ContentType | null>(null);
  const [focusSlug, setFocusSlug] = useState<string | null>(null);
  const [ownBranchHover, setOwnBranchHover] = useState(false);
  const [detailReady, setDetailReady] = useState(false);
  const [detailImageRect, setDetailImageRect] =
    useState<DetailImageRect | null>(null);
  const userCardWrapRef = useRef<HTMLDivElement>(null);
  const isolateOwnBranchRef = useRef<(() => void) | undefined>(undefined);
  const focusItemControlRef = useRef<
    ((target: FocusTarget) => void) | undefined
  >(undefined);
  const audioControlRef = useRef<((src: string) => void) | undefined>(
    undefined
  );
  const [audioState, setAudioState] = useState<AudioPlayerState | null>(null);

  const { data: contentDetail } = useContentDetail(focusSlug, timeline?.items);

  const handleFocusFadeChange = useCallback((fade: number) => {
    const opacity = 1 - fade;
    const pointerEvents = opacity < 0.5 ? 'none' : 'auto';
    const ref = userCardWrapRef;
    if (ref.current) {
      ref.current.style.opacity = String(opacity);
      ref.current.style.pointerEvents = pointerEvents;
    }
  }, []);

  const handleContentFocus = useCallback((slug: string) => {
    setFocusSlug(slug);
    setDetailReady(false);
    setDetailImageRect(null);
  }, []);

  const handleContentUnfocus = useCallback(() => {
    setFocusSlug(null);
    setDetailReady(false);
    setDetailImageRect(null);
  }, []);

  const handleDetailLayoutStart = useCallback(() => {
    setDetailReady(true);
  }, []);

  const handleDetailImageRect = useCallback((rect: DetailImageRect) => {
    setDetailImageRect(rect);
  }, []);

  const currentUsername = useMemo(() => getStoredUser()?.username ?? null, []);
  const branchColour = getStoredColour() ?? DEFAULT_COLOUR;
  const collectedRow =
    collectedRows?.find((row) => row.username === currentUsername) ?? null;

  const timelineDetail = useMemo((): TimelineDetailView | null => {
    if (!focusSlug || !detailReady || !contentDetail) {
      return null;
    }

    // How many other people (besides the viewer) have collected this item.
    const collectedByOthers = (collectedRows ?? []).filter(
      (row) =>
        row.username !== currentUsername &&
        row.items.some((entry) => entry.content.slug === focusSlug)
    ).length;

    return {
      title: contentDetail.title,
      dateLabel: getContentDetailDateLabel(contentDetail),
      description: getContentDetailDescription(contentDetail),
      link: getContentDetailLink(contentDetail),
      newsletterContent: getContentDetailNewsletterContent(contentDetail),
      presentAsNewsletter: getContentDetailIsSingleImage(contentDetail),
      collectedByOthers,
    };
  }, [contentDetail, detailReady, focusSlug, collectedRows, currentUsername]);

  // The collection whose badge is currently expanded — its items are what
  // merge into the isolated timeline on canvas.
  const expandedCollection =
    collections?.find(
      (collection) => collection._id === expandedCollectionId
    ) ?? null;
  const expandedSelectedItemId =
    expandedCollection?.content?.[
      selectedItemIndexByCollection[expandedCollection._id] ?? 0
    ]?._id ?? null;
  // Hovering either side (the title or the canvas item) previews the
  // highlight without disturbing the persisted selection underneath it.
  const highlightedCollectionItemId =
    hoveredCollectionItemId ?? expandedSelectedItemId;

  const handleCollected = (collectionId: string) => {
    setCollectedStatus((prev) => ({ ...prev, [collectionId]: true }));
    void queryClient.invalidateQueries({ queryKey: ['collectedTimeline'] });
    void queryClient.invalidateQueries({ queryKey: ['mainTimeline'] });
    void queryClient.invalidateQueries({ queryKey: ['contentDetail'] });
  };

  // Fades the timeline out, then reveals the collection view once that
  // finishes — the same "animate, then reveal/navigate once it finishes"
  // idiom EMenu.tsx uses for its own screen transition.
  const openCollectionView = () => {
    setCanvasHidden(true);
    window.clearTimeout(collectionTransitionTimeoutRef.current);
    collectionTransitionTimeoutRef.current = window.setTimeout(
      () => setViewerOpen(true),
      prefersReducedMotion() ? 0 : COLLECTION_FADE_MS
    );
  };

  // Clicking a collection badge flashes a border around the screen in the
  // user's colour (and stays), and lists that collection's item titles below
  // it — instead of opening the collection view. Only one collection can be
  // expanded at a time; clicking a different one swaps which is expanded
  // without leaving the isolated view, clicking the same one again closes it.
  // The isolated, straightened view itself (shared with the user card's
  // click) is only toggled on the not-isolating <-> isolating transition —
  // switching between collections (or from the user card's own-items-only
  // view) stays isolated throughout.
  const handleCollectionBadgeClick = (collectionId: string) => {
    setBorderFlashActive(true);
    const wasIsolating = expandedCollectionId !== null || isolatedViaUserCard;
    const next = expandedCollectionId === collectionId ? null : collectionId;
    setExpandedCollectionId(next);
    setIsolatedViaUserCard(false);
    if (wasIsolating !== (next !== null)) {
      isolateOwnBranchRef.current?.();
    }
  };

  // Clicking the user card jumps to the isolated view of just the viewer's
  // own collected items — no collection merged in (previewItems only ever
  // comes from expandedCollection, which this keeps null) — and fades the
  // collection badges out while that view is up. A collection expanded at
  // the time switches to this mode without leaving isolation; clicking the
  // user card again while already in it exits isolation entirely.
  const handleUserCardActivate = () => {
    if (expandedCollectionId !== null) {
      setExpandedCollectionId(null);
      setIsolatedViaUserCard(true);
      return;
    }
    setIsolatedViaUserCard((current) => !current);
    isolateOwnBranchRef.current?.();
  };

  // Mirrors openCollectionView in reverse: fade the collection view out,
  // then reveal the timeline again once that finishes.
  const closeCollectionView = () => {
    setViewerLeaving(true);
    window.clearTimeout(collectionTransitionTimeoutRef.current);
    collectionTransitionTimeoutRef.current = window.setTimeout(
      () => {
        setViewerOpen(false);
        setViewerLeaving(false);
        setCanvasHidden(false);
        setPreviewItem(null);
      },
      prefersReducedMotion() ? 0 : COLLECTION_FADE_MS
    );
  };

  const handleFocusItemChange = useCallback(
    (item: CollectionContent | null) => {
      setPreviewItem(
        item
          ? {
              id: item._id,
              title: item.title,
              imageUrl: item.imageUrl,
              date: item.date,
            }
          : null
      );
    },
    []
  );

  useEffect(() => {
    return () => window.clearTimeout(collectionTransitionTimeoutRef.current);
  }, []);

  // Checks every available collection's "already collected from" status in
  // parallel, so each badge can independently decide whether to show.
  useEffect(() => {
    const currentUser = getStoredUser();
    if (!currentUser || !collections || collections.length === 0) {
      setCollectedStatus({});
      return;
    }

    let cancelled = false;
    collections.forEach((collection) => {
      void hasCollectedFrom(currentUser.id, collection._id)
        .then((collected) => {
          if (!cancelled) {
            setCollectedStatus((prev) => ({
              ...prev,
              [collection._id]: collected,
            }));
          }
        })
        .catch((error) => {
          console.error('Failed to check collection status', error);
          if (!cancelled) {
            setCollectedStatus((prev) => ({
              ...prev,
              [collection._id]: false,
            }));
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [collections]);

  // Resetting a collection timer via the debug panel should bring every
  // countdown back even if it was already collected/dismissed.
  useEffect(() => {
    const onDebugChange = () => {
      setCollectedStatus((prev) => {
        const next = { ...prev };
        (collections ?? []).forEach((collection) => {
          next[collection._id] = false;
        });
        return next;
      });
    };
    window.addEventListener(DEBUG_TIMERS_EVENT, onDebugChange);
    return () => window.removeEventListener(DEBUG_TIMERS_EVENT, onDebugChange);
  }, [collections]);

  if (isLoading || isCollectedLoading) {
    return <p className="home-status">Loading timeline…</p>;
  }

  if (error) {
    return <p className="home-status">Failed to load timeline.</p>;
  }

  if (!timeline?.items.length) {
    return <p className="home-status">No timeline items yet.</p>;
  }

  return (
    <section className="home">
      <div
        className={`home__canvas-layer${
          canvasHidden ? ' home__canvas-layer--dimmed' : ''
        }`}
      >
        <TimelineCanvas
          items={timeline.items}
          collectedRows={collectedRows}
          previewItems={expandedCollection?.content ?? undefined}
          previewColour={getStoredColour() ?? DEFAULT_COLOUR}
          highlightedPreviewContentId={highlightedCollectionItemId}
          onPreviewItemHover={setHoveredCollectionItemId}
          colour={timeline.colour}
          currentUsername={currentUsername}
          highlightedType={highlightedType}
          hoverOwnBranch={ownBranchHover}
          isolateControlRef={isolateOwnBranchRef}
          focusItemControlRef={focusItemControlRef}
          audioControlRef={audioControlRef}
          onAudioStateChange={setAudioState}
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
        <div className="top-right-stack">
          <div ref={userCardWrapRef}>
            <UserCard
              onActivate={handleUserCardActivate}
              onHoverChange={setOwnBranchHover}
            />
          </div>
          {audioState && (
            <MediaPlayer
              state={audioState}
              onToggle={() => audioControlRef.current?.(audioState.src)}
              onJumpToItem={() =>
                focusItemControlRef.current?.(audioState.focusTarget)
              }
            />
          )}
          {!canvasHidden &&
            (collections ?? [])
              .filter((collection) => collectedStatus[collection._id] === false)
              .map((collection) => (
                <div
                  className={`collection-card-stack${
                    isolatedViaUserCard ? ' collection-card-stack--hidden' : ''
                  }`}
                  key={collection._id}
                >
                  <CollectionCountdown
                    collection={collection}
                    onClick={() => handleCollectionBadgeClick(collection._id)}
                  />
                  <div
                    className={`collection-card-titles${
                      expandedCollectionId === collection._id
                        ? ' collection-card-titles--visible'
                        : ''
                    }`}
                  >
                    {(collection.content ?? []).map((item, index) => (
                      <button
                        key={item._id}
                        type="button"
                        className={`collection-card-title${
                          item._id === highlightedCollectionItemId
                            ? ' collection-card-title--active'
                            : ''
                        }`}
                        style={
                          { '--title-index': index } as React.CSSProperties
                        }
                        onClick={() =>
                          setSelectedItemIndexByCollection((prev) => ({
                            ...prev,
                            [collection._id]: index,
                          }))
                        }
                        onMouseEnter={() =>
                          setHoveredCollectionItemId(item._id)
                        }
                        onMouseLeave={() =>
                          setHoveredCollectionItemId((current) =>
                            current === item._id ? null : current
                          )
                        }
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
        </div>
      </div>
      <div
        className={`screen-border-flash${
          borderFlashActive ? ' screen-border-flash--visible' : ''
        }`}
        style={
          {
            '--flash-colour': getStoredColour() ?? DEFAULT_COLOUR,
          } as React.CSSProperties
        }
      />
      {viewerOpen && collections?.[0] && (
        <div
          className={`collection-view${
            viewerLeaving ? ' collection-view--leaving' : ''
          }`}
        >
          <div className="collection-top-band">
            <CollectedBranchStrip
              items={collectedRow?.items ?? []}
              colour={branchColour}
              previewItem={previewItem}
            />
          </div>
          <CollectionViewer
            collection={collections[0]}
            onClose={closeCollectionView}
            onCollected={() => handleCollected(collections[0]._id)}
            onFocusItemChange={handleFocusItemChange}
          />
        </div>
      )}
    </section>
  );
}

export default Home;
