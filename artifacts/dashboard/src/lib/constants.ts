export const PIPELINE_STATUSES = [
  { id: "10_Raw_Scraped", label: "Raw Scraped", color: "bg-gray-100 text-gray-700 border-gray-300" },
  { id: "20_Audit_Passed", label: "Audit Passed", color: "bg-blue-100 text-blue-700 border-blue-300" },
  { id: "30_Ready_for_Outreach", label: "Ready for Outreach", color: "bg-primary/10 text-primary border-primary/30" },
  { id: "00_Discarded", label: "Discarded", color: "bg-red-100 text-red-700 border-red-300" },
  { id: "99_Manual_Review", label: "Manual Review", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
];

// Only the stages shown prominently in the dashboard UI (excludes intermediate pipeline stages)
export const DISPLAY_PIPELINE_STATUSES = [
  { id: "30_Ready_for_Outreach", label: "Ready for Outreach", color: "bg-primary/10 text-primary border-primary/30" },
  { id: "00_Discarded", label: "Discarded", color: "bg-red-100 text-red-700 border-red-300" },
  { id: "99_Manual_Review", label: "Manual Review", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
];

export function getStatusColor(statusId: string) {
  const status = PIPELINE_STATUSES.find((s) => s.id === statusId);
  return status?.color || "bg-gray-100 text-gray-700 border-gray-300";
}

export function getStatusLabel(statusId: string) {
  const status = PIPELINE_STATUSES.find((s) => s.id === statusId);
  return status?.label || statusId;
}

export const OUTREACH_MODES = [
  { id: "none", label: "None" },
  { id: "email", label: "Email" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "phone", label: "Phone" },
  { id: "in-person", label: "In Person" },
  { id: "other", label: "Other" },
];

export const OUTREACH_STATUSES = [
  { id: "not_started", label: "Not Started", color: "bg-gray-100 text-gray-600 border-gray-300" },
  { id: "contacted", label: "Contacted", color: "bg-blue-100 text-blue-700 border-blue-300" },
  { id: "meeting_scheduled", label: "Meeting Scheduled", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { id: "meeting_concluded", label: "Meeting Concluded", color: "bg-green-100 text-green-700 border-green-300" },
];

export function getOutreachStatusColor(statusId: string) {
  const s = OUTREACH_STATUSES.find((s) => s.id === statusId);
  return s?.color || "bg-gray-100 text-gray-600 border-gray-300";
}

export function getOutreachStatusLabel(statusId: string) {
  const s = OUTREACH_STATUSES.find((s) => s.id === statusId);
  return s?.label || statusId;
}

export function getOutreachModeLabel(modeId: string | null | undefined) {
  if (!modeId) return "None";
  const m = OUTREACH_MODES.find((m) => m.id === modeId);
  return m?.label || modeId;
}
