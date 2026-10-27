export const ITEM_WIDTH = 270;
export const ITEM_GAP = 140;
export const PREVIEW_EXPAND_SCALE = 1.5;
export const PREVIEW_EXPAND_LERP = 0.16;
export const PREVIEW_ISOLATE_HOVER_MAX_ZOOM = 1.6;
export const IMAGE_HEIGHT = 216;
// How much bigger main timeline items are drawn than branch (collected)
// items.
export const MAIN_ITEM_SCALE = 1.5;
export const PADDING_X = 48;
export const PADDING_Y = 48;
export const DATE_OFFSET = 24;
// Screen-space font size (px, independent of zoom) of the date labels above
// items.
export const DATE_FONT_SIZE = 16;
export const PREVIEW_DATE_SCALE = 0.8;
export const PREVIEW_ICON_SIZE = 12;
export const PREVIEW_ICON_GAP = 6;
export const PREVIEW_ICON_LIFT = 3;
// Date label format switches with zoom, relative to the fit-to-screen level:
// below DATE_FORMAT_NUMERIC_ZOOM_FACTOR shows "10/2025"; from there up to
// DATE_FORMAT_FULL_ZOOM_FACTOR shows "Oct 14, 2025"; from there (including the
// default fit view) the full "October 14th 2025".
export const DATE_FORMAT_NUMERIC_ZOOM_FACTOR = 0.6;
export const DATE_FORMAT_FULL_ZOOM_FACTOR = 0.95;
// Text colour of the date labels above items.
export const DATE_LABEL_COLOUR = '#969696';
// Font for the text drawn on the canvas (hover labels, node cards, owner
// counts); the rest of the site stays in EB Garamond.
// (Family names unquoted: p5 quotes any with spaces itself.)
export const CANVAS_LABEL_FONT =
  'Akzidenz Grotesk Pro, Helvetica, Arial, sans-serif';
// Its medium weight, for item titles.
export const CANVAS_LABEL_FONT_MEDIUM =
  'Akzidenz Grotesk Pro Medium, Akzidenz Grotesk Pro, Helvetica, Arial, sans-serif';
// Size (relative to DATE_FONT_SIZE) of the title-and-date label under items.
export const ITEM_LABEL_SCALE = 0.65;
// Its letter spacing (as a share of the font size) and line height.
export const ITEM_LABEL_LETTER_SPACING = -0.02;
export const ITEM_LABEL_LINE_HEIGHT = 1.1;
// Text colour of the label under items, and the screen-pixel width of the outline
// round outlined labels, drawn in the page background's colour so the text
// masks the lines behind it.
export const ITEM_LABEL_COLOUR = '#606060';
// Opacity of the "owned by" lines under an item's title and date.
export const SECONDARY_LABEL_ALPHA = 0.6;
// Opacity of the "and N others" part of the line under that.
export const OTHERS_LABEL_ALPHA = 0.4;
// Extra space above that secondary line, as a share of the font size.
export const SECONDARY_LABEL_GAP = 0.15;
export const LABEL_OUTLINE_PX = 4;
// The page background's gradient (top to bottom), mirroring `body` in
// index.css, for colouring label outlines to match it.
export const PAGE_BACKGROUND_TOP = '#ffffff';
export const PAGE_BACKGROUND_BOTTOM = '#e0e0e0';
// Screen-pixel blur of the white drop shadow behind the date labels.
export const DATE_LABEL_SHADOW_BLUR_PX = 6;
export const DOT_RADIUS = 3;
// Stroke colour of the main timeline line (and its flares into the nodes).
export const MAIN_LINE_COLOUR = '#969696';
// Screen-pixel blur of the soft white halo around each item, which fades out
// the connector lines beneath it where they meet the item.
export const ITEM_HALO_BLUR_PX = 24;
// Screen-pixel radius each connector line's bends are rounded to.
export const LINE_CORNER_RADIUS_PX = 6;
// Screen pixels added to every connector line's thickness, whatever the zoom.
export const CONNECTOR_EXTRA_WEIGHT_PX = 1.5;
// Where a line meets a node it widens into the dot along a concave curve. The
// taper starts this many dot radii out from the node's centre (less if the
// line's straight run into the node is shorter).
export const NODE_FLARE_REACH = 1.6;
// Hovering a connector node grows its dot: extra diameter as a fraction of the
// base (1.5 = up to 2.5× size), eased in/out at this rate.
export const NODE_HOVER_GROW = 0.3;
export const NODE_GROW_LERP = 0.25;
// The per-frame ease a hovered timeline's name tag follows the cursor along
// the line with.
export const LINE_BLOB_FOLLOW_LERP = 0.2;
// The gap (screen px) the tag keeps from the cursor's point on the line.
export const LINE_TAG_LIFT_PX = 14;
// Its corner radius, and the opacity of its second (item count) line.
export const LINE_TAG_RADIUS_PX = 6;
export const LINE_TAG_DETAIL_ALPHA = 0.7;
// While an item is focused, the branch nodes on its edges slide out to the
// matching edge of the viewport: inset this far from it, spaced this far apart,
// drawn at a fixed on-screen radius with a smaller centre hole, and tied to the
// edge by a thin stub. Vertically they spring out (a slight overshoot, then
// settling) with this per-frame stiffness and velocity damping; horizontally
// they ease out by EDGE_NODE_X_LERP per frame with no overshoot.
export const EDGE_NODE_INSET_PX = 22;
export const EDGE_NODE_GAP_PX = 35;
export const EDGE_NODE_RADIUS_PX = 9.5;
// Dots along an item's top edge, one per person viewing it right now: their
// screen-pixel radius, the white ring around each, the gap between them and
// how far in from the item's top-right corner the row starts.
export const VIEWER_DOT_RADIUS_PX = 5;
export const VIEWER_DOT_RING_PX = 1.5;
export const VIEWER_DOT_GAP_PX = 4;
export const VIEWER_DOT_INSET_PX = 8;
// Space kept between a hovered edge node's open card and the nodes beside it.
export const EDGE_NODE_CARD_CLEARANCE_PX = 8;
// How far past an edge node's dot its hover band reaches.
export const EDGE_NODE_HIT_PAD_PX = 8;
export const EDGE_NODE_HOLE_RATIO = 0.35;
export const EDGE_NODE_SPRING_STIFFNESS = 0.04;
export const EDGE_NODE_SPRING_DAMPING = 0.8;
export const EDGE_NODE_X_LERP = 0.18;
// Screen pixels of clear space between parallel branch lines where several
// meet one item (its underside, or one of its edges), the same at every zoom
// and through every bend, like lines on a metro map.
export const BRANCH_LINE_GAP_PX = 2;
// Below this zoom (as a fraction of the fit-to-screen level) the date labels
// start shrinking. The transition spans this same fraction below the
// threshold, so it eases smoothly rather than popping at a hard cutoff.
export const DATE_SHRINK_ZOOM_FACTOR = 0.8;
export const DATE_SHRINK_TRANSITION_FACTOR = 0.25;
// How much the date label's font size shrinks once fully zoomed out past the
// threshold above (0 = no change, 0.2 = 20% smaller).
export const DATE_FONT_MERGE_SHRINK = 0.2;
// Alpha for main-timeline connectors a focused/hovered branch doesn't travel.
export const MAIN_CONNECTOR_DIM_ALPHA = 0.2;
export const DRAG_THRESHOLD = 5;
export const FIT_VIEW_PADDING = 80;
// Screen-pixel margins the default whole-map view keeps clear: the header
// (logo and menu) at the top, and the labels hung under and beside items.
export const FIT_VIEW_MARGINS_PX = {
  top: 130,
  right: 150,
  bottom: 90,
  left: 24,
};
// Screen-pixel margins for the starting view of the main timeline: even on
// both sides so it sits centred horizontally.
export const MAIN_FIT_VIEW_MARGINS_PX = {
  top: 130,
  right: 24,
  bottom: 90,
  left: 24,
};
// Multiplies the starting view's zoom; <1 zooms out from the main timeline
// spanning the screen edge-to-edge.
export const MAIN_FIT_ZOOM_SCALAR = 0.85;
// Multiplies the fit-to-view zoom. 1.0 frames the whole timeline edge-to-edge,
// centred, with every item visible; >1 zooms in (content runs off the edges).
export const FIT_ZOOM_SCALAR = 1.0;
// Screen px the default fit view shifts everything down by, so branches above
// the main line clear the fixed user-card/mini-player stack (top-right)
// instead of running up under it.
export const FIT_VIEW_TOP_CLEARANCE_PX = 140;
// On initial load, the view starts zoomed out to this fraction of the fit
// view's zoom (same centre) and eases in to it, rather than appearing
// already framed.
export const ENTRANCE_ZOOM_START_FACTOR = 0.4;
export const TODAY_LABEL_BOTTOM_OFFSET = 24;
export const TODAY_LABEL_GAP = 8;
// Width (screen px) of the fade-to-background gradient at each screen edge, so
// the timeline dissolves into the background instead of hard-cutting at the border.
export const EDGE_GRADIENT_PX = 140;
// Base gap between the main line and the nearest branch row, and between
// adjacent branch rows beyond that. Both grow with ZOOM_OUT_GROWTH_POWER at
// draw time (see bounds.ts) to keep pace with the enlarged nodes/lines.
export const LANE_GAP = 25;
export const COLLECTED_ROW_EXTRA_GAP = 30;
export const MAIN_LINE_Y = PADDING_Y + IMAGE_HEIGHT / 2;
// How far (screen px) either side of a timeline line still counts as hovering
// it. When several lines are in reach, the nearest one wins.
export const CONNECTOR_HOVER_THRESHOLD_PX = 14;
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
// Colour the other collectors' branches fade to while one is hovered: the
// same grey as the item labels.
export const BRANCH_DIM_COLOUR = DATE_LABEL_COLOUR;
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
// Same idea for the items themselves, below 1 so they still shrink as the
// camera zooms out, just less than the world around them: 0 = they hold their
// on-screen size, 1 = they shrink with everything else. Capped at
// ITEM_ZOOM_OUT_GROWTH_MAX so neighbours never grow into each other.
export const ITEM_ZOOM_OUT_GROWTH_POWER = 0.5;
export const ITEM_ZOOM_OUT_GROWTH_MAX = 1 + (ITEM_GAP * 0.6) / ITEM_WIDTH;
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
export const DETAIL_IMAGE_LEFT_PX = 133;
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
export const PREVIEW_SWITCH_FADE_MS = 250;
export const COLLECT_ANIM_MS = 1350;
export const COLLECT_HOLD_MS = 600;
export const COLLECT_RETURN_FADE_MS = 1100;
export const COLLECT_RETURN_ZOOM_LERP = 0.0825;
export const COLLECT_RETURN_IMAGE_WAIT_MS = 600;
