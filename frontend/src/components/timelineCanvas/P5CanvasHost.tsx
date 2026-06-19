import { memo, type RefObject } from 'react';

const P5CanvasHost = memo(function P5CanvasHost({
  containerRef,
}: {
  containerRef: RefObject<HTMLDivElement>;
}) {
  return <div className="timeline-canvas" ref={containerRef} />;
});

export default P5CanvasHost;
