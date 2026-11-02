import type { ReactNode } from 'react';
import type {
  RichTextBlock,
  RichTextSpan,
  RichTextValue,
} from '../utils/richText';

// The styling each formatting mark applies.
function renderSpan(
  span: RichTextSpan,
  markDefs: RichTextBlock['markDefs'],
  key: string
): ReactNode {
  let node: ReactNode = span.text;
  (span.marks ?? []).forEach((mark) => {
    if (mark === 'strong') {
      node = <strong>{node}</strong>;
    } else if (mark === 'em') {
      node = <em>{node}</em>;
    } else if (mark === 'underline') {
      node = <u>{node}</u>;
    } else if (mark === 'strike-through') {
      node = <s>{node}</s>;
    } else {
      const link = markDefs?.find((def) => def._key === mark);
      if (link?._type === 'link' && link.href) {
        node = (
          <a
            className="rich-text__link"
            href={link.href}
            rel="noopener noreferrer"
            target="_blank"
          >
            {node}
          </a>
        );
      }
    }
  });
  return <span key={key}>{node}</span>;
}

function renderLine(block: RichTextBlock): ReactNode {
  return (block.children ?? []).map((span, k) =>
    renderSpan(span, block.markDefs, span._key ?? String(k))
  );
}

// Formatted text from Sanity, or plain text as it's always been shown.
// Paragraphs and list items are block-level spans, so it fits inside any
// text element (a paragraph or a span) without nesting blocks in it.
function RichText({ value }: { value: RichTextValue }) {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return <>{value}</>;
  }
  const out: ReactNode[] = [];
  let list: { kind: 'bullet' | 'number'; items: ReactNode[] } | null = null;
  const flushList = () => {
    if (list) {
      out.push(
        <span
          key={`list-${out.length}`}
          className={`rich-text__list rich-text__list--${list.kind}`}
        >
          {list.items}
        </span>
      );
      list = null;
    }
  };
  value.forEach((block, k) => {
    if (block._type !== 'block') {
      return;
    }
    const key = block._key ?? String(k);
    if (block.listItem) {
      if (!list || list.kind !== block.listItem) {
        flushList();
        list = { kind: block.listItem, items: [] };
      }
      list.items.push(
        <span key={key} className="rich-text__item">
          {renderLine(block)}
        </span>
      );
      return;
    }
    flushList();
    out.push(
      <span key={key} className="rich-text__paragraph">
        {renderLine(block)}
      </span>
    );
  });
  flushList();
  return <>{out}</>;
}

export default RichText;
