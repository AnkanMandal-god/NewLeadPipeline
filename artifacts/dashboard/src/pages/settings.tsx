import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, Eye, EyeOff, RefreshCw } from "lucide-react";

const API_BASE = "";

type ApiKeys = {
  OPENAI_API_KEY: string;
  APOLLO_API_KEY: string;
  APIFY_API_TOKEN: string;
  PAGESPEED_API_KEY: string;
};

type ScraperSettings = { query: string; location: string; limit: number };
type AuditorSettings = {
  mobile_pass_threshold: number;
  mobile_discard_threshold: number;
  openai_model: string;
  openai_max_tokens: number;
};
type EnricherSettings = { target_titles: string[] };
type PipelineSettings = { poll_interval_seconds: number; max_audit_concurrency: number };

type Settings = {
  api_keys: ApiKeys;
  scraper: ScraperSettings;
  auditor: AuditorSettings;
  enricher: EnricherSettings;
  pipeline: PipelineSettings;
};

const DEFAULT: Settings = {
  api_keys: {
    OPENAI_API_KEY: "",
    APOLLO_API_KEY: "",
    APIFY_API_TOKEN: "",
    PAGESPEED_API_KEY: "",
  },
  scraper: { query: "gym", location: "New York, NY", limit: 20 },
  auditor: {
    mobile_pass_threshold: 50,
    mobile_discard_threshold: 60,
    openai_model: "gpt-4o-mini",
    openai_max_tokens: 300,
  },
  enricher: { target_titles: ["Owner", "Founder", "CEO", "Director"] },
  pipeline: { poll_interval_seconds: 60, max_audit_concurrency: 5 },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border p-6 space-y-5">
      <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-primary border-b border-border pb-2">
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

function ApiKeyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  const masked = value.includes("•");
  return (
    <div className="relative">
      <Input
        type={show || masked ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-none font-mono text-sm pr-10"
        placeholder="Paste key here…"
      />
      {!masked && (
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { settings: Settings };
      setSettings({ ...DEFAULT, ...data.settings });
    } catch {
      toast({ title: "Error", description: "Could not load settings.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const setKey = <S extends keyof Settings>(section: S, key: keyof Settings[S], value: unknown) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { settings: Settings };
      setSettings({ ...DEFAULT, ...data.settings });
      toast({ title: "Settings saved", description: "Pipeline picks up changes on next loop tick." });
    } catch {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto w-full space-y-6 pb-24">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono uppercase">Settings</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Configure API keys and pipeline parameters. For per-stage controls, use the Pipeline page.
          </p>
        </div>
        <button onClick={fetchSettings} className="text-muted-foreground hover:text-foreground transition-colors" title="Reload">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <Section title="API Keys">
        <Field label="OpenAI API Key" hint="Used for AI UX critique generation.">
          <ApiKeyInput value={settings.api_keys.OPENAI_API_KEY} onChange={(v) => setKey("api_keys", "OPENAI_API_KEY", v)} />
        </Field>
        <Field label="Apollo API Key" hint="Used to find contact emails during enrichment.">
          <ApiKeyInput value={settings.api_keys.APOLLO_API_KEY} onChange={(v) => setKey("api_keys", "APOLLO_API_KEY", v)} />
        </Field>
        <Field label="Apify API Token" hint="Used to scrape Google Maps business listings via Apify.">
          <ApiKeyInput value={settings.api_keys.APIFY_API_TOKEN} onChange={(v) => setKey("api_keys", "APIFY_API_TOKEN", v)} />
        </Field>
        <Field label="PageSpeed API Key" hint="Optional — increases Google PageSpeed rate limits.">
          <ApiKeyInput value={settings.api_keys.PAGESPEED_API_KEY} onChange={(v) => setKey("api_keys", "PAGESPEED_API_KEY", v)} />
        </Field>
      </Section>

      <Section title="Scraper Settings">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Search Query" hint="Business type to search for.">
            <Input value={settings.scraper.query} onChange={(e) => setKey("scraper", "query", e.target.value)} className="rounded-none font-mono text-sm" placeholder="e.g. gym, dentist" />
          </Field>
          <Field label="Location" hint="City, state or region to scrape.">
            <Input value={settings.scraper.location} onChange={(e) => setKey("scraper", "location", e.target.value)} className="rounded-none font-mono text-sm" placeholder="e.g. New York, NY" />
          </Field>
        </div>
        <Field label="Results per scrape" hint="Max businesses to pull per Maps session.">
          <Input type="number" min={1} max={500} value={settings.scraper.limit} onChange={(e) => setKey("scraper", "limit", parseInt(e.target.value) || 20)} className="rounded-none font-mono text-sm w-32" />
        </Field>
      </Section>

      <Section title="Auditor / Speed Thresholds">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Pass Threshold (< this passes)" hint="Default: 50">
            <Input type="number" min={0} max={100} value={settings.auditor.mobile_pass_threshold} onChange={(e) => setKey("auditor", "mobile_pass_threshold", parseInt(e.target.value) || 50)} className="rounded-none font-mono text-sm" />
          </Field>
          <Field label="Discard Threshold (≥ this discards)" hint="Default: 60">
            <Input type="number" min={0} max={100} value={settings.auditor.mobile_discard_threshold} onChange={(e) => setKey("auditor", "mobile_discard_threshold", parseInt(e.target.value) || 60)} className="rounded-none font-mono text-sm" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="OpenAI Model">
            <Input value={settings.auditor.openai_model} onChange={(e) => setKey("auditor", "openai_model", e.target.value)} className="rounded-none font-mono text-sm" placeholder="gpt-4o-mini" />
          </Field>
          <Field label="Max Tokens">
            <Input type="number" min={50} max={2000} value={settings.auditor.openai_max_tokens} onChange={(e) => setKey("auditor", "openai_max_tokens", parseInt(e.target.value) || 300)} className="rounded-none font-mono text-sm" />
          </Field>
        </div>
      </Section>

      <Section title="Enricher — Apollo Target Titles">
        <Field label="Target Titles (one per line)" hint="Apollo searches for contacts with these titles in order. First match wins.">
          <textarea
            className="w-full rounded-none font-mono text-sm border border-input bg-background px-3 py-2 min-h-[100px] focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            value={(settings.enricher?.target_titles || []).join("\n")}
            onChange={(e) =>
              setKey("enricher", "target_titles", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))
            }
            placeholder={"Owner\nFounder\nCEO\nDirector"}
          />
        </Field>
      </Section>

      <Section title="Pipeline Loop">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Poll Interval (seconds)" hint="How often the pipeline runs. Default: 60.">
            <Input type="number" min={10} max={86400} value={settings.pipeline.poll_interval_seconds} onChange={(e) => setKey("pipeline", "poll_interval_seconds", parseInt(e.target.value) || 60)} className="rounded-none font-mono text-sm" />
          </Field>
          <Field label="Max Audit Concurrency" hint="Parallel audits per loop tick. Default: 5.">
            <Input type="number" min={1} max={20} value={settings.pipeline.max_audit_concurrency} onChange={(e) => setKey("pipeline", "max_audit_concurrency", parseInt(e.target.value) || 5)} className="rounded-none font-mono text-sm" />
          </Field>
        </div>
      </Section>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border flex justify-between items-center z-10 lg:pl-[256px]">
        <p className="text-xs font-mono text-muted-foreground hidden md:block">
          Saved to <code className="bg-muted px-1">vibe-prospector/pipeline_settings.json</code> — picked up on next tick.
        </p>
        <Button onClick={handleSave} disabled={saving} className="rounded-none font-mono uppercase tracking-wider font-bold w-full md:w-auto">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
