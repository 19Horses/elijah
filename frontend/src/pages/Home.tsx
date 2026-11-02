import { useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';

import { useLocation } from 'react-router-dom';
import CollectedBranchStrip, {
  type BranchStripPreviewItem,
} from '../components/CollectedBranchStrip';
import CollectionCountdown from '../components/CollectionCountdown';
import { getContentTypeKicker } from '../constants/contentTypes';
import {
  ALREADY_COLLECTED_MAX_TILT_DEG,
  ALREADY_COLLECTED_MIN_TILT_DEG,
} from '../components/timelineCanvas/constants';
import { panelTagTilt } from '../utils/tilt';
import CollectionViewer from '../components/CollectionViewer';
import ContentTypeIcon from '../components/ContentTypeIcon';
import MediaPlayer from '../components/MediaPlayer';
import TimelineCanvas from '../components/timelineCanvas';

import type {
  AudioPlayerState,
  DetailImageRect,
  FocusTarget,
  BranchFocusInfo,
} from '../components/timelineCanvas/types';
import TimelineDetailOverlay, {
  type TimelineDetailView,
} from '../components/TimelineDetailOverlay';
import {
  getContentDetailDateLabel,
  getContentDetailDescription,
  getContentDetailImageUrls,
  getContentDetailIsSingleImage,
  getContentDetailLink,
  getContentDetailNewsletterContent,
  useContentDetail,
} from '../queries/contentDetail';
import {
  useCollectedTimeline,
  type CollectedRowItem,
  type CollectedUserRow,
} from '../queries/collectedContent';
import { useCollections } from '../queries/collection';
import {
  useMainTimeline,
  type MainTimelineItem,
} from '../queries/mainTimeline';
import { collectItem, hasCollectedFrom } from '../services/collectItem';
import { subscribeToCollectionChanges } from '../services/collectedContent';
import { DEBUG_TIMERS_EVENT } from '../services/debugTimers';
import {
  setViewing,
  subscribeToViewers,
  VIEWING_HEARTBEAT_MS,
  type ItemViewer,
} from '../services/presence';
import { getDisplayColour } from '../services/userColor';
import { getStoredUser, USER_CHANGED_EVENT } from '../services/userStorage';
import type { CollectionContent, ContentType } from '../types/content';
import { prefersReducedMotion } from '../utils/motionPreference';

// How long the timeline fades out before the collection view appears, and
// how long the collection view fades out before the timeline reappears.
const COLLECTION_FADE_MS = 400;

type HomeProps = {
  onEntranceComplete?: () => void;
  highlightedContentId?: string | null;
  focusContentIdControlRef?: MutableRefObject<
    ((contentId: string) => void) | undefined
  >;
  resetViewControlRef?: MutableRefObject<(() => void) | undefined>;
  soloTimelineControlRef?: MutableRefObject<(() => void) | undefined>;
  onSoloTimelineChange?: (active: boolean) => void;
};

function Home({
  onEntranceComplete,
  highlightedContentId,
  focusContentIdControlRef,
  resetViewControlRef,
  soloTimelineControlRef,
  onSoloTimelineChange,
}: HomeProps) {
  const { pathname } = useLocation();
  const isCollectionOpen = pathname === '/collection';
  const drawerOpen =
    pathname === '/shop' ||
    pathname === '/events' ||
    pathname === '/login' ||
    isCollectionOpen;
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
  // Which collection's badge is currently expanded (showing its item list and
  // driving the canvas merge) — null when none is. Only one at a time.
  const [expandedCollectionId, setExpandedCollectionId] = useState<
    string | null
  >(null);
  // Each collection remembers its own selected item index independently.
  const [selectedItemIndexByCollection, setSelectedItemIndexByCollection] =
    useState<Record<string, number>>({});
  const [hoveredCollectionItemId, setHoveredCollectionItemId] = useState<
    string | null
  >(null);
  const [centerOnCollectionItemId, setCenterOnCollectionItemId] = useState<
    string | null
  >(null);
  useEffect(() => {
    setCenterOnCollectionItemId(null);
  }, [expandedCollectionId]);
  // Per-collection "has the viewer already collected from this one" status.
  // A collection id's absence means its status hasn't been checked yet.
  const [collectedStatus, setCollectedStatus] = useState<
    Record<string, boolean>
  >({});
  const [highlightedType] = useState<ContentType | null>(null);
  const [focusSlug, setFocusSlug] = useState<string | null>(null);
  const [collectingItemId, setCollectingItemId] = useState<string | null>(null);
  const [detailReady, setDetailReady] = useState(false);
  const [detailImageRect, setDetailImageRect] =
    useState<DetailImageRect | null>(null);
  const isolateOwnBranchRef = useRef<(() => void) | undefined>(undefined);
  const focusItemControlRef = useRef<
    ((target: FocusTarget) => void) | undefined
  >(undefined);
  const audioControlRef = useRef<((src: string) => void) | undefined>(
    undefined
  );
  const [audioState, setAudioState] = useState<AudioPlayerState | null>(null);

  const { data: contentDetail } = useContentDetail(focusSlug, timeline?.items);

  const handleContentFocus = useCallback((slug: string) => {
    setFocusSlug(slug);
    setDetailReady(false);
    setDetailImageRect(null);
  }, []);

  const handleContentUnfocus = useCallback(() => {
    setFocusSlug(null);
    setDetailReady(false);
    setDetailImageRect(null);
    setCollectingItemId(null);
  }, []);

  // Tell everyone which item this viewer is looking at, re-stamping it while
  // they stay on it, and clear it when they leave it (or the page).
  useEffect(() => {
    const report = (slug: string | null) => {
      setViewing(slug).catch(() => undefined);
    };
    report(focusSlug);
    if (!focusSlug) {
      return undefined;
    }
    const heartbeat = window.setInterval(
      () => report(focusSlug),
      VIEWING_HEARTBEAT_MS
    );
    const clear = () => report(null);
    window.addEventListener('pagehide', clear);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener('pagehide', clear);
      clear();
    };
  }, [focusSlug]);

  // Who's viewing each item right now, for the canvas's viewer dots.
  const [viewersBySlug, setViewersBySlug] = useState<Map<string, ItemViewer[]>>(
    () => new Map()
  );
  useEffect(() => subscribeToViewers(setViewersBySlug), []);
  // Someone collecting something refreshes the timelines live, and the map
  // eases into the new layout.
  useEffect(
    () =>
      subscribeToCollectionChanges(() => {
        void queryClient.invalidateQueries({
          queryKey: ['collectedTimeline'],
        });
      }),
    [queryClient]
  );

  const handleDetailLayoutStart = useCallback(() => {
    setDetailReady(true);
  }, []);

  const handleDetailImageRect = useCallback((rect: DetailImageRect) => {
    setDetailImageRect(rect);
  }, []);

  // Kept in step with signing in and out (and resetting), so the map always
  // knows whose timeline is whose — a collected item lands on the right one.
  // The collector's timeline the map is zoomed into, if any.
  const [branchFocus, setBranchFocus] = useState<BranchFocusInfo | null>(null);
  const [currentUsername, setCurrentUsername] = useState(
    () => getStoredUser()?.username ?? null
  );
  useEffect(() => {
    const sync = () => setCurrentUsername(getStoredUser()?.username ?? null);
    window.addEventListener(USER_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_CHANGED_EVENT, sync);
  }, []);
  const branchColour = getDisplayColour();

  const collectedRow =
    collectedRows?.find((row) => row.username === currentUsername) ?? null;
  const collectedContentIds = useMemo(
    () =>
      new Set((collectedRow?.items ?? []).map((entry) => entry.content._id)),
    [collectedRow]
  );

  const timelineDetail = useMemo((): TimelineDetailView | null => {
    if (!focusSlug || !detailReady || !contentDetail) {
      return null;
    }

    return {
      title: contentDetail.title,
      dateLabel: getContentDetailDateLabel(contentDetail),
      description: getContentDetailDescription(contentDetail),
      link: getContentDetailLink(contentDetail),
      newsletterContent: getContentDetailNewsletterContent(contentDetail),
      presentAsNewsletter: getContentDetailIsSingleImage(contentDetail),
      isAudio: contentDetail._type === 'audioAsset',
      imageUrls: getContentDetailImageUrls(contentDetail),
    };
  }, [contentDetail, detailReady, focusSlug]);

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

  const cancelPreviewCollectRef = useRef<(() => void) | undefined>(undefined);
  const collectFocusedPreviewRef = useRef<
    ((contentId: string) => void) | undefined
  >(undefined);
  const handlePreviewCollect = useCallback(
    (contentId: string) => {
      const currentUser = getStoredUser();
      const collectedContent = expandedCollection?.content?.find(
        (item) => item._id === contentId
      );
      if (!currentUser || !expandedCollection || !collectedContent) {
        cancelPreviewCollectRef.current?.();
        setCollectingItemId(null);
        return;
      }
      const collectionId = expandedCollection._id;
      const previousRows = queryClient.getQueryData<CollectedUserRow[]>([
        'collectedTimeline',
      ]);
      const optimisticItem: CollectedRowItem = {
        content: {
          image: null,
          ...collectedContent,
          unlockTime: null,
          expiryTime: null,
          isPrivate: false,
        } as MainTimelineItem,
        collectedAt: new Date().toISOString(),
      };
      queryClient.setQueryData<CollectedUserRow[]>(
        ['collectedTimeline'],
        (rows = []) => {
          const ownRow = rows.find((row) => row.userId === currentUser.id);
          if (ownRow) {
            return rows.map((row) =>
              row === ownRow
                ? { ...row, items: [...row.items, optimisticItem] }
                : row
            );
          }
          return [
            ...rows,
            {
              userId: currentUser.id,
              username: currentUser.username,
              colour: getDisplayColour(),
              items: [optimisticItem],
            },
          ];
        }
      );
      setCollectedStatus((prev) => ({ ...prev, [collectionId]: true }));

      const isInMainTimeline =
        timeline?.items.some((item) => item._id === contentId) ?? false;
      void collectItem(currentUser.id, contentId, collectionId)
        .then(() => {
          void queryClient.invalidateQueries({
            queryKey: ['collectedTimeline'],
          });
          void queryClient.invalidateQueries({ queryKey: ['contentDetail'] });
          if (isInMainTimeline) {
            void queryClient.invalidateQueries({ queryKey: ['mainTimeline'] });
          }
        })
        .catch((collectError) => {
          console.error('Failed to collect item', collectError);
          queryClient.setQueryData(['collectedTimeline'], previousRows);
          setCollectedStatus((prev) => ({ ...prev, [collectionId]: false }));
        });
    },
    [expandedCollection, queryClient, timeline]
  );

  // Clicking a collection badge lists that collection's item titles below it
  // — instead of opening the collection view. Only one collection can be
  // expanded at a time; clicking a different one swaps which is expanded
  // without leaving the isolated view, clicking the same one again closes it.
  const handleBranchIsolationExit = () => {
    setExpandedCollectionId(null);
  };

  const handleCollectionBadgeClick = (collectionId: string) => {
    const wasIsolating = expandedCollectionId !== null;
    const next = expandedCollectionId === collectionId ? null : collectionId;
    setExpandedCollectionId(next);
    if (wasIsolating !== (next !== null)) {
      isolateOwnBranchRef.current?.();
    }
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
    // (Rechecked when someone signs in or out, as well.)
  }, [collections, currentUsername]);

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
        }${drawerOpen ? ' home__canvas-layer--drawer-open' : ''}`}
      >
        <TimelineCanvas
          items={timeline.items}
          collectedRows={collectedRows}
          previewItems={expandedCollection?.content ?? undefined}
          previewColour={getDisplayColour()}
          highlightedPreviewContentId={highlightedCollectionItemId}
          centerOnPreviewContentId={centerOnCollectionItemId}
          onPreviewItemHover={setHoveredCollectionItemId}
          onPreviewCollectStart={setCollectingItemId}
          onPreviewCollect={handlePreviewCollect}
          cancelPreviewCollectControlRef={cancelPreviewCollectRef}
          collectFocusedPreviewControlRef={collectFocusedPreviewRef}
          highlightedMainContentId={highlightedContentId}
          focusContentIdControlRef={focusContentIdControlRef}
          resetViewControlRef={resetViewControlRef}
          soloTimelineControlRef={soloTimelineControlRef}
          onSoloTimelineChange={onSoloTimelineChange}
          onBranchFocusChange={setBranchFocus}
          isCollectionView={isCollectionOpen}
          colour={timeline.colour}
          currentUsername={currentUsername}
          highlightedType={highlightedType}
          hoverOwnBranch={isCollectionOpen}
          isolateControlRef={isolateOwnBranchRef}
          focusItemControlRef={focusItemControlRef}
          audioControlRef={audioControlRef}
          onAudioStateChange={setAudioState}
          viewersBySlug={viewersBySlug}
          onContentFocus={handleContentFocus}
          onContentUnfocus={handleContentUnfocus}
          onDetailLayoutStart={handleDetailLayoutStart}
          onDetailImageRect={handleDetailImageRect}
          onEntranceComplete={onEntranceComplete}
          onBranchIsolationExit={handleBranchIsolationExit}
        />
        <TimelineDetailOverlay
          detail={timelineDetail}
          imageRect={detailImageRect}
          fading={collectingItemId !== null}
        />
        <div
          className={`top-right-stack${
            drawerOpen ? ' top-right-stack--drawer-open' : ''
          }`}
        >
          {/* The timeline clicked into on the map, with a way back out. */}
          {branchFocus && (
            <div className="branch-focus-card">
              <span className="branch-focus-card__label">
                You are viewing{' '}
                <span
                  className="branch-focus-card__name"
                  style={
                    {
                      '--branch-colour': branchFocus.colour,
                    } as React.CSSProperties
                  }
                >
                  {branchFocus.username}
                </span>
                &rsquo;s timeline&hellip;
              </span>
              <button
                type="button"
                className="branch-focus-card__cancel"
                onClick={() => resetViewControlRef?.current?.()}
              >
                Cancel
              </button>
            </div>
          )}
          {audioState && (
            <MediaPlayer
              state={audioState}
              onToggle={() => audioControlRef.current?.(audioState.src)}
              onJumpToItem={() =>
                focusItemControlRef.current?.(audioState.focusTarget)
              }
            />
          )}
          {/* The collections, scrolling once they run past the screen;
              hidden while an item is being viewed. */}
          <div
            className={`collection-card-list${
              focusSlug !== null ? ' collection-card-list--hidden' : ''
            }`}
          >
            {!canvasHidden &&
              (collections ?? [])
                .filter(
                  (collection) => collectedStatus[collection._id] === false
                )
                .map((collection) => (
                  <div
                    className={`collection-card-stack${
                      collectingItemId !== null
                        ? ' collection-card-stack--hidden collection-card-stack--collecting'
                        : ''
                    }`}
                    key={collection._id}
                  >
                    <CollectionCountdown
                      collection={collection}
                      open={expandedCollectionId === collection._id}
                      onClick={() => handleCollectionBadgeClick(collection._id)}
                    >
                      <div
                        className={`collection-card-panel${
                          expandedCollectionId === collection._id
                            ? ' collection-card-panel--visible'
                            : ''
                        }`}
                      >
                        <div
                          className="collection-card-titles"
                          style={
                            {
                              '--collection-title-colour': branchColour,
                            } as React.CSSProperties
                          }
                        >
                          {(collection.content ?? []).map((item, index) => {
                            const isFocused =
                              focusSlug !== null && item.slug === focusSlug;
                            const isCollected = collectedContentIds.has(
                              item._id
                            );
                            const kind = getContentTypeKicker(item._type);
                            const description =
                              item._type === 'newsletter'
                                ? null
                                : item.description;
                            return (
                              <button
                                key={item._id}
                                type="button"
                                className={`collection-card-title${
                                  isFocused
                                    ? ' collection-card-title--active'
                                    : ''
                                }${
                                  isCollected
                                    ? ' collection-card-title--collected'
                                    : ''
                                }`}
                                style={
                                  {
                                    '--title-index': index,
                                  } as React.CSSProperties
                                }
                                // One already collected can't be hovered or
                                // clicked; the rest are collected on a click.
                                disabled={isCollected}
                                onClick={() => {
                                  setSelectedItemIndexByCollection((prev) => ({
                                    ...prev,
                                    [collection._id]: index,
                                  }));
                                  collectFocusedPreviewRef.current?.(item._id);
                                }}
                                onMouseEnter={() => {
                                  setHoveredCollectionItemId(item._id);
                                  setCenterOnCollectionItemId(item._id);
                                }}
                                onMouseLeave={() => {
                                  setHoveredCollectionItemId((current) =>
                                    current === item._id ? null : current
                                  );
                                  setCenterOnCollectionItemId((current) =>
                                    current === item._id ? null : current
                                  );
                                }}
                              >
                                <span className="collection-card-title__thumb">
                                  {item.imageUrl ? (
                                    <img src={item.imageUrl} alt="" />
                                  ) : (
                                    <ContentTypeIcon
                                      type={item._type}
                                      className="collection-card-title__icon"
                                    />
                                  )}
                                  {!isCollected && (
                                    <span
                                      className="collection-card-title__plus"
                                      aria-hidden="true"
                                    >
                                      +
                                    </span>
                                  )}
                                </span>
                                {isCollected && (
                                  <span
                                    className="collection-card-title__collected"
                                    style={
                                      {
                                        '--collected-tilt': `${panelTagTilt(
                                          item._id,
                                          ALREADY_COLLECTED_MAX_TILT_DEG,
                                          ALREADY_COLLECTED_MIN_TILT_DEG
                                        )}deg`,
                                      } as React.CSSProperties
                                    }
                                  >
                                    Already
                                    <br />
                                    collected
                                  </span>
                                )}
                                <span className="collection-card-title__body">
                                  <span className="collection-card-title__text">
                                    {item.title}
                                  </span>
                                  {kind && (
                                    <span className="collection-card-title__kind">
                                      {kind}
                                    </span>
                                  )}
                                  {description && (
                                    <span className="collection-card-title__description">
                                      {description}
                                    </span>
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </CollectionCountdown>
                  </div>
                ))}
          </div>
        </div>
      </div>
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
