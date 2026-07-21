import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import EMenu from './EMenu';

function renderMenu() {
  const result = render(
    <MemoryRouter>
      <EMenu />
    </MemoryRouter>
  );
  const section = result.container.querySelector('.e-menu');
  if (!section) {
    throw new Error('Expected to find the .e-menu section wrapper');
  }
  return { ...result, section };
}

describe('EMenu', () => {
  test('the menu items are not exposed until the e is opened', () => {
    renderMenu();
    expect(screen.queryByRole('menuitem', { name: 'Shop' })).toBeNull();
  });

  test('hovering the e reveals all three menu items', () => {
    const { section } = renderMenu();
    fireEvent.mouseEnter(section);
    expect(screen.getByRole('menuitem', { name: 'Shop' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Login' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Mailing list' })).toBeTruthy();
  });

  test('the mouse leaving the section closes the menu again', () => {
    const { section } = renderMenu();
    fireEvent.mouseEnter(section);
    fireEvent.mouseLeave(section);
    expect(screen.queryByRole('menuitem', { name: 'Shop' })).toBeNull();
  });

  test('moving from the e onto a menu item keeps the menu open', () => {
    const { section } = renderMenu();
    fireEvent.mouseEnter(section);
    const shopLink = screen.getByRole('menuitem', { name: 'Shop' });
    fireEvent.mouseEnter(shopLink);
    expect(screen.getByRole('menuitem', { name: 'Shop' })).toBeTruthy();
  });

  test('clicking the e toggles the menu open and closed, for touch devices', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'e' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'Shop' })).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByRole('menuitem', { name: 'Shop' })).toBeNull();
  });

  test('the Shop item links to the existing /shop route', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'e' }));
    const shopLink = screen.getByRole('menuitem', { name: 'Shop' });
    expect(shopLink.getAttribute('href')).toBe('/shop');
  });
});
