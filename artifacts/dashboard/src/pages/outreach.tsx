import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useListLeads, useUpdateLead, getListLeadsQueryKey, getGetLeadsStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  OUTREACH_STATUSES,
  OUTREACH_MODES,
  getOutreachStatusColor,
  getOutreachStatusLabel,
  getOutreachModeLabel,
} from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2, Globe, GlobeLock, ChevronRight, Star, ExternalLink, ChevronDown, ChevronUp, Inbox } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Batch = { id: number; query: string; location: string; scraped_at: string; lead_count: number };

const SESSION_KEY = "outreach_view_state";

type SavedState = {
  statusFilter: string;
  searchQuery: string;
  modeFilter: string;
  batchFilter: string;
  scrollY: number;
};

function loadSavedState(): Partial<SavedState> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function Outreach() {
  const saved = loadSavedState();

  const [statusFilter, setStatusFilter] = useState(saved.statusFilter ?? "all");
  const [searchQuery, setSearchQuery] = useState(saved.searchQuery ?? "");
  const [modeFilter, setModeFilter] = useState(saved.modeFilter ?? "all");
  const [batchFilter, setBatchFilter] = useState(saved.batchFilter ?? "all");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [queueExpanded, setQueueExpanded] = useState(true);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  useEffect(() => {
    const current = loadSavedState();
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...current, statusFilter, searchQuery, modeFilter, batchFilter }),
    );
  }, [statusFilter, searchQuery, modeFilter, batchFilter]);

  useEffect(() => {
    fetch("/api/batches")
      .then((r) => r.json())
      .then((d) => setBatches(d.batches || []))
      .catch(() => {});
  }, []);

  // Leads cleared by the pipeline but not yet contacted — same underlying
  // record set the Leads page shows for "Ready for Outreach".
  const { data: queueData, isLoading: queueLoading } = useListLeads(
    { status: "30_Ready_for_Outreach" },
    { query: { queryKey: getListLeadsQueryKey({ status: "30_Ready_for_Outreach" }) } },
  );
  const queueLeads = (queueData?.leads || []).filter((l) => !l.outreach_mode || l.outreach_mode === "none");

  // All leads that have outreach initiated (mode set, or status moved past not_started) —
  // identical predicate used by the API export endpoint for the sales_caller role, so the
  // count shown here always matches what a sales caller can export.
  const { data: allData, isLoading } = useListLeads({}, { query: { queryKey: getListLeadsQueryKey({}) } });
  const allLeads = allData?.leads || [];
  const outreachLeads = allLeads.filter(
    (l) => (l.outreach_mode && l.outreach_mode !== "none") || (l.outreach_status && l.outreach_status !== "not_started"),
  );

  const leads = outreachLeads.filter((l) => {
    if (statusFilter !== "all" && l.outreach_status !== statusFilter) return false;
    if (modeFilter !== "all" && l.outreach_mode !== modeFilter) return false;
    if (batchFilter !== "all" && String(l.scrape_batch_id ?? "") !== batchFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hay = `${l.business_name} ${l.contact_name || ""} ${l.contact_email || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const updateLead = useUpdateLead();

  const handleOutreachStatusChange = (id: number, newStatus: string) => {
    updateLead.mutate(
      { id, data: { outreach_status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: "Outreach status updated", description: `Lead moved to ${getOutreachStatusLabel(newStatus)}.` });
          queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        },
        onError: () => toast({ title: "Error", description: "Failed to update outreach status.", variant: "destructive" }),
      },
    );
  };

  const handleInitiateOutreach = (id: number, mode: string) => {
    if (!mode || mode === "none") return;
    updateLead.mutate(
      { id, data: { outreach_mode: mode, outreach_status: "contacted" } },
      {
        onSuccess: () => {
          toast({ title: "Outreach initiated", description: "Lead moved to the Outreach Tracker." });
          queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetLeadsStatsQueryKey() });
        },
        onError: () => toast({ title: "Error", description: "Failed to initiate outreach.", variant: "destructive" }),
      },
    );
  };

  const hasActiveFilter = statusFilter !== "all" || modeFilter !== "all" || batchFilter !== "all" || searchQuery;

  const clearFilters = () => {
    setStatusFilter("all");
    setModeFilter("all");
    setBatchFilter("all");
    setSearchQuery("");
  };

  const handleRowClick = useCallback((id: number) => {
    navigate(`/leads/${id}`);
  }, [navigate]);

  return (
    <div className="p-8 max-w-[1600px] mx-auto w-full space-y-5">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono uppercase">Outreach Tracker</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">Leads you've initiated contact with.</p>
        </div>
        <div className="font-mono text-right">
          <div className="text-2xl font-bold text-primary">{leads.length ?? "–"}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">matching records</div>
        </div>
      </div>

      {/* Ready for Outreach queue — leads cleared by the pipeline, not yet contacted */}
      <div className="border border-border bg-card overflow-hidden">
        <button
          onClick={() => setQueueExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Inbox className="h-4 w-4 text-primary" />
            <span className="font-mono text-sm font-bold uppercase tracking-wider">Ready for Outreach</span>
            <span className="font-mono text-xs text-muted-foreground border border-border px-2 py-0.5">
              {queueLoading ? "…" : queueLeads.length}
            </span>
            <span className="font-mono text-xs text-muted-foreground hidden md:inline">
              cleared by pipeline, not yet contacted
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
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-mono uppercase text-xs">Business</TableHead>
                  <TableHead className="font-mono uppercase text-xs w-[60px]">Batch</TableHead>
                  <TableHead className="font-mono uppercase text-xs w-[50px]">Site</TableHead>
                  <TableHead className="font-mono uppercase text-xs">Contact</TableHead>
                  <TableHead className="font-mono uppercase text-xs w-[180px]">Start Outreach</TableHead>
                  <TableHead className="font-mono uppercase text-xs w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {queueLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : queueLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center font-mono text-muted-foreground text-sm">
                      No leads awaiting outreach right now.
                    </TableCell>
                  </TableRow>
                ) : (
                  queueLeads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => handleRowClick(lead.id)}
                    >
                      <TableCell className="font-mono font-medium">
                        <div className="max-w-[220px] truncate">{lead.business_name}</div>
                        {lead.address && (
                          <div className="text-xs text-muted-foreground truncate max-w-[220px]">{lead.address}</div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {lead.scrape_batch_id ? `#${lead.scrape_batch_id}` : "—"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {lead.has_website && lead.website_url ? (
                          <a
                            href={lead.website_url}
                            target="_blank"
                            rel="noreferrer"
                            title={lead.website_url}
                            className="inline-flex items-center text-green-600 hover:text-primary transition-colors"
                          >
                            <Globe className="h-4 w-4" />
                            <ExternalLink className="h-2.5 w-2.5 ml-0.5 opacity-60" />
                          </a>
                        ) : (
                          <GlobeLock className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                        {lead.contact_email ? (
                          <div>
                            <div className="text-foreground truncate max-w-[160px]">{lead.contact_name || "—"}</div>
                            <a
                              href={`mailto:${lead.contact_email}`}
                              className="text-primary hover:underline truncate max-w-[160px] block"
                              title={lead.contact_email}
                            >
                              {lead.contact_email}
                            </a>
                          </div>
                        ) : lead.phone ? (
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Phone</div>
                            <a
                              href={`tel:${lead.phone}`}
                              className="text-foreground hover:text-primary transition-colors truncate max-w-[160px] block"
                              title={lead.phone}
                            >
                              {lead.phone}
                            </a>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select value="" onValueChange={(mode) => handleInitiateOutreach(lead.id, mode)}>
                          <SelectTrigger className="h-7 rounded-none font-mono text-xs border-primary text-primary px-2">
                            <SelectValue placeholder="Channel…" />
                          </SelectTrigger>
                          <SelectContent>
                            {OUTREACH_MODES.filter((m) => m.id !== "none").map((m) => (
                              <SelectItem key={m.id} value={m.id} className="font-mono text-xs">
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Status quick-jump — mirrors the Leads stage quick-jump */}
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-colors ${
            statusFilter === "all"
              ? "bg-foreground text-background border-foreground"
              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"
          }`}
        >
          All ({outreachLeads.length})
        </button>
        {OUTREACH_STATUSES.filter((s) => s.id !== "not_started").map((s) => {
          const count = outreachLeads.filter((l) => l.outreach_status === s.id).length;
          return (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-colors ${
                statusFilter === s.id
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"
              }`}
            >
              {s.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Filter bar — same layout/styling as the Leads page filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search name, contact, email…"
            className="pl-9 w-56 font-mono text-sm rounded-none border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-[150px] font-mono text-xs rounded-none border-border h-8">
            <SelectValue placeholder="Any Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="font-mono text-xs">Any Channel</SelectItem>
            {OUTREACH_MODES.filter((m) => m.id !== "none").map((m) => (
              <SelectItem key={m.id} value={m.id} className="font-mono text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {batches.length > 0 && (
          <Select value={batchFilter} onValueChange={setBatchFilter}>
            <SelectTrigger className="w-[180px] font-mono text-xs rounded-none border-border h-8">
              <SelectValue placeholder="All Batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-mono text-xs">All Batches</SelectItem>
              {batches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)} className="font-mono text-xs">
                  #{b.id} — {b.query} · {b.location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasActiveFilter && (
          <button
            onClick={clearFilters}
            className="text-xs font-mono text-muted-foreground hover:text-destructive transition-colors uppercase tracking-wider"
          >
            Clear
          </button>
        )}
      </div>

      {/* Outreach records table — same structure/styling as the Leads table */}
      <div className="border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="font-mono uppercase text-xs">Business</TableHead>
              <TableHead className="font-mono uppercase text-xs w-[60px]">Batch</TableHead>
              <TableHead className="font-mono uppercase text-xs w-[50px]">Site</TableHead>
              <TableHead className="font-mono uppercase text-xs">Rating</TableHead>
              <TableHead className="font-mono uppercase text-xs">Category</TableHead>
              <TableHead className="font-mono uppercase text-xs">Contact</TableHead>
              <TableHead className="font-mono uppercase text-xs w-[110px]">Channel</TableHead>
              <TableHead className="font-mono uppercase text-xs w-[170px]">Outreach Status</TableHead>
              <TableHead className="font-mono uppercase text-xs w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                </TableCell>
              </TableRow>
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center font-mono text-muted-foreground text-sm">
                  {outreachLeads.length === 0
                    ? "No outreach records yet — start outreach from a Ready for Outreach lead above."
                    : "No records match the current filters."}
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow
                  key={lead.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => handleRowClick(lead.id)}
                >
                  {/* Business */}
                  <TableCell className="font-mono font-medium">
                    <div className="max-w-[220px] truncate">{lead.business_name}</div>
                    {lead.address && (
                      <div className="text-xs text-muted-foreground truncate max-w-[220px]">{lead.address}</div>
                    )}
                  </TableCell>
                  {/* Batch */}
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {lead.scrape_batch_id ? `#${lead.scrape_batch_id}` : "—"}
                  </TableCell>
                  {/* Website */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {lead.has_website && lead.website_url ? (
                      <a
                        href={lead.website_url}
                        target="_blank"
                        rel="noreferrer"
                        title={lead.website_url}
                        className="inline-flex items-center text-green-600 hover:text-primary transition-colors"
                      >
                        <Globe className="h-4 w-4" />
                        <ExternalLink className="h-2.5 w-2.5 ml-0.5 opacity-60" />
                      </a>
                    ) : (
                      <GlobeLock className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  {/* Rating */}
                  <TableCell className="font-mono text-xs">
                    {lead.rating != null ? (
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                        <span>{Number(lead.rating).toFixed(1)}</span>
                        {lead.review_count != null && (
                          <span className="text-muted-foreground">· {lead.review_count}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {/* Category */}
                  <TableCell className="font-mono text-xs text-muted-foreground max-w-[120px]">
                    <span className="truncate block">{lead.business_category || "—"}</span>
                  </TableCell>
                  {/* Contact */}
                  <TableCell className="font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                    {lead.contact_email ? (
                      <div>
                        <div className="text-foreground truncate max-w-[160px]">{lead.contact_name || "—"}</div>
                        <a
                          href={`mailto:${lead.contact_email}`}
                          className="text-primary hover:underline truncate max-w-[160px] block"
                          title={lead.contact_email}
                        >
                          {lead.contact_email}
                        </a>
                      </div>
                    ) : lead.phone ? (
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Phone</div>
                        <a
                          href={`tel:${lead.phone}`}
                          className="text-foreground hover:text-primary transition-colors truncate max-w-[160px] block"
                          title={lead.phone}
                        >
                          {lead.phone}
                        </a>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {/* Channel */}
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {getOutreachModeLabel(lead.outreach_mode)}
                  </TableCell>
                  {/* Outreach status — editable, same pattern as the Stage select on Leads */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={lead.outreach_status || "not_started"}
                      onValueChange={(v) => handleOutreachStatusChange(lead.id, v)}
                    >
                      <SelectTrigger
                        className={`h-7 rounded-none font-mono text-xs border px-2 ${getOutreachStatusColor(lead.outreach_status || "not_started")}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OUTREACH_STATUSES.map((s) => (
                          <SelectItem key={s.id} value={s.id} className="font-mono text-xs">
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
