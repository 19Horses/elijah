import type { MutableRefObject, RefObject } from 'react';
import type { MainTimelineItem } from '../../queries/mainTimeline';
import type { ContentType } from '../../types/content';
import type { CollectedUserRow } from '../../queries/collectedContent';

export type TimelineCanvasProps = {
  items: MainTimelineItem[];
  collectedRows?: CollectedUserRow[];
  colour?: string | null;
  highlightedType?: ContentType | null;
  onFocusFadeChange?: (fade: number) => void;
  onContentFocus?: (slug: string) => void;
  onContentUnfocus?: () => void;
  onDetailLayoutStart?: () => void;
};

export type CollectedSource = {
  rowIndex: number;
  colour: string;
  username: string;
};

export type ProcessedCollected = {
  contentId: string;
  slug: string | null;
  imageUrl: string | null;
  dateLabel: string;
  contentType: ContentType;
  title: string;
  bodyContent: string | null;
  aspectRatio: number;
  anchorTime: number;
  rowIndex: number;
  sources: CollectedSource[];
};

export type ProcessedItem = {
  imageUrl: string | null;
  slug: string | null;
  dateLabel: string;
  contentType: ContentType;
  title: string;
  bodyContent: string | null;
  aspectRatio: number;
};

export type ItemOffset = {
  dx: number;
  dy: number;
};

export type ContentBounds = {
  left: number;
  right: number;
  centerY: number;
  top: number;
  width: number;
  height: number;
  dateBottom: number;
};

export type ConnectorPoint = {
  x: number;
  y: number;
};

export type FocusTarget = {
  lane: 'main' | 'collected';
  index: number;
};

export type DetailPhase = 'none' | 'layout' | 'complete';

export type DragLane = 'main' | 'collected' | 'canvas' | 'focus' | null;

export type TimelineRuntime = {
  dragLane: DragLane;
  dragIndex: number;
  dragPointerOffsetX: number;
  dragPointerOffsetY: number;
  pressX: number;
  pressY: number;
  cameraX: number;
  cameraY: number;
  zoom: number;
  targetCameraX: number;
  targetCameraY: number;
  targetZoom: number;
  focusTarget: FocusTarget | null;
  viewAnimating: boolean;
  viewUnfocusing: boolean;
  fitZoomLevel: number;
  animationWorldX: number;
  animationWorldY: number;
  animationStartScreenX: number;
  animationStartScreenY: number;
  animationStartZoom: number;
  activeHighlightType: ContentType | null;
  highlightStrength: number;
  loadStartMs: number;
  focusContentFade: number;
  detailPhase: DetailPhase;
  detailLayout: number;
};

export type TimelineSketchRefs = {
  highlightedTypeRef: RefObject<ContentType | null>;
  interactionLockedRef: MutableRefObject<boolean>;
  onFocusFadeChangeRef: RefObject<((fade: number) => void) | undefined>;
  onContentFocusRef: RefObject<((slug: string) => void) | undefined>;
  onContentUnfocusRef: RefObject<(() => void) | undefined>;
  onDetailLayoutStartRef: RefObject<(() => void) | undefined>;
};

export type TimelineSketchDeps = {
  runtime: TimelineRuntime;
  items: MainTimelineItem[];
  processed: ProcessedItem[];
  processedCollected: ProcessedCollected[];
  itemOffsets: ItemOffset[];
  collectedOffsets: ItemOffset[];
  backgroundColour: string;
  refs: TimelineSketchRefs;
};

export type DrawRect = Pick<ContentBounds, 'left' | 'top' | 'width' | 'height'>;
