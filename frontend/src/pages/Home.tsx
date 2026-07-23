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
  const [alreadyCollected, setAlreadyCollected] = useState(false);
  const [statusChecked, setStatusChecked] = useState(false);
  const [collectedSignal, setCollectedSignal] = useState(0);
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

  const activeCollection = collections?.[0] ?? null;

  const handleCollected = () => {
    setAlreadyCollected(true);
    setCollectedSignal((signal) => signal + 1);
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

  useEffect(() => {
    const currentUser = getStoredUser();
    if (!currentUser || !activeCollection) {
      setAlreadyCollected(false);
      setStatusChecked(true);
      return;
    }

    let cancelled = false;
    setStatusChecked(false);
    void hasCollectedFrom(currentUser.id, activeCollection._id)
      .then((collected) => {
        if (!cancelled) setAlreadyCollected(collected);
      })
      .catch((error) => {
        console.error('Failed to check collection status', error);
        if (!cancelled) setAlreadyCollected(false);
      })
      .finally(() => {
        if (!cancelled) setStatusChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCollection]);

  // Resetting a collection timer via the debug panel should bring the
  // countdown back even if it was already collected/dismissed.
  useEffect(() => {
    const onDebugChange = () => {
      setAlreadyCollected(false);
      setStatusChecked(true);
    };
    window.addEventListener(DEBUG_TIMERS_EVENT, onDebugChange);
    return () => window.removeEventListener(DEBUG_TIMERS_EVENT, onDebugChange);
  }, []);

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
          canvasHidden ? ' home__canvas-layer--hidden' : ''
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
              refreshSignal={collectedSignal}
              onActivate={() => isolateOwnBranchRef.current?.()}
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
        </div>
      </div>
      {statusChecked &&
        activeCollection &&
        !alreadyCollected &&
        !canvasHidden && (
          <CollectionCountdown
            collection={activeCollection}
            onClick={openCollectionView}
          />
        )}
      {viewerOpen && activeCollection && (
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
            collection={activeCollection}
            onClose={closeCollectionView}
            onCollected={handleCollected}
            onFocusItemChange={handleFocusItemChange}
          />
        </div>
      )}
    </section>
  );
}

export default Home;
