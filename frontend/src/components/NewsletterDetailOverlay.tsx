export type NewsletterDetailView = {
  title: string;
  content: string;
  titleOpacity: number;
};

type NewsletterDetailOverlayProps = {
  detail: NewsletterDetailView | null;
};

function NewsletterDetailOverlay({ detail }: NewsletterDetailOverlayProps) {
  if (!detail || detail.titleOpacity <= 0.01) {
    return null;
  }

  return (
    <aside className="newsletter-detail" aria-label={detail.title}>
      <h2
        className="newsletter-detail__title"
        style={{ opacity: detail.titleOpacity }}
      >
        {detail.title}
      </h2>
      <div className="newsletter-detail__body">{detail.content}</div>
    </aside>
  );
}

export default NewsletterDetailOverlay;
