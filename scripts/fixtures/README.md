# Parser fixtures

OCR text samples and golden oracles for `scripts/verify-parser.ts` (and future Vitest tests).

| File | Provider | Purpose |
| --- | --- | --- |
| `diagnostyka-ocr.txt` | Diagnostyka | OCR text from `diagnostyka-sample.pdf` |
| `diagnostyka-ocr.expected.json` | Diagnostyka | Expected `dates` metadata + `items` (`LabItem[]`) |
| `alab-ocr.txt` | ALAB | OCR text from `alab-sample.pdf` |
| `alab-ocr.expected.json` | ALAB | Expected `dates` metadata + `items` (`LabItem[]`) |

Run:

```bash
npx tsx scripts/verify-parser.ts
```

## PDF fixtures (extraction probe)

Place a lab PDF here (e.g. `diagnostyka-sample.pdf`, `alab-sample.pdf`), or set `PROBE_PDF` when running:

```powershell
$env:PROBE_PDF = "C:\path\to\your_anon.pdf"
npm run debug:pdf
```

PDF fixtures are not committed (see `.gitignore`). Capture OCR output from `/dev/pdf-extract` into `*-ocr.txt` for parser tests.
