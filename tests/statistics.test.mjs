import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

test("operational day uses one central 07:00 helper", async () => {
  const operational = await source("app/lib/operationalDate.ts");
  const repository = await source("app/lib/reportRepository.ts");
  assert.match(operational, /OPERATIONAL_DAY_START_HOUR = 7/);
  assert.match(operational, /parts\.hour < OPERATIONAL_DAY_START_HOUR/);
  assert.match(repository, /operationalDateForReport\(report\)/);
  assert.doesNotMatch(repository, /onSnapshot|onValue|setInterval/);
});

test("statistics use one range read, local aggregation and range cache", async () => {
  const repository = await source("app/lib/reportRepository.ts");
  assert.match(repository, /statisticsMemoryCache/);
  assert.match(repository, /sessionStorage/);
  assert.match(repository, /statisticsRequests/);
  assert.match(repository, /const queried = await queryRange/);
  assert.match(repository, /reports\.forEach\(\(report\) =>/);
  assert.doesNotMatch(repository, /getStats[\s\S]*firebaseFetch[\s\S]*firebaseFetch/);
});

test("statistics UI reuses totals and groups without Firebase writes", async () => {
  const page = await source("app/page.tsx");
  assert.match(page, /Mingguan/);
  assert.match(page, /Bulanan/);
  assert.match(page, /Tahunan/);
  assert.match(page, /LevelBarChart totals=\{periodTotals\}/);
  assert.match(page, /DetailTable totals=\{periodTotals\}/);
  assert.match(page, /completeTrendGroups\(remoteStats\)/);
});
