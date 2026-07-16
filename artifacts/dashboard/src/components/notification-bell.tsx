import React, { useState } from "react";
import { Bell, CheckCheck, CircleAlert, TriangleAlert, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useGetNotifications, useMarkNotificationsRead, useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const LEVEL_ICON: Record<string, React.ReactNode> = {
  error: <CircleAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />,
  warning: <TriangleAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />,
  info: <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />,
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: me } = useGetMe({ query: { retry: false } });
  const isAdmin = me?.user?.role === "admin";
  const queryClient = useQueryClient();

  const { data } = useGetNotifications(
    { limit: 50 },
    {
      query: {
        queryKey: ["notifications"],
        refetchInterval: 15000,
        enabled: isAdmin,
      },
    },
  );

  const markRead = useMarkNotificationsRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      },
    },
  });

  if (!isAdmin) return null;

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && unreadCount > 0) {
          markRead.mutate({ data: { all: true } });
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
          data-testid="button-notifications"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 py-0 text-[10px] leading-4 justify-center rounded-full"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Notifications
          </span>
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => markRead.mutate({ data: { all: true } })}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-96">
          {notifications.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-xs text-muted-foreground font-mono">
              No notifications yet
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-2 px-3 py-2.5 ${!n.read ? "bg-accent/40" : ""}`}
                  data-testid={`notification-${n.id}`}
                >
                  {LEVEL_ICON[n.level] ?? LEVEL_ICON.info}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-snug break-words">{n.message}</p>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>{n.source}</span>
                      <span>·</span>
                      <span>{timeAgo(n.time)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
