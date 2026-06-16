import { useEffect, useRef, useState } from 'react';
import type { Collection } from '../queries/collection';
import type { CollectionContent } from '../types/content';

type CollectionViewerProps = {
  collection: Collection;
  onClose: () => void;
};

function CollectionItem({
  item,
  isActive,
  onSelect,
  animIndex,
}: {
  item: CollectionContent;
  isActive: boolean;
  onSelect: () => void;
  animIndex: number;
}) {
  return (
    <div
      className="collection-viewer__slot"
      style={{ '--anim-index': animIndex } as React.CSSProperties}
    >
      <div
        className={`collection-viewer__item${isActive ? ' collection-viewer__item--active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!isActive) onSelect();
        }}
        onKeyDown={(e) => {
          if (!isActive && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onSelect();
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        role="button"
        tabIndex={isActive ? -1 : 0}
      >
        <div
          className={`collection-viewer__meta${isActive ? ' collection-viewer__meta--visible' : ''}`}
          aria-hidden={!isActive}
        >
          <div className="collection-viewer__heading">
            <span className="collection-viewer__plus" aria-hidden="true">
              +
            </span>
            <p className="collection-viewer__title">{item.title}</p>
          </div>
          {'description' in item && item.description && (
            <p className="collection-viewer__description">{item.description}</p>
          )}
          {'content' in item && item.content && (
            <p className="collection-viewer__description">{item.content}</p>
          )}
        </div>
        <div className="collection-viewer__media">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.title}
              className="collection-viewer__image"
              draggable={false}
            />
          ) : (
            <div className="collection-viewer__placeholder">
              <span>{item.title}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CollectionViewer({ collection, onClose }: CollectionViewerProps) {
  const items = collection.content ?? [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t1 = window.setTimeout(() => setOverlayVisible(true), 0);
    const t2 = window.setTimeout(() => setContentVisible(true), 200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  return (
    <div
      ref={overlayRef}
      className={`collection-viewer__overlay${overlayVisible ? ' collection-viewer__overlay--visible' : ''}`}
      onClick={handleOverlayClick}
      onMouseDown={(e) => e.stopPropagation()}
      role="presentation"
    >
      {items.length === 0 ? (
        <p className="collection-viewer__empty">No content yet.</p>
      ) : (
        <div
          className={`collection-viewer__stage${contentVisible ? ' collection-viewer__stage--visible' : ''}`}
        >
          <div
            className="collection-viewer__track"
            style={{
              transform: `translateX(calc(-1 * (${activeIndex} + 0.5) * var(--cv-slot)))`,
            }}
          >
            {items.map((item, index) => (
              <CollectionItem
                key={item._id}
                item={item}
                isActive={index === activeIndex}
                onSelect={() => setActiveIndex(index)}
                animIndex={index}
              />
            ))}
          </div>

          <button
            type="button"
            className="collection-viewer__close"
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label="Close collection"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default CollectionViewer;
