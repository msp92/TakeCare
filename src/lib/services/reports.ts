import type { SupabaseClient } from "@supabase/supabase-js";

import type { LabItem } from "@/types";

function formatMarkdownSection(date: string, items: LabItem[]): string {
  const header = `## ${date}`;
  const tableHeader = "| Badanie | Wynik | Jednostka | Zakres referencyjny |";
  const separator = "| --- | --- | --- | --- |";
  const rows = items.map((item) => `| ${item.name} | ${item.value} | ${item.unit ?? ""} | ${item.refRange ?? ""} |`);
  return [header, "", tableHeader, separator, ...rows].join("\n");
}

/** Merge new lab items into the user's longitudinal Markdown report. */
export async function buildReport(supabase: SupabaseClient, userId: string, newItems: LabItem[]): Promise<string> {
  if (newItems.length === 0) {
    return "";
  }

  const sectionDate = newItems[0]?.date ?? new Date().toISOString().slice(0, 10);
  const section = formatMarkdownSection(sectionDate, newItems);

  const { data: existing, error } = await supabase
    .from("reports")
    .select("content")
    .eq("user_id", userId)
    .maybeSingle<{ content: string }>();

  if (error) {
    throw error;
  }

  const current = existing?.content.trim() ?? "";
  return current.length > 0 ? `${current}\n\n${section}` : section;
}
