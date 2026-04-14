import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WsProvider, useWebSocketEngine } from "@/hooks/use-websocket";
import NotFound from "@/pages/not-found";
import Singer from "@/pages/Singer";
import Host from "@/pages/Host";
import Crowd from "@/pages/Crowd";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Host} />
      <Route path="/host" component={Host} />
      <Route path="/singer" component={Singer} />
      <Route path="/crowd" component={Crowd} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const wsState = useWebSocketEngine();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WsProvider value={wsState}>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </WsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
