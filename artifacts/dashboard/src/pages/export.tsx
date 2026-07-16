import React, { useState, useEffect } from "react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { PIPELINE_STATUSES, OUTREACH_STATUSES } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Search } from "lucide-react";

type Batch = { id: number; query: string; location: string; scraped_at: string };

export default function Export() {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const isSalesCaller = me?.user?.role === "sales_caller";

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [outreachStatusFilter, setOutreachStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");
  const [hasWebsite, setHasWebsite] = useState("all");
  const [batches, setBatches] = useState<Batch[]>([]);

  useEffect(() => {
    if (isSalesCaller) return; // batches are a full-pipeline concept, not relevant to outreach-only exports
    fetch("/api/batches")
      .then((r) => r.json())
      .then((d) => setBatches(d.batches || []))
      .catch(() => {});
  }, [isSalesCaller]);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (isSalesCaller) {
      if (outreachStatusFilter !== "all") params.append("outreach_status", outreachStatusFilter);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());
    } else {
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());
      if (batchFilter !== "all") params.append("batch_id", batchFilter);
      if (hasWebsite !== "all") params.append("has_website", hasWebsite);
    }
    const url = `/api/leads/export${params.toString() ? `?${params.toString()}` : ""}`;
    window.open(url, "_blank");
  };

  return (
    <div className="p-8 max-w-3xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-mono uppercase">Export Data</h1>
        <p className="text-muted-foreground mt-1 font-mono text-sm">
          {isSalesCaller
            ? "Download your outreach leads for external processing or mail merge."
            : "Download lead segments for external processing or mail merge."}
        </p>
      </div>

      <Card className="rounded-none border-border shadow-none">
        <CardHeader className="bg-muted/30 border-b border-border">
          <CardTitle className="font-mono text-lg uppercase tracking-wider">CSV Generator</CardTitle>
          <CardDescription className="font-mono text-sm">
            {isSalesCaller
              ? "Filters apply only to leads you've already started outreach on."
              : "Apply filters, then generate a CSV."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-5">

          {isSalesCaller ? (
            <div className="space-y-2">
              <label className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">Outreach Status</label>
              <Select value={outreachStatusFilter} onValueChange={setOutreachStatusFilter}>
                <SelectTrigger className="w-full rounded-none font-mono border-border h-10">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="font-mono">ALL OUTREACH STATUSES</SelectItem>
                  {OUTREACH_STATUSES.filter((s) => s.id !== "not_started").map((s) => (
                    <SelectItem key={s.id} value={s.id} className="font-mono">{s.label.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">Pipeline Stage</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full rounded-none font-mono border-border h-10">
                  <SelectValue placeholder="All Stages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="font-mono">ALL STAGES</SelectItem>
                  {PIPELINE_STATUSES.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="font-mono">{s.label.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Search */}
          <div className="space-y-2">
            <label className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Name, contact, email…"
                className="pl-9 rounded-none font-mono text-sm border-border"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {!isSalesCaller && (
            <div className="grid grid-cols-2 gap-4">
              {/* Batch */}
              <div className="space-y-2">
                <label className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">Scrape Batch</label>
                <Select value={batchFilter} onValueChange={setBatchFilter}>
                  <SelectTrigger className="rounded-none font-mono border-border h-10 text-xs">
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
              </div>

              {/* Website */}
              <div className="space-y-2">
                <label className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">Website</label>
                <Select value={hasWebsite} onValueChange={setHasWebsite}>
                  <SelectTrigger className="rounded-none font-mono border-border h-10 text-xs">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="font-mono text-xs">Any</SelectItem>
                    <SelectItem value="true" className="font-mono text-xs">Has Website</SelectItem>
                    <SelectItem value="false" className="font-mono text-xs">No Website</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-border">
            <Button
              onClick={handleExport}
              className="w-full rounded-none h-14 font-mono uppercase font-bold tracking-widest text-base"
            >
              <Download className="mr-2 h-5 w-5" />
              Generate CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
