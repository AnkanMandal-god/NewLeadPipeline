import React, { useState, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useGetLead, useUpdateLead, useDeleteLead, getGetLeadQueryKey, getListLeadsQueryKey, getGetLeadsStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Lead } from "@workspace/api-client-react";
import { PIPELINE_STATUSES, getStatusColor, getStatusLabel, OUTREACH_MODES, OUTREACH_STATUSES } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Save, Trash2, ExternalLink, Globe, GlobeLock, Star } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const leadFormSchema = z.object({
  business_name: z.string().min(1, "Required"),
  website_url: z.string().url().or(z.literal("")).nullable(),
  phone: z.string().nullable(),
  pipeline_status: z.string(),
  business_category: z.string().nullable(),
  address: z.string().nullable(),
  desktop_speed_score: z.coerce.number().nullable(),
  mobile_speed_score: z.coerce.number().nullable(),
  ai_ux_critique: z.string().nullable(),
  contact_email: z.string().email().or(z.literal("")).nullable(),
  contact_name: z.string().nullable(),
  outreach_mode: z.string().nullable(),
  outreach_status: z.string(),
  outreach_notes: z.string().nullable(),
  notes: z.string().nullable(),
});

type LeadFormValues = z.infer<typeof leadFormSchema>;

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-primary border-b border-border pb-2">
      {title}
    </h3>
  );
}

function FLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-xs uppercase text-muted-foreground">{children}</span>
  );
}

export default function LeadDetail() {
  const [, params] = useRoute("/leads/:id");
  const id = parseInt(params?.id || "0", 10);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const goBack = () => {
    // Go back in browser history — preserves leads list scroll + filter state
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate("/leads");
    }
  };
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetLead(id, {
    query: { enabled: !!id, queryKey: getGetLeadQueryKey(id) },
  });

  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      business_name: "",
      website_url: "",
      phone: "",
      pipeline_status: "",
      business_category: "",
      address: "",
      desktop_speed_score: null,
      mobile_speed_score: null,
      ai_ux_critique: "",
      contact_email: "",
      contact_name: "",
      outreach_mode: "none",
      outreach_status: "not_started",
      outreach_notes: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (data?.lead) {
      const l: Lead = data.lead;
      form.reset({
        business_name: l.business_name || "",
        website_url: l.website_url || "",
        phone: l.phone || "",
        pipeline_status: l.pipeline_status || "",
        business_category: l.business_category || "",
        address: l.address || "",
        desktop_speed_score: l.desktop_speed_score ?? null,
        mobile_speed_score: l.mobile_speed_score ?? null,
        ai_ux_critique: l.ai_ux_critique || "",
        contact_email: l.contact_email || "",
        contact_name: l.contact_name || "",
        outreach_mode: l.outreach_mode || "none",
        outreach_status: l.outreach_status || "not_started",
        outreach_notes: l.outreach_notes || "",
        notes: l.notes || "",
      });
    }
  }, [data, form]);

  const onSubmit = (values: LeadFormValues) => {
    updateLead.mutate(
      { id, data: values as Parameters<typeof updateLead.mutate>[0]["data"] },
      {
        onSuccess: () => {
          toast({ title: "Saved", description: "Lead details updated successfully." });
          queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetLeadsStatsQueryKey() });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update lead.", variant: "destructive" });
        },
      },
    );
  };

  const handleDelete = () => {
    deleteLead.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Deleted", description: "Lead removed from system." });
          queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetLeadsStatsQueryKey() });
          navigate("/leads");
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to delete lead.", variant: "destructive" });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data?.lead) {
    return <div className="p-8 font-mono text-destructive">LEAD NOT FOUND</div>;
  }

  const lead: Lead = data.lead;

  return (
    <div className="p-8 max-w-5xl mx-auto w-full space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div className="flex items-center gap-4">
          <button onClick={goBack} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight font-mono uppercase truncate max-w-lg">
                {lead.business_name}
              </h1>
              {lead.has_website ? (
                <Globe className="h-4 w-4 text-green-600" />
              ) : (
                <GlobeLock className="h-4 w-4 text-muted-foreground" />
              )}
              <Badge
                variant="outline"
                className={`rounded-none font-mono text-[11px] uppercase tracking-wider ${getStatusColor(lead.pipeline_status)}`}
              >
                {getStatusLabel(lead.pipeline_status)}
              </Badge>
            </div>
            <div className="text-xs font-mono text-muted-foreground mt-1 tracking-widest flex items-center gap-3">
              <span>ID: {lead.id}</span>
              <span>ADDED: {new Date(lead.created_at).toLocaleDateString()}</span>
              {lead.business_category && <span className="uppercase">{lead.business_category}</span>}
              {lead.rating && (
                <span className="flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  {lead.rating} ({lead.review_count} reviews)
                </span>
              )}
              {lead.scrape_batch_id && (
                <span>BATCH #{lead.scrape_batch_id}</span>
              )}
            </div>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="rounded-none border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground font-mono uppercase tracking-wider text-xs"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-none border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-mono uppercase">Delete Lead?</AlertDialogTitle>
              <AlertDialogDescription className="font-mono text-sm">
                This action cannot be undone. This will permanently delete the lead from the database.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-none font-mono uppercase text-xs">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-none font-mono uppercase text-xs"
              >
                Confirm Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Left column */}
            <div className="md:col-span-2 space-y-6">
              {/* Core Info */}
              <div className="bg-card border border-border p-6 space-y-5">
                <SectionHeader title="Core Info" />
                <FormField
                  control={form.control}
                  name="business_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel><FLabel>Business Name</FLabel></FormLabel>
                      <FormControl>
                        <Input {...field} className="rounded-none font-mono" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="website_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <FLabel>Website</FLabel>
                          {field.value && (
                            <a
                              href={field.value}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 text-primary hover:underline text-xs"
                            >
                              Visit <ExternalLink className="h-3 w-3 inline ml-0.5" />
                            </a>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} className="rounded-none font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel><FLabel>Phone</FLabel></FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} className="rounded-none font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="business_category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel><FLabel>Business Type</FLabel></FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} className="rounded-none font-mono" placeholder="e.g. gym, dentist" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel><FLabel>Address</FLabel></FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} className="rounded-none font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel><FLabel>Notes</FLabel></FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value || ""}
                          className="rounded-none font-mono text-sm min-h-[80px]"
                          placeholder="Any general notes about this lead…"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Audit Data */}
              <div className="bg-card border border-border p-6 space-y-5">
                <SectionHeader title="Audit Data" />

                {/* Audit result badge — read only, derived from scores + status */}
                {(() => {
                  const mobile = lead.mobile_speed_score;
                  const status = lead.pipeline_status;
                  if (mobile == null && status === "10_Raw_Scraped") {
                    return (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs uppercase text-muted-foreground">Audit Result</span>
                        <span className="font-mono text-xs px-2 py-0.5 border bg-gray-100 text-gray-600 border-gray-300">Not Audited</span>
                      </div>
                    );
                  }
                  if (mobile == null) {
                    return (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs uppercase text-muted-foreground">Audit Result</span>
                        <span className="font-mono text-xs px-2 py-0.5 border bg-yellow-100 text-yellow-700 border-yellow-300">Inconclusive — PageSpeed unavailable</span>
                      </div>
                    );
                  }
                  const isPassed = status === "20_Audit_Passed" || status === "30_Ready_for_Outreach";
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs uppercase text-muted-foreground">Audit Result</span>
                      {isPassed ? (
                        <span className="font-mono text-xs px-2 py-0.5 border bg-green-100 text-green-700 border-green-300">Passed — poor mobile performance</span>
                      ) : (
                        <span className="font-mono text-xs px-2 py-0.5 border bg-red-100 text-red-700 border-red-300">Failed — site already fast</span>
                      )}
                      <span className="font-mono text-xs text-muted-foreground">Mobile: {mobile} · Desktop: {lead.desktop_speed_score ?? "–"}</span>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="desktop_speed_score"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel><FLabel>Desktop Score (0-100)</FLabel></FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            value={field.value ?? ""}
                            className="rounded-none font-mono text-lg"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="mobile_speed_score"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel><FLabel>Mobile Score (0-100)</FLabel></FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            value={field.value ?? ""}
                            className="rounded-none font-mono text-lg"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="ai_ux_critique"
                  render={({ field }) => {
                    const isFallback = !field.value || field.value === "AI critique unavailable." || field.value === "Could not fetch page content for analysis.";
                    return (
                      <FormItem>
                        <FormLabel>
                          <FLabel>AI UX Critique</FLabel>
                          {isFallback && field.value && (
                            <span className="ml-2 font-mono text-[10px] text-amber-600 uppercase tracking-wider">(page content unavailable)</span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            value={field.value || ""}
                            className={`rounded-none font-mono text-sm min-h-[140px] leading-relaxed ${isFallback && field.value ? "text-muted-foreground italic" : ""}`}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {/* Pipeline */}
              <div className="bg-card border border-border p-6 space-y-5">
                <SectionHeader title="Pipeline" />
                <FormField
                  control={form.control}
                  name="pipeline_status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel><FLabel>Status</FLabel></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className={`rounded-none font-mono font-bold ${getStatusColor(field.value)}`}>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PIPELINE_STATUSES.map((s) => (
                            <SelectItem key={s.id} value={s.id} className="font-mono">
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {lead.pipeline_status === "00_Discarded" && (
                  <div className="space-y-1.5">
                    <FLabel>Discard Reason</FLabel>
                    <div className="font-mono text-xs px-3 py-2 border border-red-300 bg-red-50 text-red-700 leading-relaxed">
                      {lead.discard_reason || "No reason recorded for this discard."}
                    </div>
                  </div>
                )}
              </div>

              {/* Contact */}
              <div className="bg-card border border-border p-6 space-y-5">
                <SectionHeader title="Contact" />
                <FormField
                  control={form.control}
                  name="contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel><FLabel>Contact Name</FLabel></FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} className="rounded-none font-mono" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contact_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <FLabel>Email</FLabel>
                        {field.value && (
                          <a href={`mailto:${field.value}`} className="ml-2 text-primary hover:underline text-xs">
                            Send
                          </a>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          {...field}
                          value={field.value || ""}
                          className="rounded-none font-mono"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Outreach */}
              <div className="bg-card border border-border p-6 space-y-5">
                <SectionHeader title="Outreach" />
                <FormField
                  control={form.control}
                  name="outreach_mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel><FLabel>Mode of Outreach</FLabel></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "none"}>
                        <FormControl>
                          <SelectTrigger className="rounded-none font-mono">
                            <SelectValue placeholder="Select mode" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {OUTREACH_MODES.map((m) => (
                            <SelectItem key={m.id} value={m.id} className="font-mono">
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="outreach_status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel><FLabel>Outreach Status</FLabel></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "not_started"}>
                        <FormControl>
                          <SelectTrigger className="rounded-none font-mono">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {OUTREACH_STATUSES.map((s) => (
                            <SelectItem key={s.id} value={s.id} className="font-mono">
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="outreach_notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel><FLabel>Remarks / Notes</FLabel></FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value || ""}
                          className="rounded-none font-mono text-sm min-h-[100px]"
                          placeholder="Meeting details, follow-up notes…"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Sticky save bar */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border flex justify-end z-10 lg:pl-[256px]">
            <Button
              type="submit"
              disabled={updateLead.isPending}
              className="rounded-none font-mono uppercase tracking-wider font-bold w-full md:w-auto"
            >
              {updateLead.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
