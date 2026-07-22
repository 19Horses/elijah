import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CollectedBranchStrip from '../components/CollectedBranchStrip';
import CollectionCountdown from '../components/CollectionCountdown';
import CollectionViewer from '../components/CollectionViewer';
import TimelineCanvas from '../components/timelineCanvas';
import type { DetailImageRect } from '../components/timelineCanvas/types';
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
import type { ContentType } from '../types/content';

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
      isFuture: contentDetail.date
        ? new Date(contentDetail.date).getTime() > Date.now()
        : false,
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
}

export default Home;
