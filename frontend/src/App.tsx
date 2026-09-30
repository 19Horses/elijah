import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
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

const AppRoutes = () => {
  const { pathname } = useLocation();
  const isHome = pathname === '/home';
  const isShop = pathname === '/shop';
  const isEvents = pathname === '/events';
  const isLogin = pathname === '/login';
  const isTimelineRoute = isHome || isShop || isEvents || isLogin;
  const showHeader = !isTimelineRoute;
  const [timelineReady, setTimelineReady] = useState(false);
  const handleEntranceComplete = useCallback(() => {
    setTimelineReady(true);
  }, []);

  return (
    <>
      {showHeader && <Header />}
      <main className={isTimelineRoute ? 'main--home' : undefined}>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/content/:slug" element={<Content />} />
        </Routes>
        {isTimelineRoute && (
          <Home onEntranceComplete={handleEntranceComplete} />
        )}
      </main>
      {timelineReady && isTimelineRoute && <NavDrawer />}
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
