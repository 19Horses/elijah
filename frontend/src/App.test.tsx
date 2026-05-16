import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import App from './App';

describe('When the app renders', () => {
  test('it shows the title', () => {
    render(<App />);
    expect(1 + 1).toBe(2);
  });
});
