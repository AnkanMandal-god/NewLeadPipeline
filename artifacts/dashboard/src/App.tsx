import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Leads from "@/pages/leads";
import LeadDetail from "@/pages/lead-detail";
import Export from "@/pages/export";
import SettingsPage from "@/pages/settings";
import Pipeline from "@/pages/pipeline";
import Outreach from "@/pages/outreach";
import Users from "@/pages/users";
import Login from "@/pages/login";
import { useGetMe } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = useGetMe({
    query: { retry: false },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return <Login />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/pipeline" component={Pipeline} />
        <Route path="/leads" component={Leads} />
        <Route path="/leads/:id" component={LeadDetail} />
        <Route path="/outreach" component={Outreach} />
        <Route path="/export" component={Export} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/users" component={Users} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthGate>
            <Router />
          </AuthGate>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
