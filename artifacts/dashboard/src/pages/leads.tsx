import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useListLeads, useUpdateLead, getListLeadsQueryKey, getGetLeadsStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PIPELINE_STATUSES, getStatusLabel, getStatusColor, OUTREACH_MODES } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2, Globe, GlobeLock, ChevronRight, Star, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Batch = { id: number; query: string; location: string; scraped_at: string; lead_count: number };

const QUICK_STAGES = [
  { id: "all", label: "All" },
  { id: "30_Ready_for_Outreach", label: "Ready for Outreach" },
  { id: "99_Manual_Review", label: "Manual Review" },
  { id: "00_Discarded", label: "Discarded" },
  { id: "10_Raw_Scraped", label: "Pending Audit" },
  { id: "20_Audit_Passed", label: "Pending Enrichment" },
];

const SESSION_KEY = "leads_view_state";

type SavedState = {
  statusFilter: string;
  searchQuery: string;
  websiteFilter: string;
  contactFilter: string;
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

export default function Leads() {
  const searchParams = new URLSearchParams(window.location.search);
  const initialStatus = searchParams.get("status") || "all";

  // Restore filter state from sessionStorage on first render
  const saved = loadSavedState();

  const [statusFilter, setStatusFilter] = useState(saved.statusFilter ?? initialStatus);
  const [searchQuery, setSearchQuery] = useState(saved.searchQuery ?? "");
  const [websiteFilter, setWebsiteFilter] = useState(saved.websiteFilter ?? "all");
  const [contactFilter, setContactFilter] = useState(saved.contactFilter ?? "all");
  const [batchFilter, setBatchFilter] = useState(saved.batchFilter ?? "all");
  const [batches, setBatches] = useState<Batch[]>([]);

  const [outreachMode, setOutreachMode] = useState<Record<number, string>>({});

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // ── Persist filter state to sessionStorage ──────────────────────────────
  useEffect(() => {
    const current = loadSavedState();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      ...current,
      statusFilter,
      searchQuery,
      websiteFilter,
      contactFilter,
      batchFilter,
    }));
  }, [statusFilter, searchQuery, websiteFilter, contactFilter, batchFilter]);

  // ── Persist scroll position ──────────────────────────────────────────────
  useEffect(() => {
    const handleScroll = () => {
      const current = loadSavedState();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...current, scrollY: window.scrollY }));
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    fetch("/api/batches")
      .then((r) => r.json())
      .then((d) => setBatches(d.batches || []))
      .catch(() => {});
  }, []);

  const queryParams = {
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(searchQuery && { search: searchQuery }),
    ...(websiteFilter !== "all" && { has_website: websiteFilter as "true" | "false" }),
    ...(contactFilter !== "all" && { has_contact: contactFilter as "true" | "false" }),
    ...(batchFilter !== "all" && { batch_id: parseInt(batchFilter) }),
  };

  const { data, isLoading } = useListLeads(queryParams, {
    query: { queryKey: getListLeadsQueryKey(queryParams) },
  });

  // ── Restore scroll position after data loads ─────────────────────────────
  const scrollRestoredRef = useRef(false);
  const leads = (data?.leads || []).filter((l) => {
    if (statusFilter === "30_Ready_for_Outreach" && l.outreach_mode && l.outreach_mode !== "none") return false;
    return true;
  });

  useEffect(() => {
    if (!isLoading && leads.length > 0 && !scrollRestoredRef.current) {
      const st = loadSavedState();
      if (st.scrollY && st.scrollY > 0) {
        scrollRestoredRef.current = true;
        requestAnimationFrame(() => window.scrollTo({ top: st.scrollY, behavior: "instant" as ScrollBehavior }));
      }
    }
  }, [isLoading, leads.length]);

  const updateLead = useUpdateLead();

  const handleStatusChange = (id: number, newStatus: string) => {
    updateLead.mutate(
      { id, data: { pipeline_status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: "Stage updated", description: `Lead moved to ${getStatusLabel(newStatus)}.` });
          queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetLeadsStatsQueryKey() });
        },
        onError: () => toast({ title: "Error", description: "Failed to update lead status.", variant: "destructive" }),
      },
    );
  };

  const handleInitiateOutreach = (id: number, mode: string) => {
    if (!mode || mode === "none") return;
    updateLead.mutate(
      { id, data: { outreach_mode: mode, outreach_status: "contacted" } },
      {
        onSuccess: () => {
          toast({ title: "Outreach initiated", description: `Lead moved to Outreach Tracker.` });
          setOutreachMode((prev) => ({ ...prev, [id]: "" }));
          queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetLeadsStatsQueryKey() });
        },
        onError: () => toast({ title: "Error", description: "Failed to initiate outreach.", variant: "destructive" }),
      },
    );
  };

  const isReadyView = statusFilter === "30_Ready_for_Outreach";

  const hasActiveFilter =
    statusFilter !== "all" ||
    websiteFilter !== "all" ||
    contactFilter !== "all" ||
    batchFilter !== "all" ||
    searchQuery;

  const clearFilters = () => {
    setStatusFilter("all");
    setWebsiteFilter("all");
    setContactFilter("all");
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
          <h1 className="text-2xl font-bold tracking-tight font-mono uppercase">Leads Database</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">All prospect records.</p>
        </div>
        <div className="font-mono text-right">
          <div className="text-2xl font-bold text-primary">{leads.length ?? "–"}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">matching records</div>
        </div>
      </div>

      {/* Stage quick-jump */}
      <div className="flex items-center gap-1 flex-wrap">
        {QUICK_STAGES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStatusFilter(s.id)}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-colors ${
              statusFilter === s.id
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search name, domain, email…"
            className="pl-9 w-56 font-mono text-sm rounded-none border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Website toggle */}
        <div className="flex items-center gap-1 border border-border">
          {[{ id: "all", label: "Any" }, { id: "true", label: "Has Site" }, { id: "false", label: "No Site" }].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setWebsiteFilter(opt.id)}
              className={`px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors ${
                websiteFilter === opt.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Contact toggle */}
        <div className="flex items-center gap-1 border border-border">
          {[{ id: "all", label: "Any Contact" }, { id: "true", label: "Has Email" }, { id: "false", label: "No Email" }].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setContactFilter(opt.id)}
              className={`px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors ${
                contactFilter === opt.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

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

      {/* Outreach initiation hint */}
      {isReadyView && (
        <div className="bg-primary/5 border border-primary/20 p-3 font-mono text-xs text-primary">
          Select an outreach channel to initiate contact. The lead will move to the Outreach Tracker.
        </div>
      )}

      <div className="border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="font-mono uppercase text-xs">Business</TableHead>
              <TableHead className="font-mono uppercase text-xs w-[60px]">Batch</TableHead>
              <TableHead className="font-mono uppercase text-xs w-[50px]">Site</TableHead>
              <TableHead className="font-mono uppercase text-xs">Rating</TableHead>
              <TableHead className="font-mono uppercase text-xs">Category</TableHead>
              <TableHead className="font-mono uppercase text-xs w-[90px]">Audit</TableHead>
              <TableHead className="font-mono uppercase text-xs">Contact</TableHead>
              {isReadyView ? (
                <TableHead className="font-mono uppercase text-xs w-[180px]">Start Outreach</TableHead>
              ) : (
                <TableHead className="font-mono uppercase text-xs w-[160px]">Stage</TableHead>
              )}
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
                  {isReadyView
                    ? "No leads awaiting outreach — all have been initiated or no leads in this stage yet."
                    : "No leads match the current filters."}
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
                  {/* Website — clickable globe opens site in new tab */}
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
                  {/* Audit result */}
                  <TableCell className="font-mono text-xs">
                    {(() => {
                      const mobile = (lead as any).mobile_speed_score as number | null | undefined;
                      const status = lead.pipeline_status;
                      if (mobile == null) {
                        if (status === "10_Raw_Scraped") return <span className="text-muted-foreground">—</span>;
                        return <span className="text-amber-600">?</span>;
                      }
                      const passed = status === "20_Audit_Passed" || status === "30_Ready_for_Outreach";
                      return (
                        <div className="flex items-center gap-1">
                          <span className={passed ? "text-green-600 font-bold" : "text-red-500"}>{mobile}</span>
                          <span className={`text-[9px] uppercase ${passed ? "text-green-600" : "text-red-500"}`}>{passed ? "✓" : "✗"}</span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  {/* Contact — email preferred, phone as fallback */}
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
                    ) : (lead as any).phone ? (
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Phone</div>
                        <a
                          href={`tel:${(lead as any).phone}`}
                          className="text-foreground hover:text-primary transition-colors truncate max-w-[160px] block"
                          title={(lead as any).phone}
                        >
                          {(lead as any).phone}
                        </a>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {/* Outreach initiate OR Stage */}
                  {isReadyView ? (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={outreachMode[lead.id] || ""}
                        onValueChange={(mode) => {
                          setOutreachMode((prev) => ({ ...prev, [lead.id]: mode }));
                          handleInitiateOutreach(lead.id, mode);
                        }}
                      >
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
                  ) : (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={lead.pipeline_status}
                        onValueChange={(v) => handleStatusChange(lead.id, v)}
                      >
                        <SelectTrigger
                          className={`h-7 rounded-none font-mono text-xs border px-2 ${getStatusColor(lead.pipeline_status)}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PIPELINE_STATUSES.map((s) => (
                            <SelectItem key={s.id} value={s.id} className="font-mono text-xs">
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  )}
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
