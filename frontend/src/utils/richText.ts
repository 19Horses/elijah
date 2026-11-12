// Text from Sanity that may be formatted: Portable Text blocks (bold, italic,
// underline, strikethrough, links, lists), or plain text not yet converted.
export type RichTextSpan = {
  _type: 'span';
  _key?: string;
  text: string;
  marks?: string[];
};

export type RichTextBlock = {
  _type: 'block';
  _key?: string;
  style?: string;
  listItem?: 'bullet' | 'number';
  level?: number;
  children?: RichTextSpan[];
  markDefs?: { _key: string; _type: string; href?: string }[];
};

export type RichTextValue = string | RichTextBlock[] | null | undefined;

// Its words alone, paragraphs separated by blank lines.
export function toPlainText(value: RichTextValue): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return value
    .filter((block) => block._type === 'block')
    .map((block) => (block.children ?? []).map((span) => span.text).join(''))
    .join('\n\n');
}

// Whether there's any text in it at all.
export function hasRichText(value: RichTextValue): boolean {
  return toPlainText(value).trim().length > 0;
}
