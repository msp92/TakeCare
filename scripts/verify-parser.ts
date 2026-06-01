/**
 * Manual parser check: npx tsx scripts/verify-parser.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseLabText } from "../src/lib/services/parser";
import { buildReport } from "../src/lib/services/reports";

const root = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function load(name: string): string {
  return readFileSync(join(root, name), "utf8");
}

const ocrItems = parseLabText(load("diagnostyka-ocr.txt"));
const cleanItems = parseLabText(load("alab-clean.txt"));

const mockSupabase = {
  from() {
    return {
      select() {
        return {
          eq() {
            return {
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            };
          },
        };
      },
    };
  },
};

const report = await buildReport(mockSupabase as never, "user-id", ocrItems);

process.stdout.write(`Diagnostyka OCR fixture: ${String(ocrItems.length)} items\n`);
process.stdout.write(`${JSON.stringify(ocrItems, null, 2)}\n\n`);
process.stdout.write(`ALAB clean fixture: ${String(cleanItems.length)} items\n`);
process.stdout.write(`${JSON.stringify(cleanItems, null, 2)}\n\n`);
process.stdout.write("Sample report section:\n\n");
process.stdout.write(`${report}\n`);
