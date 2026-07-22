import type { CollectedRowItem } from '../queries/collectedContent';

type CollectedBranchStripProps = {
  items: CollectedRowItem[];
  colour: string;
};

function CollectedBranchStrip({ items, colour }: CollectedBranchStripProps) {
  const style = { '--branch-colour': colour } as React.CSSProperties;

  if (items.length === 0) {
    return (
      <div
        className="collected-branch-strip collected-branch-strip--empty"
        style={style}
      />
    );
  }

  return (
    <div className="collected-branch-strip" style={style}>
      <div className="collected-branch-strip__line" />
      {items.map(({ content }) => (
        <div className="collected-branch-strip__node" key={content._id}>
          <span className="collected-branch-strip__dot" />
          <div className="collected-branch-strip__thumb">
            {content.imageUrl ? (
              <img src={content.imageUrl} alt={content.title} />
            ) : (
              <span className="collected-branch-strip__thumb-fallback">
                {content.title}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default CollectedBranchStrip;
