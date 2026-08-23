/**
 * Manual parser check: npx tsx scripts/verify-parser.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseLabText } from "../src/lib/services/parser";
import { mergeReportContent } from "../src/lib/services/reports";

const root = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function load(name: string): string {
  return readFileSync(join(root, name), "utf8");
}

const diagnostykaItems = parseLabText(load("diagnostyka-ocr.txt"));
const alabItems = parseLabText(load("alab-ocr.txt"));

const report = mergeReportContent("", diagnostykaItems);

process.stdout.write(`Diagnostyka OCR fixture: ${String(diagnostykaItems.length)} items\n`);
process.stdout.write(`${JSON.stringify(diagnostykaItems, null, 2)}\n\n`);
process.stdout.write(`ALAB OCR fixture: ${String(alabItems.length)} items\n`);
process.stdout.write(`${JSON.stringify(alabItems, null, 2)}\n\n`);
process.stdout.write("Sample report section:\n\n");
process.stdout.write(`${report}\n`);
