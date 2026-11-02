// A tilt (degrees, between min and max either way) that looks random but is
// always the same for a given id, so a tag keeps its angle from one render to
// the next.
export function tiltFor(
  id: string,
  maxDegrees: number,
  minDegrees = 0
): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  }
  const unit = (hash >>> 0) / 0xffffffff;
  // The low bit picks the way it leans; the rest how far.
  const sign = (hash & 1) === 0 ? 1 : -1;
  return sign * (minDegrees + unit * (maxDegrees - minDegrees));
}

// An item's "already collected" tag's tilt on the map, and in the collection
// panel — leaning the other way there, so the two never match.
export const mapTagTilt = (
  id: string,
  maxDegrees: number,
  minDegrees: number
) => tiltFor(id, maxDegrees, minDegrees);
export const panelTagTilt = (
  id: string,
  maxDegrees: number,
  minDegrees: number
) =>
  -Math.sign(mapTagTilt(id, maxDegrees, minDegrees)) *
  Math.abs(tiltFor(`${id}:panel`, maxDegrees, minDegrees));
