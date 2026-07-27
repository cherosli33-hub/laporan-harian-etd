import type { Report } from "./types";

const API_URL = "https://script.google.com/macros/s/AKfycbw45vEQYymDrgABTQDtxeILyF0_WacTYFb0iXFWU8AsWR3g3YMgv-OimxYlrPZzr0ZG/exec";
const CACHE_KEY = "etd-laporan-harian:server-cache:v1";
const CHANNEL = "etd-report-sheet";

export type StaffSuggestion = { name: string; category: string; uses: number; lastUsed: string };
export type StatsPeriod = "week" | "month" | "year";
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

type ApiPayload = {
  ok: boolean;
  error?: string;
  reports?: Report[];
  staff?: StaffSuggestion[];
  stats?: RemoteStats;
  created?: boolean;
  report?: Report;
};

function requestId() {
  return crypto.randomUUID().replace(/[^0-9A-Za-z-]/g, "");
}

function iframeRequest(query: Record<string, string>, postPayload?: unknown): Promise<ApiPayload> {
  if (typeof window === "undefined") return Promise.reject(new Error("Pelayar diperlukan."));
  return new Promise((resolve, reject) => {
    const id = requestId();
    const frame = document.createElement("iframe");
    frame.name = `etd_api_${id}`;
    frame.hidden = true;
    frame.setAttribute("aria-hidden", "true");
    let form: HTMLFormElement | null = null;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      form?.remove();
      frame.remove();
    };
    const onMessage = (event: MessageEvent) => {
      const message = event.data as { channel?: string; requestId?: string; payload?: ApiPayload };
      if (message?.channel !== CHANNEL || message.requestId !== id || !message.payload) return;
      cleanup();
      if (message.payload.ok) resolve(message.payload);
      else reject(new Error(message.payload.error || "Google Sheet tidak dapat dihubungi."));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Sambungan Google Sheet mengambil masa terlalu lama."));
    }, 30000);
    window.addEventListener("message", onMessage);
    document.body.appendChild(frame);

    if (postPayload) {
      form = document.createElement("form");
      form.method = "POST";
      form.action = API_URL;
      form.target = frame.name;
      form.hidden = true;
      const fields = { transport: "iframe", requestId: id, payload: JSON.stringify(postPayload) };
      Object.entries(fields).forEach(([name, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form!.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
      return;
    }

    const url = new URL(API_URL);
    url.searchParams.set("transport", "iframe");
    url.searchParams.set("requestId", id);
    Object.entries(query).forEach(([key, value]) => value && url.searchParams.set(key, value));
    frame.src = url.toString();
  });
}

function cacheReports(reports: Report[]) {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(reports));
}

function cachedReports(): Report[] {
  try { return JSON.parse(window.localStorage.getItem(CACHE_KEY) || "[]") as Report[]; }
  catch { return []; }
}

export const reportRepository = {
  apiUrl: API_URL,
  cachedReports,
  async getAll(filters: { date?: string; shift?: string; start?: string; end?: string } = {}) {
    const payload = await iframeRequest({ action: "listReports", limit: "1000", ...filters });
    const reports = payload.reports || [];
    if (!Object.keys(filters).length) cacheReports(reports);
    return reports;
  },
  async save(report: Report) {
    const payload = await iframeRequest({}, { action: "saveReport", report });
    const saved = payload.report || report;
    const reports = cachedReports();
    const index = reports.findIndex((item) => item.id === saved.id);
    if (index < 0) reports.push(saved); else reports[index] = saved;
    cacheReports(reports);
    return { created: Boolean(payload.created), report: saved };
  },
  async remove(id: string) {
    await iframeRequest({}, { action: "deleteReport", id });
    cacheReports(cachedReports().filter((report) => report.id !== id));
  },
  async getStaff() {
    const payload = await iframeRequest({ action: "listStaff" });
    return payload.staff || [];
  },
  async getStats(period: StatsPeriod, anchor: string) {
    const payload = await iframeRequest({ action: "getStats", period, anchor });
    if (!payload.stats) throw new Error("Statistik tidak diterima.");
    return payload.stats;
  },
};
