import { Report } from "./types";

// Gantikan lapisan ini dengan API Google Apps Script nanti. Skrin aplikasi
// dan model data tidak perlu diubah apabila backend disambungkan.
const STORAGE_KEY = "etd-laporan-harian:v1";
export const localReportRepository = {
  getAll(): Report[] { if (typeof window === "undefined") return []; try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as Report[]; } catch { return []; } },
  save(report: Report) { const reports = this.getAll(); const index = reports.findIndex((item) => item.id === report.id); const created = index < 0; if (created) reports.push(report); else reports[index] = { ...report, createdAt: reports[index].createdAt }; window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports)); return { created, report }; },
  remove(id: string) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.getAll().filter((report) => report.id !== id))); },
};
