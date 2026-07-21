import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import DebugPanel from './components/DebugPanel';
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
          <Route path="/home" element={<Home />} />
          <Route path="/content/:slug" element={<Content />} />
          <Route path="/shop" element={<Shop />} />
        </Routes>
      </main>
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
