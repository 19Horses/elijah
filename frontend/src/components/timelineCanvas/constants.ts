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
export const PAGE_BACKGROUND_TOP = '#f0f0f0';
export const PAGE_BACKGROUND_BOTTOM = '#d2d2d2';
// Screen-pixel blur of the white drop shadow behind the date labels.
export const DATE_LABEL_SHADOW_BLUR_PX = 6;
export const DOT_RADIUS = 3;
// Stroke colour of the main timeline line (and its flares into the nodes).
export const MAIN_LINE_COLOUR = '#969696';
// Screen-pixel blur of the soft background-coloured halo around each item,
// which fades out the connector lines beneath it where they meet the item.
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
// drawn at a fixed on-screen radius with a see-through centre hole, and tied
// to the edge by a thin stub. They slide out (and back) with an ease-in-out over
// EDGE_NODE_ANIM_MS.
export const EDGE_NODE_INSET_PX = 36;
export const EDGE_NODE_GAP_PX = 42;
export const EDGE_NODE_RADIUS_PX = 13;
// Dots beside an item's top corner, one per person viewing it right now: their
// screen-pixel radius, the background-coloured ring masking lines around each, the gap between them, how
// far out from the image's side the grid starts, and how many dots per row.
export const VIEWER_DOT_RADIUS_PX = 5;
export const VIEWER_DOT_RING_PX = 1.5;
export const VIEWER_DOT_GAP_PX = 4;
export const VIEWER_DOT_INSET_PX = 6;
export const VIEWER_DOT_COLUMNS = 3;
// The tag naming an item's kind in its image's bottom-right corner (screen px):
// how far in from the corner, its padding, text size and box colour.
export const KIND_TAG_INSET_PX = 6;
export const KIND_TAG_PAD_X_PX = 4;
export const KIND_TAG_PAD_Y_PX = 3;
export const KIND_TAG_FONT_PX = 9;
export const KIND_TAG_BACKGROUND = '#606060';
// A viewer moving on to another item: their dot fades out there and back in
// at the new item over this long.
export const VIEWER_DOT_FADE_MS = 220;
// A hovered viewer dot grows by this fraction of its radius, easing at this
// rate per frame.
export const VIEWER_DOT_HOVER_GROW = 0.3;
export const VIEWER_DOT_HOVER_LERP = 0.25;
// A viewer moving on to another item also sends a white flash along the
// timelines joining the two: this long and thick (screen px, plus its glow),
// at this steady pace (screen px per ms), taking at least / at most this long.
export const VIEWER_FLASH_LENGTH_PX = 160;
export const VIEWER_FLASH_WEIGHT_PX = 3;
export const VIEWER_FLASH_GLOW_PX = 10;
export const VIEWER_FLASH_SPEED_PX_PER_MS = 2.2;
export const VIEWER_FLASH_MIN_MS = 300;
export const VIEWER_FLASH_MAX_MS = 1200;
// The flash is drawn as this many strokes stacked about its middle, each
// shorter than the last and this strong, so it fades smoothly to either end.
export const VIEWER_FLASH_LAYERS = 10;
export const VIEWER_FLASH_LAYER_ALPHA = 0.3;
// How much less a route along someone else's timeline is favoured than one
// along the viewer's own or the main one.
export const VIEWER_FLASH_OTHER_TIMELINE_COST = 3;
// Space kept between a hovered edge node's open card and the nodes beside it.
export const EDGE_NODE_CARD_CLEARANCE_PX = 8;
// How far past an edge node's dot its hover band reaches.
export const EDGE_NODE_HIT_PAD_PX = 8;
export const EDGE_NODE_HOLE_RATIO = 0.45;
export const EDGE_NODE_ANIM_MS = 400;
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
// How far greyed-out item pictures (while viewing a collection) are washed
// toward white, on top of going greyscale.
export const GREY_OUT_LIGHTEN = 0.85;
// The band of light that sweeps across the collection's item pictures while
// it's being viewed: every SHEEN_PERIOD_MS it takes SHEEN_SWEEP_MS to cross a
// picture, at SHEEN_ANGLE (radians) and up to SHEEN_STRENGTH white, each
// picture starting SHEEN_STAGGER_MS after the one before.
export const SHEEN_PERIOD_MS = 3200;
export const SHEEN_SWEEP_MS = 1300;
export const SHEEN_ANGLE = 0.4;
export const SHEEN_STRENGTH = 0.55;
export const SHEEN_STAGGER_MS = 160;
// Screen px kept clear around a collection's framed timeline: either side
// (room for labels hung beside its items, the right one before the panel's
// gap), at the top (the header, plus a label hung above an item) and at the
// bottom (a label hung below one), so it reads centred labels and all.
export const COLLECTION_FRAME_SIDE_PX = 120;
export const COLLECTION_FRAME_TOP_PX = 240;
export const COLLECTION_FRAME_BOTTOM_PX = 130;
// Hovering a collection item in its panel zooms in this many times closer
// than the collection view's framing — the same for every item.
export const COLLECTION_HOVER_ZOOM = 7;
// World units between the main timeline's pictures and the row of a
// collection's items shown above it when the viewer has no branch yet.
export const COLLECTION_ROW_GAP = 150;
// Screen px kept between a collection's framed timeline and its panel.
export const COLLECTION_PANEL_GAP_PX = 24;
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
// Zooming back out to the map takes as long as zooming in to an item.
export const VIEW_UNFOCUS_ANIMATION_LERP = VIEW_ANIMATION_LERP;
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
// The collected timelines changing under a live map: items ease to their new
// places over LAYOUT_SHIFT_MS; new branch lines then draw out (after
// BRANCH_GROW_DELAY_MS, over BRANCH_GROW_MS) and new items fade in, growing
// from this share of their size, as their line reaches them.
export const LAYOUT_SHIFT_MS = 700;
export const BRANCH_GROW_DELAY_MS = 250;
export const BRANCH_GROW_MS = 800;
export const ITEM_APPEAR_MS = 450;
export const ITEM_APPEAR_FROM_SCALE = 0.7;
export const PREVIEW_SWITCH_FADE_MS = 250;
export const COLLECT_ANIM_MS = 1350;
export const COLLECT_HOLD_MS = 600;
export const COLLECT_RETURN_FADE_MS = 1100;
export const COLLECT_RETURN_ZOOM_LERP = 0.0825;
export const COLLECT_RETURN_IMAGE_WAIT_MS = 600;

// The drop shadow under a music item's play/pause glyph (screen px).
export const PLAY_BUTTON_SHADOW_BLUR_PX = 14;
export const PLAY_BUTTON_SHADOW_OFFSET_PX = 2;
export const PLAY_BUTTON_SHADOW_ALPHA = 0.45;
