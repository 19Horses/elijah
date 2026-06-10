import TimelineCanvas from '../components/TimelineCanvas';
import { useCollections } from '../queries/collection';
import { useMainTimeline } from '../queries/mainTimeline';

function Home() {
  const { data: timeline, isLoading, error } = useMainTimeline();
  useCollections();

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
    </section>
  );
}

export default Home;
