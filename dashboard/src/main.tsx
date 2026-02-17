import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { CanvasPage } from "./canvas/CanvasPage";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const isCanvas = window.location.pathname.startsWith("/canvas");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {isCanvas ? <CanvasPage /> : <App />}
    </QueryClientProvider>
  </StrictMode>,
);
