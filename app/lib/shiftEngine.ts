import '../shared/operationalShift.js';
import type { Shift } from './types';
type OperationalShift = { operationalDate:string; shift:'pagi'|'petang'|'malam'; calendarDate:string; timeZone:string };
export const shiftEngine = (globalThis as unknown as { OperationalShiftEngine: { version:number; getOperationalShift(value?: Date|string):OperationalShift; fromLocal(date:string,time:string):OperationalShift; nextBoundary(value?:Date):Date } }).OperationalShiftEngine;
export const shiftLabel = (value:OperationalShift['shift']):Shift => ({pagi:'Pagi',petang:'Petang',malam:'Malam'} as const)[value];
