export type Shift = "Pagi" | "Petang" | "Malam";

export type StatKey =
  | "merah" | "kuning" | "hijau"
  | "l1" | "l2" | "l3" | "l4" | "l5"
  | "asthmaBay" | "oscc" | "kesBaru" | "kesUlangan" | "masukWad";

export type StaffMember = { id: string; name: string; category: string };

export type VehicleMovement = {
  id: string;
  vehicleNo: string;
  destination: string;
  /** Legacy field retained so old records can be re-saved without data loss. */
  driver?: string;
  drivers: string[];
  timeOut: string;
  timeIn: string;
  unit: string;
};

export type Report = {
  id: string;
  date: string;
  shift: Shift;
  filledBy: string;
  staff: StaffMember[];
  stats: Record<StatKey, number>;
  carry: { merah: number; kuning: number; hijau: number; observation: number };
  carryNotes: string;
  bid: number;
  did: number;
  caseNotes: string;
  ambulances: VehicleMovement[];
  calls: { mecc: number; operator: number; awam: number; palsu: number };
  callNotes: string;
  createdAt: string;
  updatedAt: string;
};

export function normalizeReport(report: Report): Report {
  return {
    ...report,
    staff: Array.isArray(report.staff) ? report.staff : [],
    ambulances: (Array.isArray(report.ambulances) ? report.ambulances : []).map((movement) => {
      const drivers = Array.isArray(movement.drivers)
        ? movement.drivers.map((name) => String(name || "").trim()).filter(Boolean)
        : [];
      const legacyDriver = String(movement.driver || "").trim();
      const normalizedDrivers = drivers.length ? drivers : legacyDriver ? [legacyDriver] : [""];
      return {
        ...movement,
        driver: legacyDriver || normalizedDrivers[0] || "",
        drivers: normalizedDrivers,
      };
    }),
  };
}

export const emptyReport = (date: string, shift: Shift): Report => {
  const now = new Date().toISOString();
  return {
    id: `${date}_${shift}`,
    date,
    shift,
    filledBy: "",
    staff: [],
    stats: {
      merah: 0, kuning: 0, hijau: 0,
      l1: 0, l2: 0, l3: 0, l4: 0, l5: 0,
      asthmaBay: 0, oscc: 0, kesBaru: 0, kesUlangan: 0, masukWad: 0,
    },
    carry: { merah: 0, kuning: 0, hijau: 0, observation: 0 },
    carryNotes: "",
    bid: 0,
    did: 0,
    caseNotes: "",
    ambulances: [],
    calls: { mecc: 0, operator: 0, awam: 0, palsu: 0 },
    callNotes: "",
    createdAt: now,
    updatedAt: now,
  };
};
