const ETD_CONFIG = Object.freeze({
  SPREADSHEET_ID: "1_iHiS3PuL2tokfXZLyflN0ViosZKyvfQT5lQHqrtRJc",
  REPORTS: "Shift_Reports",
  STAFF: "Staff_On_Duty",
  DIRECTORY: "Staff_Directory",
  CARRY: "Carry_Forward",
  AMBULANCE: "Ambulance",
  CALLS: "Emergency_Calls",
  DAILY: "Daily_Summary"
});

const REPORT_HEADERS = Object.freeze([
  "Report_ID", "Tarikh", "Syif", "Diisi_Oleh", "L1", "L2", "L3", "L4", "L5",
  "Asthma_Bay", "OSCC", "Zon_Merah", "Zon_Kuning", "Zon_Hijau", "Kes_Baru",
  "Kes_Ulangan", "Jumlah_Pesakit", "Masuk_Wad", "Carry_Merah", "Carry_Kuning",
  "Observation_Ward", "BID", "DID", "MECC", "Operator", "Awam", "Palsu",
  "Jumlah_Panggilan", "Catatan_Carry", "Catatan_Kes", "Catatan_Panggilan",
  "Created_At", "Updated_At"
]);

function doGet(e) {
  const parameters = (e && e.parameter) || {};
  try {
    const action = String(parameters.action || "health");
    let payload;
    if (action === "health") {
      payload = { ok: true, service: "Laporan Harian ETD Kuala Lipis API", time: new Date().toISOString() };
    } else if (action === "listReports") {
      payload = { ok: true, reports: listReports_(parameters) };
    } else if (action === "listStaff") {
      payload = { ok: true, staff: listStaffDirectory_() };
    } else if (action === "getStats") {
      payload = { ok: true, stats: getStats_(parameters) };
    } else {
      throw new Error("Tindakan tidak disokong.");
    }
    return response_(parameters, payload);
  } catch (error) {
    return response_(parameters, { ok: false, error: String(error && error.message || error) });
  }
}

function doPost(e) {
  const parameters = (e && e.parameter) || {};
  try {
    const body = parameters.payload || (e && e.postData && e.postData.contents) || "{}";
    const payload = JSON.parse(body);
    if (payload.action === "saveReport") {
      const result = saveReport_(payload.report || {});
      return response_(parameters, { ok: true, created: result.created, report: result.report });
    }
    if (payload.action === "deleteReport") {
      deleteReport_(String(payload.id || ""));
      return response_(parameters, { ok: true, id: String(payload.id || "") });
    }
    throw new Error("Tindakan tidak disokong.");
  } catch (error) {
    console.error(error);
    return response_(parameters, { ok: false, error: String(error && error.message || error) });
  }
}

function saveReport_(report) {
  validateReport_(report);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getSpreadsheet_();
    const sheet = requireSheet_(spreadsheet, ETD_CONFIG.REPORTS, REPORT_HEADERS);
    const id = clean_(report.date) + "_" + clean_(report.shift);
    const existingRow = findRowById_(sheet, id);
    const now = new Date();
    const createdAt = existingRow ? sheet.getRange(existingRow, 32).getValue() : validDate_(report.createdAt) || now;
    const row = reportToRow_({ ...report, id: id, createdAt: createdAt, updatedAt: now });
    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
    } else {
      appendRow_(sheet, row);
    }
    replaceChildRows_(spreadsheet.getSheetByName(ETD_CONFIG.STAFF), id, staffRows_(report, id));
    replaceChildRows_(spreadsheet.getSheetByName(ETD_CONFIG.CARRY), id, carryRows_(report, id));
    replaceChildRows_(spreadsheet.getSheetByName(ETD_CONFIG.AMBULANCE), id, ambulanceRows_(report, id));
    replaceChildRows_(spreadsheet.getSheetByName(ETD_CONFIG.CALLS), id, callRows_(report, id));
    rebuildStaffDirectory_(spreadsheet);
    refreshDailySummary_(spreadsheet);
    SpreadsheetApp.flush();
    return { created: !existingRow, report: rowToReport_(row, childMaps_(spreadsheet)) };
  } finally {
    lock.releaseLock();
  }
}

function deleteReport_(id) {
  if (!id) throw new Error("ID laporan diperlukan.");
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getSpreadsheet_();
    const reportSheet = spreadsheet.getSheetByName(ETD_CONFIG.REPORTS);
    const row = findRowById_(reportSheet, id);
    if (row) reportSheet.deleteRow(row);
    [ETD_CONFIG.STAFF, ETD_CONFIG.CARRY, ETD_CONFIG.AMBULANCE, ETD_CONFIG.CALLS].forEach(function (name) {
      replaceChildRows_(spreadsheet.getSheetByName(name), id, []);
    });
    rebuildStaffDirectory_(spreadsheet);
    refreshDailySummary_(spreadsheet);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function listReports_(parameters) {
  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(ETD_CONFIG.REPORTS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  assertHeaders_(sheet, REPORT_HEADERS);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, REPORT_HEADERS.length).getValues();
  const children = childMaps_(spreadsheet);
  const date = clean_(parameters.date);
  const shift = clean_(parameters.shift);
  const start = clean_(parameters.start);
  const end = clean_(parameters.end);
  const limit = Math.min(1000, Math.max(1, Number(parameters.limit) || 500));
  return rows.filter(function (row) {
    const key = dateKey_(row[1]);
    return clean_(row[0]) &&
      (!date || key === date) &&
      (!shift || shift === "Semua" || clean_(row[2]) === shift) &&
      (!start || key >= start) &&
      (!end || key <= end);
  }).sort(function (a, b) {
    return (dateKey_(b[1]) + shiftOrder_(b[2])) > (dateKey_(a[1]) + shiftOrder_(a[2])) ? 1 : -1;
  }).slice(0, limit).map(function (row) {
    return rowToReport_(row, children);
  });
}

function listStaffDirectory_() {
  const sheet = getSpreadsheet_().getSheetByName(ETD_CONFIG.DIRECTORY);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues()
    .filter(function (row) { return clean_(row[0]); })
    .map(function (row) {
      return { name: clean_(row[0]), category: clean_(row[1]), uses: number_(row[2]), lastUsed: dateKey_(row[3]) };
    });
}

function getStats_(parameters) {
  const period = ["day", "week", "month", "year"].includes(parameters.period) ? parameters.period : "month";
  const anchor = parseDateKey_(parameters.anchor) || new Date();
  const range = periodRange_(period, anchor);
  const reports = listReports_({ start: range.start, end: range.end, limit: 1000 });
  const totals = emptyTotals_();
  reports.forEach(function (report) { addReportTotals_(totals, report); });
  const groups = {};
  reports.forEach(function (report) {
    const key = period === "year" ? report.date.slice(0, 7) : report.date;
    if (!groups[key]) groups[key] = emptyTotals_();
    addReportTotals_(groups[key], report);
  });
  return {
    period: period,
    start: range.start,
    end: range.end,
    totals: totals,
    groups: Object.keys(groups).sort().map(function (key) { return { key: key, ...groups[key] }; })
  };
}

function reportToRow_(report) {
  const l1 = number_(report.stats && report.stats.l1);
  const l2 = number_(report.stats && report.stats.l2);
  const l3 = number_(report.stats && report.stats.l3);
  const l4 = number_(report.stats && report.stats.l4);
  const l5 = number_(report.stats && report.stats.l5);
  const asthma = number_(report.stats && report.stats.asthmaBay);
  const oscc = number_(report.stats && report.stats.oscc);
  const red = l1 + l2;
  const yellow = l3;
  const green = l4 + l5 + asthma;
  const newCases = l1 + l2 + l3 + l4 + asthma;
  const repeatCases = l5;
  return [
    clean_(report.id), dateValue_(report.date), clean_(report.shift), clean_(report.filledBy),
    l1, l2, l3, l4, l5, asthma, oscc, red, yellow, green, newCases, repeatCases,
    red + yellow + green, number_(report.stats && report.stats.masukWad),
    number_(report.carry && report.carry.merah), number_(report.carry && report.carry.kuning),
    number_(report.carry && report.carry.observation), number_(report.bid), number_(report.did),
    number_(report.calls && report.calls.mecc), number_(report.calls && report.calls.operator),
    number_(report.calls && report.calls.awam), number_(report.calls && report.calls.palsu),
    totalCalls_(report), clean_(report.carryNotes), clean_(report.caseNotes), clean_(report.callNotes),
    validDate_(report.createdAt) || new Date(), validDate_(report.updatedAt) || new Date()
  ];
}

function rowToReport_(row, children) {
  const id = clean_(row[0]);
  return {
    id: id, date: dateKey_(row[1]), shift: clean_(row[2]), filledBy: clean_(row[3]),
    staff: children.staff[id] || [],
    stats: {
      l1: number_(row[4]), l2: number_(row[5]), l3: number_(row[6]), l4: number_(row[7]), l5: number_(row[8]),
      asthmaBay: number_(row[9]), oscc: number_(row[10]), merah: number_(row[11]), kuning: number_(row[12]),
      hijau: number_(row[13]), kesBaru: number_(row[14]), kesUlangan: number_(row[15]), masukWad: number_(row[17])
    },
    carry: { merah: number_(row[18]), kuning: number_(row[19]), hijau: 0, observation: number_(row[20]) },
    carryNotes: clean_(row[28]), bid: number_(row[21]), did: number_(row[22]), caseNotes: clean_(row[29]),
    ambulances: children.ambulance[id] || [],
    calls: { mecc: number_(row[23]), operator: number_(row[24]), awam: number_(row[25]), palsu: number_(row[26]) },
    callNotes: clean_(row[30]), createdAt: isoDate_(row[31]), updatedAt: isoDate_(row[32])
  };
}

function childMaps_(spreadsheet) {
  return {
    staff: childMap_(spreadsheet.getSheetByName(ETD_CONFIG.STAFF), function (row, index) {
      return { id: clean_(row[0]) + "_staff_" + index, name: clean_(row[3]), category: clean_(row[4]) };
    }),
    ambulance: childMap_(spreadsheet.getSheetByName(ETD_CONFIG.AMBULANCE), function (row, index) {
      return { id: clean_(row[0]) + "_amb_" + index, vehicleNo: clean_(row[3]), destination: clean_(row[4]), driver: clean_(row[5]), timeOut: timeText_(row[6]), timeIn: timeText_(row[7]), unit: clean_(row[8]) };
    })
  };
}

function childMap_(sheet, mapper) {
  const map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  rows.forEach(function (row, index) {
    const id = clean_(row[0]);
    if (!id) return;
    if (!map[id]) map[id] = [];
    map[id].push(mapper(row, index));
  });
  return map;
}

function staffRows_(report, id) {
  return (report.staff || []).filter(function (item) { return clean_(item.name); }).map(function (item) {
    return [id, dateValue_(report.date), clean_(report.shift), clean_(item.name), clean_(item.category)];
  });
}

function carryRows_(report, id) {
  return [[id, dateValue_(report.date), clean_(report.shift), number_(report.carry && report.carry.merah), number_(report.carry && report.carry.kuning), number_(report.carry && report.carry.observation), clean_(report.carryNotes)]];
}

function ambulanceRows_(report, id) {
  return (report.ambulances || []).map(function (item) {
    return [id, dateValue_(report.date), clean_(report.shift), clean_(item.vehicleNo), clean_(item.destination), clean_(item.driver), clean_(item.timeOut), clean_(item.timeIn), clean_(item.unit)];
  });
}

function callRows_(report, id) {
  return [[id, dateValue_(report.date), clean_(report.shift), number_(report.calls && report.calls.mecc), number_(report.calls && report.calls.operator), number_(report.calls && report.calls.awam), number_(report.calls && report.calls.palsu), totalCalls_(report), clean_(report.callNotes)]];
}

function replaceChildRows_(sheet, id, newRows) {
  if (!sheet) throw new Error("Tab data sokongan tidak ditemui.");
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    for (let index = ids.length - 1; index >= 0; index -= 1) {
      if (clean_(ids[index][0]) === id) sheet.deleteRow(index + 2);
    }
  }
  if (newRows.length) {
    const start = sheet.getLastRow() + 1;
    ensureRows_(sheet, start + newRows.length - 1);
    sheet.getRange(start, 1, newRows.length, newRows[0].length).setValues(newRows);
  }
}

function rebuildStaffDirectory_(spreadsheet) {
  const source = spreadsheet.getSheetByName(ETD_CONFIG.STAFF);
  const target = spreadsheet.getSheetByName(ETD_CONFIG.DIRECTORY);
  const entries = {};
  if (source && source.getLastRow() >= 2) {
    source.getRange(2, 1, source.getLastRow() - 1, 5).getValues().forEach(function (row) {
      const name = clean_(row[3]);
      const category = clean_(row[4]);
      if (!name) return;
      const key = category.toLowerCase() + "|" + name.toLowerCase();
      const date = dateKey_(row[1]);
      if (!entries[key]) entries[key] = { name: name, category: category, uses: 0, lastUsed: date };
      entries[key].uses += 1;
      if (date > entries[key].lastUsed) entries[key].lastUsed = date;
    });
  }
  clearBody_(target, 4);
  const rows = Object.keys(entries).map(function (key) {
    const item = entries[key];
    return [item.name, item.category, item.uses, dateValue_(item.lastUsed)];
  }).sort(function (a, b) { return String(a[1] + a[0]).localeCompare(String(b[1] + b[0])); });
  if (rows.length) target.getRange(2, 1, rows.length, 4).setValues(rows);
}

function refreshDailySummary_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(ETD_CONFIG.REPORTS);
  const byDate = {};
  if (sheet && sheet.getLastRow() >= 2) {
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, REPORT_HEADERS.length).getValues();
    rows.forEach(function (row) {
      if (!clean_(row[0])) return;
      const date = dateKey_(row[1]);
      if (!byDate[date]) byDate[date] = emptyDailyTotals_();
      const totals = byDate[date];
      totals.l1 += number_(row[4]); totals.l2 += number_(row[5]); totals.l3 += number_(row[6]);
      totals.l4 += number_(row[7]); totals.l5 += number_(row[8]); totals.asthma += number_(row[9]);
      totals.oscc += number_(row[10]); totals.merah += number_(row[11]); totals.kuning += number_(row[12]);
      totals.hijau += number_(row[13]); totals.kesBaru += number_(row[14]); totals.kesUlangan += number_(row[15]);
      totals.cases += number_(row[16]); totals.ward += number_(row[17]);
    });
  }
  const target = spreadsheet.getSheetByName(ETD_CONFIG.DAILY);
  clearBody_(target, 15);
  const rows = Object.keys(byDate).sort().map(function (date) {
    const value = byDate[date];
    return [dateValue_(date), value.l1, value.l2, value.l3, value.l4, value.l5, value.asthma, value.oscc, value.merah, value.kuning, value.hijau, value.kesBaru, value.kesUlangan, value.cases, value.ward];
  });
  if (rows.length) target.getRange(2, 1, rows.length, 15).setValues(rows);
}

function emptyDailyTotals_() {
  return { l1: 0, l2: 0, l3: 0, l4: 0, l5: 0, asthma: 0, oscc: 0, merah: 0, kuning: 0, hijau: 0, kesBaru: 0, kesUlangan: 0, cases: 0, ward: 0 };
}

function emptyTotals_() {
  return { cases: 0, merah: 0, kuning: 0, hijau: 0, l1: 0, l2: 0, l3: 0, l4: 0, l5: 0, asthma: 0, oscc: 0, kesBaru: 0, kesUlangan: 0, ward: 0, ambulance: 0, calls: 0, bid: 0, did: 0 };
}

function addReportTotals_(totals, report) {
  totals.l1 += number_(report.stats.l1); totals.l2 += number_(report.stats.l2); totals.l3 += number_(report.stats.l3);
  totals.l4 += number_(report.stats.l4); totals.l5 += number_(report.stats.l5); totals.asthma += number_(report.stats.asthmaBay);
  totals.oscc += number_(report.stats.oscc); totals.merah += number_(report.stats.merah); totals.kuning += number_(report.stats.kuning);
  totals.hijau += number_(report.stats.hijau); totals.kesBaru += number_(report.stats.kesBaru); totals.kesUlangan += number_(report.stats.kesUlangan);
  totals.cases += number_(report.stats.merah) + number_(report.stats.kuning) + number_(report.stats.hijau);
  totals.ward += number_(report.stats.masukWad); totals.ambulance += (report.ambulances || []).length;
  totals.calls += totalCalls_(report); totals.bid += number_(report.bid); totals.did += number_(report.did);
}

function validateReport_(report) {
  if (!report || typeof report !== "object") throw new Error("Laporan tidak sah.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean_(report.date))) throw new Error("Tarikh laporan tidak sah.");
  if (!["Pagi", "Petang", "Malam"].includes(clean_(report.shift))) throw new Error("Syif tidak sah.");
  if (!clean_(report.filledBy)) throw new Error("Nama pengisi diperlukan.");
}

function periodRange_(period, anchor) {
  const date = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  let start;
  let end;
  if (period === "day") {
    start = date;
    end = date;
  } else if (period === "week") {
    const day = (date.getDay() + 6) % 7;
    start = new Date(date); start.setDate(date.getDate() - day);
    end = new Date(start); end.setDate(start.getDate() + 6);
  } else if (period === "year") {
    start = new Date(date.getFullYear(), 0, 1);
    end = new Date(date.getFullYear(), 11, 31);
  } else {
    start = new Date(date.getFullYear(), date.getMonth(), 1);
    end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }
  return { start: localDateKey_(start), end: localDateKey_(end) };
}

function getSpreadsheet_() { return SpreadsheetApp.openById(ETD_CONFIG.SPREADSHEET_ID); }
function requireSheet_(spreadsheet, name, headers) { const sheet = spreadsheet.getSheetByName(name); if (!sheet) throw new Error("Tab " + name + " tidak ditemui."); assertHeaders_(sheet, headers); return sheet; }
function assertHeaders_(sheet, headers) { const found = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0]; if (found.join("|") !== headers.join("|")) throw new Error("Susunan kolum " + sheet.getName() + " telah berubah."); }
function findRowById_(sheet, id) { if (!sheet || sheet.getLastRow() < 2) return 0; const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues(); for (let i = 0; i < values.length; i += 1) if (clean_(values[i][0]) === id) return i + 2; return 0; }
function appendRow_(sheet, row) { const target = sheet.getLastRow() + 1; ensureRows_(sheet, target); sheet.getRange(target, 1, 1, row.length).setValues([row]); }
function ensureRows_(sheet, target) { if (target > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), target - sheet.getMaxRows()); }
function clearBody_(sheet, columns) { if (!sheet) return; const rows = sheet.getLastRow() - 1; if (rows > 0) sheet.getRange(2, 1, rows, columns).clearContent(); }
function shiftOrder_(shift) { return clean_(shift) === "Pagi" ? "1" : clean_(shift) === "Petang" ? "2" : "3"; }
function number_(value) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(0, parsed) : 0; }
function clean_(value) { return String(value === null || value === undefined ? "" : value).trim(); }
function totalCalls_(report) { const calls = report.calls || {}; return number_(calls.mecc) + number_(calls.operator) + number_(calls.awam) + number_(calls.palsu); }
function validDate_(value) { const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function dateValue_(key) { const match = clean_(key).match(/^(\d{4})-(\d{2})-(\d{2})$/); return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0) : validDate_(key) || ""; }
function parseDateKey_(key) { const value = dateValue_(key); return value instanceof Date ? value : null; }
function localDateKey_(date) { return Utilities.formatDate(date, "Asia/Kuala_Lumpur", "yyyy-MM-dd"); }
function dateKey_(value) { const date = validDate_(value); return date ? localDateKey_(date) : clean_(value).slice(0, 10); }
function isoDate_(value) { const date = validDate_(value); return date ? date.toISOString() : clean_(value); }
function timeText_(value) { if (value instanceof Date && !Number.isNaN(value.getTime())) return Utilities.formatDate(value, "Asia/Kuala_Lumpur", "HH:mm"); return clean_(value); }

function response_(parameters, payload) {
  if (clean_(parameters.transport) === "iframe") return iframeResponse_(clean_(parameters.requestId), payload);
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function iframeResponse_(requestId, payload) {
  if (!/^[0-9A-Za-z-]{1,100}$/.test(requestId)) throw new Error("Request ID tidak sah.");
  const message = JSON.stringify({ channel: "etd-report-sheet", requestId: requestId, payload: payload })
    .replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return HtmlService.createHtmlOutput("<!doctype html><meta charset=\"utf-8\"><script>window.top.postMessage(" + message + ",\"*\");<\/script>")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
