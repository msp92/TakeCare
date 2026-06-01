# Parser fixtures (Phase 3)

Text samples for `scripts/verify-parser.ts`:

| File | Provider | Purpose |
| --- | --- | --- |
| `diagnostyka-ocr.txt` | Diagnostyka (OCR-style) | Primary parser target — must return expected `LabItem[]` |
| `alab-clean.txt` | ALAB (Tier-1 text) | Best-effort clean-text sample |

Run:

```bash
npx tsx scripts/verify-parser.ts
```

## PDF fixtures (extraction probe)

Place a Diagnostyka lab PDF here as `sample.pdf`, or set `PROBE_PDF` to an absolute path when running:

```powershell
$env:PROBE_PDF = "C:\path\to\your_anon.pdf"
npm run debug:pdf
```

PDF fixtures are not committed (see `.gitignore`).
