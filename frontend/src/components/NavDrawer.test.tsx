import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

  test('the menu items are not exposed until the e is opened', () => {
    renderMenu();
    expect(screen.queryByRole('menuitem', { name: 'Shop' })).toBeNull();
  });

  test('hovering the e reveals the menu items', () => {
    const { section } = renderMenu();
    fireEvent.mouseEnter(section);
    expect(screen.getByRole('menuitem', { name: 'Shop' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Login' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Mailing list' })).toBeTruthy();
  });

  test('the mouse leaving the section keeps it open through a short grace period, then closes it', () => {
    const { section } = renderMenu();
    fireEvent.mouseEnter(section);
    fireEvent.mouseLeave(section);
    expect(screen.getByRole('menuitem', { name: 'Shop' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole('menuitem', { name: 'Shop' })).toBeNull();
  });

  test('re-entering during the grace period cancels the close', () => {
    const { section } = renderMenu();
    fireEvent.mouseEnter(section);
    fireEvent.mouseLeave(section);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseEnter(section);
    act(() => {
      vi.advanceTimersByTime(300);
    });
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
