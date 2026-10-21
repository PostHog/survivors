import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GamesPage } from '@/pages/GamesPage';

// The workspace carries the chat and its markdown renderer: load it only when a game is opened, not for the games list.
const WorkspacePage = lazy(() => import('@/pages/WorkspacePage').then((m) => ({ default: m.WorkspacePage })));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter basename="/admin">
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<GamesPage />} />
              <Route
                path="games/:id"
                element={
                  <Suspense fallback={<Skeleton className="m-6 h-96" />}>
                    <WorkspacePage />
                  </Suspense>
                }
              />
              <Route
                path="*"
                element={
                  <p className="p-6 text-muted-foreground">
                    Nothing here.{' '}
                    <a className="underline" href="/admin">
                      Back to the games
                    </a>
                    .
                  </p>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster richColors />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
