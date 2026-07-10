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

// Which collector's timeline the view is currently zoomed into, for the
// top-bar label. Null when not zoomed into any branch.
export type BranchFocusInfo = {
  username: string;
  colour: string;
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

// A hoverable connector dot registered while drawing. Used, when an item is
// focused, to label the node with the timeline it belongs to and the item it
// connects to at the far end of its line.
export type NodeHoverRegion = {
  // World position of the dot.
  x: number;
  y: number;
  // Title of the item at the opposite end of this node's connector.
  title: string;
  // Timeline the node belongs to (a collector's username, or the main line).
  timeline: string;
  colour: string;
  // The item at the opposite end — focused when the node is clicked.
  target: FocusTarget;
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
  // Collector row the view is zoomed into via a branch click, or null.
  focusedBranchRow: number | null;
  viewAnimating: boolean;
  viewUnfocusing: boolean;
  fitZoomLevel: number;
  animationWorldX: number;
  animationWorldY: number;
  animationStartScreenX: number;
  animationStartScreenY: number;
  animationStartCameraX: number;
  animationStartCameraY: number;
  animationStartZoom: number;
  activeHighlightType: ContentType | null;
  highlightStrength: number;
  // Eased strength (0-1) of fading other branches to grey, and the row kept
  // at full colour while it fades.
  branchDimStrength: number;
  branchDimRow: number | null;
  loadStartMs: number;
  focusContentFade: number;
  // Whether the currently/last focused item is dated after today, so the detail
  // view can invert to a white background. Retained through the unfocus fade.
  focusedItemIsFuture: boolean;
  detailPhase: DetailPhase;
  detailLayout: number;
  // Accumulated rotation (radians) of the focused audio track's CD. Only
  // advances while that track is playing, so it holds still when paused.
  audioDiscAngle: number;
  // Connector dots drawn on the most recent frame while an item is focused, so
  // the input handler can hit-test them for hover labels and click-to-focus.
  nodeRegions: NodeHoverRegion[];
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
  // Sketch → React: reports which branch timeline is zoomed into (or null).
  onBranchFocusRef: RefObject<
    ((info: BranchFocusInfo | null) => void) | undefined
  >;
  // React → sketch: cancel button calls this to animate back to default fit.
  resetViewRef: MutableRefObject<(() => void) | undefined>;
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
