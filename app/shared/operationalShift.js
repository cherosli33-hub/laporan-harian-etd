/* Shared AMO shift contract v1. Identical source in both independently deployed apps.
 * Wire values stay lowercase for compatibility with existing Firestore records/rules.
 */
(function (root) {
  const timeZone = 'Asia/Kuala_Lumpur';
  function dateKey(date) { return date.toISOString().slice(0, 10); }
  function shiftDate(date, days) { const value = new Date(date + 'T00:00:00Z'); value.setUTCDate(value.getUTCDate() + days); return dateKey(value); }
  function getOperationalShift(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('Tarikh / masa panggilan tidak sah.');
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(date);
    const part = key => parts.find(p => p.type === key).value;
    const calendarDate = `${part('year')}-${part('month')}-${part('day')}`;
    const minutes = +part('hour') * 60 + +part('minute');
    const shift = minutes >= 420 && minutes < 840 ? 'pagi' : minutes >= 840 && minutes < 1260 ? 'petang' : 'malam';
    return { operationalDate: minutes < 420 ? shiftDate(calendarDate,-1) : calendarDate, shift, calendarDate, timeZone };
  }
  function fromLocal(date, time) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time || '')) throw new Error('Tarikh / masa panggilan tidak sah.');
    const result = getOperationalShift(`${date}T${time}+08:00`);
    if (result.calendarDate !== date) throw new Error('Tarikh panggilan tidak sah.');
    return result;
  }
  function nextBoundary(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value), current = getOperationalShift(date);
    for (const hour of [7,14,21]) { const candidate = new Date(`${current.calendarDate}T${String(hour).padStart(2,'0')}:00:00+08:00`); if (candidate > date) return candidate; }
    return new Date(`${shiftDate(current.calendarDate,1)}T07:00:00+08:00`);
  }
  root.OperationalShiftEngine = Object.freeze({ version:1, timeZone, getOperationalShift, fromLocal, nextBoundary, shiftDate });
})(globalThis);
