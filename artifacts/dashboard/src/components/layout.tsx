import React from "react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Activity, LayoutDashboard, List, Download, Settings, Zap, Send, LogOut, Users as UsersIcon } from "lucide-react";
import { useHealthCheck, useLogout, useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck({ query: { queryKey: ["health"], refetchInterval: 30000 } });
  const { data: me } = useGetMe({ query: { retry: false } });
  const queryClient = useQueryClient();
  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
      },
    },
  });

  return (
    <SidebarProvider>
      <div className="flex min-h-[100dvh] w-full bg-background">
        <Sidebar className="border-r border-border">
          <SidebarHeader className="border-b border-border p-4 bg-primary text-primary-foreground">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              <span className="font-mono font-bold tracking-tight uppercase text-sm">VIBE PROSPECTOR</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                Mission Control
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {me?.user?.role !== "sales_caller" && (
                    <>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={location === "/"}>
                          <Link href="/" className="font-mono text-sm">
                            <LayoutDashboard className="h-4 w-4 mr-2" />
                            Dashboard
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={location.startsWith("/pipeline")}>
                          <Link href="/pipeline" className="font-mono text-sm">
                            <Zap className="h-4 w-4 mr-2" />
                            Pipeline
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={location.startsWith("/leads")}>
                          <Link href="/leads" className="font-mono text-sm">
                            <List className="h-4 w-4 mr-2" />
                            Leads Database
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </>
                  )}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.startsWith("/outreach")}>
                      <Link href="/outreach" className="font-mono text-sm">
                        <Send className="h-4 w-4 mr-2" />
                        Outreach
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/export"}>
                      <Link href="/export" className="font-mono text-sm">
                        <Download className="h-4 w-4 mr-2" />
                        Export Data
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {me?.user?.role !== "sales_caller" && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={location === "/settings"}>
                        <Link href="/settings" className="font-mono text-sm">
                          <Settings className="h-4 w-4 mr-2" />
                          Settings
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {me?.user?.role === "admin" && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={location === "/users"}>
                        <Link href="/users" className="font-mono text-sm">
                          <UsersIcon className="h-4 w-4 mr-2" />
                          Team Accounts
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <div className="mt-auto p-4 border-t border-border space-y-2">
            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <div className={`h-2 w-2 rounded-full ${health?.status === "ok" ? "bg-green-500" : "bg-red-500"}`} />
              API: {health?.status === "ok" ? "ONLINE" : "OFFLINE"}
            </div>
            {me?.user && (
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground truncate">{me.user.username}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => logoutMutation.mutate()}
                  data-testid="button-logout"
                  aria-label="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </Sidebar>
        <main className="flex-1 overflow-auto flex flex-col">{children}</main>
      </div>
    </SidebarProvider>
  );
}
