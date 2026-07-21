import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import DebugPanel from './components/DebugPanel';
import EMenu from './components/EMenu';
import Header from './components/Header';
import Content from './pages/Content';
import Home from './pages/Home';
import Landing from './pages/Landing';
import Shop from './pages/Shop';
import { initSelectionColour } from './services/userColor';

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { pathname } = useLocation();
  const isLanding = pathname === '/';
  const isHome = pathname === '/home';
  const isShop = pathname === '/shop';
  const showHeader = !isLanding && !isHome && !isShop;
  // Gates the e nav's very first appearance on the timeline's own entrance
  // animation. Rendered as a sibling of <main> (not inside it) so it's
  // unaffected by <main>'s fade-out/in during screen transitions, and
  // doesn't unmount/remount when navigating between home and shop - it just
  // persists once it's appeared.
  const [timelineReady, setTimelineReady] = useState(false);
  const handleEntranceComplete = useCallback(() => {
    setTimelineReady(true);
  }, []);

  return (
    <>
      {showHeader && <Header />}
      <main
        className={
          isLanding
            ? 'main--landing'
            : isHome
            ? 'main--home'
            : isShop
            ? 'main--shop'
            : undefined
        }
      >
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/home"
            element={<Home onEntranceComplete={handleEntranceComplete} />}
          />
          <Route path="/content/:slug" element={<Content />} />
          <Route path="/shop" element={<Shop />} />
        </Routes>
      </main>
      {timelineReady && (isHome || isShop) && <EMenu />}
      <DebugPanel />
    </>
  );
};

const App = () => {
  useEffect(() => {
    initSelectionColour();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </QueryClientProvider>
  );
};

export default App;
