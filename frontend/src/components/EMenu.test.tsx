import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import EMenu from './EMenu';

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

// Defaults to the timeline screen itself, since most of these tests are
// about the hover/toggle interaction rather than the cross-screen
// navigate-back behavior (covered separately below). Wrapped in a real
// <main>, since EMenu looks one up via document.querySelector to apply the
// screen-fade class before navigating.
function renderMenu(initialEntries: string[] = ['/home']) {
  const result = render(
    <MemoryRouter initialEntries={initialEntries}>
      <main>
        <Routes>
          <Route path="*" element={<EMenu />} />
        </Routes>
      </main>
      <LocationDisplay />
    </MemoryRouter>
  );
  const section = result.container.querySelector('.e-menu');
  if (!section) {
    throw new Error('Expected to find the .e-menu section wrapper');
  }
  const main = result.container.querySelector('main');
  if (!main) {
    throw new Error('Expected to find a main element');
  }
  return { ...result, section, main };
}

describe('EMenu', () => {
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
    // Still open immediately after leaving - covers the moment the pointer
    // is in transit toward an item, over empty space.
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

  test('clicking the e on a non-timeline screen fades the screen out, then navigates back to the timeline', () => {
    const { main } = renderMenu(['/shop']);
    fireEvent.click(screen.getByRole('button', { name: 'e' }));
    // Still on /shop immediately - fading out first, not toggling in place.
    expect(screen.getByTestId('location').textContent).toBe('/shop');
    expect(main.classList.contains('main--leaving')).toBe(true);
    expect(screen.queryByRole('menuitem', { name: 'Shop' })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId('location').textContent).toBe('/home');
  });

  test('clicking Shop fades the timeline out, then navigates to /shop', () => {
    const { main } = renderMenu(['/home']);
    fireEvent.click(screen.getByRole('button', { name: 'e' }));
    const shopLink = screen.getByRole('menuitem', { name: 'Shop' });
    fireEvent.click(shopLink);
    // Still on /home immediately - fading out first.
    expect(screen.getByTestId('location').textContent).toBe('/home');
    expect(main.classList.contains('main--leaving')).toBe(true);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId('location').textContent).toBe('/shop');
  });
});
