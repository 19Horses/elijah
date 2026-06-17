import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import CollectionCountdown from '../components/CollectionCountdown';
import CollectionViewer from '../components/CollectionViewer';
import TimelineCanvas from '../components/TimelineCanvas';
import UserCard from '../components/UserCard';
import { useCollectedTimeline } from '../queries/collectedContent';
import { useCollections } from '../queries/collection';
import { useMainTimeline } from '../queries/mainTimeline';
import { hasCollectedFrom } from '../services/collectItem';
import { getStoredUser } from '../services/userStorage';

function Home() {
  const queryClient = useQueryClient();
  const { data: timeline, isLoading, error } = useMainTimeline();
  const { data: collections } = useCollections();
  const { data: collectedItems, isLoading: isCollectedLoading } =
    useCollectedTimeline();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [alreadyCollected, setAlreadyCollected] = useState(false);
  const [statusChecked, setStatusChecked] = useState(false);
  const [collectedSignal, setCollectedSignal] = useState(0);

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
        collectedItems={collectedItems}
        colour={timeline.colour}
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
      <UserCard refreshSignal={collectedSignal} />
    </section>
  );
}

export default Home;
