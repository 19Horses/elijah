import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import DebugPanel from './components/DebugPanel';
import Header from './components/Header';
import NavDrawer from './components/NavDrawer';
import Content from './pages/Content';
import Home from './pages/Home';
import { initSelectionColour } from './services/userColor';

const queryClient = new QueryClient();

const TIMELINE_PATHS = ['/home', '/shop', '/events', '/login', '/collection'];

const AppRoutes = () => {
  const { pathname } = useLocation();
  const isTimelineRoute = TIMELINE_PATHS.includes(pathname);
  const showHeader = !isTimelineRoute;
  const [timelineReady, setTimelineReady] = useState(false);
  const handleEntranceComplete = useCallback(() => {
    setTimelineReady(true);
  }, []);
  const [hoveredCollectedContentId, setHoveredCollectedContentId] = useState<
    string | null
  >(null);
  const focusContentIdControlRef = useRef<
    ((contentId: string) => void) | undefined
  >(undefined);
  const resetViewControlRef = useRef<(() => void) | undefined>(undefined);
  const soloTimelineControlRef = useRef<(() => void) | undefined>(undefined);
  // Whether the viewer's own timeline is being shown alone on the map.
  const [soloTimelineActive, setSoloTimelineActive] = useState(false);

  return (
    <>
      {showHeader && <Header />}
      <main className={isTimelineRoute ? 'main--home' : undefined}>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/content/:slug" element={<Content />} />
          {TIMELINE_PATHS.map((path) => (
            <Route key={path} path={path} element={null} />
          ))}
        </Routes>
        {isTimelineRoute && (
          <Home
            onEntranceComplete={handleEntranceComplete}
            onSoloTimelineChange={setSoloTimelineActive}
            highlightedContentId={hoveredCollectedContentId}
            focusContentIdControlRef={focusContentIdControlRef}
            resetViewControlRef={resetViewControlRef}
            soloTimelineControlRef={soloTimelineControlRef}
          />
        )}
      </main>
      {timelineReady && isTimelineRoute && (
        <NavDrawer
          onCollectedItemHover={setHoveredCollectedContentId}
          focusContentIdControlRef={focusContentIdControlRef}
          resetViewControlRef={resetViewControlRef}
          soloTimelineControlRef={soloTimelineControlRef}
          soloTimelineActive={soloTimelineActive}
        />
      )}
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
