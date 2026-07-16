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
import { useGetMe, useHealthCheck, getGetMeQueryKey } from "@workspace/api-client-react";
import { Loader2, AlertTriangle } from "lucide-react";
import { useEffect } from "react";

const queryClient = new QueryClient();

function NotConfiguredScreen({ missing }: { missing?: string[] }) {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background p-8">
      <div className="max-w-md w-full border border-border p-8 space-y-6 font-mono">
        <div className="flex items-center gap-3 text-yellow-500">
          <AlertTriangle className="h-6 w-6 flex-shrink-0" />
          <span className="font-bold uppercase tracking-wider text-sm">Setup Required</span>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Please provide the required fields in{" "}
          <span className="text-foreground font-bold">Replit Secrets</span> to start the application.
        </p>
        {missing && missing.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Missing secrets:</p>
            <ul className="space-y-1">
              {missing.map((key) => (
                <li key={key} className="text-xs bg-muted px-3 py-1.5 text-foreground">
                  {key}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted-foreground leading-relaxed">
          Add the secrets above in your Replit project's <span className="text-foreground">Secrets</span> tab,
          then the app will start automatically.
        </p>
      </div>
    </div>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: health, isLoading: healthLoading } = useHealthCheck({
    query: { queryKey: ["health"], retry: false },
  });
  const { data, isLoading: authLoading, isError } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
  });

  const isLoading = healthLoading || authLoading;

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // API is up but missing required secrets
  if (health && (health as { status: string; missing?: string[] }).status === "not_configured") {
    const missing = (health as { status: string; missing?: string[] }).missing;
    return <NotConfiguredScreen missing={missing} />;
  }

  // API is unreachable (e.g. crashed before our lazy-load fix was deployed)
  if (!health && !healthLoading) {
    return <NotConfiguredScreen />;
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
