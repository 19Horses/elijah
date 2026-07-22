import { formatMainTimelineDate } from '../queries/mainTimeline';
import { usePastEvents } from '../queries/events';

function Events() {
  const { data, isLoading, isError } = usePastEvents();
  const events = (data ?? []).filter((event) => !event.isPrivate);

  return (
    <section className="events">
      {isLoading && <p className="events__status">Loading events...</p>}
      {!isLoading && isError && (
        <p className="events__status">
          Could not load events. Please try again later.
        </p>
      )}
      {!isLoading && !isError && events.length === 0 && (
        <p className="events__status">No past events yet.</p>
      )}
      {!isLoading && !isError && events.length > 0 && (
        <ul className="events__list">
          {events.map((event) => (
            <li key={event._id} className="events__row">
              <p className="events__date">
                {formatMainTimelineDate(event.date)}
              </p>
              <div className="events__title">
                {event.link ? (
                  <a
                    className="events__link"
                    href={event.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {event.title}
                  </a>
                ) : (
                  event.title
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default Events;
