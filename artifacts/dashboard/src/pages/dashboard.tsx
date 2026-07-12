import React from "react";
import { Link } from "wouter";
import { useGetLeadsStats, getGetLeadsStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Target, ChevronRight } from "lucide-react";

const DISPLAY_STAGES = [
  {
    id: "30_Ready_for_Outreach",
    label: "Ready for Outreach",
    desc: "Contact enriched — ready to contact",
    color: "border-primary text-primary",
    dot: "bg-primary",
  },
  {
    id: "99_Manual_Review",
    label: "Manual Review",
    desc: "Needs human review",
    color: "border-yellow-400 text-yellow-600",
    dot: "bg-yellow-400",
  },
  {
    id: "00_Discarded",
    label: "Discarded",
    desc: "Site too fast / no fit",
    color: "border-red-400 text-red-600",
    dot: "bg-red-400",
  },
];

const QUEUE_STAGES = [
  {
    id: "10_Raw_Scraped",
    label: "Pending Audit",
    desc: "Scraped — awaiting website audit",
    color: "border-gray-400 text-gray-500",
    dot: "bg-gray-400",
  },
  {
    id: "20_Audit_Passed",
    label: "Pending Enrichment",
    desc: "Audit done — awaiting contact lookup",
    color: "border-blue-400 text-blue-600",
    dot: "bg-blue-400",
  },
];

export default function Dashboard() {
  const { data, isLoading } = useGetLeadsStats({
    query: { queryKey: getGetLeadsStatsQueryKey() },
  });

  const stats = data?.stats || {};
  const totalLeads = Object.values(stats).reduce((a, b) => a + b, 0);

  const StatCard = ({ id, label, desc, color, dot }: typeof DISPLAY_STAGES[0]) => {
    const count = stats[id] ?? 0;
    return (
      <Link
        href={`/leads?status=${id}`}
        className={`flex-1 min-w-0 border-2 p-4 hover:opacity-80 transition-opacity ${color}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className={`h-2 w-2 rounded-full flex-shrink-0 ${dot}`} />
          <span className="font-mono text-xs font-bold uppercase tracking-wider truncate">{label}</span>
          <span className="ml-auto font-mono font-bold text-2xl tabular-nums flex-shrink-0">
            {isLoading ? <Skeleton className="h-6 w-8 inline-block" /> : count}
          </span>
        </div>
        <p className="text-xs font-mono opacity-70 leading-snug pl-4">{desc}</p>
      </Link>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono uppercase">Pipeline Overview</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">Live monitoring of outbound lead progression.</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold font-mono text-primary">{isLoading ? "-" : totalLeads}</div>
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Total Leads</div>
        </div>
      </div>

      {/* Main outcome cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {DISPLAY_STAGES.map((stage) => {
          const count = stats[stage.id] ?? 0;
          return (
            <Card key={stage.id} className="border-border rounded-none shadow-none flex flex-col">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  {stage.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 flex-1 flex flex-col justify-between">
                {isLoading ? (
                  <Skeleton className="h-10 w-20 mb-4" />
                ) : (
                  <div className="text-4xl font-bold font-mono tracking-tighter mb-4">{count}</div>
                )}
                <Link
                  href={`/leads?status=${stage.id}`}
                  className="inline-flex items-center text-xs font-mono text-primary hover:underline uppercase"
                >
                  View Leads <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pipeline queue (intermediate stages — informational only) */}
      <div className="border border-border bg-card p-5 space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Processing Queue</h2>
        <div className="flex flex-col md:flex-row gap-2">
          {QUEUE_STAGES.map((stage, i) => (
            <React.Fragment key={stage.id}>
              <StatCard {...stage} />
              {i < QUEUE_STAGES.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground self-center flex-shrink-0 hidden md:block" />
              )}
            </React.Fragment>
          ))}
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          These leads are moving through the pipeline automatically. Check Pipeline Control to monitor progress.
        </p>
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border rounded-none shadow-none bg-secondary text-secondary-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider">
              <Target className="h-4 w-4 text-primary" />
              Action Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-secondary-foreground/80 mb-6 max-w-sm">
              Leads waiting for outreach or manual review. Keep the pipeline moving.
            </p>
            <div className="flex gap-4">
              <Link
                href="/leads?status=30_Ready_for_Outreach"
                className="bg-primary text-primary-foreground px-4 py-2 text-sm font-mono font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors"
              >
                Start Outreach
              </Link>
              <Link
                href="/leads?status=99_Manual_Review"
                className="border border-secondary-foreground/20 px-4 py-2 text-sm font-mono hover:bg-secondary-foreground/10 transition-colors"
              >
                Review Flagged
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
