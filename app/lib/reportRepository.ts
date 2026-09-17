import type { Report } from "./types";

const FIREBASE_API_KEY = "AIzaSyCQQ85ceJep54XbkDFun2Zb1dpECcsCAIw";
const PROJECT_ID = "amo-dashboard-v2";
const COLLECTION = "daily_reports";
const CACHE_KEY = "etd-laporan-harian:firebase-cache:v2";
const AUTH_KEY = "etd-laporan-harian:firebase-auth:v2";

export type StaffSuggestion = { name: string; category: string; uses: number; lastUsed: string };
export type StatsPeriod = "day" | "week" | "month" | "year";
export type StatsTotals = {
  cases: number; merah: number; kuning: number; hijau: number;
  l1: number; l2: number; l3: number; l4: number; l5: number;
  asthma: number; oscc: number; kesBaru: number; kesUlangan: number;
  ward: number; ambulance: number; calls: number; bid: number; did: number;
};
export type RemoteStats = {
  period: StatsPeriod;
  start: string;
  end: string;
  totals: StatsTotals;
  groups: Array<{ key: string } & StatsTotals>;
};

type AuthSession = { idToken: string; refreshToken: string; expiresAt: number };
type FirestoreDocument = { name?: string; fields?: Record<string, { stringValue?: string; booleanValue?: boolean }> };

function cacheReports(reports: Report[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(CACHE_KEY, JSON.stringify(reports));
}
function cachedReports(): Report[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(CACHE_KEY) || "[]") as Report[]; }
  catch { return []; }
}
function loadAuth(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(window.localStorage.getItem(AUTH_KEY) || "null") as AuthSession | null; }
  catch { return null; }
}
function saveAuth(session: AuthSession) {
  window.localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return session;
}
async function anonymousAuth(): Promise<AuthSession> {
  const existing = loadAuth();
  if (existing && existing.expiresAt > Date.now() + 60_000) return existing;
  if (existing?.refreshToken) {
    try {
      const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: existing.refreshToken }),
      });
      if (response.ok) {
        const data = await response.json() as { id_token: string; refresh_token: string; expires_in: string };
        return saveAuth({ idToken: data.id_token, refreshToken: data.refresh_token, expiresAt: Date.now() + Number(data.expires_in) * 1000 });
      }
    } catch { /* create a fresh anonymous session below */ }
  }
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!response.ok) throw new Error("Firebase Anonymous Auth tidak dapat dimulakan.");
  const data = await response.json() as { idToken: string; refreshToken: string; expiresIn: string };
  return saveAuth({ idToken: data.idToken, refreshToken: data.refreshToken, expiresAt: Date.now() + Number(data.expiresIn) * 1000 });
}
function baseUrl() {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}`;
}
async function firebaseFetch(url: string, init: RequestInit = {}) {
  const auth = await anonymousAuth();
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.idToken}`, ...(init.headers || {}) } });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firebase tidak dapat dihubungi (${response.status}). ${text.slice(0, 180)}`);
  }
  return response;
}
function docToReport(doc: FirestoreDocument): Report | null {
  if (doc.fields?.deleted?.booleanValue) return null;
  const raw = doc.fields?.reportJson?.stringValue;
  if (!raw) return null;
  try { return JSON.parse(raw) as Report; } catch { return null; }
}
async function allRemoteReports(): Promise<Report[]> {
  const reports: Report[] = [];
  let pageToken = "";
  do {
    const url = new URL(baseUrl());
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await firebaseFetch(url.toString());
    const data = await response.json() as { documents?: FirestoreDocument[]; nextPageToken?: string };
    for (const doc of data.documents || []) {
      const report = docToReport(doc);
      if (report) reports.push(report);
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return reports.sort((a, b) => (b.date + shiftOrder(b.shift)).localeCompare(a.date + shiftOrder(a.shift)));
}
function shiftOrder(shift: string) { return shift === "Malam" ? "3" : shift === "Petang" ? "2" : "1"; }
function emptyTotals(): StatsTotals {
  return { cases: 0, merah: 0, kuning: 0, hijau: 0, l1: 0, l2: 0, l3: 0, l4: 0, l5: 0, asthma: 0, oscc: 0, kesBaru: 0, kesUlangan: 0, ward: 0, ambulance: 0, calls: 0, bid: 0, did: 0 };
}
function addTotals(total: StatsTotals, report: Report) {
  const s = report.stats;
  total.l1 += s.l1; total.l2 += s.l2; total.l3 += s.l3; total.l4 += s.l4; total.l5 += s.l5;
  total.asthma += s.asthmaBay; total.oscc += s.oscc; total.merah += s.merah; total.kuning += s.kuning; total.hijau += s.hijau;
  total.kesBaru += s.kesBaru; total.kesUlangan += s.kesUlangan; total.ward += s.masukWad;
  total.cases += s.merah + s.kuning + s.hijau; total.ambulance += report.ambulances.length;
  total.calls += report.calls.mecc + report.calls.operator + report.calls.awam + report.calls.palsu;
  total.bid += report.bid; total.did += report.did;
}
function dateKey(date: Date) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function periodRange(period: StatsPeriod, anchor: string) {
  const [y, m, d] = anchor.split("-").map(Number);
  const a = new Date(y, (m || 1) - 1, d || 1);
  let start = new Date(a), end = new Date(a);
  if (period === "week") {
    const mondayOffset = (a.getDay() + 6) % 7; start.setDate(a.getDate() - mondayOffset); end = new Date(start); end.setDate(start.getDate() + 6);
  } else if (period === "month") {
    start = new Date(a.getFullYear(), a.getMonth(), 1); end = new Date(a.getFullYear(), a.getMonth() + 1, 0);
  } else if (period === "year") {
    start = new Date(a.getFullYear(), 0, 1); end = new Date(a.getFullYear(), 11, 31);
  }
  return { start: dateKey(start), end: dateKey(end) };
}

export const reportRepository = {
  apiUrl: `firebase://${PROJECT_ID}/${COLLECTION}`,
  cachedReports,
  async getAll(filters: { date?: string; shift?: string; start?: string; end?: string } = {}) {
    const all = await allRemoteReports();
    const reports = all.filter(report =>
      (!filters.date || report.date === filters.date) &&
      (!filters.shift || filters.shift === "Semua" || report.shift === filters.shift) &&
      (!filters.start || report.date >= filters.start) && (!filters.end || report.date <= filters.end));
    if (!Object.keys(filters).length) cacheReports(reports);
    return reports;
  },
  async save(report: Report) {
    const id = `${report.date}_${report.shift}`;
    const url = `${baseUrl()}/${encodeURIComponent(id)}`;
    let created = true;
    try { await firebaseFetch(url); created = false; } catch { created = true; }
    const now = new Date().toISOString();
    const saved: Report = { ...report, id, createdAt: created ? (report.createdAt || now) : report.createdAt, updatedAt: now };
    await firebaseFetch(url, { method: "PATCH", body: JSON.stringify({ fields: {
      date: { stringValue: saved.date }, shift: { stringValue: saved.shift }, reportJson: { stringValue: JSON.stringify(saved) },
      deleted: { booleanValue: false }, updatedAt: { stringValue: saved.updatedAt }
    } }) });
    const reports = cachedReports(); const index = reports.findIndex(item => item.id === id);
    if (index < 0) reports.push(saved); else reports[index] = saved; cacheReports(reports);
    return { created, report: saved };
  },
  async remove(id: string) {
    const url = `${baseUrl()}/${encodeURIComponent(id)}?updateMask.fieldPaths=deleted&updateMask.fieldPaths=updatedAt`;
    await firebaseFetch(url, { method: "PATCH", body: JSON.stringify({ fields: { deleted: { booleanValue: true }, updatedAt: { stringValue: new Date().toISOString() } } }) });
    cacheReports(cachedReports().filter(report => report.id !== id));
  },
  async getStaff() {
    const reports = await allRemoteReports();
    const map = new Map<string, StaffSuggestion>();
    reports.forEach(report => report.staff.forEach(item => {
      if (!item.name.trim()) return; const key = `${item.category.toLowerCase()}|${item.name.toLowerCase()}`; const current = map.get(key);
      if (!current) map.set(key, { name: item.name, category: item.category, uses: 1, lastUsed: report.date });
      else { current.uses += 1; if (report.date > current.lastUsed) current.lastUsed = report.date; }
    }));
    return [...map.values()].sort((a, b) => b.uses - a.uses || b.lastUsed.localeCompare(a.lastUsed));
  },
  async getStats(period: StatsPeriod, anchor: string): Promise<RemoteStats> {
    const range = periodRange(period, anchor); const reports = (await allRemoteReports()).filter(r => r.date >= range.start && r.date <= range.end);
    const totals = emptyTotals(); reports.forEach(r => addTotals(totals, r)); const grouped = new Map<string, StatsTotals>();
    reports.forEach(r => { const key = period === "year" ? r.date.slice(0, 7) : r.date; if (!grouped.has(key)) grouped.set(key, emptyTotals()); addTotals(grouped.get(key)!, r); });
    return { period, start: range.start, end: range.end, totals, groups: [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, ...value })) };
  },
};
