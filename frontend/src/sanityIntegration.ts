const projectId = 'PLACEHOLDER';
export const SANITY_URL = `https://${projectId}.apicdn.sanity.io/v2025-06-01`;

export const getApiUrl = (query: string) =>
  `${SANITY_URL}/data/query/production?query=${encodeURI(query)}`;
