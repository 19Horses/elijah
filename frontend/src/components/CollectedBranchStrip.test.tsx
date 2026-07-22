import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import CollectedBranchStrip from './CollectedBranchStrip';
import type { CollectedRowItem } from '../queries/collectedContent';
import type { MainTimelineItem } from '../queries/mainTimeline';

function makeItem(
  overrides: Partial<MainTimelineItem> = {}
): CollectedRowItem {
  return {
    collectedAt: '2026-01-01T00:00:00.000Z',
    content: {
      _id: 'item-1',
      _type: 'imageAsset',
      title: 'A collected item',
      slug: 'a-collected-item',
      imageUrl: 'https://example.com/image.jpg',
      unlockTime: null,
      expiryTime: null,
      ...overrides,
    } as MainTimelineItem,
  };
}

describe('CollectedBranchStrip', () => {
  test('renders an empty dashed placeholder when there are no items', () => {
    const { container } = render(
      <CollectedBranchStrip items={[]} colour="#ff0000" />
    );
    const root = container.querySelector('.collected-branch-strip');
    expect(root).toBeTruthy();
    expect(root?.classList.contains('collected-branch-strip--empty')).toBe(
      true
    );
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  test('renders one node per collected item, in order', () => {
    const items = [
      makeItem({ _id: 'a', title: 'First' }),
      makeItem({ _id: 'b', title: 'Second' }),
    ] as CollectedRowItem[];
    const { container } = render(
      <CollectedBranchStrip items={items} colour="#00ff00" />
    );
    const nodes = container.querySelectorAll(
      '.collected-branch-strip__node'
    );
    expect(nodes).toHaveLength(2);
    expect(screen.getByAltText('First')).toBeTruthy();
    expect(screen.getByAltText('Second')).toBeTruthy();
  });

  test('shows a text fallback instead of an image when imageUrl is missing', () => {
    const items = [
      makeItem({ imageUrl: null, title: 'No image here' }),
    ] as CollectedRowItem[];
    render(<CollectedBranchStrip items={items} colour="#0000ff" />);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.getByText('No image here')).toBeTruthy();
  });

  test('applies the given colour as a CSS custom property', () => {
    const { container } = render(
      <CollectedBranchStrip items={[]} colour="#abcdef" />
    );
    const root = container.querySelector(
      '.collected-branch-strip'
    ) as HTMLElement;
    expect(root.style.getPropertyValue('--branch-colour')).toBe('#abcdef');
  });

  test('renders a coloured outer dot with a black inner dot for each item', () => {
    const items = [
      makeItem({ _id: 'a' }),
      makeItem({ _id: 'b' }),
    ] as CollectedRowItem[];
    const { container } = render(
      <CollectedBranchStrip items={items} colour="#123456" />
    );
    expect(
      container.querySelectorAll('.collected-branch-strip__dot')
    ).toHaveLength(2);
    expect(
      container.querySelectorAll('.collected-branch-strip__dot-inner')
    ).toHaveLength(2);
  });

  test('sets a per-node stagger index for the entrance animation', () => {
    const items = [
      makeItem({ _id: 'a' }),
      makeItem({ _id: 'b' }),
    ] as CollectedRowItem[];
    const { container } = render(
      <CollectedBranchStrip items={items} colour="#123456" />
    );
    const nodes = container.querySelectorAll<HTMLElement>(
      '.collected-branch-strip__node'
    );
    expect(nodes[0].style.getPropertyValue('--node-index')).toBe('0');
    expect(nodes[1].style.getPropertyValue('--node-index')).toBe('1');
  });
});
