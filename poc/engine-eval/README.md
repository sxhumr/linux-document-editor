# Engine evaluation PoC (Milestone 1)

DOCX round-trip harness behind [`docs/ENGINE_EVALUATION.md`](../../docs/ENGINE_EVALUATION.md). Kept as the record of the Milestone 1 engine comparison and no longer developed.

> **Superseded (Milestone 6).** The permanent compatibility suite is [`ui/tests/compatibility/`](../../ui/tests/compatibility/). It runs in CI against the engine version the app ships. The fixture generators moved there too (`cd ui && npm run fixtures`), and the corpus has since grown, so a re-run here covers more fixtures than `results/` shows.

```bash
npm ci
npm run eval       # round trips → results/results.json + results/SUMMARY.md
```

| Path | Purpose |
| --- | --- |
| `adapters/*.mjs` | One file per engine: `open`, `appendToParagraph`, `save`, `paragraphCount` |
| `lib/inspect.mjs` | Engine-independent OOXML feature extraction and comparison |
| `run.mjs` | Harness: offline guard, round trips, reopen, LibreOffice check, timings |
| `report.mjs` | Renders `results/SUMMARY.md` |

Outputs are written to `.work/` (git-ignored); fixtures are never overwritten.
