import React, { useState, useEffect, useCallback, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Save, Loader2, Zap, RefreshCw, ChevronDown, ChevronRight, ChevronUp,
  CheckCircle2, AlertCircle, Clock
} from "lucide-react";

const API = "";

// ── Types ─────────────────────────────────────────────────────────────────────

type PipelineStages = {
  scraper_enabled: boolean;
  auditor_enabled: boolean;
  enricher_enabled: boolean;
  trigger_scrape: boolean;
  trigger_audit: boolean;
};

type Runtime = {
  scraper_running: boolean;
  auditor_running: boolean;
  last_scrape_at: string | null;
  last_audit_at: string | null;
};

type AuditProgress = {
  step: "idle" | "auditing" | "done" | "error";
  message: string;
  current: number;
  total: number;
  passed: number;
  failed: number;
  inconclusive: number;
  log: Array<{ time: string; msg: string }>;
  started_at: string | null;
  finished_at: string | null;
};

type ScrapeProgress = {
  step: "idle" | "starting" | "fetching" | "parsing" | "inserting" | "done" | "error";
  message: string;
  current: number;
  total: number;
  new_leads: number;
  duplicates_skipped: number;
  query: string | null;
  location: string | null;
  log: Array<{ time: string; msg: string }>;
  started_at: string | null;
  finished_at: string | null;
};

type Batch = {
  id: number;
  query: string;
  location: string;
  limit_count: number;
  scraped_at: string;
  lead_count: number;
};

type Settings = {
  scraper: { query: string; location: string; limit: number };
  auditor: {
    mobile_pass_threshold: number;
    mobile_discard_threshold: number;
    openai_model: string;
    openai_max_tokens: number;
  };
  enricher: { target_titles: string[] };
  pipeline: {
    poll_interval_seconds: number;
    max_audit_concurrency: number;
    auditor_interval_seconds: number;
    enricher_interval_seconds: number;
  };
};

type AuditLead = {
  id: number;
  business_name: string;
  website_url: string | null;
  address: string | null;
  mobile_speed_score: number | null;
  desktop_speed_score: number | null;
  ai_ux_critique: string | null;
  pipeline_status: string;
  rating: number | null;
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border p-5 space-y-4">
      <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-primary border-b border-border pb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-xs uppercase text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground font-mono">{hint}</p>}
    </div>
  );
}

function StageToggle({
  stage, enabled, onToggle, loading,
}: {
  stage: string; enabled: boolean; onToggle: (stage: string, enable: boolean) => void; loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-4 border border-border bg-muted/30">
      <div className="space-y-0.5">
        <div className="font-mono font-bold text-sm uppercase tracking-wider">{stage} Stage</div>
        <div className="font-mono text-xs text-muted-foreground">
          {enabled ? "Active — processing leads automatically" : "Inactive — stage is paused"}
        </div>
      </div>
      <Button
        onClick={() => onToggle(stage.toLowerCase(), !enabled)}
        disabled={loading}
        variant={enabled ? "default" : "outline"}
        className={`rounded-none font-mono uppercase tracking-wider text-xs min-w-[110px] ${
          enabled ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : "border-border text-muted-foreground"
        }`}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : enabled ? "Active" : "Inactive"}
      </Button>
    </div>
  );
}

function ScrapeProgressPanel({ progress }: { progress: ScrapeProgress | null }) {
  const logRef = useRef<HTMLDivElement>(null);
  const [showLog, setShowLog] = useState(false);

  const isIdle = !progress || progress.step === "idle";
  const isDone = progress?.step === "done";
  const isError = progress?.step === "error";
  const isActive = !isIdle && !isDone && !isError;

  // Auto-open log when a scrape starts or finishes; keep closed when idle
  useEffect(() => {
    if (isActive || isDone || isError) setShowLog(true);
    if (isIdle) setShowLog(false);
  }, [isActive, isDone, isError, isIdle]);

  // Scroll to bottom whenever log grows
  useEffect(() => {
    if (showLog && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [progress?.log, showLog]);

  const pct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : null;

  const stepColor = isDone
    ? "text-green-600"
    : isError
    ? "text-red-600"
    : isIdle
    ? "text-muted-foreground"
    : "text-primary";

  const barColor = isDone
    ? "bg-green-500"
    : isError
    ? "bg-red-500"
    : "bg-primary";

  const hasLog = progress && progress.log.length > 0;

  return (
    <div className="border border-border bg-muted/10 space-y-3 p-4">
      {/* Status row */}
      <div className="flex items-center gap-2">
        {isDone ? (
          <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
        ) : isError ? (
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
        ) : isActive ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
        ) : (
          <div className="h-4 w-4 rounded-full border border-muted-foreground/40 flex-shrink-0" />
        )}
        <span className={`font-mono text-xs font-bold uppercase tracking-wider ${stepColor}`}>
          {isIdle ? "Ready" : progress!.step.toUpperCase()}
        </span>
        <span className="font-mono text-xs text-muted-foreground flex-1 truncate">
          {isIdle ? "— waiting for next batch trigger" : `— ${progress!.message}`}
        </span>
        {pct !== null && (
          <span className="font-mono text-xs text-muted-foreground tabular-nums flex-shrink-0">
            {pct}%
          </span>
        )}
        {hasLog && (
          <button
            onClick={() => setShowLog((v) => !v)}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 ml-1"
          >
            {showLog ? (
              <><ChevronUp className="h-3 w-3" /> Hide log</>
            ) : (
              <><ChevronDown className="h-3 w-3" /> Show log</>
            )}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted h-1.5 overflow-hidden">
        {pct !== null ? (
          <div
            className={`h-full transition-all duration-300 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        ) : isActive ? (
          <div className={`h-full ${barColor} animate-pulse w-full`} />
        ) : null}
      </div>

      {/* Query/location tag — always show when available */}
      {progress && (progress.query || progress.location) && (
        <div className="font-mono text-[10px] text-muted-foreground flex items-center gap-1.5">
          <span className="uppercase tracking-wider">Query:</span>
          <span className="text-foreground font-bold">
            {[progress.query, progress.location].filter(Boolean).join(" · ")}
          </span>
        </div>
      )}

      {/* Done summary */}
      {isDone && progress && (
        <div className="flex gap-4 font-mono text-xs">
          <span className="text-green-700 font-bold">+{progress.new_leads} new leads</span>
          {progress.duplicates_skipped > 0 && (
            <span className="text-muted-foreground">{progress.duplicates_skipped} duplicates skipped</span>
          )}
          {progress.new_leads === 0 && progress.duplicates_skipped > 0 && (
            <span className="text-amber-600">All results already in database</span>
          )}
          {progress.started_at && progress.finished_at && (
            <span className="text-muted-foreground ml-auto">
              <Clock className="inline h-3 w-3 mr-1" />
              {Math.round(
                (new Date(progress.finished_at).getTime() - new Date(progress.started_at).getTime()) / 1000
              )}s
            </span>
          )}
        </div>
      )}

      {/* Log — collapsible */}
      {showLog && hasLog && (
        <div
          ref={logRef}
          className="bg-background border border-border max-h-48 overflow-y-auto p-2 space-y-0.5"
        >
          {progress!.log.map((entry, i) => (
            <div key={i} className="flex gap-2 font-mono text-[10px]">
              <span className="text-muted-foreground flex-shrink-0 tabular-nums">
                {new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className="text-foreground">{entry.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditProgressPanel({ progress }: { progress: AuditProgress | null }) {
  const logRef = useRef<HTMLDivElement>(null);
  const [showLog, setShowLog] = useState(false);

  const isIdle = !progress || progress.step === "idle";
  const isDone = progress?.step === "done";
  const isError = progress?.step === "error";
  const isActive = !isIdle && !isDone && !isError;

  useEffect(() => {
    if (isActive || isDone || isError) setShowLog(true);
    if (isIdle) setShowLog(false);
  }, [isActive, isDone, isError, isIdle]);

  useEffect(() => {
    if (showLog && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [progress?.log, showLog]);

  const pct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : null;

  const stepColor = isDone ? "text-green-600" : isError ? "text-red-600" : isIdle ? "text-muted-foreground" : "text-primary";
  const barColor = isDone ? "bg-green-500" : isError ? "bg-red-500" : "bg-primary";
  const hasLog = progress && progress.log.length > 0;

  return (
    <div className="border border-border bg-muted/10 space-y-3 p-4">
      <div className="flex items-center gap-2">
        {isDone ? (
          <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
        ) : isError ? (
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
        ) : isActive ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
        ) : (
          <div className="h-4 w-4 rounded-full border border-muted-foreground/40 flex-shrink-0" />
        )}
        <span className={`font-mono text-xs font-bold uppercase tracking-wider ${stepColor}`}>
          {isIdle ? "Ready" : progress!.step.toUpperCase()}
        </span>
        <span className="font-mono text-xs text-muted-foreground flex-1 truncate">
          {isIdle ? "— waiting for next audit run" : `— ${progress!.message}`}
        </span>
        {pct !== null && (
          <span className="font-mono text-xs text-muted-foreground tabular-nums flex-shrink-0">{pct}%</span>
        )}
        {hasLog && (
          <button
            onClick={() => setShowLog((v) => !v)}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 ml-1"
          >
            {showLog ? <><ChevronUp className="h-3 w-3" /> Hide log</> : <><ChevronDown className="h-3 w-3" /> Show log</>}
          </button>
        )}
      </div>

      <div className="w-full bg-muted h-1.5 overflow-hidden">
        {pct !== null ? (
          <div className={`h-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
        ) : isActive ? (
          <div className={`h-full ${barColor} animate-pulse w-full`} />
        ) : null}
      </div>

      {isDone && progress && (
        <div className="flex gap-4 font-mono text-xs">
          <span className="text-green-700 font-bold">✓ {progress.passed} passed</span>
          {progress.failed > 0 && <span className="text-red-600">✗ {progress.failed} failed</span>}
          {progress.inconclusive > 0 && <span className="text-yellow-600">? {progress.inconclusive} inconclusive</span>}
          {progress.started_at && progress.finished_at && (
            <span className="text-muted-foreground ml-auto">
              <Clock className="inline h-3 w-3 mr-1" />
              {Math.round((new Date(progress.finished_at).getTime() - new Date(progress.started_at).getTime()) / 1000)}s
            </span>
          )}
        </div>
      )}

      {showLog && hasLog && (
        <div ref={logRef} className="bg-background border border-border max-h-48 overflow-y-auto p-2 space-y-0.5">
          {progress!.log.map((entry, i) => (
            <div key={i} className="flex gap-2 font-mono text-[10px]">
              <span className="text-muted-foreground flex-shrink-0 tabular-nums">
                {new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className={entry.msg.startsWith("✓") ? "text-green-700" : entry.msg.startsWith("✗") ? "text-red-600" : entry.msg.startsWith("?") ? "text-yellow-600" : "text-foreground"}>
                {entry.msg}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditLeadRow({ lead, pending }: { lead: AuditLead; pending: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-border bg-muted/10 font-mono text-xs">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => !pending && setExpanded((x) => !x)}
      >
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{lead.business_name}</div>
          {lead.address && <div className="text-muted-foreground truncate">{lead.address}</div>}
          {lead.website_url && (
            <a
              href={lead.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline truncate block"
              onClick={(e) => e.stopPropagation()}
            >
              {lead.website_url}
            </a>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {pending ? (
            <Badge variant="outline" className="rounded-none border-orange-300 text-orange-600 bg-orange-50 font-mono text-xs">
              Pending Audit
            </Badge>
          ) : (
            <>
              {lead.mobile_speed_score != null && (
                <div className="text-center">
                  <div className={`text-lg font-bold tabular-nums ${
                    lead.mobile_speed_score < 50 ? "text-red-600" : lead.mobile_speed_score < 70 ? "text-yellow-600" : "text-green-600"
                  }`}>{lead.mobile_speed_score}</div>
                  <div className="text-muted-foreground text-[10px] uppercase">Mobile</div>
                </div>
              )}
              {lead.desktop_speed_score != null && (
                <div className="text-center">
                  <div className={`text-lg font-bold tabular-nums ${
                    lead.desktop_speed_score < 50 ? "text-red-600" : lead.desktop_speed_score < 70 ? "text-yellow-600" : "text-green-600"
                  }`}>{lead.desktop_speed_score}</div>
                  <div className="text-muted-foreground text-[10px] uppercase">Desktop</div>
                </div>
              )}
              <Badge variant="outline" className="rounded-none font-mono text-xs border-green-300 text-green-700 bg-green-50">
                Audited
              </Badge>
              {lead.ai_ux_critique && (
                expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </>
          )}
        </div>
      </div>
      {expanded && lead.ai_ux_critique && (
        <div className="px-3 pb-3 border-t border-border">
          <div className="text-[10px] uppercase text-muted-foreground font-bold mt-2 mb-1">AI Critique</div>
          <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{lead.ai_ux_critique}</p>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

const BATCH_PAGE_SIZE = 10;

export default function Pipeline() {
  const { toast } = useToast();
  const [stages, setStages] = useState<PipelineStages | null>(null);
  const [runtime, setRuntime] = useState<Runtime>({ scraper_running: false, auditor_running: false, last_scrape_at: null, last_audit_at: null });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchesExpanded, setBatchesExpanded] = useState(false);
  const [stageLoading, setStageLoading] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [auditTriggerLoading, setAuditTriggerLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("scraper");
  const [scrapeProgress, setScrapeProgress] = useState<ScrapeProgress | null>(null);
  const [auditProgress, setAuditProgress] = useState<AuditProgress | null>(null);

  // Auditor queue state
  const [pendingAuditLeads, setPendingAuditLeads] = useState<AuditLead[]>([]);
  const [auditedLeads, setAuditedLeads] = useState<AuditLead[]>([]);
  const [auditorLeadsLoading, setAuditorLeadsLoading] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const auditPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const auditBgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`${API}/api/pipeline/status`);
    if (!res.ok) return;
    const d = await res.json();
    setStages(d.stages);
    if (d.runtime) setRuntime({
      scraper_running: d.runtime.scraper_running,
      auditor_running: d.runtime.auditor_running ?? false,
      last_scrape_at: d.runtime.last_scrape_at,
      last_audit_at: d.runtime.last_audit_at ?? null,
    });
    return d;
  }, []);

  const fetchBatches = useCallback(async () => {
    const res = await fetch(`${API}/api/batches`);
    if (!res.ok) return [];
    const d = await res.json();
    const b = d.batches || [];
    setBatches(b);
    return b;
  }, []);

  const fetchProgress = useCallback(async (autoShow = false): Promise<ScrapeProgress | null> => {
    try {
      const res = await fetch(`${API}/api/pipeline/scrape-progress`);
      if (!res.ok) return null;
      const p = await res.json();
      setScrapeProgress(p);
      return p;
    } catch {
      return null;
    }
  }, []);

  const fetchAuditProgress = useCallback(async (): Promise<AuditProgress | null> => {
    try {
      const res = await fetch(`${API}/api/pipeline/audit-progress`);
      if (!res.ok) return null;
      const p = await res.json();
      setAuditProgress(p);
      return p;
    } catch {
      return null;
    }
  }, []);

  const fetchAuditorLeads = useCallback(async () => {
    setAuditorLeadsLoading(true);
    try {
      const [pendingRes, auditedRes] = await Promise.all([
        fetch(`${API}/api/leads?status=10_Raw_Scraped`),
        fetch(`${API}/api/leads?has_speed_score=true`),
      ]);
      if (pendingRes.ok) setPendingAuditLeads((await pendingRes.json()).leads || []);
      if (auditedRes.ok) setAuditedLeads((await auditedRes.json()).leads || []);
    } finally {
      setAuditorLeadsLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [, settingsRes] = await Promise.all([
        fetchStatus(),
        fetch(`${API}/api/settings`),
        fetchBatches(),
        fetchProgress(true),
        fetchAuditProgress(),
      ]);
      if (settingsRes.ok) {
        const d = await settingsRes.json();
        setSettings(d.settings);
      }
    } catch {
      toast({ title: "Error", description: "Could not load pipeline data.", variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  }, [fetchStatus, fetchBatches, fetchProgress, fetchAuditProgress, toast]);

  useEffect(() => {
    fetchAll();
    return () => stopPolling();
  }, [fetchAll]);

  // Background poller: when the scraper is active but no user-triggered poll
  // is running, keep refreshing status + progress every 3s until it finishes.
  const bgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopBgPoll = () => {
    if (bgPollRef.current) { clearInterval(bgPollRef.current); bgPollRef.current = null; }
  };

  useEffect(() => {
    const isActive = runtime.scraper_running || (
      scrapeProgress !== null &&
      !["idle", "done", "error"].includes(scrapeProgress.step)
    );

    if (isActive && !triggerLoading) {
      // Start background refresh if not already running
      if (!bgPollRef.current) {
        bgPollRef.current = setInterval(async () => {
          const [statusData, progress] = await Promise.all([
            fetchStatus(),
            fetchProgress(),
          ]);
          const stillRunning =
            (statusData as { runtime?: { scraper_running?: boolean } } | undefined)
              ?.runtime?.scraper_running ?? false;
          const progStep = (progress as ScrapeProgress | null)?.step ?? "idle";
          // Stop bg poll once scraper finishes
          if (!stillRunning && ["idle", "done", "error"].includes(progStep)) {
            stopBgPoll();
            fetchBatches();
          }
        }, 3000);
      }
    } else {
      stopBgPoll();
    }

    return stopBgPoll;
  }, [runtime.scraper_running, scrapeProgress?.step, triggerLoading, fetchStatus, fetchProgress, fetchBatches]);

  // Background poller: audit stage — keep refreshing while auditor_running
  const stopAuditBgPoll = () => {
    if (auditBgPollRef.current) { clearInterval(auditBgPollRef.current); auditBgPollRef.current = null; }
  };

  useEffect(() => {
    const isActive = runtime.auditor_running || (
      auditProgress !== null &&
      !["idle", "done", "error"].includes(auditProgress.step)
    );

    if (isActive && !auditTriggerLoading) {
      if (!auditBgPollRef.current) {
        auditBgPollRef.current = setInterval(async () => {
          const [statusData, progress] = await Promise.all([fetchStatus(), fetchAuditProgress()]);
          const stillRunning =
            (statusData as { runtime?: { auditor_running?: boolean } } | undefined)
              ?.runtime?.auditor_running ?? false;
          const progStep = (progress as AuditProgress | null)?.step ?? "idle";
          if (!stillRunning && ["idle", "done", "error"].includes(progStep)) {
            stopAuditBgPoll();
            fetchAuditorLeads();
          }
        }, 2000);
      }
    } else {
      stopAuditBgPoll();
    }
    return stopAuditBgPoll;
  }, [runtime.auditor_running, auditProgress?.step, auditTriggerLoading, fetchStatus, fetchAuditProgress, fetchAuditorLeads]);

  useEffect(() => {
    if (activeTab === "auditor") { fetchAuditorLeads(); fetchAuditProgress(); }
  }, [activeTab, fetchAuditorLeads, fetchAuditProgress]);

  const handleStageToggle = async (stage: string, enable: boolean) => {
    setStageLoading(stage);
    try {
      const res = await fetch(`${API}/api/pipeline/${stage}/${enable ? "enable" : "disable"}`, { method: "POST" });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setStages(d.stages);
      toast({
        title: `${stage.charAt(0).toUpperCase() + stage.slice(1)} ${enable ? "activated" : "deactivated"}`,
        description: "Takes effect on next pipeline tick.",
      });
    } catch {
      toast({ title: "Error", description: "Failed to toggle stage.", variant: "destructive" });
    } finally {
      setStageLoading(null);
    }
  };

  const handleAddBatch = async () => {
    setTriggerLoading(true);
    setScrapeProgress(null);

    try {
      const res = await fetch(`${API}/api/pipeline/scraper/trigger`, { method: "POST" });
      if (!res.ok) throw new Error("Trigger request failed");
      setStages((prev) => prev ? { ...prev, trigger_scrape: true } : prev);
      toast({ title: "Batch queued", description: "Pipeline will start scraping within 10 seconds." });

      stopPolling();
      let seenStartedAt: string | null = null;

      pollRef.current = setInterval(async () => {
        // Poll progress (primary completion signal)
        const progress = await fetchProgress();
        if (progress) {
          // If we have a started_at from this run, detect completion via step===done/error
          if (progress.started_at && progress.started_at !== seenStartedAt) {
            // A new run has started (started_at changed or appeared)
            if (seenStartedAt === null) {
              seenStartedAt = progress.started_at;
            }
          }

          const isComplete = (
            progress.step === "done" ||
            progress.step === "error"
          ) && (
            // Only resolve if this progress belongs to the run we triggered
            // (started_at is within the last 10 minutes)
            progress.started_at !== null &&
            Date.now() - new Date(progress.started_at).getTime() < 10 * 60 * 1000
          );

          if (isComplete) {
            stopPolling();
            setTriggerLoading(false);
            await fetchBatches();
            await fetchStatus();
            if (progress.step === "done") {
              toast({
                title: "Batch complete",
                description: `${progress.new_leads} new leads added${progress.duplicates_skipped > 0 ? `, ${progress.duplicates_skipped} duplicates skipped` : ""}.`,
              });
            } else {
              toast({ title: "Batch failed", description: progress.message, variant: "destructive" });
            }
            return;
          }
        }

        // Fallback: poll pipeline status too
        const statusData = await fetchStatus() as { stages?: PipelineStages; runtime?: Runtime } | undefined;
        const scraperRunning = statusData?.runtime?.scraper_running ?? false;
        const triggerStillSet = statusData?.stages?.trigger_scrape ?? false;

        // If scraper is no longer running AND trigger was consumed AND we have a recent done progress
        if (!scraperRunning && !triggerStillSet && progress?.step === "done") {
          stopPolling();
          setTriggerLoading(false);
          await fetchBatches();
        }
      }, 2000);

      // Hard timeout: 8 minutes
      setTimeout(() => {
        if (pollRef.current) {
          stopPolling();
          setTriggerLoading(false);
          fetchBatches();
          toast({ title: "Timed out", description: "Scrape is taking longer than expected. Check the pipeline logs.", variant: "destructive" });
        }
      }, 8 * 60 * 1000);

    } catch (err) {
      toast({ title: "Error", description: "Failed to queue batch.", variant: "destructive" });
      setTriggerLoading(false);
    }
  };

  const handleRunAudit = async () => {
    setAuditTriggerLoading(true);
    setAuditProgress(null);
    try {
      const res = await fetch(`${API}/api/pipeline/auditor/trigger`, { method: "POST" });
      if (!res.ok) throw new Error("Trigger request failed");
      setStages((prev) => prev ? { ...prev, trigger_audit: true } : prev);
      toast({ title: "Audit queued", description: "Pipeline will start auditing within 10 seconds." });

      if (auditPollRef.current) clearInterval(auditPollRef.current);
      let seenStartedAt: string | null = null;

      auditPollRef.current = setInterval(async () => {
        const progress = await fetchAuditProgress();
        if (progress) {
          if (progress.started_at && progress.started_at !== seenStartedAt) {
            seenStartedAt = progress.started_at;
          }
          const isComplete = (progress.step === "done" || progress.step === "error") &&
            progress.started_at !== null &&
            Date.now() - new Date(progress.started_at).getTime() < 10 * 60 * 1000;

          if (isComplete) {
            clearInterval(auditPollRef.current!);
            auditPollRef.current = null;
            setAuditTriggerLoading(false);
            await fetchAuditorLeads();
            await fetchStatus();
            if (progress.step === "done") {
              toast({
                title: "Audit complete",
                description: `${progress.passed} passed · ${progress.failed} failed · ${progress.inconclusive} inconclusive`,
              });
            } else {
              toast({ title: "Audit failed", description: progress.message, variant: "destructive" });
            }
            return;
          }
        }
        const statusData = await fetchStatus() as { runtime?: { auditor_running?: boolean }; stages?: { trigger_audit?: boolean } } | undefined;
        if (!(statusData?.runtime?.auditor_running) && !(statusData?.stages?.trigger_audit) && progress?.step === "done") {
          clearInterval(auditPollRef.current!);
          auditPollRef.current = null;
          setAuditTriggerLoading(false);
          await fetchAuditorLeads();
        }
      }, 2000);

      // Hard timeout: 20 minutes (audits take longer than scrapes)
      setTimeout(() => {
        if (auditPollRef.current) {
          clearInterval(auditPollRef.current);
          auditPollRef.current = null;
          setAuditTriggerLoading(false);
          fetchAuditorLeads();
          toast({ title: "Timed out", description: "Audit is taking longer than expected.", variant: "destructive" });
        }
      }, 20 * 60 * 1000);

    } catch {
      toast({ title: "Error", description: "Failed to queue audit.", variant: "destructive" });
      setAuditTriggerLoading(false);
    }
  };

  const setSettingField = <S extends keyof Settings>(section: S, key: keyof Settings[S], value: unknown) => {
    setSettings((prev) => prev ? { ...prev, [section]: { ...prev[section], [key]: value } } : prev);
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSettingsLoading(true);
    try {
      const res = await fetch(`${API}/api/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setSettings(d.settings);
      await fetchStatus();
      toast({ title: "Settings saved", description: "Changes take effect on the next pipeline tick." });
    } catch {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    } finally {
      setSettingsLoading(false);
    }
  };

  if (!stages || !settings) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isRunning = triggerLoading || runtime.scraper_running;
  const visibleBatches = batchesExpanded ? batches : batches.slice(0, BATCH_PAGE_SIZE);

  return (
    <div className="p-8 max-w-4xl mx-auto w-full space-y-6 pb-28">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono uppercase">Pipeline Control</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Manage scraping, auditing, and enrichment stages.
          </p>
        </div>
        <button
          onClick={fetchAll}
          disabled={refreshing}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="rounded-none border border-border bg-transparent h-auto p-0 gap-0">
          {["Scraper", "Auditor", "Enricher"].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab.toLowerCase()}
              className="rounded-none font-mono uppercase text-xs tracking-wider px-5 py-2.5 border-r border-border last:border-r-0 data-[state=active]:bg-foreground data-[state=active]:text-background"
            >
              {tab}
              <span
                className={`ml-2 h-1.5 w-1.5 rounded-full inline-block ${
                  stages[`${tab.toLowerCase()}_enabled` as keyof PipelineStages] ? "bg-green-500" : "bg-gray-400"
                }`}
              />
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── SCRAPER TAB ─────────────────────────────────────────────────────── */}
        <TabsContent value="scraper" className="mt-6 space-y-4">
          <StageToggle
            stage="Scraper"
            enabled={stages.scraper_enabled}
            onToggle={handleStageToggle}
            loading={stageLoading === "scraper"}
          />

          {/* Add Batch */}
          <Section title="Add Batch">
            <p className="text-xs font-mono text-muted-foreground">
              Pull one batch of results from Google Maps using the settings below and add them to the leads database.
              New records are added; duplicates (same business + phone) are automatically skipped.
            </p>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleAddBatch}
                disabled={isRunning}
                variant="outline"
                className="rounded-none font-mono uppercase tracking-wider text-xs border-primary text-primary hover:bg-primary hover:text-primary-foreground"
              >
                {isRunning ? (
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-3 w-3 mr-2" />
                )}
                {runtime.scraper_running ? "Running…" : isRunning ? "Waiting for pipeline…" : "Add Batch"}
              </Button>
            </div>

            {runtime.last_scrape_at && !isRunning && (
              <p className="text-xs font-mono text-muted-foreground">
                Last batch: {new Date(runtime.last_scrape_at).toLocaleString()}
              </p>
            )}

            {/* Progress panel — always visible */}
            <ScrapeProgressPanel progress={scrapeProgress} />
          </Section>

          {/* Search Parameters */}
          <Section title="Search Parameters">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Search Query" hint="Business type to search for.">
                <Input
                  value={settings.scraper.query}
                  onChange={(e) => setSettingField("scraper", "query", e.target.value)}
                  className="rounded-none font-mono text-sm"
                  placeholder="e.g. gym, dentist"
                />
              </Field>
              <Field label="Location" hint="City or region.">
                <Input
                  value={settings.scraper.location}
                  onChange={(e) => setSettingField("scraper", "location", e.target.value)}
                  className="rounded-none font-mono text-sm"
                  placeholder="e.g. Kharagpur, India"
                />
              </Field>
            </div>
            <Field label="Results per batch" hint="Max businesses per Apify run (up to 500). Without an Apify key, pulls from a 30-business test pool.">
              <Input
                type="number"
                min={1}
                max={500}
                value={settings.scraper.limit}
                onChange={(e) => setSettingField("scraper", "limit", parseInt(e.target.value) || 20)}
                className="rounded-none font-mono text-sm w-40"
              />
            </Field>
          </Section>

          {/* Scrape Batches */}
          <Section title="Scrape Batches">
            {batches.length === 0 ? (
              <p className="text-xs font-mono text-muted-foreground">No batches yet. Add a batch to begin.</p>
            ) : (
              <div className="space-y-1">
                {visibleBatches.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-3 border border-border bg-muted/20 font-mono text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-muted-foreground flex-shrink-0">#{b.id}</span>
                      <span className="font-bold truncate">{b.query}</span>
                      <span className="text-muted-foreground truncate hidden sm:inline">in {b.location}</span>
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground flex-shrink-0 ml-3">
                      <span className={b.lead_count > 0 ? "text-green-700 font-bold" : ""}>
                        {b.lead_count > 0 ? `+${b.lead_count} leads` : "0 new"}
                      </span>
                      <span>{new Date(b.scraped_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}

                {batches.length > BATCH_PAGE_SIZE && (
                  <button
                    onClick={() => setBatchesExpanded((v) => !v)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border mt-1"
                  >
                    {batchesExpanded ? (
                      <><ChevronUp className="h-3 w-3" /> Show less</>
                    ) : (
                      <><ChevronDown className="h-3 w-3" /> Show all {batches.length} batches</>
                    )}
                  </button>
                )}
              </div>
            )}
          </Section>
        </TabsContent>

        {/* ── AUDITOR TAB ──────────────────────────────────────────────────────── */}
        <TabsContent value="auditor" className="mt-6 space-y-4">
          <StageToggle
            stage="Auditor"
            enabled={stages.auditor_enabled}
            onToggle={handleStageToggle}
            loading={stageLoading === "auditor"}
          />

          {/* Run Audit */}
          <Section title="Run Audit">
            <p className="text-xs font-mono text-muted-foreground">
              PageSpeed-test each pending lead's website and generate an AI critique of conversion issues.
              Runs automatically on interval when Active, or trigger manually below.
            </p>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleRunAudit}
                disabled={auditTriggerLoading || runtime.auditor_running}
                variant="outline"
                className="rounded-none font-mono uppercase tracking-wider text-xs border-primary text-primary hover:bg-primary hover:text-primary-foreground"
              >
                {auditTriggerLoading || runtime.auditor_running ? (
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-3 w-3 mr-2" />
                )}
                {runtime.auditor_running ? "Running…" : auditTriggerLoading ? "Waiting for pipeline…" : "Run Audit Now"}
              </Button>
            </div>
            {runtime.last_audit_at && !auditTriggerLoading && !runtime.auditor_running && (
              <p className="text-xs font-mono text-muted-foreground">
                Last run: {new Date(runtime.last_audit_at).toLocaleString()}
              </p>
            )}
            <AuditProgressPanel progress={auditProgress} />
          </Section>

          {/* Pending Audit Queue */}
          <Section title={`Pending Audit${pendingAuditLeads.length > 0 ? ` (${pendingAuditLeads.length})` : ""}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-mono text-muted-foreground">
                Leads queued for auditing — processed one-by-one via PageSpeed + AI critique.
              </p>
              <button
                onClick={() => { fetchAuditorLeads(); fetchAuditProgress(); }}
                disabled={auditorLeadsLoading}
                className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <RefreshCw className={`h-3 w-3 ${auditorLeadsLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
            {auditorLeadsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : pendingAuditLeads.length === 0 ? (
              <div className="text-xs font-mono text-muted-foreground py-4 text-center">
                No leads pending audit — queue is clear.
              </div>
            ) : (
              <div className="space-y-1.5">
                {pendingAuditLeads.map((lead) => (
                  <AuditLeadRow key={lead.id} lead={lead} pending={true} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Audited Records">
            <p className="text-xs font-mono text-muted-foreground mb-2">
              Leads that have been evaluated. Click a row to expand the AI critique.
            </p>
            {auditorLeadsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : auditedLeads.length === 0 ? (
              <div className="text-xs font-mono text-muted-foreground py-4 text-center">
                No audited records yet.
              </div>
            ) : (
              <div className="space-y-1.5">
                {auditedLeads.map((lead) => (
                  <AuditLeadRow key={lead.id} lead={lead} pending={false} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Audit Settings">
            <p className="text-xs font-mono text-muted-foreground">
              Mobile score below Pass threshold → sent to Enricher. Above Discard threshold → Manual Review.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Pass Threshold" hint="Score below this passes (default 50).">
                <Input
                  type="number" min={0} max={100}
                  value={settings.auditor.mobile_pass_threshold}
                  onChange={(e) => setSettingField("auditor", "mobile_pass_threshold", parseInt(e.target.value) || 50)}
                  className="rounded-none font-mono text-sm"
                />
              </Field>
              <Field label="Discard Threshold" hint="Score at or above this → Manual Review (default 60).">
                <Input
                  type="number" min={0} max={100}
                  value={settings.auditor.mobile_discard_threshold}
                  onChange={(e) => setSettingField("auditor", "mobile_discard_threshold", parseInt(e.target.value) || 60)}
                  className="rounded-none font-mono text-sm"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="OpenAI Model">
                <Input
                  value={settings.auditor.openai_model}
                  onChange={(e) => setSettingField("auditor", "openai_model", e.target.value)}
                  className="rounded-none font-mono text-sm"
                  placeholder="gpt-4o-mini"
                />
              </Field>
              <Field label="Max Tokens">
                <Input
                  type="number" min={50} max={2000}
                  value={settings.auditor.openai_max_tokens}
                  onChange={(e) => setSettingField("auditor", "openai_max_tokens", parseInt(e.target.value) || 300)}
                  className="rounded-none font-mono text-sm"
                />
              </Field>
            </div>
            <Field label="Max Concurrent Audits" hint="How many leads are audited in parallel.">
              <Input
                type="number" min={1} max={20}
                value={settings.pipeline.max_audit_concurrency}
                onChange={(e) => setSettingField("pipeline", "max_audit_concurrency", parseInt(e.target.value) || 5)}
                className="rounded-none font-mono text-sm w-40"
              />
            </Field>
          </Section>
        </TabsContent>

        {/* ── ENRICHER TAB ─────────────────────────────────────────────────────── */}
        <TabsContent value="enricher" className="mt-6 space-y-4">
          <StageToggle
            stage="Enricher"
            enabled={stages.enricher_enabled}
            onToggle={handleStageToggle}
            loading={stageLoading === "enricher"}
          />

          <Section title="Apollo.io Target Titles">
            <p className="text-xs font-mono text-muted-foreground">
              Apollo searches for contacts with these job titles (in order). First match wins. One per line.
            </p>
            <Field label="Target Titles">
              <textarea
                className="w-full rounded-none font-mono text-sm border border-input bg-background px-3 py-2 min-h-[120px] focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                value={(settings.enricher.target_titles || []).join("\n")}
                onChange={(e) =>
                  setSettingField("enricher", "target_titles",
                    e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))
                }
                placeholder={"Owner\nFounder\nCEO\nDirector"}
              />
            </Field>
          </Section>
        </TabsContent>
      </Tabs>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border flex justify-between items-center z-10 lg:pl-[256px]">
        <p className="text-xs font-mono text-muted-foreground hidden md:block">
          Settings are saved to <code className="bg-muted px-1">pipeline_settings.json</code> — picked up on next tick.
        </p>
        <Button
          onClick={handleSaveSettings}
          disabled={settingsLoading}
          className="rounded-none font-mono uppercase tracking-wider font-bold w-full md:w-auto"
        >
          {settingsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
