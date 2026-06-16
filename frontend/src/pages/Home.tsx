import { useState } from 'react';
import CollectionCountdown from '../components/CollectionCountdown';
import CollectionViewer from '../components/CollectionViewer';
import TimelineCanvas from '../components/TimelineCanvas';
import { useCollections } from '../queries/collection';
import { useMainTimeline } from '../queries/mainTimeline';

function Home() {
  const { data: timeline, isLoading, error } = useMainTimeline();
  const { data: collections } = useCollections();
  const [viewerOpen, setViewerOpen] = useState(false);

  const activeCollection = collections?.[0] ?? null;

  if (isLoading) {
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
      <TimelineCanvas items={timeline.items} colour={timeline.colour} />
      {activeCollection && (
        <CollectionCountdown
          collection={activeCollection}
          onClick={() => setViewerOpen(true)}
        />
      )}
      {viewerOpen && activeCollection && (
        <CollectionViewer
          collection={activeCollection}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </section>
  );
}

export default Home;
