import type { Report } from './types';
import { masterSuggestions, staffSuggestionKind, type SuggestionKind } from './masterSuggestions';
export type { SuggestionKind } from './masterSuggestions';
type Suggestion = { value: string; uses: number; lastUsed: string };
type SuggestionData = Record<SuggestionKind, Suggestion[]>;
export const SUGGESTION_STORAGE_KEY = 'etd-laporan-harian:suggestions:v2';
const MAX_PER_KIND = 60;
const LEGACY_KEY = 'etd-laporan-harian:suggestions:v1';
const kinds = Object.keys(masterSuggestions) as SuggestionKind[];
const clean = (value: string) => value.trim().replace(/\s+/g, ' ');
const comparable = (value: string) => clean(value).toLocaleLowerCase('ms');
const emptyData = () => Object.fromEntries(kinds.map(kind => [kind, [] as Suggestion[]])) as SuggestionData;
function read(): SuggestionData {
 const data = emptyData();
 if (typeof window === 'undefined') return data;
 try {
  // Do not infer staff roles from the legacy shared people list.
  const stored = JSON.parse(window.localStorage.getItem(SUGGESTION_STORAGE_KEY) || window.localStorage.getItem(LEGACY_KEY) || '{}');
  for (const kind of kinds) {
   const seen = new Set(masterSuggestions[kind].map(comparable));
   for (const item of Array.isArray(stored?.[kind]) ? stored[kind] : []) {
    if (typeof item?.value !== 'string') continue;
    const value = clean(item.value), key = comparable(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    data[kind].push({ value, uses: Number.isFinite(item.uses) ? item.uses : 1, lastUsed: typeof item.lastUsed === 'string' ? item.lastUsed : '' });
   }
  }
 } catch { /* Defaults still work when device storage is unavailable. */ }
 return data;
}
function add(data: SuggestionData, kind: SuggestionKind, raw: string, now: string) {
 const value = clean(String(raw || '')), key = comparable(value);
 if (!key || masterSuggestions[kind].some(item => comparable(item) === key)) return;
 const existing = data[kind].find(item => comparable(item.value) === key);
 if (existing) { existing.uses += 1; existing.lastUsed = now; }
 else data[kind].push({ value, uses: 1, lastUsed: now });
}
export const suggestionStore = {
 // Existing save path calls this only after the repository confirms success.
 remember(report: Report) {
  if (typeof window === 'undefined') return;
  const data = read(), now = new Date().toISOString();
  add(data, 'people', report.filledBy, now);
  report.staff.forEach(member => add(data, staffSuggestionKind(member.category), member.name, now));
  report.ambulances.forEach(movement => {
   movement.drivers.forEach(driver => add(data, 'drivers', driver, now));
   add(data, 'destinations', movement.destination, now);
   add(data, 'vehicles', movement.vehicleNo, now);
   add(data, 'units', movement.unit, now);
  });
  kinds.forEach(kind => { data[kind] = data[kind].sort((a, b) => b.uses - a.uses || b.lastUsed.localeCompare(a.lastUsed)).slice(0, MAX_PER_KIND); });
  try { window.localStorage.setItem(SUGGESTION_STORAGE_KEY, JSON.stringify(data)); }
  catch { /* Memory failure must not report a successfully saved record as failed. */ }
 },
 values(kind: SuggestionKind, query = '', limit = 12): string[] {
  const needle = comparable(query);
  return [...masterSuggestions[kind], ...read()[kind].map(item => item.value)]
   .filter(value => !needle || comparable(value).includes(needle)).slice(0, limit);
 },
};
