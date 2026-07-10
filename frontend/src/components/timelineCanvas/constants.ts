export const ITEM_WIDTH = 180;
export const ITEM_GAP = 140;
export const IMAGE_HEIGHT = 144;
export const PADDING_X = 48;
export const PADDING_Y = 48;
export const DATE_OFFSET = 24;
export const DOT_RADIUS = 3;
// Spacing between adjacent branch nodes on a main item's underside.
export const BRANCH_NODE_GAP = 9;
// Alpha for main-timeline connectors a focused/hovered branch doesn't travel.
export const MAIN_CONNECTOR_DIM_ALPHA = 0.2;
export const DEFAULT_BACKGROUND = '#000000';
export const DRAG_THRESHOLD = 5;
export const FIT_VIEW_PADDING = 80;
export const FIT_ZOOM_SCALAR = 1.0;
export const TODAY_LABEL_BOTTOM_OFFSET = 24;
export const TODAY_LABEL_GAP = 8;
// Half-width (screen px) of the today background gradient's transition. The
// crossover is centred on the today line, so the fade spans this far to each
// side before clamping to transparent (past) / white (future).
export const TODAY_GRADIENT_HALF_PX = 70;
export const LANE_GAP = 50;
export const MAIN_LINE_Y = PADDING_Y + IMAGE_HEIGHT / 2;
export const COLLECTED_LANE_TOP = PADDING_Y + IMAGE_HEIGHT + LANE_GAP;
// First branch row above the main line, mirrored around it: its bottom sits
// LANE_GAP above the main item's top, matching the first row below.
export const COLLECTED_LANE_ABOVE_FIRST_ROW_TOP =
  PADDING_Y - LANE_GAP - IMAGE_HEIGHT;
export const COLLECTED_ROW_HEIGHT = IMAGE_HEIGHT + 30;
export const CONNECTOR_HOVER_THRESHOLD = 6;
export const MAIN_USERNAME = 'dialE';
export const MAIN_GLOW_COLOUR = '#ff0000';
// A colour pulse that travels along the timeline like data through a wire.
export const MAIN_GLOW_TRAVEL_MS = 5000;
export const MAIN_GLOW_TRAVEL_BLUR = 12;
// Matches the timeline line thickness.
export const MAIN_GLOW_STRIP_WIDTH = 1;
export const MAIN_GLOW_STRIP_LENGTH = 140;
// How far the strip's centre lightens toward white (0 = none, 1 = white).
export const MAIN_GLOW_CENTER_LIGHTEN = 0.65;
// Colour the other collectors' branches fade to while one is hovered.
export const BRANCH_DIM_COLOUR = '#555555';
export const BRANCH_DIM_LERP = 0.16;
export const TYPE_DIM_ALPHA = 0.4;
export const TYPE_DIM_OVERLAY = 0.3;
export const TYPE_HIGHLIGHT_BLUR = 22;
export const FOCUS_VIEWPORT_FILL = 0.52;
export const VIEW_ANIMATION_LERP = 0.12;
export const VIEW_UNFOCUS_ANIMATION_LERP = 0.15;
export const VIEW_SNAP_THRESHOLD = 0.001;
export const WHEEL_ZOOM_SENSITIVITY = 0.001;
export const SCROLL_STEP_MIN_DELTA = 1;
export const SCROLL_GESTURE_GAP_MS = 80;
export const SCROLL_STEP_COOLDOWN_MS = 260;
export const SCROLL_ON_STOP_PX = 4;
export const SCROLL_SNAP_LERP = 0.18;
export const SCROLL_SNAP_THRESHOLD_PX = 0.5;
export const MIN_ZOOM_FACTOR = 0.25;
export const MAX_ZOOM_FACTOR = 4;
export const MAX_VISIBLE_COLLECTOR_LABELS = 3;
export const OTHERS_LABEL_BG = '#9ca3af';
export const HIGHLIGHT_FADE_OUT_LERP = 0.08;
export const HIGHLIGHT_FADE_SNAP = 0.01;
export const DETAIL_LAYOUT_LERP = 0.08;
export const DETAIL_TEXT_VIEWPORT_LEFT = 0.52;
export const DETAIL_TEXT_GAP_PX = 48;
export const DETAIL_IMAGE_PADDING_PX = 18;
// Focused image is pinned to the bottom-left of the viewport at this height
// (fraction of viewport height = 50vh), padded from the screen edges.
export const DETAIL_IMAGE_HEIGHT_VH = 0.6;
export const DETAIL_IMAGE_EDGE_PADDING_PX = 48;
// How far from the left edge the focused image sits (larger = further right).
export const DETAIL_IMAGE_LEFT_PX = 140;
export const DETAIL_SHIFT_LEFT_BLEND = 0.35;
export const DETAIL_SHIFT_WIDTH_BOOST = 0.12;
export const DETAIL_LAYOUT_SCALE = 0.82;
export const DETAIL_MIN_SCALE = 0.35;
export const LOAD_INITIAL_DELAY_MS = 120;
export const LOAD_IMAGE_STAGGER_MS = 80;
export const LOAD_IMAGE_FADE_MS = 450;
export const LOAD_CONNECTOR_DELAY_MS = 180;
export const LOAD_CONNECTOR_STAGGER_MS = 45;
export const LOAD_CONNECTOR_FADE_MS = 400;
export const LOAD_ALPHA_SNAP = 0.01;
