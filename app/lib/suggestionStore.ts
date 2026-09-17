import type { Report } from "./types";

export type SuggestionKind = "people" | "drivers" | "destinations" | "vehicles" | "units";
type Suggestion = { value: string; uses: number; lastUsed: string };
type SuggestionData = Record<SuggestionKind, Suggestion[]>;

const KEY = "etd-laporan-harian:suggestions:v1";
const MAX_PER_KIND = 60;
const emptyData = (): SuggestionData => ({ people: [], drivers: [], destinations: [], vehicles: [], units: [] });

function read(): SuggestionData {
  if (typeof window === "undefined") return emptyData();
  try {
    const stored = JSON.parse(window.localStorage.getItem(KEY) || "{}") as Partial<SuggestionData>;
    const empty = emptyData();
    return Object.fromEntries(Object.keys(empty).map((key) => [key, Array.isArray(stored[key as SuggestionKind]) ? stored[key as SuggestionKind] : []])) as SuggestionData;
  } catch {
    return emptyData();
  }
}

function add(data: SuggestionData, kind: SuggestionKind, raw: string, now: string) {
  const value = String(raw || "").trim().replace(/\s+/g, " ");
  if (!value) return;
  const key = value.toLocaleLowerCase("ms");
  const existing = data[kind].find((item) => item.value.toLocaleLowerCase("ms") === key);
  if (existing) {
    existing.value = value;
    existing.uses += 1;
    existing.lastUsed = now;
  } else {
    data[kind].push({ value, uses: 1, lastUsed: now });
  }
}

export const suggestionStore = {
  remember(report: Report) {
    if (typeof window === "undefined") return;
    const data = read();
    const now = new Date().toISOString();
    add(data, "people", report.filledBy, now);
    report.staff.forEach((member) => add(data, "people", member.name, now));
    report.ambulances.forEach((movement) => {
      movement.drivers.forEach((driver) => add(data, "drivers", driver, now));
      add(data, "destinations", movement.destination, now);
      add(data, "vehicles", movement.vehicleNo, now);
      add(data, "units", movement.unit, now);
    });
    (Object.keys(data) as SuggestionKind[]).forEach((kind) => {
      data[kind] = data[kind]
        .sort((a, b) => b.uses - a.uses || b.lastUsed.localeCompare(a.lastUsed))
        .slice(0, MAX_PER_KIND);
    });
    window.localStorage.setItem(KEY, JSON.stringify(data));
  },
  values(kind: SuggestionKind, query = "", limit = 12) {
    const needle = query.trim().toLocaleLowerCase("ms");
    return read()[kind]
      .filter((item) => !needle || item.value.toLocaleLowerCase("ms").includes(needle))
      .slice(0, limit)
      .map((item) => item.value);
  },
};
