import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import Landing from './pages/Landing';
import Shop from './pages/Shop';

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { pathname } = useLocation();
  const isLanding = pathname === '/';

  return (
    <>
      {!isLanding && <Header />}
      <main className={isLanding ? 'main--landing' : undefined}>
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
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </QueryClientProvider>
  );
};

export default App;
