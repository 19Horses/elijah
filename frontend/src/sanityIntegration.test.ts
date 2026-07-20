import { describe, expect, test } from 'vitest';
import { getApiUrl } from './sanityIntegration';

describe('getApiUrl', () => {
  test('encodes the query with no params', () => {
    const url = getApiUrl('*[_type == "event"]');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('query')).toBe('*[_type == "event"]');
  });

  test('encodes GROQ params as JSON-stringified $ query params', () => {
    const url = getApiUrl('*[_id in $collectedIds]', {
      collectedIds: ['a', 'b'],
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('$collectedIds')).toBe(
      JSON.stringify(['a', 'b'])
    );
  });
});
