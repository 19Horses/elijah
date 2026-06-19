import { CONTENT_TYPES } from '../constants/contentTypes';
import type { ContentType } from '../types/content';

type ContentLegendProps = {
  highlightedType: ContentType | null;
  onHighlight: (type: ContentType | null) => void;
  chromeOpacity?: number;
};

function ContentLegend({
  highlightedType,
  onHighlight,
  chromeOpacity = 1,
}: ContentLegendProps) {
  return (
    <div
      className="content-legend"
      style={{
        opacity: chromeOpacity,
        pointerEvents: chromeOpacity < 0.5 ? 'none' : undefined,
      }}
      onMouseLeave={() => onHighlight(null)}
    >
      <p className="content-legend__title">Content</p>
      <ul className="content-legend__list">
        {CONTENT_TYPES.map((entry) => (
          <li key={entry.type}>
            <button
              type="button"
              className={`content-legend__item${
                highlightedType === entry.type
                  ? ' content-legend__item--active'
                  : ''
              }`}
              onMouseEnter={() => onHighlight(entry.type)}
              onFocus={() => onHighlight(entry.type)}
              onBlur={() => onHighlight(null)}
            >
              <span
                className="content-legend__swatch"
                style={{ backgroundColor: entry.colour }}
                aria-hidden="true"
              />
              <span className="content-legend__label">{entry.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ContentLegend;
