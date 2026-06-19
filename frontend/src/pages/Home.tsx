import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CollectionCountdown from '../components/CollectionCountdown';
import CollectionViewer from '../components/CollectionViewer';
import ContentLegend from '../components/ContentLegend';
import TimelineCanvas from '../components/timelineCanvas';
import TimelineDetailOverlay, {
  type TimelineDetailView,
} from '../components/TimelineDetailOverlay';
import UserCard from '../components/UserCard';
import {
  getContentDetailDateLabel,
  getContentDetailDescription,
  useContentDetail,
} from '../queries/contentDetail';
import { useCollectedTimeline } from '../queries/collectedContent';
import { useCollections } from '../queries/collection';
import { useMainTimeline } from '../queries/mainTimeline';
import { hasCollectedFrom } from '../services/collectItem';
import { getStoredUser } from '../services/userStorage';
import type { ContentType } from '../types/content';

function Home() {
  const queryClient = useQueryClient();
  const { data: timeline, isLoading, error } = useMainTimeline();
  const { data: collections } = useCollections();
  const { data: collectedRows, isLoading: isCollectedLoading } =
    useCollectedTimeline();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [alreadyCollected, setAlreadyCollected] = useState(false);
  const [statusChecked, setStatusChecked] = useState(false);
  const [collectedSignal, setCollectedSignal] = useState(0);
  const [highlightedType, setHighlightedType] = useState<ContentType | null>(
    null
  );
  const [focusSlug, setFocusSlug] = useState<string | null>(null);
  const [detailReady, setDetailReady] = useState(false);
  const userCardWrapRef = useRef<HTMLDivElement>(null);
  const legendWrapRef = useRef<HTMLDivElement>(null);

  const { data: contentDetail } = useContentDetail(focusSlug);

  const handleFocusFadeChange = useCallback((fade: number) => {
    const opacity = 1 - fade;
    const pointerEvents = opacity < 0.5 ? 'none' : 'auto';
    for (const ref of [userCardWrapRef, legendWrapRef]) {
      if (ref.current) {
        ref.current.style.opacity = String(opacity);
        ref.current.style.pointerEvents = pointerEvents;
      }
    }
  }, []);

  const handleContentFocus = useCallback((slug: string) => {
    setFocusSlug(slug);
    setDetailReady(false);
  }, []);

  const handleContentUnfocus = useCallback(() => {
    setFocusSlug(null);
    setDetailReady(false);
  }, []);

  const handleDetailLayoutStart = useCallback(() => {
    setDetailReady(true);
  }, []);

  const timelineDetail = useMemo((): TimelineDetailView | null => {
    if (!focusSlug || !detailReady || !contentDetail) {
      return null;
    }

    return {
      title: contentDetail.title,
      dateLabel: getContentDetailDateLabel(contentDetail),
      description: getContentDetailDescription(contentDetail),
    };
  }, [contentDetail, detailReady, focusSlug]);

  const activeCollection = collections?.[0] ?? null;

  const handleCollected = () => {
    setAlreadyCollected(true);
    setCollectedSignal((signal) => signal + 1);
    void queryClient.invalidateQueries({ queryKey: ['collectedTimeline'] });
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
      <TimelineCanvas
        items={timeline.items}
        collectedRows={collectedRows}
        colour={timeline.colour}
        highlightedType={highlightedType}
        onFocusFadeChange={handleFocusFadeChange}
        onContentFocus={handleContentFocus}
        onContentUnfocus={handleContentUnfocus}
        onDetailLayoutStart={handleDetailLayoutStart}
      />
      <TimelineDetailOverlay detail={timelineDetail} />
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
        <UserCard refreshSignal={collectedSignal} />
      </div>
      <div ref={legendWrapRef}>
        <ContentLegend
          highlightedType={highlightedType}
          onHighlight={setHighlightedType}
        />
      </div>
    </section>
  );
}

export default Home;
