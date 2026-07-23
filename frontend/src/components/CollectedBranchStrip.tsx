import type { CollectedRowItem } from '../queries/collectedContent';

export type BranchStripPreviewItem = {
  id: string;
  title: string;
  imageUrl: string | null;
  date: string | null;
};

type CollectedBranchStripProps = {
  items: CollectedRowItem[];
  colour: string;
  // A not-yet-collected item to preview in its by-date position, so the user
  // can see where it'll land before actually collecting it.
  previewItem?: BranchStripPreviewItem | null;
};

type StripEntry = {
  id: string;
  title: string;
  imageUrl: string | null;
  dateValue: number;
  isPreview: boolean;
};

const dateValueOf = (date: string | null): number =>
  date ? new Date(date).getTime() : Number.POSITIVE_INFINITY;

function CollectedBranchStrip({
  items,
  colour,
  previewItem,
}: CollectedBranchStripProps) {
  const style = { '--branch-colour': colour } as React.CSSProperties;

  const entries: StripEntry[] = items.map(({ content }) => ({
    id: content._id,
    title: content.title,
    imageUrl: content.imageUrl,
    dateValue: dateValueOf(content.date),
    isPreview: false,
  }));

  if (previewItem) {
    entries.push({
      id: previewItem.id,
      title: previewItem.title,
      imageUrl: previewItem.imageUrl,
      dateValue: dateValueOf(previewItem.date),
      isPreview: true,
    });
  }

  entries.sort((a, b) => a.dateValue - b.dateValue);

  if (entries.length === 0) {
    return (
      <div
        className="collected-branch-strip collected-branch-strip--empty"
        style={style}
      />
    );
  }

  return (
    <div className="collected-branch-strip" style={style}>
      {entries.map((entry, index) => {
        // The link into a preview node, or out of one, is drawn dashed —
        // marking it as "not collected yet" rather than an established link.
        const dashedConnector = entry.isPreview || entries[index - 1]?.isPreview;
        return (
          <div
            className={`collected-branch-strip__node${
              entry.isPreview ? ' collected-branch-strip__node--preview' : ''
            }${dashedConnector ? ' collected-branch-strip__node--dashed-connector' : ''}`}
            key={entry.id}
            style={{ '--node-index': index } as React.CSSProperties}
          >
            <span className="collected-branch-strip__dot collected-branch-strip__dot--left">
              <span className="collected-branch-strip__dot-inner" />
            </span>
            <span className="collected-branch-strip__dot collected-branch-strip__dot--right">
              <span className="collected-branch-strip__dot-inner" />
            </span>
            <div className="collected-branch-strip__thumb">
              {entry.imageUrl ? (
                <img src={entry.imageUrl} alt={entry.title} />
              ) : (
                <span className="collected-branch-strip__thumb-fallback">
                  {entry.title}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CollectedBranchStrip;
