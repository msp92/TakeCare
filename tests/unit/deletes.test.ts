import { afterEach, describe, expect, it, vi } from "vitest";

import { buildReportFromExtractions } from "@/lib/services/deletes";
import { buildReportSection } from "@/lib/services/reports";
import type { ExtractionPayload, LabItem } from "@/types";

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

function extraction(items: LabItem[], createdAt: string) {
  const payload: ExtractionPayload = {
    facility: "diagnostyka",
    source: "text",
    items,
    rawText: "fixture",
  };
  return { payload, created_at: createdAt };
}

describe("buildReportFromExtractions", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("empty extractions → empty string", () => {
    expect(buildReportFromExtractions([])).toBe("");
  });

  it("single extraction with items → one Markdown section", () => {
    const result = buildReportFromExtractions([extraction([ITEM], "2024-01-02T10:00:00Z")]);
    expect(result).toBe(buildReportSection([ITEM]));
  });

  it("multiple extractions → sections joined with \\n\\n in created_at order", () => {
    const result = buildReportFromExtractions([
      extraction([ITEM_B], "2023-01-01T10:00:00Z"),
      extraction([ITEM], "2024-06-01T10:00:00Z"),
    ]);

    const expected = [buildReportSection([ITEM_B]), buildReportSection([ITEM])].join("\n\n");
    expect(result).toBe(expected);
  });

  it("extraction with empty items → skipped", () => {
    const result = buildReportFromExtractions([
      extraction([], "2024-01-01T10:00:00Z"),
      extraction([ITEM], "2024-01-02T10:00:00Z"),
    ]);

    expect(result).toBe(buildReportSection([ITEM]));
  });

  it("items with date null fall back to mocked today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15"));

    const result = buildReportFromExtractions([extraction([{ ...ITEM, date: null }], "2024-01-02T10:00:00Z")]);

    expect(result).toContain("## 2026-01-15");
  });
});
