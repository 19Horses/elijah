import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import Landing from './pages/Landing';
import Shop from './pages/Shop';
import { initSelectionColour } from './services/userColor';

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { pathname } = useLocation();
  const isLanding = pathname === '/';
  const isHome = pathname === '/home';
  const showHeader = !isLanding && !isHome;

  return (
    <>
      {showHeader && <Header />}
      <main
        className={
          isLanding ? 'main--landing' : isHome ? 'main--home' : undefined
        }
      >
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/home" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
        </Routes>
      </main>
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
