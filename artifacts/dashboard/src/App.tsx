import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
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
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
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

// Sales callers only get Outreach + Export in the nav; they may also open a lead's
// detail page (reached from Outreach) to log a call, but every other route redirects
// them back to Outreach.
const SALES_CALLER_ALLOWED_PREFIXES = ["/outreach", "/export", "/leads/"];

function RoleGate({ children }: { children: React.ReactNode }) {
  const { data } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const [location, navigate] = useLocation();
  const role = data?.user?.role;

  useEffect(() => {
    if (role !== "sales_caller") return;
    const allowed = SALES_CALLER_ALLOWED_PREFIXES.some(
      (prefix) => location === prefix || location.startsWith(prefix),
    );
    if (!allowed) {
      navigate("/outreach", { replace: true });
    }
  }, [role, location, navigate]);

  return <>{children}</>;
}

function Router() {
  return (
    <Layout>
      <RoleGate>
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
      </RoleGate>
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
