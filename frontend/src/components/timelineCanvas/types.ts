import type { MutableRefObject, RefObject } from 'react';
import type { MainTimelineItem } from '../../queries/mainTimeline';
import type { ContentType } from '../../types/content';
import type { CollectedUserRow } from '../../queries/collectedContent';
import type { AudioController } from './sketch/audioController';

export type TimelineCanvasProps = {
  items: MainTimelineItem[];
  collectedRows?: CollectedUserRow[];
  colour?: string | null;
  currentUsername?: string | null;
  highlightedType?: ContentType | null;
  onFocusFadeChange?: (fade: number) => void;
  onContentFocus?: (slug: string) => void;
  onContentUnfocus?: () => void;
  onDetailLayoutStart?: () => void;
  onDetailImageRect?: (rect: DetailImageRect) => void;
};

export type DetailImageRect = {
  left: number;
  top: number;
  width: number;
  height: number;
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
  audioUrl: string | null;
  galleryUrls: string[];
};

export type ProcessedItem = {
  imageUrl: string | null;
  slug: string | null;
  dateLabel: string;
  contentType: ContentType;
  title: string;
  bodyContent: string | null;
  aspectRatio: number;
  audioUrl: string | null;
  galleryUrls: string[];
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
  snapping: boolean;
  snapTargetCameraX: number;
  snapTargetCameraY: number;
  lastWheelMs: number;
  snapStepReadyMs: number;
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
  // Eased strength (0-1) of fading other branches to grey, and the row kept
  // at full colour while it fades.
  branchDimStrength: number;
  branchDimRow: number | null;
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
  onDetailImageRectRef: RefObject<
    ((rect: DetailImageRect) => void) | undefined
  >;
};

export type TimelineSketchDeps = {
  runtime: TimelineRuntime;
  items: MainTimelineItem[];
  processed: ProcessedItem[];
  processedCollected: ProcessedCollected[];
  itemOffsets: ItemOffset[];
  collectedOffsets: ItemOffset[];
  backgroundColour: string;
  // Username of the logged-in viewer, used to trace their own branch.
  currentUsername: string | null;
  audio: AudioController;
  refs: TimelineSketchRefs;
};

export type DrawRect = Pick<ContentBounds, 'left' | 'top' | 'width' | 'height'>;
