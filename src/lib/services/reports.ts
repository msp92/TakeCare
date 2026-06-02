import type { SupabaseClient } from "@supabase/supabase-js";

import type { LabItem } from "@/types";

function formatMarkdownSection(date: string, items: LabItem[]): string {
  const header = `## ${date}`;
  const tableHeader = "| Badanie | Wynik | Jednostka | Zakres referencyjny |";
  const separator = "| --- | --- | --- | --- |";
  const rows = items.map((item) => `| ${item.name} | ${item.value} | ${item.unit ?? ""} | ${item.refRange ?? ""} |`);
  return [header, "", tableHeader, separator, ...rows].join("\n");
}

/** Markdown section for one upload (used by RPC merge and manual verification). */
export function buildReportSection(newItems: LabItem[]): string {
  if (newItems.length === 0) {
    return "";
  }

  const sectionDate = newItems[0]?.date ?? new Date().toISOString().slice(0, 10);
  return formatMarkdownSection(sectionDate, newItems);
}

/** Merge a new section into existing report Markdown (pure; no I/O). */
export function mergeReportContent(currentContent: string, newItems: LabItem[]): string {
  const section = buildReportSection(newItems);
  if (section.length === 0) {
    return currentContent;
  }

  const current = currentContent.trim();
  return current.length > 0 ? `${current}\n\n${section}` : section;
}

/**
 * Fetch current report and merge items (manual verification / tests only).
 * Production uploads append via `complete_upload_processing` RPC (atomic SQL).
 */
export async function buildReport(supabase: SupabaseClient, userId: string, newItems: LabItem[]): Promise<string> {
  const { data: existing, error } = await supabase
    .from("reports")
    .select("content")
    .eq("user_id", userId)
    .maybeSingle<{ content: string }>();

  if (error) {
    throw error;
  }

  return mergeReportContent(existing?.content ?? "", newItems);
}
