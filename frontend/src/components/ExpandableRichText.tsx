import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';

type ExpandableRichTextProps = {
  children: ReactNode;
  className?: string;
  // Applied to the clamped body (holds the rich text).
  bodyClassName?: string;
  // Applied to the Show more / Show less control.
  toggleClassName?: string;
};

// Clamps long rich text with an ellipsis, offering Show more / Show less
// when the content actually overflows the collapsed height.
function ExpandableRichText({
  children,
  className,
  bodyClassName,
  toggleClassName,
}: ExpandableRichTextProps) {
  const bodyRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    if (expanded) {
      return;
    }
    setOverflows(body.scrollHeight > body.clientHeight + 1);
  }, [children, expanded]);

  const toggle = (event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setExpanded((current) => !current);
  };

  const rootClass = [
    className,
    expanded && className ? `${className}--expanded` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={rootClass || undefined}>
      <span ref={bodyRef} className={bodyClassName}>
        {children}
      </span>
      {(overflows || expanded) && (
        <span
          className={toggleClassName}
          role="button"
          tabIndex={0}
          onClick={toggle}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              toggle(event);
            }
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </span>
      )}
    </span>
  );
}

export default ExpandableRichText;
