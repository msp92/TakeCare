import { afterEach, describe, expect, it, vi } from "vitest";

import { buildReportSection, mergeReportContent } from "@/lib/services/reports";
import type { LabItem } from "@/types";

/** Mirror of the SQL append CASE in complete_upload_processing_rpc.sql lines 43–46. */
function sqlAppend(current: string, section: string): string {
  return current.trim() === "" ? section : `${current}\n\n${section}`;
}

const ITEM: LabItem = {
  name: "CRP",
  value: "1.0",
  unit: "mg/L",
  refRange: "<5",
  date: "2024-01-01",
};

const ITEM_B: LabItem = {
  name: "Glukoza",
  value: "5.0",
  unit: "mmol/L",
  refRange: "3,9-5,6",
  date: "2023-06-01",
};

describe("buildReportSection", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("empty items → empty string", () => {
    expect(buildReportSection([])).toBe("");
  });

  it("single item → section with ## heading and table row", () => {
    const section = buildReportSection([ITEM]);
    expect(section).toContain("## 2024-01-01");
    expect(section).toContain("| CRP |");
    expect(section).toContain("| 1.0 |");
  });

  it("uses today when date is null", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15"));
    const section = buildReportSection([{ ...ITEM, date: null }]);
    expect(section).toContain("## 2026-01-15");
  });
});

describe("mergeReportContent", () => {
  it("empty current + items → section only", () => {
    expect(mergeReportContent("", [ITEM])).toBe(buildReportSection([ITEM]));
  });

  it("non-empty current + items → trimmed current + \\n\\n + section", () => {
    const current = "## 2023-01-01\n| Old | 1 | mg/L | <5 |\n";
    const merged = mergeReportContent(current, [ITEM]);
    expect(merged.startsWith("## 2023-01-01")).toBe(true);
    expect(merged).toContain("\n\n## 2024-01-01");
  });

  it("two merges → two sections in order", () => {
    const first = mergeReportContent("", [ITEM_B]);
    const second = mergeReportContent(first, [ITEM]);
    const dateB = ITEM_B.date ?? "";
    const dateA = ITEM.date ?? "";
    expect(second.indexOf(`## ${dateB}`)).toBeLessThan(second.indexOf(`## ${dateA}`));
  });

  it("empty items → returns current unchanged", () => {
    expect(mergeReportContent("existing", [])).toBe("existing");
  });
});

describe("SQL append parity", () => {
  it("empty current: TS and SQL agree", () => {
    const section = buildReportSection([ITEM]);
    expect(mergeReportContent("", [ITEM])).toBe(sqlAppend("", section));
  });

  it("non-empty current: TS and SQL agree", () => {
    const current = "## 2023-01-01\n| Old | 1 | mg/L | <5 |";
    const section = buildReportSection([ITEM]);
    expect(mergeReportContent(current, [ITEM])).toBe(sqlAppend(current, section));
  });

  it("trailing whitespace: TS trims, SQL does not — known divergence", () => {
    const currentWithTrailing = "## 2023-01-01\n| Old | 1 | mg/L | <5 |\n";
    const section = buildReportSection([ITEM]);
    // Known parity gap: mergeReportContent trims currentContent before appending;
    // the SQL RPC appends to the untrimmed stored content. This divergence is
    // benign in practice (SQL content is written by the RPC, not by TS), but
    // worth tracking explicitly. Fix if production content ever has trailing whitespace.
    expect(mergeReportContent(currentWithTrailing, [ITEM])).not.toBe(sqlAppend(currentWithTrailing, section));
  });
});
