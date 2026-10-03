# PHC → ETD emergency calls

## Rollout

The owner confirmed **3 October 2026** as the first operational date using PHC-derived calls. `PHC_INTEGRATION_START_DATE` is `2026-10-03`. Manual values before that date remain unchanged. Every call from that date must be represented by a completed, successfully synced PHC. A missing cloud case cannot be counted. Existing device-local cases must be synced from their original browser origin; changing the app URL does not migrate localStorage.

The repositories and deployments remain separate:
- `cherosli33-hub/phc-kuala-lipis`: PHC writer, clinical form, local drafts and completed records.
- `cherosli33-hub/laporan-harian-etd`: ETD reader, reports and operations UI.

Shared Firebase project: `amo-dashboard-v2`. ETD uses existing `daily_reports` and Anonymous Auth. PHC uses Google sign-in and the approved staff/admin policy. No credentials or new Firebase project were invented. Existing AMO modules were not changed.

## Entity contract and privacy

PHC atomically upserts clinical `phcRecords/{phcId}` and minimal `phcCallSummaries/{phcId}` in one transaction. IDs and createdAt remain unchanged on edit; updatedAt rejects stale overwrites. The durable device outbox retains failed writes and retries after sign-in/reconnection. Drafts are never published. A pending local record does not count yet; PHC shows its sync status.

Summary fields: phcId, status (`completed`), operationalDate, shift (`pagi|petang|malam`), callSource (`mecc|operator|awam|palsu`), callDate, callTime, meccCentre (only for MECC), timeZone (`Asia/Kuala_Lumpur`), createdAt, updatedAt, integrationVersion, deleted, deletedAt. Clinical details are exclusively in `phcRecords.recordJson`. ETD requests only operational fields. The deployed rules allow authenticated summary reads and deny ETD clinical reads and PHC writes. PHC writers require verified approved accounts; self-approval is denied.

ETD counts unique PHC IDs, never counter+1. Invalid eligible metadata or conflicting IDs produce an unavailable state. Deleted or non-completed entities are excluded; production PHC currently has no cancellation/deletion UI.

## Operational date and shift

PHC explicitly confirms operationalDate and shift. ETD preserves them rather than inferring from completion time. Night calls after midnight can belong to the previous operational date. ETD's central 07:00 helper remains for legacy records and current-date display. Current ETD reports store explicit operationalDate to avoid applying legacy correction twice. PHC calendar and operation fields are validated; no automatic shift guess is introduced.

## Reader and statistics

Firestore query: completed status, bounded operationalDate range, optional lowercase shift; order by operationalDate. Projection: phcId, status, operationalDate, shift, callSource, deleted, deletedAt. The two existing PHC composite indexes are deployed and ready. Queries filter canonical YYYY-MM-DD values; the reducer validates real calendar dates and compares day numbers.

Form outputs are read-only AUTO • PHC. Save requeries and refuses unavailable data. The dashboard queries calls even without an ETD report. Weekly/monthly/yearly statistics add historical manual calls before the boundary and unique PHC summaries from the boundary onwards, including calls without an ETD report. Current form/Home values use scoped realtime listeners. Historical/statistics views load their requested range on demand.

Original manual counts are retained as legacyCalls on the first integrated save; notes and all other ETD fields remain intact. Transient callData is not persisted. Loading/errors show unavailable markers rather than zero. A successful empty backend query returns zero. Offline cache cannot masquerade as live PHC data. Save/print are blocked until the PHC read succeeds. Authentication/API requests have bounded timeouts.

## Verification on 3 October 2026

- PHC: model tests, Firestore rules tests, real mobile form create/draft/completion/edit/search/filter/AMPLE/Notes/print/period/source/outbox/refresh tests passed at widths 320–414.
- ETD mobile browser: four sources, fresh edit refresh, unavailable/save/print guards, derived save and week/month/year totals passed at widths 320–414 with no JavaScript errors. All external requests were intercepted; no fixture writes reached production.
- ETD: repository/React tests for all sources, duplicates, drafts, night date, historical values, unavailable/save/print guards and period totals passed. App TypeScript and production build passed.
- Shared Firestore emulator: actual PHC transaction/model → actual Firestore rules/query → actual ETD reader. Four sources, idempotent resave, source-changing edit, draft exclusion, separate shifts, night after midnight, historical manual calls and week/month/year totals passed. Test fixtures were restricted to the demo emulator.
- Production read-only queries succeeded for 3 October, both all-shift and Pagi/Petang/Malam. All returned zero; no production PHC test cases or patient fixtures were created.
- PHC is published separately. Its new Google OAuth origin still needs Firebase Authentication authorization. Firebase Console in the current browser returned 502; app sign-in/cloud publication cannot yet be certified on the new origin. End-to-end production clinical submission remains pending that configuration and an approved user's real case.

Annual queries read one minimal summary per case. Projection reduces payload, not document-read billing. Local drafts and device records remain origin-specific. Private PHC hosting access and Firebase staff authorization are separate access controls.

## Reproduce

`node --test tests/phc-integration.test.mjs tests/statistics.test.mjs`

`npx tsc --noEmit -p tsconfig.pages.json`

`npm run build`

For shared-backend verification, keep both repos separate, prepare the PHC demo rules, start its Firestore emulator, then run ETD `tests/shared-backend.test.mjs` with `PHC_PROJECT_PATH` set to that checkout and `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`. The test refuses a non-local emulator host.

ETD mobile test: `tests/mobile-integration.test.cjs`, a local app server, Playwright module via `PLAYWRIGHT_MODULE`, and optional `PHC_CHROMIUM_PATH`. It intercepts all external traffic and cannot write fixture records to production.

### Pengesahan Firebase / refresh
CallState ready kini membawa fetchedAt, operationalDate dan shift daripada query berjaya. UI memaparkan pengesahan + masa semakan; ini membuktikan data PHC yang tersedia telah dibaca dari Firebase, bukan semua device lain telah selesai upload. Home/borang menggunakan onSnapshot sempit; polling terdahulu telah diganti sepenuhnya. Kiraan kekal berdasarkan entiti unik. Service worker tidak cache domain Firebase/Auth; kegagalan rangkaian tidak boleh dipaparkan sebagai data cloud terkini.

## Realtime AMO shifts (4 October 2026)

The deployments remain independent. The identical `operationalShift.js` contract
is vendored into PHC `public/shared` and ETD `app/shared`; both execute the same
`getOperationalShift`/`fromLocal` implementation in Asia/Kuala_Lumpur.
Wire values remain lowercase (`pagi`, `petang`, `malam`, `mecc`, `operator`,
`awam`, `palsu`) to preserve existing records, queries and security rules.
Pagi is [07:00,14:00), Petang [14:00,21:00), Malam [21:00,next 07:00).
Before 07:00 the operational date is the previous Malaysia calendar day.

`app/lib/phcLive.ts` attaches `onSnapshot` with metadata changes to:
`phcCallSummaries WHERE status == completed AND operationalDate == date
AND shift == selectedShift.toLowerCase()`.
Only a server-confirmed snapshot (`fromCache=false`, `hasPendingWrites=false`)
produces Live status and usable counters. Counts are rebuilt from the complete
snapshot, deduplicated by document/PHC ID; events never increment database counters.
The form has one subscription. Home has three disjoint shift subscriptions for
its selected operational date to show the daily sum. Cleanup calls unsubscribe
on view/date/shift/retry changes and on unmount, including cancelled async auth.
Firestore handles connection retries. Offline/cache is shown as interrupted sync.
No focus/visibility polling or 30-second timer remains. The only shift timer is
local, scheduled at the next 07:00/14:00/21:00 boundary. Active current reports
follow it while explicitly selected historical dates/shifts stay pinned; the old
draft is preserved before switching. Historical/statistics reads are on-demand,
bounded to selected dates/ranges; record pages hydrate only their visible dates.
The existing completed/status/shift/date indexes support this query. No new public
access and no production rules relaxation were needed.

PHC preserves IDs on edit, saves a durable local pending version, and commits
clinical record plus operation-only summary atomically. Final success appears
only after the transaction promise confirms the server write. `submittedAt`,
`shiftEngineVersion`, uppercase `callSourceType`, `callSourceDetail` and
`syncStatus` are added inside the clinical JSON envelope without changing the
public summary/rules schema. Lowercase `callSource` is the canonical wire source;
MECC names never determine category through string matching. Old records are not
bulk-migrated. New/explicitly edited records enforce the shared engine.

Verification: unit/model tests, actual Firestore emulator listener/rules tests,
180-second idle listener observation, isolated mobile React UI tests with no
production writes and exact 14:00/21:00/07:00 rollover/lifecycle checks. To run the
cross-repository emulator suite, check out PHC and ETD as sibling directories,
prepare PHC test rules, and run `firebase emulators:exec` using PHC firebase.test.json
with `node --test ../etd-integration/tests/realtime.test.mjs`.
The mobile test-only Vite fixture replaces the listener at module resolution;
none of that fixture is imported into production.
