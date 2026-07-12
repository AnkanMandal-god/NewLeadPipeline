import React, { useState } from "react";
import { Link } from "wouter";
import type { Lead } from "@workspace/api-client-react";
import { useListLeads, getListLeadsQueryKey } from "@workspace/api-client-react";
import { OUTREACH_STATUSES, OUTREACH_MODES, getOutreachStatusColor, getOutreachStatusLabel, getOutreachModeLabel } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, ChevronRight, Globe, GlobeLock, Phone, Mail, Linkedin, Send, Inbox, ChevronDown, ChevronUp } from "lucide-react";

const MODE_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="h-3 w-3" />,
  linkedin: <Linkedin className="h-3 w-3" />,
  phone: <Phone className="h-3 w-3" />,
  "in-person": <Send className="h-3 w-3" />,
};

export default function Outreach() {
  const QUEUE_PAGE_SIZE = 10;
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [queueExpanded, setQueueExpanded] = useState(true);
  const [queuePage, setQueuePage] = useState(0);

  // Fetch leads in the ready-for-outreach pipeline stage (not yet contacted)
  const { data: queueData, isLoading: queueLoading } = useListLeads(
    { status: "30_Ready_for_Outreach" },
    { query: { queryKey: getListLeadsQueryKey({ status: "30_Ready_for_Outreach" }) } },
  );

  const queueLeads = (queueData?.leads || []).filter(
    (l) => !l.outreach_mode || l.outreach_mode === "none",
  );
  const queueTotalPages = Math.max(1, Math.ceil(queueLeads.length / QUEUE_PAGE_SIZE));
  const queuePageSafe = Math.min(queuePage, queueTotalPages - 1);
  const queuePageLeads = queueLeads.slice(queuePageSafe * QUEUE_PAGE_SIZE, (queuePageSafe + 1) * QUEUE_PAGE_SIZE);

  // Fetch all leads that have an outreach mode set (not none / not null)
  const { data: allData, isLoading: allLoading } = useListLeads(
    {},
    { query: { queryKey: getListLeadsQueryKey({}) } },
  );

  const allLeads = allData?.leads || [];

  // Client-side filter: only show leads that have outreach initiated
  const outreachLeads = allLeads.filter(
    (l) =>
      (l.outreach_mode && l.outreach_mode !== "none") ||
      (l.outreach_status && l.outreach_status !== "not_started"),
  );

  const filteredLeads = outreachLeads.filter((l) => {
    const matchesStatus = statusFilter === "all" || l.outreach_status === statusFilter;
    const matchesSearch =
      !searchQuery ||
      l.business_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.contact_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.contact_email || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Group by outreach_status
  const grouped = OUTREACH_STATUSES.filter((s) => s.id !== "not_started").reduce(
    (acc, s) => {
      acc[s.id] = filteredLeads.filter((l) => l.outreach_status === s.id);
      return acc;
    },
    {} as Record<string, typeof filteredLeads>,
  );

  // Leads without a specific status bucket (contacted or fallback)
  const contacted = filteredLeads.filter((l) => l.outreach_status === "contacted" || l.outreach_status === "not_started");

  const isLoading = allLoading;

  return (
    <div className="p-8 max-w-[1400px] mx-auto w-full space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono uppercase">Outreach Tracker</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Track all leads you've initiated contact with.
          </p>
        </div>
        <div className="text-right font-mono">
          <div className="text-3xl font-bold text-primary">{outreachLeads.length}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">In Outreach</div>
        </div>
      </div>

      {/* Ready for Outreach Queue */}
      <div className="border border-border">
        <button
          onClick={() => setQueueExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Inbox className="h-4 w-4 text-primary" />
            <span className="font-mono text-sm font-bold uppercase tracking-wider">
              Ready for Outreach
            </span>
            <span className="font-mono text-xs text-muted-foreground border border-border px-2 py-0.5">
              {queueLoading ? "…" : queueLeads.length}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              leads cleared by pipeline, not yet contacted
            </span>
          </div>
          {queueExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {queueExpanded && (
          <div className="border-t border-border">
            {queueLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : queueLeads.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-center">
                <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  No leads in queue right now
                </p>
              </div>
            ) : (
              <div>
                <div className="divide-y divide-border">
                  {queuePageLeads.map((lead) => (
                    <Link key={lead.id} href={`/leads/${lead.id}`}>
                      <div className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-bold truncate">{lead.business_name}</span>
                              {lead.has_website ? (
                                <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              ) : (
                                <GlobeLock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              )}
                              {lead.contact_email && (
                                <Badge variant="outline" className="font-mono text-xs rounded-none px-2 py-0 flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {lead.contact_email}
                                </Badge>
                              )}
                              {!lead.contact_email && (lead as any).phone && (
                                <Badge variant="outline" className="font-mono text-xs rounded-none px-2 py-0 flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {(lead as any).phone}
                                </Badge>
                              )}
                            </div>
                            {lead.contact_name && (
                              <p className="font-mono text-xs text-muted-foreground mt-1">{lead.contact_name}</p>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
                {/* Pagination */}
                {queueTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/10">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      {queuePageSafe * QUEUE_PAGE_SIZE + 1}–{Math.min((queuePageSafe + 1) * QUEUE_PAGE_SIZE, queueLeads.length)} of {queueLeads.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setQueuePage((p) => Math.max(0, p - 1))}
                        disabled={queuePageSafe === 0}
                        className="px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider border border-border disabled:opacity-30 hover:bg-muted/30 transition-colors"
                      >
                        ← Prev
                      </button>
                      {Array.from({ length: queueTotalPages }, (_, i) => (
                        <button
                          key={i}
                          onClick={() => setQueuePage(i)}
                          className={`w-6 h-6 font-mono text-[10px] border transition-colors ${i === queuePageSafe ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"}`}
                        >
                          {i + 1}
                        </button>
                      ))}
                      <button
                        onClick={() => setQueuePage((p) => Math.min(queueTotalPages - 1, p + 1))}
                        disabled={queuePageSafe === queueTotalPages - 1}
                        className="px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider border border-border disabled:opacity-30 hover:bg-muted/30 transition-colors"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status quick-jump */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        <button
          onClick={() => setStatusFilter("all")}
          className={`flex-shrink-0 px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider border transition-colors ${statusFilter === "all" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"}`}
        >
          All ({outreachLeads.length})
        </button>
        {OUTREACH_STATUSES.filter((s) => s.id !== "not_started").map((s) => {
          const count = outreachLeads.filter((l) => l.outreach_status === s.id).length;
          return (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={`flex-shrink-0 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-colors ${statusFilter === s.id ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"}`}
            >
              {s.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search name, contact, email…"
            className="pl-9 font-mono text-sm rounded-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="text-xs font-mono text-muted-foreground hover:text-destructive uppercase tracking-wider"
          >
            Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <Send className="h-10 w-10 text-muted-foreground/40" />
          <p className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
            No outreach records yet
          </p>
          <p className="font-mono text-xs text-muted-foreground max-w-xs">
            Open a lead's detail page and set an Outreach Mode to track it here.
          </p>
          <Link href="/leads" className="text-xs font-mono text-primary hover:underline uppercase tracking-wider">
            Browse Leads →
          </Link>
        </div>
      ) : statusFilter !== "all" ? (
        // Flat list when filtered by status
        <div className="space-y-2">
          {filteredLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      ) : (
        // Grouped view when "All" is selected
        <div className="space-y-8">
          {OUTREACH_STATUSES.filter((s) => s.id !== "not_started").map((s) => {
            const leads = grouped[s.id] || [];
            if (leads.length === 0) return null;
            return (
              <div key={s.id} className="space-y-2">
                <div className="flex items-center gap-3">
                  <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </h2>
                  <span className="font-mono text-xs text-muted-foreground">({leads.length})</span>
                  <div className="flex-1 border-t border-border" />
                </div>
                {leads.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
              </div>
            );
          })}

          {/* Leads that have a mode set but outreach_status is still "not_started" or "contacted" */}
          {(() => {
            const misc = filteredLeads.filter(
              (l) =>
                l.outreach_status === "not_started" ||
                l.outreach_status === "contacted" ||
                !["meeting_scheduled", "meeting_concluded"].includes(l.outreach_status || ""),
            );
            const unGrouped = misc.filter(
              (l) => !["meeting_scheduled", "meeting_concluded"].includes(l.outreach_status || ""),
            );
            if (unGrouped.length === 0) return null;
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Contacted / In Progress
                  </h2>
                  <span className="font-mono text-xs text-muted-foreground">({unGrouped.length})</span>
                  <div className="flex-1 border-t border-border" />
                </div>
                {unGrouped.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <Link href={`/leads/${lead.id}`}>
      <div className="border border-border bg-card hover:bg-muted/30 transition-colors p-4 flex items-start justify-between gap-4 cursor-pointer">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-sm truncate">{lead.business_name}</span>
            {lead.has_website ? (
              <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            ) : (
              <GlobeLock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            )}
            {lead.outreach_mode && lead.outreach_mode !== "none" && (
              <Badge variant="outline" className="font-mono text-xs rounded-none flex items-center gap-1 px-2 py-0">
                {MODE_ICONS[lead.outreach_mode] || null}
                {getOutreachModeLabel(lead.outreach_mode)}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={`font-mono text-xs rounded-none px-2 py-0 border ${getOutreachStatusColor(lead.outreach_status || "not_started")}`}
            >
              {getOutreachStatusLabel(lead.outreach_status || "not_started")}
            </Badge>
          </div>

          {(lead.contact_name || lead.contact_email) && (
            <div className="font-mono text-xs text-muted-foreground flex items-center gap-3">
              {lead.contact_name && <span>{lead.contact_name}</span>}
              {lead.contact_email && (
                <span className="text-primary">{lead.contact_email}</span>
              )}
            </div>
          )}

          {lead.outreach_notes && (
            <p className="font-mono text-xs text-muted-foreground italic line-clamp-2 max-w-2xl">
              {lead.outreach_notes}
            </p>
          )}
        </div>

        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      </div>
    </Link>
  );
}
