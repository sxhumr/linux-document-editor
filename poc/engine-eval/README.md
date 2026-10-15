# Engine evaluation PoC (Milestone 1)

DOCX round-trip harness behind [`docs/ENGINE_EVALUATION.md`](../../docs/ENGINE_EVALUATION.md). Throwaway by design: it informs the engine choice and seeds `tests/compatibility/`, but it is not app code.

```bash
npm ci
npm run fixtures   # fixtures/docx/ (+ fixtures/docx/libreoffice/, needs LibreOffice)
npm run eval       # round trips → results/results.json + results/SUMMARY.md
```

| Path | Purpose |
| --- | --- |
| `scripts/make-fixtures.mjs` | Synthetic corpus, built with `docx` (no private documents) |
| `scripts/make-libreoffice-fixtures.sh` | Same fixtures re-saved by a second producer |
| `adapters/*.mjs` | One file per engine: `open`, `appendToParagraph`, `save`, `paragraphCount` |
| `lib/inspect.mjs` | Engine-independent OOXML feature extraction and comparison |
| `run.mjs` | Harness: offline guard, round trips, reopen, LibreOffice check, timings |
| `report.mjs` | Renders `results/SUMMARY.md` |

Outputs are written to `.work/` (git-ignored); fixtures are never overwritten.
