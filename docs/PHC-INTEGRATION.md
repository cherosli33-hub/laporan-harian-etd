# PHC → ETD emergency calls

## Current rollout state (3 October 2026)

ETD uses Firestore project `amo-dashboard-v2`, collection `daily_reports`, REST queries and existing anonymous Firebase auth. The current PHC file inspected was `Patient_Care_Report_PHC.html`, Library version 10. It uses `PHCStore` and `PCR_cases` in device localStorage. Its `PHCIntegration.toEntity` prepares metadata, but it has **no shared backend writer**. No PHC repository was found by searches for PHC/patient under the connected account. This change does not modify PHC or either deployment.

`PHC_INTEGRATION_START_DATE` in `app/lib/phcCalls.ts` deliberately remains `null`. Production/manual historical behavior remains intact until the writer, rules, indexes and live tests below are ready. This branch is an integration-ready ETD reader, not a claim of completed live integration. Do not set the boundary to today's date just because this code exists. Choose the first operational date with complete shared PHC coverage; never move the boundary backwards after activation.

## Shared contract

Separate clinical PHC records from a minimal summary collection:

`amo-dashboard-v2 / phcCallSummaries / {phcId}`

```json
{
  "phcId": "PHC-ABC123",
  "status": "completed",
  "operationalDate": "2026-10-03",
  "shift": "pagi",
  "callSource": "mecc",
  "deleted": false
}
```

Required strings: `phcId`, `status`, `operationalDate`, `shift`, `callSource`. Optional `deleted` boolean / `deletedAt` timestamp string. Wire shifts are `pagi`, `petang`, `malam`, matching the current PHC adapter; ETD maps them to display labels Pagi/Petang/Malam. Sources are exactly `mecc`, `operator`, `awam`, `palsu`. Other statuses (draft/cancelled/void) are excluded.

The PHC owner must upsert the same document ID = `phcId` on create/edit/resave, and update status/delete the same summary on cancellation/void/deletion. Clinical and summary changes must commit atomically, or use a trusted retryable backend publisher; a completed case must not appear saved while its summary write failed. Do not publish an edit draft over the currently completed case. Never duplicate names, IC/passport, observations, treatment or notes into this collection. ETD never writes this collection.

The reader rejects ID/path mismatches and malformed eligible metadata. Identical repeated IDs count once; conflicting repeated IDs fail explicitly rather than inflate counts. No increment/decrement writes.

## Operational date

PHC's existing UI explicitly confirms operationalDate = shift start date and operationalShift. Its export maps operationalShift to the contract's lowercase shift. Preserve that confirmed date; do not infer it from createdAt/completion time. Malaysia timezone and 07:00 operational rollover are defined in `app/lib/operationalDate.ts`. Example: dispatch at 04 October 06:59 during Malam belongs to 03 October. At 07:00 the new operational day starts.

New ETD reports retain explicit `operationalDate` to avoid applying legacy timestamp correction twice. Changing form date updates both dates. Older ETD reports without that field keep the existing legacy correction helper. PHC's future writer must use the confirmed operation fields, validate its night date rules against this helper, and reuse the same 07:00 contract if it adds suggestions. No PHC formula or deployment was changed here.

## Queries / indexes / cost

Firestore `documents:runQuery` uses:

- `status == completed`
- `operationalDate >= start` AND `operationalDate <= end`
- form: also `shift == pagi|petang|malam`
- orderBy operationalDate ASC
- projection: phcId, status, operationalDate, shift, callSource, deleted, deletedAt

Daily dashboard reads one operational date, even when no ETD report exists. Form queries one date and shift. Report range/page hydration queries only the dates represented by that result. Statistics reads the selected week/month/year, clipped to the integration boundary, includes PHC calls even without a corresponding saved ETD report, and adds manual calls only before the boundary. Integrated ranges bypass stale statistics caches. Focus, screen reopen and the refresh button requery current summaries. No realtime subscription/polling is introduced.

Annual stats currently read the selected year's minimal summaries, one document per completed case; this is bounded but not a server count aggregation. A future aggregation endpoint can reduce reads if volume warrants it. Projection reduces payload, not per-document read billing. No clinical database downloads.

Two composite indexes are supplied in `backend/firebase/phc.indexes.json`: status+operationalDate, and status+shift+operationalDate. Merge these into the project's existing index configuration; do not replace existing indexes. `callSource` is counted locally and needs no compound index. Index creation and readiness were not tested in production.

Firebase official references:
- https://firebase.google.com/docs/firestore/query-data/indexing
- https://firebase.google.com/docs/firestore/security/rules-fields

## Security prerequisite

Existing ETD authentication is reused; the project's deployed Firestore rules were not available in this repository. Before activation, add narrowly scoped authenticated summary reads and authorized PHC publisher writes using the actual existing roles. ETD must have no clinical PHC read access or summary write access. Anonymous auth alone does not establish a PHC publisher role. Do not loosen clinical rules or add broad public writes. Field projection is not a security boundary: Firestore permissions apply at document level, hence the separate minimal summary collection. No rules were deployed by this change.

## UI / persistence / failure

After the boundary the call fields are read-only outputs with AUTO • PHC. The manual handler also rejects edits for integrated dates. Call notes, ambulance movements and all other ETD inputs remain independent. Historical dates keep manual values/counters. On first integrated save, the prior server manual calls are retained as `legacyCalls`; call notes survive. Current calls are refreshed before save, and the saved shape stays calls.mecc/operator/awam/palsu. `callData` is transient and is removed before persistence.

Loading and errors show em dashes, clear status and retry, never a silent zero. Offline ETD cache is allowed for other fields but integrated call totals are marked unavailable. A valid empty query yields zero. Save/print buttons are disabled until the form's PHC read succeeds; save additionally requeries to prevent stale counts. Statistics and dashboard isolate PHC failures so other ETD data remains visible. Browser print without the app button still prints explicit unavailable markers.

## Verification

Run `node --test tests/*.test.mjs`, `npx tsc --noEmit -p tsconfig.pages.json`, `npm run lint`, `npm run build`.

`tests/phc-integration.test.mjs` executes the actual transpiled repository/derive code with an activated test boundary and mocked Firestore REST transport: A/B totals, C edit, D repeated ID/upsert, E draft, F shift isolation, G 06:59/07:00 rollover, H cancelled/void/soft delete, I legacy reports, J network failure/offline cache/save guard, K/L daily and week/month/year consistency including calls without ETD reports, and preservation of notes/manual history. This is functional adapter testing, not live PHC submission or production Firebase verification.

Required before activation: connect PHC publisher, confirm canonical shift/date data, deploy/verify indexes and scoped rules, run A–H against actual shared PHC records, verify ETD form/dashboard/statistics/print and mobile, then set an agreed complete-coverage start date. No production clinical test data has been created.

Verification result: 18 tests passed, app-scoped TypeScript passed, lint passed with the two existing img warnings, production build passed. The full project TypeScript config still reports pre-existing Cloudflare worker ambient-type errors; `tsconfig.pages.json` passes. Actual iPhone/mobile browser and printed-page visual checks could not run: no browser binary was installed and browser download returned an invalid/truncated archive. No claim of live/mobile end-to-end completion is made.
