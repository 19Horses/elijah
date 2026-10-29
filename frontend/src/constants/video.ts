export const VIDEO_CDN_URL = (import.meta.env.VITE_VIDEO_CDN_URL ?? '').replace(
  /\/+$/,
  ''
);
