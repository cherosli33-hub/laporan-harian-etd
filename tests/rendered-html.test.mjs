import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

test("startup reads only the current operational date", async () => {
  const [page, repository] = await Promise.all([source("app/page.tsx"), source("app/lib/reportRepository.ts")]);
  assert.match(page, /reportRepository\.getByDate\(today\)/);
  assert.doesNotMatch(page, /reportRepository\.getAll\(/);
  assert.doesNotMatch(repository, /allRemoteReports|getAll\(/);
  assert.match(repository, /fieldPath: "date"/);
  assert.match(repository, /op: "EQUAL"/);
  assert.match(page, /malaysiaMinutes\(\) < 7 \* 60/);
  assert.doesNotMatch(page, /7 \* 60 \+ 30|7:30 pagi/);
});

test("records use range queries and server pagination", async () => {
  const repository = await source("app/lib/reportRepository.ts");
  assert.match(repository, /async getRange\(/);
  assert.match(repository, /GREATER_THAN_OR_EQUAL/);
  assert.match(repository, /LESS_THAN_OR_EQUAL/);
  assert.match(repository, /async getPage\(/);
  assert.match(repository, /pageSize/);
  assert.match(repository, /pageToken/);
  assert.match(repository, /orderBy/);
});

test("statistics are weekly, monthly or yearly and load on demand", async () => {
  const [page, repository] = await Promise.all([source("app/page.tsx"), source("app/lib/reportRepository.ts")]);
  assert.match(repository, /StatsPeriod = "week" \| "month" \| "year"/);
  assert.match(page, /Papar sensus/);
  assert.doesNotMatch(page, /if \(view !== "stats"\)/);
  for (const metric of ["l1", "l2", "l3", "l4", "l5", "merah", "kuning", "hijau", "asthma"]) assert.match(repository, new RegExp(metric));
});

test("vehicle movements preserve legacy driver and support multiple drivers", async () => {
  const [page, types] = await Promise.all([source("app/page.tsx"), source("app/lib/types.ts")]);
  assert.match(page, /Pergerakan Ambulans & Kenderaan/);
  assert.match(page, /\+ Tambah pemandu/);
  assert.match(types, /driver\?: string/);
  assert.match(types, /drivers: string\[\]/);
  assert.match(types, /legacyDriver \? \[legacyDriver\]/);
});

test("autocomplete is local, deduplicated and bounded", async () => {
  const suggestions = await source("app/lib/suggestionStore.ts");
  assert.match(suggestions, /localStorage/);
  assert.match(suggestions, /toLocaleLowerCase/);
  assert.match(suggestions, /MAX_PER_KIND = 60/);
  for (const kind of ["people", "drivers", "destinations", "vehicles", "units"]) assert.match(suggestions, new RegExp(kind));
});
