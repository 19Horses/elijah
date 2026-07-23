export const ITEM_WIDTH = 180;
export const ITEM_GAP = 140;
export const IMAGE_HEIGHT = 144;
export const PADDING_X = 48;
export const PADDING_Y = 48;
export const DATE_OFFSET = 24;
// Screen-space font size (px, independent of zoom) of the date labels above
// items.
export const DATE_FONT_SIZE = 16;
// Date label format switches with zoom, relative to the fit-to-screen level:
// below DATE_FORMAT_NUMERIC_ZOOM_FACTOR shows "10/2025"; from there up to
// DATE_FORMAT_FULL_ZOOM_FACTOR shows "Oct 14 2025"; above that, the full
// "October 14 2025".
export const DATE_FORMAT_NUMERIC_ZOOM_FACTOR = 0.6;
export const DATE_FORMAT_FULL_ZOOM_FACTOR = 1.3;
export const DOT_RADIUS = 3;
// Hovering a connector node grows its dot: extra diameter as a fraction of the
// base (1.5 = up to 2.5× size), eased in/out at this rate.
export const NODE_HOVER_GROW = 0.3;
export const NODE_GROW_LERP = 0.25;
// Spacing between adjacent branch nodes on a main item's underside.
export const BRANCH_NODE_GAP = 9;
// Below this zoom (as a fraction of the fit-to-screen level), parallel branch
// lines sharing the same route ease their fan-out spacing down to 0 so they
// merge into a single line for readability; above it they fan back out. The
// transition spans this same fraction below the threshold, so it eases
// smoothly rather than popping at a hard cutoff.
export const BRANCH_MERGE_ZOOM_FACTOR = 0.8;
export const BRANCH_MERGE_TRANSITION_FACTOR = 0.25;
// How much the date label's font size shrinks once branches have fully
// merged (0 = no change, 0.2 = 20% smaller at full merge), easing with the
// same threshold/transition as the branch merge above.
export const DATE_FONT_MERGE_SHRINK = 0.2;
// Alpha for main-timeline connectors a focused/hovered branch doesn't travel.
export const MAIN_CONNECTOR_DIM_ALPHA = 0.2;
export const DEFAULT_BACKGROUND = '#000000';
export const DRAG_THRESHOLD = 5;
export const FIT_VIEW_PADDING = 80;
// Multiplies the fit-to-view zoom. 1.0 frames the whole timeline edge-to-edge,
// centred, with every item visible; >1 zooms in (content runs off the edges).
export const FIT_ZOOM_SCALAR = 1.0;
// Screen px the default fit view shifts everything down by, so branches above
// the main line clear the fixed user-card/mini-player stack (top-right)
// instead of running up under it.
export const FIT_VIEW_TOP_CLEARANCE_PX = 140;
export const TODAY_LABEL_BOTTOM_OFFSET = 24;
export const TODAY_LABEL_GAP = 8;
// Width (screen px) of the fade-to-background gradient at each screen edge, so
// the timeline dissolves into the background instead of hard-cutting at the border.
export const EDGE_GRADIENT_PX = 140;
// Base gap between the main line and the nearest branch row, and between
// adjacent branch rows beyond that. Both grow with ZOOM_OUT_GROWTH_POWER at
// draw time (see bounds.ts) to keep pace with the enlarged nodes/lines.
export const LANE_GAP = 50;
export const COLLECTED_ROW_EXTRA_GAP = 30;
export const MAIN_LINE_Y = PADDING_Y + IMAGE_HEIGHT / 2;
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
// Opacity items not in the hovered branch's timeline fade to while it's hovered.
export const BRANCH_DIM_ITEM_ALPHA = 0.3;
export const TYPE_DIM_ALPHA = 0.4;
export const TYPE_DIM_OVERLAY = 0.3;
// Fade applied over private items the viewer hasn't collected.
export const PRIVATE_OVERLAY_ALPHA = 0.55;
export const PRIVATE_BADGE_TEXT = 'Private content';
export const PRIVATE_BADGE_COLOUR = '#3f3f46';
// Which distortion private images render with — swap to compare.
export const PRIVATE_IMAGE_EFFECT: 'blur' | 'pixelate' = 'blur';
export const PRIVATE_BLUR_PX = 10;
// Long edge (px) of the low-res buffer private images are downsampled to
// before being scaled back up with smoothing off, for the pixelate effect.
export const PRIVATE_PIXEL_CELL_PX = 14;
export const TYPE_HIGHLIGHT_BLUR = 22;
export const FOCUS_VIEWPORT_FILL = 0.52;
export const VIEW_ANIMATION_LERP = 0.12;
export const VIEW_UNFOCUS_ANIMATION_LERP = 0.15;
export const VIEW_SNAP_THRESHOLD = 0.001;
export const WHEEL_ZOOM_SENSITIVITY = 0.0025;
// How quickly the camera eases toward the pan target each frame (drag or
// scroll wheel), 0-1 per frame; higher = snappier, lower = smoother/more
// trailing.
export const PAN_LERP = 0.18;
// Below this on-screen distance (px) a pan is considered settled, so the next
// drag/wheel gesture rebases its target from the live camera position.
export const PAN_SETTLE_THRESHOLD_PX = 0.5;
// How quickly the zoom eases toward the wheel-zoom target each frame (same
// shape as PAN_LERP).
export const ZOOM_LERP = 0.18;
// Below this zoom-unit distance a wheel-zoom is considered settled.
export const ZOOM_SETTLE_THRESHOLD = 0.0005;
export const MIN_ZOOM_FACTOR = 0.25;
// Absolute zoom level the user can zoom in to, independent of the fit-to-screen
// zoom (which shrinks as the timeline grows) — so items reach the same max
// on-screen size no matter how many items the timeline has.
export const MAX_ZOOM_LEVEL = 1.5;
// How strongly nodes and connector lines grow as the camera zooms out below
// the default fit level. 1 = they merely hold their on-screen size instead of
// shrinking; >1 = they actively grow larger the further out you zoom.
export const ZOOM_OUT_GROWTH_POWER = 1.3;
// Same idea, but for the gap between branch rows — higher than
// ZOOM_OUT_GROWTH_POWER so rows spread apart faster than the nodes/lines
// thicken, keeping them comfortably clear of each other at extreme zoom-out.
export const LANE_GAP_GROWTH_POWER = 1.8;
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
