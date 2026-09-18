import type { Report } from "./types";

export const ETD_TIME_ZONE = "Asia/Kuala_Lumpur";
export const OPERATIONAL_DAY_START_HOUR = 7;

const dateParts = (value: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ETD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, hour: Number(part("hour")) };
};

export function previousDateISO(date: string) {
  const value = new Date(`${date}T12:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toLocaleDateString("en-CA", { timeZone: ETD_TIME_ZONE });
}

export function nextDateISO(date: string) {
  const value = new Date(`${date}T12:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toLocaleDateString("en-CA", { timeZone: ETD_TIME_ZONE });
}

export function operationalDateFromTimestamp(timestamp: string | Date) {
  const value = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(value.getTime())) return "";
  const parts = dateParts(value);
  return parts.hour < OPERATIONAL_DAY_START_HOUR ? previousDateISO(parts.date) : parts.date;
}

/**
 * `date` is already the operational date in current records. Older records that
 * used the calendar date for a Malam entry before 07:00 are corrected locally.
 */
export function operationalDateForReport(report: Report) {
  const recordedDate = String(report.date || "").slice(0, 10);
  if (report.shift !== "Malam") return recordedDate || operationalDateFromTimestamp(report.createdAt);
  const timestamp = report.createdAt || report.updatedAt;
  const timestampParts = timestamp ? dateParts(new Date(timestamp)) : null;
  if (timestampParts && timestampParts.hour < OPERATIONAL_DAY_START_HOUR && timestampParts.date === recordedDate) {
    return previousDateISO(recordedDate);
  }
  return recordedDate || operationalDateFromTimestamp(timestamp);
}
