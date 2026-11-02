import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import NavDrawer from './NavDrawer';

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderMenu(initialEntries: string[] = ['/home']) {
  const queryClient = new QueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="*" element={<NavDrawer />} />
        </Routes>
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const section = result.container.querySelector('.e-menu');
  if (!section) {
    throw new Error('Expected to find the .e-menu section wrapper');
  }
  return { ...result, section };
}

describe('NavDrawer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('the menu items always show beside the e, without hovering', () => {
    renderMenu();
    expect(screen.getByRole('menuitem', { name: 'Shop' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Login' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Mailing List' })).toBeTruthy();
  });

  test('clicking the e keeps the menu open', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'e' }));
    expect(screen.getByRole('menuitem', { name: 'Shop' })).toBeTruthy();
  });

  test('the Shop item links to the existing /shop route', () => {
    renderMenu();
    const shopLink = screen.getByRole('menuitem', { name: 'Shop' });
    expect(shopLink.getAttribute('href')).toBe('/shop');
  });

  test('clicking Shop opens the drawer and navigates to /shop immediately', () => {
    renderMenu(['/home']);
    fireEvent.click(screen.getByRole('button', { name: 'e' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Shop' }));
    expect(screen.getByTestId('location').textContent).toBe('/shop');
    expect(document.querySelector('.nav-drawer__panel--open')).not.toBeNull();
  });

  test('the active drawer item is highlighted while its content is open', () => {
    renderMenu(['/shop']);
    const shopLink = screen.getByRole('menuitem', { name: 'Shop' });
    expect(shopLink.className).toContain('e-menu__item--active');
  });

  test('the menu list stays visible while the drawer is open, without hovering', () => {
    renderMenu(['/shop']);
    expect(screen.getByRole('menuitem', { name: 'Shop' })).toBeTruthy();
  });

  test('clicking the active item again closes the drawer', () => {
    renderMenu(['/shop']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Shop' }));
    expect(screen.getByTestId('location').textContent).toBe('/home');
  });

  test('clicking the backdrop closes the drawer', () => {
    renderMenu(['/shop']);
    const backdrop = document.querySelector('.nav-drawer__backdrop');
    if (!backdrop) throw new Error('Expected to find the backdrop');
    fireEvent.click(backdrop);
    expect(screen.getByTestId('location').textContent).toBe('/home');
  });

  test('pressing Escape closes the drawer', () => {
    renderMenu(['/events']);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('location').textContent).toBe('/home');
  });
});
