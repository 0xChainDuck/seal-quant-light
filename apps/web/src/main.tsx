import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoute, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppShell } from './app/AppShell.js';
import { MarketsPage } from './pages/MarketsPage.js';
import './styles.css';

const MarketDetailPage = React.lazy(() =>
  import('./pages/MarketDetailPage.js').then((module) => ({ default: module.MarketDetailPage }))
);

const rootRoute = createRootRoute({
  component: AppShell
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: MarketsPage
});

const marketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/market/$asset',
  component: MarketRoutePage
});

function MarketRoutePage() {
  const { asset } = marketRoute.useParams();
  return (
    <React.Suspense fallback={<div className="page-loading">Loading terminal...</div>}>
      <MarketDetailPage asset={asset} />
    </React.Suspense>
  );
}

const routeTree = rootRoute.addChildren([indexRoute, marketRoute]);
const router = createRouter({ routeTree });
const queryClient = new QueryClient();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
