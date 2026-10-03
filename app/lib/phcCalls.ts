import type { Report, Shift } from './types';
import { operationalDateForReport } from './operationalDate';

// Operational cutover confirmed by the owner: 3 October 2026.
// Historical manual calls before this date remain unchanged.
export const PHC_INTEGRATION_START_DATE: string | null = '2026-10-03';
export const PHC_SUMMARY_COLLECTION = 'phcCallSummaries';
export const callLabels = { mecc: 'MECC / Call Centre', operator: 'Operator', awam: 'Awam', palsu: 'Palsu' };
export type CallSource = keyof typeof callLabels;
export type Calls = Report['calls'];
export type CallState = { status: 'loading' | 'ready' | 'error'; calls?: Calls; message?: string };
export type PHCSummary = { phcId: string; status: string; operationalDate: string; shift: string; callSource: string; deleted?: boolean; deletedAt?: string | null };
export const emptyCalls = (): Calls => ({ mecc: 0, operator: 0, awam: 0, palsu: 0 });
export const callsTotal = (calls: Calls) => Object.values(calls).reduce((sum, n) => sum + n, 0);
export function calendarDay(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Tarikh operasi PHC tidak sah.');
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Tarikh operasi PHC tidak sah.');
  return date.getTime() / 86400000;
}
export function usesPHC(date: string, start = PHC_INTEGRATION_START_DATE) { return !!start && date >= start; }
export function normalizePHCShift(shift: string): Shift | null {
  return ({ pagi: 'Pagi', petang: 'Petang', malam: 'Malam' } as Record<string, Shift>)[shift.toLowerCase()] || null;
}
export function derivePHCCalls(rows: PHCSummary[], start: string, end = start, shift?: Shift): Calls {
  const result = emptyCalls();
  const startDay = calendarDay(start), endDay = calendarDay(end);
  if (endDay < startDay) throw new Error('Julat tarikh PHC tidak sah.');
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (row.status !== 'completed' || row.deleted || row.deletedAt) continue;
    const day = calendarDay(row.operationalDate);
    const normalizedShift = normalizePHCShift(row.shift);
    if (day < startDay || day > endDay || (shift && normalizedShift !== shift)) continue;
    if (!row.phcId?.trim() || !normalizedShift || !Object.prototype.hasOwnProperty.call(callLabels, row.callSource)) throw new Error('Maklumat panggilan PHC tidak lengkap.');
    const signature = `${row.operationalDate}_${normalizedShift}_${row.callSource}`;
    if (seen.has(row.phcId)) {
      if (seen.get(row.phcId) !== signature) throw new Error("ID PHC mempunyai maklumat bercanggah.");
      continue;
    }
    seen.set(row.phcId, signature);
    result[row.callSource as CallSource]++;
  }
  return result;
}
// PHC summaries must be upserted at document ID = phcId. No counter writes.
export function reportWithCalls(report: Report, state: CallState): Report {
  return { ...report, calls: state.status === 'ready' ? state.calls! : report.calls, callData: state };
}
export function reportCallsTotal(report: Report): number | null {
  if (usesPHC(operationalDateForReport(report)) && report.callData?.status !== 'ready') return null;
  return callsTotal(report.calls);
}
export function fieldCalls(report: Report): Calls | null {
  return reportCallsTotal(report) === null ? null : report.calls;
}
