import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/react';
import App from './App';
import './styles/global.less';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
  document.getElementById('root')!.innerHTML =
    '<p style="padding:2rem;color:#eee;font-family:sans-serif">' +
    'Missing <code>VITE_CLERK_PUBLISHABLE_KEY</code> — set it in <code>client/.env.local</code> for local dev ' +
    'or in the Vercel project environment variables for deploys (the <code>VITE_</code> prefix is required), then rebuild.</p>';
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ClerkProvider>
  </React.StrictMode>
);

