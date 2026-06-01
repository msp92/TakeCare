import type { LabItem } from "@/types";

const DATE_PATTERNS = [
  /data\s+(?:wykonania|badania)\s*:\s*(\d{2}[./-]\d{2}[./-]\d{4})/i,
  /(\d{2}[./-]\d{2}[./-]\d{4})/,
  /(\d{4}-\d{2}-\d{2})/,
];

/** Diagnostyka-style row: name + numeric value + optional unit + optional reference range. */
const LAB_ROW =
  /^([A-Za-zÀ-žąćęłńóśźżĄĆĘŁŃÓŚŹŻ][A-Za-zÀ-žąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9\s().,\-/%]+?)\s+([\d]+[,.]?\d*)\s*(.*?)\s*$/u;

const REF_RANGE_ONLY = /^[\d]+[,.]?\d*\s*[-–]\s*[\d]+[,.]?\d*$/u;

function normalizeDate(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const match = /^(\d{2})[./-](\d{2})[./-](\d{4})$/.exec(trimmed);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
  return trimmed;
}

function extractReportDate(text: string): string {
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      return normalizeDate(match[1]);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function parseTrailingUnitAndRef(rest: string): { unit?: string; refRange?: string } {
  const trimmed = rest.trim();
  if (!trimmed) {
    return {};
  }

  const refMatch = /([<>≤≥]?\s*[\d]+[,.]?\d*)\s*$/.exec(trimmed);
  if (refMatch) {
    const beforeRef = trimmed.slice(0, refMatch.index).trim();
    const refToken = refMatch[1].replace(/\s+/g, "");
    if (/^[<>≤≥]/.test(refToken) || REF_RANGE_ONLY.test(refToken)) {
      return {
        unit: beforeRef.length > 0 ? beforeRef : undefined,
        refRange: refToken,
      };
    }
  }

  const rangeMatch = /([\d]+[,.]?\d*\s*[-–]\s*[\d]+[,.]?\d*)\s*$/.exec(trimmed);
  if (rangeMatch) {
    const beforeRef = trimmed.slice(0, rangeMatch.index).trim();
    return {
      unit: beforeRef.length > 0 ? beforeRef : undefined,
      refRange: rangeMatch[1].replace(/\s+/g, ""),
    };
  }

  if (REF_RANGE_ONLY.test(trimmed)) {
    return { refRange: trimmed.replace(/\s+/g, "") };
  }

  return { unit: trimmed };
}

/**
 * Parse flat lab text (Tier-1 or OCR) into structured items. Returns partial results; [] if nothing matches.
 */
export function parseLabText(text: string): LabItem[] {
  const reportDate = extractReportDate(text);
  const items: LabItem[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (line.length < 4) {
      continue;
    }

    const match = LAB_ROW.exec(line);
    if (!match) {
      continue;
    }

    const name = match[1].trim();
    const value = match[2].replace(",", ".");
    const trailing = match[3].trim();
    const { unit, refRange } = parseTrailingUnitAndRef(trailing);

    const key = `${name}:${value}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    items.push({
      name,
      value,
      unit,
      refRange,
      date: reportDate,
    });
  }

  return items;
}
