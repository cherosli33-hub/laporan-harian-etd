import { normalizeReport, type Report } from "./types";
import { nextDateISO, operationalDateForReport } from "./operationalDate";

const FIREBASE_API_KEY = "AIzaSyCQQ85ceJep54XbkDFun2Zb1dpECcsCAIw";
const PROJECT_ID = "amo-dashboard-v2";
const COLLECTION = "daily_reports";
const CACHE_KEY = "etd-laporan-harian:today-cache:v3";
const AUTH_KEY = "etd-laporan-harian:firebase-auth:v2";
const STATS_CACHE_KEY = "etd-laporan-harian:stats-cache:v1";

export type StatsPeriod = "week" | "month" | "year";
export type StatsTotals = { cases: number; merah: number; kuning: number; hijau: number; l1: number; l2: number; l3: number; l4: number; l5: number; asthma: number; oscc: number; kesBaru: number; kesUlangan: number; ward: number; ambulance: number; calls: number; bid: number; did: number };
export type RemoteStats = { period: StatsPeriod; start: string; end: string; totals: StatsTotals; groups: Array<{ key: string } & StatsTotals>; reports: Report[]; cacheKey: string };
export type RecordPage = { reports: Report[]; nextPageToken: string };

type AuthSession = { idToken: string; refreshToken: string; expiresAt: number };
type FirestoreDocument = { name?: string; fields?: Record<string, { stringValue?: string; booleanValue?: boolean }> };

function cacheReports(date: string, reports: Report[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(CACHE_KEY, JSON.stringify({ date, reports }));
}
function cachedReports(date: string): Report[] {
  if (typeof window === "undefined") return [];
  try {
    const cache = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null") as { date?: string; reports?: Report[] } | null;
    return cache?.date === date ? (cache.reports || []).map(normalizeReport) : [];
  } catch { return []; }
}
function loadAuth(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(window.localStorage.getItem(AUTH_KEY) || "null") as AuthSession | null; } catch { return null; }
}
function saveAuth(session: AuthSession) { window.localStorage.setItem(AUTH_KEY, JSON.stringify(session)); return session; }
async function anonymousAuth(): Promise<AuthSession> {
  const existing = loadAuth();
  if (existing && existing.expiresAt > Date.now() + 60_000) return existing;
  if (existing?.refreshToken) {
    try {
      const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: existing.refreshToken }) });
      if (response.ok) {
        const data = await response.json() as { id_token: string; refresh_token: string; expires_in: string };
        return saveAuth({ idToken: data.id_token, refreshToken: data.refresh_token, expiresAt: Date.now() + Number(data.expires_in) * 1000 });
      }
    } catch { /* create a fresh anonymous session */ }
  }
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) });
  if (!response.ok) throw new Error("Firebase Anonymous Auth tidak dapat dimulakan.");
  const data = await response.json() as { idToken: string; refreshToken: string; expiresIn: string };
  return saveAuth({ idToken: data.idToken, refreshToken: data.refreshToken, expiresAt: Date.now() + Number(data.expiresIn) * 1000 });
}
function baseUrl() { return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}`; }
function queryUrl() { return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`; }
async function firebaseFetch(url: string, init: RequestInit = {}) {
  const auth = await anonymousAuth();
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.idToken}`, ...(init.headers || {}) } });
  if (!response.ok) { const details = await response.text(); throw new Error(`Firebase tidak dapat dihubungi (${response.status}). ${details.slice(0, 180)}`); }
  return response;
}
function docToReport(doc?: FirestoreDocument): Report | null {
  if (!doc || doc.fields?.deleted?.booleanValue) return null;
  const raw = doc.fields?.reportJson?.stringValue;
  if (!raw) return null;
  try { return normalizeReport(JSON.parse(raw) as Report); } catch { return null; }
}
function shiftOrder(shift: string) { return shift === "Malam" ? "3" : shift === "Petang" ? "2" : "1"; }
function sortReports(reports: Report[]) { return reports.sort((a, b) => (b.date + shiftOrder(b.shift)).localeCompare(a.date + shiftOrder(a.shift))); }

type Filter = { fieldFilter: { field: { fieldPath: "date" }; op: "EQUAL" | "GREATER_THAN_OR_EQUAL" | "LESS_THAN_OR_EQUAL"; value: { stringValue: string } } };
const dateFilter = (op: Filter["fieldFilter"]["op"], value: string): Filter => ({ fieldFilter: { field: { fieldPath: "date" }, op, value: { stringValue: value } } });
async function queryRange(start: string, end = start): Promise<Report[]> {
  const filters = start === end ? [dateFilter("EQUAL", start)] : [dateFilter("GREATER_THAN_OR_EQUAL", start), dateFilter("LESS_THAN_OR_EQUAL", end)];
  const where = filters.length === 1 ? filters[0] : { compositeFilter: { op: "AND", filters } };
  const response = await firebaseFetch(queryUrl(), { method: "POST", body: JSON.stringify({ structuredQuery: { from: [{ collectionId: COLLECTION }], where, orderBy: [{ field: { fieldPath: "date" }, direction: "DESCENDING" }] } }) });
  const rows = await response.json() as Array<{ document?: FirestoreDocument }>;
  return sortReports(rows.map((row) => docToReport(row.document)).filter((report): report is Report => Boolean(report)));
}

const statisticsMemoryCache = new Map<string, RemoteStats>();
const statisticsRequests = new Map<string, Promise<RemoteStats>>();

function statisticsCacheKey(period: StatsPeriod, start: string, end: string) {
  return `${period === "week" ? "weekly" : period === "month" ? "monthly" : "yearly"}_${period === "week" ? `${start}_${end}` : period === "month" ? start.slice(0, 7) : start.slice(0, 4)}`;
}

function readStatisticsCache(key: string): RemoteStats | null {
  const memory = statisticsMemoryCache.get(key);
  if (memory) return memory;
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(`${STATS_CACHE_KEY}:${key}`) || "null") as RemoteStats | null;
    if (!parsed?.totals || !Array.isArray(parsed.groups) || !Array.isArray(parsed.reports)) return null;
    const normalized = { ...parsed, reports: parsed.reports.map(normalizeReport) };
    statisticsMemoryCache.set(key, normalized);
    return normalized;
  } catch { return null; }
}

function writeStatisticsCache(value: RemoteStats) {
  statisticsMemoryCache.set(value.cacheKey, value);
  if (typeof window !== "undefined") {
    try { window.sessionStorage.setItem(`${STATS_CACHE_KEY}:${value.cacheKey}`, JSON.stringify(value)); } catch { /* memory cache remains available */ }
  }
}

function clearStatisticsCache() {
  statisticsMemoryCache.clear();
  statisticsRequests.clear();
  if (typeof window !== "undefined") {
    Object.keys(window.sessionStorage).filter((key) => key.startsWith(`${STATS_CACHE_KEY}:`)).forEach((key) => window.sessionStorage.removeItem(key));
  }
}

function emptyTotals(): StatsTotals { return { cases: 0, merah: 0, kuning: 0, hijau: 0, l1: 0, l2: 0, l3: 0, l4: 0, l5: 0, asthma: 0, oscc: 0, kesBaru: 0, kesUlangan: 0, ward: 0, ambulance: 0, calls: 0, bid: 0, did: 0 }; }
function addTotals(total: StatsTotals, report: Report) {
  const s = report.stats;
  total.l1 += s.l1; total.l2 += s.l2; total.l3 += s.l3; total.l4 += s.l4; total.l5 += s.l5;
  total.asthma += s.asthmaBay; total.oscc += s.oscc; total.merah += s.merah; total.kuning += s.kuning; total.hijau += s.hijau;
  total.kesBaru += s.kesBaru; total.kesUlangan += s.kesUlangan; total.ward += s.masukWad;
  total.cases += s.merah + s.kuning + s.hijau; total.ambulance += report.ambulances.length;
  total.calls += report.calls.mecc + report.calls.operator + report.calls.awam + report.calls.palsu; total.bid += report.bid; total.did += report.did;
}
function dateKey(date: Date) { const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0"); return `${y}-${m}-${d}`; }
export function periodRange(period: StatsPeriod, anchor: string) {
  const [y, m, d] = anchor.split("-").map(Number); const a = new Date(y, (m || 1) - 1, d || 1); let start = new Date(a), end = new Date(a);
  if (period === "week") { const offset = (a.getDay() + 6) % 7; start.setDate(a.getDate() - offset); end = new Date(start); end.setDate(start.getDate() + 6); }
  else if (period === "month") { start = new Date(a.getFullYear(), a.getMonth(), 1); end = new Date(a.getFullYear(), a.getMonth() + 1, 0); }
  else { start = new Date(a.getFullYear(), 0, 1); end = new Date(a.getFullYear(), 11, 31); }
  return { start: dateKey(start), end: dateKey(end) };
}

export const reportRepository = {
  apiUrl: `firebase://${PROJECT_ID}/${COLLECTION}`,
  cachedReports,
  async getByDate(date: string) { const reports = await queryRange(date); cacheReports(date, reports); return reports; },
  async getRange(start: string, end: string, shift: string = "Semua") { const reports = await queryRange(start, end); return shift === "Semua" ? reports : reports.filter((report) => report.shift === shift); },
  async getPage(pageSize = 10, pageToken = "", shift: string = "Semua"): Promise<RecordPage> {
    const url = new URL(baseUrl()); url.searchParams.set("pageSize", String(pageSize)); url.searchParams.set("orderBy", "date desc"); if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await firebaseFetch(url.toString()); const data = await response.json() as { documents?: FirestoreDocument[]; nextPageToken?: string };
    const reports = sortReports((data.documents || []).map(docToReport).filter((report): report is Report => Boolean(report)));
    return { reports: shift === "Semua" ? reports : reports.filter((report) => report.shift === shift), nextPageToken: data.nextPageToken || "" };
  },
  async save(report: Report) {
    const normalized = normalizeReport(report); normalized.ambulances = normalized.ambulances.map((movement) => ({ ...movement, driver: movement.drivers[0] || movement.driver || "" }));
    const id = `${normalized.date}_${normalized.shift}`; const url = `${baseUrl()}/${encodeURIComponent(id)}`; let created = true;
    try { await firebaseFetch(url); created = false; } catch { created = true; }
    const now = new Date().toISOString(); const saved: Report = { ...normalized, id, createdAt: created ? (normalized.createdAt || now) : normalized.createdAt, updatedAt: now };
    await firebaseFetch(url, { method: "PATCH", body: JSON.stringify({ fields: { date: { stringValue: saved.date }, shift: { stringValue: saved.shift }, reportJson: { stringValue: JSON.stringify(saved) }, deleted: { booleanValue: false }, updatedAt: { stringValue: saved.updatedAt } } }) });
    clearStatisticsCache();
    return { created, report: saved };
  },
  async remove(id: string) {
    const url = `${baseUrl()}/${encodeURIComponent(id)}?updateMask.fieldPaths=deleted&updateMask.fieldPaths=updatedAt`;
    await firebaseFetch(url, { method: "PATCH", body: JSON.stringify({ fields: { deleted: { booleanValue: true }, updatedAt: { stringValue: new Date().toISOString() } } }) });
    clearStatisticsCache();
  },
  async getStats(period: StatsPeriod, anchor: string, options: { refresh?: boolean } = {}): Promise<RemoteStats> {
    const range = periodRange(period, anchor);
    const cacheKey = statisticsCacheKey(period, range.start, range.end);
    if (!options.refresh) {
      const cached = readStatisticsCache(cacheKey);
      if (cached) return cached;
      const pending = statisticsRequests.get(cacheKey);
      if (pending) return pending;
    }
    const request = (async () => {
      // One query only. The extra calendar day lets legacy pre-07:00 Malam
      // records be normalized and filtered to the correct operational date.
      const queried = await queryRange(range.start, nextDateISO(range.end));
      const reports = queried.filter((report) => {
        const date = operationalDateForReport(report);
        return date >= range.start && date <= range.end;
      });
      const totals = emptyTotals();
      const grouped = new Map<string, StatsTotals>();
      reports.forEach((report) => {
        addTotals(totals, report);
        const operationalDate = operationalDateForReport(report);
        const key = period === "year" ? operationalDate.slice(0, 7) : operationalDate;
        if (!grouped.has(key)) grouped.set(key, emptyTotals());
        addTotals(grouped.get(key)!, report);
      });
      const value: RemoteStats = { period, ...range, totals, reports, cacheKey, groups: [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => ({ key, ...item })) };
      writeStatisticsCache(value);
      return value;
    })();
    statisticsRequests.set(cacheKey, request);
    try { return await request; } finally { statisticsRequests.delete(cacheKey); }
  },
  clearStatisticsCache,
};
