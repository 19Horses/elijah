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
  // When true (e.g. the user card is hovered), the view highlights the logged-in
  // viewer's own branch as though it were hovered on the canvas.
  hoverOwnBranch?: boolean;
  // Populated by the canvas with a toggle for isolating the viewer's own branch,
  // so an outside control (the user card) can invoke it.
  isolateControlRef?: MutableRefObject<(() => void) | undefined>;
  // Populated by the canvas with a jump-to-item focuser, so an outside control
  // (the mini player, rendered by the caller) can invoke it.
  focusItemControlRef?: MutableRefObject<
    ((target: FocusTarget) => void) | undefined
  >;
  // Populated by the canvas with a play/pause toggle (by track src), so an
  // outside control (the mini player) can invoke it.
  audioControlRef?: MutableRefObject<((src: string) => void) | undefined>;
  // Reports the mini-player state (or null to hide it) so the caller can
  // render it alongside its own UI (e.g. stacked under the user card).
  onAudioStateChange?: (state: AudioPlayerState | null) => void;
  onFocusFadeChange?: (fade: number) => void;
  onContentFocus?: (slug: string) => void;
  onContentUnfocus?: () => void;
  onDetailLayoutStart?: () => void;
  onDetailImageRect?: (rect: DetailImageRect) => void;
  onEntranceComplete?: () => void;
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

// The persistent mini-player state: the loaded audio track's metadata, shown
// when a track is active and its own item isn't focused. Null hides the player.
export type AudioPlayerState = {
  src: string;
  title: string;
  imageUrl: string | null;
  playing: boolean;
  // The item this track belongs to, so the mini player can jump back to it.
  focusTarget: FocusTarget;
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
  contentType: ContentType;
  title: string;
  bodyContent: string | null;
  aspectRatio: number;
  anchorTime: number;
  rowIndex: number;
  sources: CollectedSource[];
  audioUrl: string | null;
  galleryUrls: string[];
  isPrivate: boolean;
};

export type ProcessedItem = {
  imageUrl: string | null;
  slug: string | null;
  contentType: ContentType;
  title: string;
  bodyContent: string | null;
  aspectRatio: number;
  audioUrl: string | null;
  galleryUrls: string[];
  isPrivate: boolean;
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
  // Camera position a drag or scroll-wheel pan is easing toward.
  panTargetCameraX: number;
  panTargetCameraY: number;
  // Whether the camera is still catching up to the pan target.
  panning: boolean;
  // Zoom level a wheel-zoom gesture is easing toward.
  zoomTargetZoom: number;
  // World/screen point kept fixed under the cursor while the zoom eases in.
  zoomAnchorWorldX: number;
  zoomAnchorWorldY: number;
  zoomAnchorScreenX: number;
  zoomAnchorScreenY: number;
  // Whether the zoom is still catching up to the zoom target.
  zooming: boolean;
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
  // The collector row isolated into a straight, centred timeline (or null; kept
  // set until the fade-out finishes), whether isolation is currently engaged
  // (the ease target), and the eased 0-1 progress for the transition.
  branchIsolateRow: number | null;
  branchIsolateActive: boolean;
  branchIsolate: number;
  loadStartMs: number;
  // Set once the staggered entrance (images + connectors) has fully faded
  // in, so the one-shot onEntranceComplete callback only fires once.
  entranceComplete: boolean;
  focusContentFade: number;
  detailPhase: DetailPhase;
  detailLayout: number;
  // Accumulated rotation (radians) of the focused audio track's CD. Only
  // advances while that track is playing, so it holds still when paused.
  audioDiscAngle: number;
  // Eased 0-1 grow of the hovered connector node, and the world position and
  // colour of the node it's drawn at (kept while it shrinks back out).
  hoverNodeScale: number;
  hoverNodeX: number;
  hoverNodeY: number;
  hoverNodeColour: string;
  // Connector dots drawn on the most recent frame while an item is focused, so
  // the input handler can hit-test them for hover labels and click-to-focus.
  nodeRegions: NodeHoverRegion[];
};

export type TimelineSketchRefs = {
  highlightedTypeRef: RefObject<ContentType | null>;
  // React → sketch: whether the user card is hovered (highlight own branch).
  hoverOwnBranchRef: RefObject<boolean>;
  interactionLockedRef: MutableRefObject<boolean>;
  onFocusFadeChangeRef: RefObject<((fade: number) => void) | undefined>;
  onContentFocusRef: RefObject<((slug: string) => void) | undefined>;
  onContentUnfocusRef: RefObject<(() => void) | undefined>;
  onDetailLayoutStartRef: RefObject<(() => void) | undefined>;
  onDetailImageRectRef: RefObject<
    ((rect: DetailImageRect) => void) | undefined
  >;
  // Sketch → React: fires once, after the timeline's staggered entrance
  // animation has fully finished.
  onEntranceCompleteRef: RefObject<(() => void) | undefined>;
  // Sketch → React: reports which branch timeline is zoomed into (or null).
  onBranchFocusRef: RefObject<
    ((info: BranchFocusInfo | null) => void) | undefined
  >;
  // Sketch → React: reports the mini-player state (or null to hide it).
  onAudioStateChangeRef: RefObject<
    ((state: AudioPlayerState | null) => void) | undefined
  >;
  // React → sketch: cancel button calls this to animate back to default fit.
  resetViewRef: MutableRefObject<(() => void) | undefined>;
  // React → sketch: user-card click toggles isolating the viewer's own branch
  // into a straight, centred timeline.
  isolateOwnBranchRef: MutableRefObject<(() => void) | undefined>;
  // React → sketch: mini-player click (image/title) jumps/focuses that item.
  focusItemRef: MutableRefObject<((target: FocusTarget) => void) | undefined>;
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
