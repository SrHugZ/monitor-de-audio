import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { WebSocketProvider } from "./contexts/WebSocketContext";
import InstrumentSelect from "./pages/InstrumentSelect";
import MonitorPage from "./pages/MonitorPage";
import AdminPage from "./pages/AdminPage";
import InstallPWA from "./components/InstallPWA";
import { usePWA } from "./hooks/usePWA";
import { toast } from "sonner";
import { useEffect } from "react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={InstrumentSelect} />
      <Route path="/monitor/:id" component={MonitorPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PWAManager() {
  const { updateAvailable, applyUpdate } = usePWA();

  // Notifica quando há atualização disponível
  useEffect(() => {
    if (!updateAvailable) return;
    toast(
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Nova versão disponível!</span>
        <button onClick={applyUpdate} style={{ textDecoration: 'underline', fontWeight: 600 }}>
          Atualizar
        </button>
      </div>,
      { id: 'sw-update', duration: Infinity }
    );
  }, [updateAvailable, applyUpdate]);

  return <InstallPWA />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <WebSocketProvider>
          <TooltipProvider>
            <PWAManager />
            <Toaster
            theme="dark"
              toastOptions={{
                style: {
                  background: "oklch(0.14 0.008 260)",
                  border: "1px solid oklch(0.25 0.01 260)",
                  color: "oklch(0.90 0.01 260)",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.75rem",
                },
              }}
            />
            <Router />
          </TooltipProvider>
        </WebSocketProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
