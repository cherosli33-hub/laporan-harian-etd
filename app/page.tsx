"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Report, Shift, StatKey, emptyReport } from "./lib/types";
import { localReportRepository } from "./lib/localReportRepository";
import { RemoteStats, StaffSuggestion, StatsPeriod, reportRepository } from "./lib/reportRepository";

type View = "dashboard" | "form" | "records" | "stats";
const shifts: Shift[] = ["Pagi", "Petang", "Malam"];
const steps = ["Maklumat asas", "Kakitangan", "Statistik kes", "Carry forward", "Laporan kes", "Ambulans", "Panggilan", "Semakan"];
const labels: Record<StatKey, string> = { merah: "Merah", kuning: "Kuning", hijau: "Hijau", l1: "L1", l2: "L2", l3: "L3", l4: "L4", l5: "L5", asthmaBay: "Asthma Bay", oscc: "OSCC", kesBaru: "Kes Baru", kesUlangan: "Kes Ulangan", masukWad: "Masuk Wad" };
const staffCategories = ["Pegawai Perubatan", "PPP", "Nurse/Jururawat", "PPK", "Pemandu Ambulans"];
const shiftTimes: Record<Shift, string> = { Pagi: "7:00 pagi – 2:00 petang", Petang: "2:00 petang – 9:00 malam", Malam: "9:00 malam – 7:30 pagi" };
const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
const malaysiaMinutes = () => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  return Number(parts.find((part) => part.type === "hour")?.value || 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value || 0);
};
const previousDateISO = (date: string) => {
  const value = new Date(`${date}T12:00:00+08:00`);
  value.setDate(value.getDate() - 1);
  return value.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
};
const operationalDateISO = () => malaysiaMinutes() < 7 * 60 + 30 ? previousDateISO(todayISO()) : todayISO();
const reportingDateForShift = (shift: Shift) => shift === "Malam" && malaysiaMinutes() < 7 * 60 + 30 ? previousDateISO(todayISO()) : todayISO();
const currentShift = (): Shift => {
  const minutes = malaysiaMinutes();
  if (minutes >= 7 * 60 && minutes < 14 * 60) return "Pagi";
  if (minutes >= 14 * 60 && minutes < 21 * 60) return "Petang";
  return "Malam";
};
const formatDate = (date: string, short = false) => new Intl.DateTimeFormat("ms-MY", { day: "numeric", month: short ? "short" : "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(`${date}T12:00:00`));
const derived = (r: Report) => ({
  merah: r.stats.l1 + r.stats.l2,
  kuning: r.stats.l3,
  hijau: r.stats.l4 + r.stats.l5 + r.stats.asthmaBay,
  kesBaru: r.stats.l1 + r.stats.l2 + r.stats.l3 + r.stats.l4 + r.stats.asthmaBay,
  kesUlangan: r.stats.l5,
});
const totalCases = (r: Report) => {
  const zone = derived(r);
  return zone.merah + zone.kuning + zone.hijau;
};
const withDerived = (r: Report): Report => {
  const calculated = derived(r);
  return { ...r, stats: { ...r.stats, ...calculated } };
};
const totalCalls = (r: Report) => Object.values(r.calls).reduce((a, b) => a + b, 0);
const blankStaff = (category = "Pegawai Perubatan") => ({ id: crypto.randomUUID(), name: "", category });
const blankAmbulance = () => ({ id: crypto.randomUUID(), vehicleNo: "", destination: "", driver: "", timeOut: "", timeIn: "", unit: "" });
const upsertReport = (list: Report[], report: Report) => {
  const index = list.findIndex((item) => item.id === report.id);
  if (index < 0) return [...list, report];
  const next = list.slice();
  next[index] = report;
  return next;
};
const inPeriod = (date: string, period: StatsPeriod, anchor: string) => {
  if (period === "day") return date === anchor;
  if (period === "year") return date.slice(0, 4) === anchor.slice(0, 4);
  if (period === "week") {
    const anchorDate = new Date(`${anchor}T12:00:00`);
    const day = (anchorDate.getDay() + 6) % 7;
    const start = new Date(anchorDate);
    start.setDate(anchorDate.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const startKey = start.toLocaleDateString("en-CA");
    const endKey = end.toLocaleDateString("en-CA");
    return date >= startKey && date <= endKey;
  }
  return date.slice(0, 7) === anchor.slice(0, 7);
};

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [reports, setReports] = useState<Report[]>([]);
  const [drafts, setDrafts] = useState<Report[]>([]);
  const [draft, setDraft] = useState<Report>(() => emptyReport(todayISO(), "Pagi"));
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterShift, setFilterShift] = useState<Shift | "Semua">("Semua");
  const [recordResults, setRecordResults] = useState<Report[]>([]);
  const [staffSuggestions, setStaffSuggestions] = useState<StaffSuggestion[]>([]);
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>("month");
  const [statsAnchor, setStatsAnchor] = useState(todayISO());
  const [remoteStats, setRemoteStats] = useState<RemoteStats | null>(null);
  const [syncState, setSyncState] = useState<"loading" | "online" | "offline">("loading");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [previewOnly, setPreviewOnly] = useState(false);

  useEffect(() => {
    setDrafts(localReportRepository.getDrafts());
    setReady(true);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    Promise.all([reportRepository.getAll(), reportRepository.getStaff()])
      .then(([serverReports, names]) => {
        setReports(serverReports);
        setRecordResults(serverReports);
        setStaffSuggestions(names);
        setSyncState("online");
      })
      .catch(() => {
        const cached = reportRepository.cachedReports();
        setReports(cached);
        setRecordResults(cached);
        setSyncState("offline");
      });
  }, []);

  useEffect(() => {
    if (!ready || view !== "form" || previewOnly) return;
    const timer = window.setTimeout(() => {
      localReportRepository.saveDraft(withDerived({ ...draft, id: `${draft.date}_${draft.shift}` }));
      setDrafts(localReportRepository.getDrafts());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, previewOnly, ready, view]);

  useEffect(() => {
    if (view !== "stats") return;
    setBusy(true);
    reportRepository.getStats(statsPeriod, statsAnchor)
      .then((stats) => { setRemoteStats(stats); setSyncState("online"); })
      .catch(() => setSyncState("offline"))
      .finally(() => setBusy(false));
  }, [statsAnchor, statsPeriod, view]);

  const filledByOptions = useMemo(() => Array.from(new Set(reports.map((r) => r.filledBy).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ms")), [reports]);
  const today = operationalDateISO();
  const todaysReports = useMemo(() => reports.filter((r) => r.date === today), [reports, today]);
  const filtered = useMemo(() => recordResults.slice().sort((a, b) => `${b.date}${b.shift}`.localeCompare(`${a.date}${a.shift}`)), [recordResults]);
  const statReports = useMemo(() => reports.filter((r) => inPeriod(r.date, statsPeriod, statsAnchor)), [reports, statsPeriod, statsAnchor]);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const persist = async (report: Report) => {
    setBusy(true);
    try {
      const saved = await reportRepository.save(withDerived({ ...report, updatedAt: new Date().toISOString() }));
      localReportRepository.removeDraft(report.id);
      setReports((prev) => upsertReport(prev, saved.report));
      setRecordResults((prev) => upsertReport(prev, saved.report));
      setDrafts(localReportRepository.getDrafts());
      setSyncState("online");
      notify(saved.created ? "Laporan baharu disimpan ke Google Sheet" : "Laporan berjaya dikemas kini");
      setView("dashboard");
      setStep(0);
      reportRepository.getStaff().then(setStaffSuggestions).catch(() => undefined);
    } catch (error) {
      setSyncState("offline");
      notify(error instanceof Error ? error.message : "Laporan tidak dapat disimpan.");
    } finally {
      setBusy(false);
    }
  };
  const startReport = (shift: Shift, date = reportingDateForShift(shift)) => {
    const existing = reports.find((r) => r.id === `${date}_${shift}`);
    const remembered = localReportRepository.getDraft(`${date}_${shift}`);
    setPreviewOnly(false);
    setDraft(remembered ? structuredClone(remembered) : existing ? structuredClone(existing) : emptyReport(date, shift));
    setStep(0);
    setView("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const leaveForm = (nextView: View = "dashboard") => {
    if (view === "form" && !previewOnly) {
      localReportRepository.saveDraft(withDerived({ ...draft, id: `${draft.date}_${draft.shift}` }));
      setDrafts(localReportRepository.getDrafts());
    }
    if (previewOnly) setPreviewOnly(false);
    setView(nextView);
  };
  const updateDraft = (patch: Partial<Report>) => setDraft((d) => ({ ...d, ...patch }));
  const updateStat = (key: StatKey, value: number) => setDraft((d) => ({ ...d, stats: { ...d.stats, [key]: Math.max(0, value || 0) } }));
  const updateCarry = (key: keyof Report["carry"], value: number) => setDraft((d) => ({ ...d, carry: { ...d.carry, [key]: Math.max(0, value || 0) } }));
  const updateCall = (key: keyof Report["calls"], value: number) => setDraft((d) => ({ ...d, calls: { ...d.calls, [key]: Math.max(0, value || 0) } }));
  const submit = (event: FormEvent) => { event.preventDefault(); if (!draft.filledBy.trim()) return notify("Sila isi nama pengisi dahulu"); void persist({ ...draft, id: `${draft.date}_${draft.shift}` }); };
  const remove = async (report: Report) => {
    if (!window.confirm(`Padam laporan ${report.shift}, ${formatDate(report.date)}?`)) return;
    setBusy(true);
    try {
      await reportRepository.remove(report.id);
      setReports((prev) => prev.filter((item) => item.id !== report.id));
      setRecordResults((prev) => prev.filter((item) => item.id !== report.id));
      setSyncState("online");
      notify("Laporan dipadam daripada Google Sheet");
    } catch (error) {
      setSyncState("offline");
      notify(error instanceof Error ? error.message : "Laporan tidak dapat dipadam.");
    } finally {
      setBusy(false);
    }
  };
  const searchRecords = async () => {
    setBusy(true);
    try {
      const found = await reportRepository.getAll({ date: filterDate, shift: filterShift === "Semua" ? "" : filterShift });
      setRecordResults(found);
      setSyncState("online");
      notify(`${found.length} rekod ditemui`);
    } catch (error) {
      setSyncState("offline");
      notify(error instanceof Error ? error.message : "Carian Google Sheet gagal.");
    } finally {
      setBusy(false);
    }
  };
  const printReport = (report: Report) => { setPreviewOnly(true); setDraft(structuredClone(report)); setStep(7); setView("form"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const dayTotals = summarize(todaysReports);
  const periodTotals = remoteStats?.totals || summarize(statReports);

  return (
    <main className="app-shell">
      <header className="topbar no-print">
        <div className="brand"><img className="brand-logo" src="/etd-logo.jpg" alt="Logo Jabatan Kecemasan dan Trauma Hospital Kuala Lipis" /><div><p className="eyebrow">E.T.D HOSPITAL KUALA LIPIS</p><h1>Laporan Harian ETD</h1></div></div>
        <span className={`sync-badge ${syncState}`}><i />{syncState === "online" ? "Google Sheet aktif" : syncState === "loading" ? "Menyambung…" : "Draf luar talian"}</span>
      </header>
      {!ready ? <div className="loading">Menyiapkan ruang laporan…</div> : null}

      {ready && view === "dashboard" && <div className="page page-dashboard">
        <section className="hero"><div><p className="eyebrow">HARI OPERASI ETD</p><h2>{formatDate(today)}</h2><p className="muted">Syif Malam kekal pada tarikh mula syif sehingga 7:30 pagi.</p></div><button className="primary desktop-action" onClick={() => startReport(currentShift())}>+ Isi laporan</button></section>
        <section className="shift-grid">
          {shifts.map((shift, index) => {
            const report = todaysReports.find((r) => r.shift === shift);
            const remembered = drafts.find((r) => r.id === `${today}_${shift}`);
            const entry = report || remembered;
            const zone = entry ? derived(entry) : null;
            return <article className={`shift-card shift-${index}`} key={shift}>
              <div className="shift-card-top"><span className="shift-icon">{index === 0 ? "☀" : index === 1 ? "◐" : "☾"}</span><span className={`status ${report ? "complete" : remembered ? "draft" : ""}`}>{report ? "Sudah diisi" : remembered ? "Draf disimpan" : "Belum diisi"}</span></div>
              <h3>Syif {shift}</h3><p className="shift-time">{shiftTimes[shift]}</p><p className="case-total"><strong>{entry ? totalCases(entry) : "—"}</strong> <span>jumlah kes</span></p>
              <div className="shift-zone-row" aria-label={`Pecahan zon syif ${shift}`}>
                <span><i className="dot-red" />Merah <b>{zone?.merah ?? "—"}</b></span>
                <span><i className="dot-yellow" />Kuning <b>{zone?.kuning ?? "—"}</b></span>
                <span><i className="dot-green" />Hijau <b>{zone?.hijau ?? "—"}</b></span>
              </div>
              <div className="shift-carry-row">
                <small>Carry Forward</small>
                <span>Merah <b>{entry?.carry.merah ?? "—"}</b></span>
                <span>Kuning <b>{entry?.carry.kuning ?? "—"}</b></span>
                <span>Obs. Ward <b>{entry?.carry.observation ?? "—"}</b></span>
              </div>
              {report ? <p className="updated">Dikemas kini {new Date(report.updatedAt).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })}</p> : remembered ? <p className="updated">Boleh sambung tanpa isi semula</p> : <p className="updated">Tiada laporan lagi</p>}
              <button className={report ? "secondary" : "primary"} onClick={() => startReport(shift, today)}>{report ? "Lihat & kemas kini" : remembered ? "Sambung draf" : "Mula laporan"} <span>→</span></button>
            </article>;
          })}
        </section>
        <section className="section-block"><div className="section-heading"><div><p className="eyebrow">GAMBARAN HARIAN</p><h2>Jumlah setakat ini</h2></div><span>{todaysReports.length}/3 syif dilaporkan</span></div>
          <div className="zone-summary">
            <div className="zone-summary-head"><span>Syif</span><span>Zon Merah</span><span>Zon Kuning</span><span>Zon Hijau</span><span>Jumlah</span><span>OSCC</span></div>
            {shifts.map((shift) => {
              const report = todaysReports.find((r) => r.shift === shift);
              const remembered = drafts.find((r) => r.id === `${today}_${shift}`);
              const entry = report || remembered;
              const zone = entry ? derived(entry) : null;
              return <div className="zone-summary-row" key={shift}><strong>{shift}{!report && remembered ? <small>Draf</small> : null}</strong><span className="zone-red">{zone?.merah ?? "—"}</span><span className="zone-yellow">{zone?.kuning ?? "—"}</span><span className="zone-green">{zone?.hijau ?? "—"}</span><b>{entry ? totalCases(entry) : "—"}</b><span>{entry ? entry.stats.oscc : "—"}</span></div>;
            })}
          </div>
          <div className="metric-grid dashboard-metrics"><Metric label="Jumlah kes" value={dayTotals.cases} accent="emerald" icon="✚" /><Metric label="Kes merah" value={dayTotals.merah} accent="red" icon="●" /><Metric label="Kes kuning" value={dayTotals.kuning} accent="yellow" icon="●" /><Metric label="Kes hijau" value={dayTotals.hijau} accent="green" icon="●" /><Metric label="Asthma Bay" value={dayTotals.asthma} accent="purple" icon="◌" /><Metric label="OSCC" value={dayTotals.oscc} accent="pink" icon="◇" /><Metric label="Masuk wad" value={dayTotals.ward} accent="blue" icon="▣" /><Metric label="Ambulans" value={dayTotals.ambulance} accent="orange" icon="➜" /></div>
        </section>
        <section className="quick-strip"><div><span>Jumlah panggilan kecemasan</span><strong>{dayTotals.calls}</strong></div><div><span>BID / DID</span><strong>{dayTotals.bid} / {dayTotals.did}</strong></div><button onClick={() => setView("stats")}>Lihat statistik <span>→</span></button></section>
      </div>}

      {ready && view === "form" && <form className="page form-page" onSubmit={submit}>
        <div className="form-heading no-print"><button type="button" className="back-btn" onClick={() => previewOnly ? leaveForm("records") : leaveForm("dashboard")}>←</button><div><p className="eyebrow">{previewOnly ? "PRATONTON CETAKAN" : reports.some((r) => r.id === draft.id) ? "KEMAS KINI LAPORAN" : "DRAF DISIMPAN AUTOMATIK"}</p><h2>{draft.shift} · {formatDate(draft.date, true)}</h2><small className="form-shift-time">{shiftTimes[draft.shift]}</small></div><span className="step-number">{previewOnly ? "Pratonton A4" : `${step + 1}/${steps.length}`}</span></div>
        {!previewOnly ? <div className="stepper no-print">{steps.map((label, i) => <button type="button" key={label} className={i === step ? "active" : i < step ? "done" : ""} onClick={() => setStep(i)} aria-label={`Langkah ${i + 1}: ${label}`}><span>{i < step ? "✓" : i + 1}</span><small>{label}</small></button>)}</div> : null}
        <section className="form-card">
          {step === 0 && <Step title="Maklumat asas" subtitle="Pilih tarikh, syif dan masukkan nama orang yang mengisi laporan."><div className="field-grid">
            <Field label="Tarikh laporan"><input type="date" value={draft.date} onChange={(e) => updateDraft({ date: e.target.value, id: `${e.target.value}_${draft.shift}` })} required /></Field>
            <Field label="Syif"><div className="segmented">{shifts.map((s) => <button type="button" key={s} className={draft.shift === s ? "selected" : ""} onClick={() => updateDraft({ shift: s, id: `${draft.date}_${s}` })}>{s}</button>)}</div></Field>
            <Field label="Nama pengisi" hint="Wajib diisi"><input list="filled-by-suggestions" value={draft.filledBy} onChange={(e) => updateDraft({ filledBy: e.target.value })} placeholder="Contoh: Rosli" autoComplete="off" required /><datalist id="filled-by-suggestions">{filledByOptions.map((name) => <option key={name} value={name} />)}</datalist></Field>
          </div></Step>}
          {step === 1 && <Step title="Kakitangan bertugas" subtitle="Isi mengikut kategori. Nama yang pernah direkod akan muncul sebagai cadangan."><div className="staff-category-list">
            {staffCategories.map((category) => {
              const people = draft.staff.filter((person) => person.category === category);
              const options = staffSuggestions.filter((item) => item.category === category);
              const listId = `staff-${category.replace(/\W/g, "-")}`;
              return <section className="staff-category-card" key={category}>
                <div className="staff-category-title"><div><span>{staffCategories.indexOf(category) + 1}</span><h3>{category}</h3></div><button type="button" onClick={() => setDraft((d) => ({ ...d, staff: [...d.staff, blankStaff(category)] }))}>+ Tambah nama</button></div>
                <datalist id={listId}>{options.map((item) => <option key={`${category}-${item.name}`} value={item.name}>{item.uses} kali digunakan</option>)}</datalist>
                {people.length ? <div className="staff-name-list">{people.map((person, i) => <div className="staff-name-row" key={person.id}><span>{i + 1}</span><input list={listId} aria-label={`Nama ${category} ${i + 1}`} value={person.name} onChange={(e) => setDraft((d) => ({ ...d, staff: d.staff.map((p) => p.id === person.id ? { ...p, name: e.target.value } : p) }))} placeholder={`Nama ${category}`} autoComplete="off" /><button type="button" className="icon-btn danger" onClick={() => setDraft((d) => ({ ...d, staff: d.staff.filter((p) => p.id !== person.id) }))} aria-label={`Padam ${person.name || category}`}>×</button></div>)}</div> : <p className="empty-category">Belum ada nama. Tekan “Tambah nama”.</p>}
              </section>;
            })}
          </div></Step>}
          {step === 2 && <Step title="Statistik kes" subtitle="Isi level kes dahulu. Zon dan kategori akan dikira secara automatik.">
            <div className="counter-group"><h3>Level kes</h3><div className="counter-grid">{(["l1", "l2", "l3", "l4", "l5"] as const).map((key) => <Counter key={key} label={labels[key]} value={draft.stats[key]} onChange={(v) => updateStat(key, v)} tone={key} />)}</div></div>
            <div className="counter-group"><h3>Kategori tambahan</h3><div className="counter-grid"><Counter label="Asthma Bay" value={draft.stats.asthmaBay} onChange={(v) => updateStat("asthmaBay", v)} tone="asthmaBay" /><Counter label="OSCC" value={draft.stats.oscc} onChange={(v) => updateStat("oscc", v)} tone="oscc" /><Counter label="Masuk Wad" value={draft.stats.masukWad} onChange={(v) => updateStat("masukWad", v)} tone="masukWad" /></div><p className="formula-note">OSCC dan Masuk Wad direkod berasingan dan tidak menambah jumlah pesakit syif.</p></div>
            <div className="auto-zone-grid"><AutoValue label="Zon Merah" formula="L1 + L2" value={derived(draft).merah} tone="red" /><AutoValue label="Zon Kuning" formula="L3" value={derived(draft).kuning} tone="yellow" /><AutoValue label="Zon Hijau" formula="L4 + L5 + Asthma Bay" value={derived(draft).hijau} tone="green" /></div>
            <div className="auto-category"><div><span>Kes Baru</span><strong>{derived(draft).kesBaru}</strong><small>L1–L4 + Asthma Bay</small></div><div><span>Kes Ulangan</span><strong>{derived(draft).kesUlangan}</strong><small>L5</small></div></div>
            <div className="total-band"><span>Jumlah pesakit syif</span><strong>{totalCases(draft)}</strong></div>
          </Step>}
          {step === 3 && <Step title="Carry forward" subtitle="Masukkan secara manual selepas staf mengira baki pesakit di zon."><p className="formula-note carry-note">Carry Forward tidak dikira automatik. Hanya Zon Merah, Zon Kuning dan Observation Ward diperlukan.</p><div className="counter-grid carry-grid">{(["merah", "kuning", "observation"] as const).map((key) => <Counter key={key} label={key === "observation" ? "Observation Ward" : `Zon ${key[0].toUpperCase() + key.slice(1)}`} value={draft.carry[key]} onChange={(v) => updateCarry(key, v)} tone={key} />)}</div><Field label="Catatan carry forward" hint="Pilihan"><textarea value={draft.carryNotes} onChange={(e) => updateDraft({ carryNotes: e.target.value })} placeholder="Maklumat tambahan untuk syif seterusnya…" rows={4} /></Field></Step>}
          {step === 4 && <Step title="Laporan kes" subtitle="Rekodkan BID, DID dan sebarang kejadian atau catatan penting."><div className="counter-grid two"><Counter label="BID" value={draft.bid} onChange={(v) => updateDraft({ bid: v })} tone="bid" /><Counter label="DID" value={draft.did} onChange={(v) => updateDraft({ did: v })} tone="did" /></div><Field label="Catatan laporan" hint="Pilihan"><textarea value={draft.caseNotes} onChange={(e) => updateDraft({ caseNotes: e.target.value })} placeholder="Catat kejadian penting dalam syif ini…" rows={6} /></Field></Step>}
          {step === 5 && <Step title="Pergerakan ambulans" subtitle="Tambah satu rekod bagi setiap perjalanan ambulans."><div className="ambulance-list">
            {draft.ambulances.map((item, i) => <article className="ambulance-card" key={item.id}><div className="repeat-title"><h3>Perjalanan {i + 1}</h3><button type="button" className="text-danger" onClick={() => setDraft((d) => ({ ...d, ambulances: d.ambulances.filter((a) => a.id !== item.id) }))}>Padam</button></div><div className="field-grid compact">
              {([["vehicleNo", "No. ambulans", "WQB 1234"], ["destination", "Destinasi", "Hospital Temerloh"], ["driver", "Pemandu", "Nama pemandu"], ["unit", "Unit / jabatan", "ETD"]] as const).map(([key, label, placeholder]) => <Field label={label} key={key}><input value={item[key]} placeholder={placeholder} onChange={(e) => setDraft((d) => ({ ...d, ambulances: d.ambulances.map((a) => a.id === item.id ? { ...a, [key]: e.target.value } : a) }))} /></Field>)}
              <Field label="Masa keluar"><input type="time" value={item.timeOut} onChange={(e) => setDraft((d) => ({ ...d, ambulances: d.ambulances.map((a) => a.id === item.id ? { ...a, timeOut: e.target.value } : a) }))} /></Field><Field label="Masa balik"><input type="time" value={item.timeIn} onChange={(e) => setDraft((d) => ({ ...d, ambulances: d.ambulances.map((a) => a.id === item.id ? { ...a, timeIn: e.target.value } : a) }))} /></Field>
            </div></article>)}
          </div><button type="button" className="add-btn" onClick={() => setDraft((d) => ({ ...d, ambulances: [...d.ambulances, blankAmbulance()] }))}>+ Tambah perjalanan ambulans</button></Step>}
          {step === 6 && <Step title="Panggilan kecemasan" subtitle="Catat bilangan panggilan yang diterima mengikut sumber."><div className="counter-grid">{(["mecc", "operator", "awam", "palsu"] as const).map((key) => <Counter key={key} label={key === "mecc" ? "MECC / Call Centre" : key[0].toUpperCase() + key.slice(1)} value={draft.calls[key]} onChange={(v) => updateCall(key, v)} tone={key} />)}</div><div className="total-band"><span>Jumlah panggilan</span><strong>{totalCalls(draft)}</strong></div><Field label="Catatan panggilan" hint="Pilihan"><textarea rows={4} value={draft.callNotes} onChange={(e) => updateDraft({ callNotes: e.target.value })} placeholder="Maklumat tambahan…" /></Field></Step>}
          {step === 7 && <Step title={previewOnly ? "Pratonton cetakan" : "Semakan akhir"} subtitle={previewOnly ? "Semak susunan laporan A4 sebelum membuka pilihan cetak telefon." : "Semak semua maklumat sebelum menyimpan laporan ke Google Sheet."}><ReportPreview report={draft} /><div className="review-actions no-print">{previewOnly ? <><button type="button" className="secondary" onClick={() => leaveForm("records")}>← Kembali ke Rekod</button><button type="button" className="primary" onClick={() => window.print()}>⎙ Cetak Laporan</button></> : <><button type="button" className="secondary" onClick={() => window.print()}>⎙ Cetak A4</button><button type="submit" className="primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan ke Google Sheet"}</button></>}</div></Step>}
        </section>
        {!previewOnly ? <div className="form-nav no-print"><button type="button" className="secondary" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>← Sebelum</button>{step < 7 ? <button type="button" className="primary" onClick={() => setStep((s) => Math.min(7, s + 1))}>Seterusnya →</button> : null}</div> : null}
      </form>}

      {ready && view === "records" && <div className="page"><section className="hero"><div><p className="eyebrow">REKOD GOOGLE SHEET</p><h2>Rekod laporan</h2><p className="muted">Cari, lihat dan kemas kini laporan yang dikongsi oleh semua staf.</p></div></section>
        <section className="filter-card"><Field label="Tarikh"><input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} /></Field><Field label="Syif"><select value={filterShift} onChange={(e) => setFilterShift(e.target.value as Shift | "Semua")}><option>Semua</option>{shifts.map((s) => <option key={s}>{s}</option>)}</select></Field><div className="filter-actions"><button className="primary" disabled={busy} onClick={() => void searchRecords()}>{busy ? "Mencari…" : "Cari Rekod"}</button><button className="link-btn" onClick={() => { setFilterDate(""); setFilterShift("Semua"); setRecordResults(reports); }}>Kosongkan</button></div></section>
        <section className="record-list">{filtered.length ? filtered.map((report) => <article className="record-card" key={report.id}><div className="date-tile"><strong>{new Date(`${report.date}T12:00:00`).getDate()}</strong><span>{new Date(`${report.date}T12:00:00`).toLocaleDateString("ms-MY", { month: "short" })}</span></div><div className="record-main"><span className="status complete">Syif {report.shift}</span><h3>{totalCases(report)} kes</h3><p>{shiftTimes[report.shift]} · Diisi oleh {report.filledBy || "—"}</p></div><div className="record-metrics"><span><b>{derived(report).merah}</b> Merah</span><span><b>{derived(report).kuning}</b> Kuning</span><span><b>{derived(report).hijau}</b> Hijau</span></div><div className="record-actions"><button className="secondary" onClick={() => startReport(report.shift, report.date)}>Edit</button><button className="secondary" onClick={() => printReport(report)}>Pratonton</button><button className="icon-btn danger" onClick={() => remove(report)} aria-label={`Padam laporan ${report.shift} ${report.date}`}>×</button></div></article>) : <Empty title="Tiada rekod ditemui" text="Cuba tarikh atau syif lain, atau cipta laporan baharu." />}</section>
      </div>}

      {ready && view === "stats" && <div className="page"><section className="hero stats-hero"><div><p className="eyebrow">ANALISIS GOOGLE SHEET</p><h2>Statistik ETD</h2><p className="muted">Pilih hari, minggu, bulan atau tahun untuk melihat jumlah dan graf tempoh tersebut sahaja.</p></div><PeriodPicker period={statsPeriod} anchor={statsAnchor} onPeriod={setStatsPeriod} onAnchor={setStatsAnchor} /></section>
        <section className="stats-feature"><div><p>{statsPeriod === "day" ? "JUMLAH HARI DIPILIH" : statsPeriod === "week" ? "JUMLAH MINGGU DIPILIH" : statsPeriod === "month" ? "JUMLAH BULAN DIPILIH" : "JUMLAH TAHUN DIPILIH"}</p><strong>{busy ? "…" : periodTotals.cases}</strong><span>{remoteStats ? `${formatDate(remoteStats.start, true)} – ${formatDate(remoteStats.end, true)}` : "Mengambil data Google Sheet"}</span></div><div className="distribution">{[["Merah", periodTotals.merah, "#dc3f45"], ["Kuning", periodTotals.kuning, "#e0a300"], ["Hijau", periodTotals.hijau, "#14915f"]].map(([name, value, color]) => { const pct = periodTotals.cases ? Math.round((Number(value) / periodTotals.cases) * 100) : 0; return <div className="bar-row" key={name}><span>{name}</span><div><i style={{ width: `${pct}%`, background: color }} /></div><b>{value} <small>{pct}%</small></b></div>; })}</div></section>
        <div className="metric-grid stats-grid"><Metric label="Masuk wad" value={periodTotals.ward} accent="blue" icon="▣" /><Metric label="Ambulans" value={periodTotals.ambulance} accent="orange" icon="➜" /><Metric label="Panggilan" value={periodTotals.calls} accent="emerald" icon="☎" /><Metric label="Asthma Bay" value={periodTotals.asthma} accent="purple" icon="◌" /><Metric label="OSCC" value={periodTotals.oscc} accent="pink" icon="◇" /><Metric label="BID / DID" value={`${periodTotals.bid} / ${periodTotals.did}`} accent="slate" icon="+" /></div>
        <section className="level-card"><div className="section-heading"><div><p className="eyebrow">PECAHAN LEVEL</p><h2>L1 hingga L5</h2></div></div><div className="level-grid">{(["l1", "l2", "l3", "l4", "l5"] as const).map((key) => <div key={key}><span>{key.toUpperCase()}</span><strong>{periodTotals[key]}</strong></div>)}</div></section>
        <section className="level-card chart-card"><div className="section-heading"><div><p className="eyebrow">GRAF TEMPOH DIPILIH</p><h2>Trend jumlah pesakit</h2></div></div><TrendChart groups={remoteStats?.groups || []} /></section>
      </div>}

      <nav className="bottom-nav no-print" aria-label="Navigasi utama"><NavButton active={view === "dashboard"} icon="⌂" label="Utama" onClick={() => leaveForm("dashboard")} /><NavButton active={view === "form" && !previewOnly} icon="+" label="Isi laporan" onClick={() => startReport(currentShift())} prominent /><NavButton active={view === "records" || previewOnly} icon="▤" label="Rekod" onClick={() => leaveForm("records")} /><NavButton active={view === "stats"} icon="▥" label="Statistik" onClick={() => leaveForm("stats")} /></nav>
      {toast ? <div className="toast no-print">✓ {toast}</div> : null}
    </main>
  );
}

function Step({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <><div className="card-heading"><div><p className="eyebrow">BORANG LAPORAN</p><h2>{title}</h2><p>{subtitle}</p></div></div><div className="step-content">{children}</div></>; }
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="field"><span>{label} {hint ? <small>{hint}</small> : null}</span>{children}</label>; }
function Counter({ label, value, onChange, tone }: { label: string; value: number; onChange: (v: number) => void; tone: string }) { return <div className={`counter tone-${tone}`}><span>{label}</span><div><button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Kurangkan ${label}`}>−</button><input aria-label={label} type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={value === 0 ? "" : String(value)} onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")))} /><button type="button" onClick={() => onChange(value + 1)} aria-label={`Tambah ${label}`}>+</button></div></div>; }
function AutoValue({ label, formula, value, tone }: { label: string; formula: string; value: number; tone: string }) { return <article className={`auto-value auto-${tone}`}><span>{label}</span><strong>{value}</strong><small>{formula}</small></article>; }
function Metric({ label, value, accent, icon }: { label: string; value: string | number; accent: string; icon: string }) { return <article className={`metric accent-${accent}`}><span className="metric-icon">{icon}</span><div><p>{label}</p><strong>{value}</strong></div></article>; }
function NavButton({ active, icon, label, onClick, prominent }: { active: boolean; icon: string; label: string; onClick: () => void; prominent?: boolean }) { return <button className={`${active ? "active" : ""} ${prominent ? "prominent" : ""}`} onClick={onClick}><span>{icon}</span><small>{label}</small></button>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><span>▤</span><h3>{title}</h3><p>{text}</p></div>; }

function ReportPreview({ report }: { report: Report }) {
  return <article className="report-preview"><header><img className="print-logo" src="/etd-logo.jpg" alt="Logo ETD Kuala Lipis" /><div><small>KEMENTERIAN KESIHATAN MALAYSIA</small><h2>LAPORAN HARIAN ETD</h2><p>E.T.D Hospital Kuala Lipis</p></div><div className="report-id"><span>Tarikh</span><strong>{formatDate(report.date)}</strong><span>Syif</span><strong>{report.shift}</strong></div></header>
    <section className="preview-summary"><div><span>Diisi oleh</span><strong>{report.filledBy || "Belum diisi"}</strong></div><div><span>Jumlah kes</span><strong>{totalCases(report)}</strong></div><div><span>Kakitangan</span><strong>{report.staff.length}</strong></div><div><span>Ambulans</span><strong>{report.ambulances.length}</strong></div></section>
    <section><h3>Statistik kes</h3><div className="print-stats">{(["l1", "l2", "l3", "l4", "l5", "asthmaBay"] as const).map((key) => <div key={key}><span>{labels[key]}</span><b>{report.stats[key]}</b></div>)}<div><span>Zon Merah</span><b>{derived(report).merah}</b></div><div><span>Zon Kuning</span><b>{derived(report).kuning}</b></div><div><span>Zon Hijau</span><b>{derived(report).hijau}</b></div><div><span>Kes Baru</span><b>{derived(report).kesBaru}</b></div><div><span>Kes Ulangan</span><b>{derived(report).kesUlangan}</b></div><div><span>OSCC</span><b>{report.stats.oscc}</b></div><div><span>Masuk Wad</span><b>{report.stats.masukWad}</b></div></div></section>
    <section className="preview-columns"><div><h3>Kakitangan bertugas</h3>{report.staff.length ? <ul>{report.staff.map((s) => <li key={s.id}><span>{s.name || "—"}</span><small>{s.category}</small></li>)}</ul> : <p>Tiada rekod</p>}</div><div><h3>Carry forward</h3><ul><li><span>Zon Merah</span><b>{report.carry.merah}</b></li><li><span>Zon Kuning</span><b>{report.carry.kuning}</b></li><li><span>Observation Ward</span><b>{report.carry.observation}</b></li></ul></div></section>
    <section className="preview-columns"><div><h3>Laporan kes</h3><p><strong>BID: {report.bid} &nbsp; DID: {report.did}</strong></p><p>{report.caseNotes || "Tiada catatan."}</p></div><div><h3>Panggilan kecemasan</h3><ul>{Object.entries(report.calls).map(([key, val]) => <li key={key}><span>{key.toUpperCase()}</span><b>{val}</b></li>)}</ul></div></section>
    <section><h3>Pergerakan ambulans</h3>{report.ambulances.length ? <div className="print-table"><div><b>No.</b><b>Destinasi / unit</b><b>Pemandu</b><b>Masa</b></div>{report.ambulances.map((a) => <div key={a.id}><span>{a.vehicleNo || "—"}</span><span>{a.destination || "—"} · {a.unit || "—"}</span><span>{a.driver || "—"}</span><span>{a.timeOut || "—"} – {a.timeIn || "—"}</span></div>)}</div> : <p>Tiada pergerakan ambulans.</p>}</section>
    <footer>Rekod rasmi Laporan Harian ETD · Dikemas kini {new Date(report.updatedAt).toLocaleString("ms-MY")}</footer>
  </article>;
}

function PeriodPicker({ period, anchor, onPeriod, onAnchor }: { period: StatsPeriod; anchor: string; onPeriod: (period: StatsPeriod) => void; onAnchor: (date: string) => void }) {
  const currentYear = Number(anchor.slice(0, 4)) || new Date().getFullYear();
  const years = Array.from({ length: 9 }, (_, index) => new Date().getFullYear() - 4 + index);
  return <div className="period-picker">
    <div className="segmented period-switch">
      <button className={period === "day" ? "selected" : ""} onClick={() => onPeriod("day")}>Hari</button>
      <button className={period === "week" ? "selected" : ""} onClick={() => onPeriod("week")}>Minggu</button>
      <button className={period === "month" ? "selected" : ""} onClick={() => onPeriod("month")}>Bulan</button>
      <button className={period === "year" ? "selected" : ""} onClick={() => onPeriod("year")}>Tahun</button>
    </div>
    {period === "day" ? <input aria-label="Pilih hari" type="date" value={anchor} onChange={(event) => onAnchor(event.target.value)} /> : null}
    {period === "week" ? <input aria-label="Pilih minggu" type="date" value={anchor} onChange={(event) => onAnchor(event.target.value)} /> : null}
    {period === "month" ? <input aria-label="Pilih bulan" type="month" value={anchor.slice(0, 7)} onChange={(event) => onAnchor(`${event.target.value}-01`)} /> : null}
    {period === "year" ? <select aria-label="Pilih tahun" value={currentYear} onChange={(event) => onAnchor(`${event.target.value}-01-01`)}>{years.map((year) => <option key={year}>{year}</option>)}</select> : null}
  </div>;
}

function TrendChart({ groups }: { groups: RemoteStats["groups"] }) {
  const max = Math.max(1, ...groups.map((group) => group.cases));
  if (!groups.length) return <Empty title="Belum ada data dalam tempoh ini" text="Graf akan muncul selepas laporan syif disimpan." />;
  return <div className="trend-chart" role="img" aria-label="Graf jumlah pesakit mengikut tempoh">
    {groups.map((group) => {
      const label = group.key.length === 7
        ? new Intl.DateTimeFormat("ms-MY", { month: "short" }).format(new Date(`${group.key}-01T12:00:00`))
        : new Intl.DateTimeFormat("ms-MY", { day: "numeric", month: "short" }).format(new Date(`${group.key}T12:00:00`));
      return <div className="trend-column" key={group.key}>
        <span className="trend-value">{group.cases}</span>
        <div className="trend-stack" style={{ height: `${Math.max(8, (group.cases / max) * 150)}px` }}>
          <i className="trend-red" style={{ flex: group.merah || 0 }} />
          <i className="trend-yellow" style={{ flex: group.kuning || 0 }} />
          <i className="trend-green" style={{ flex: group.hijau || 0 }} />
        </div>
        <small>{label}</small>
      </div>;
    })}
  </div>;
}

function summarize(reports: Report[]) {
  return reports.reduce((a, r) => { const zone = derived(r); return ({ cases: a.cases + totalCases(r), merah: a.merah + zone.merah, kuning: a.kuning + zone.kuning, hijau: a.hijau + zone.hijau, ward: a.ward + r.stats.masukWad, ambulance: a.ambulance + r.ambulances.length, calls: a.calls + totalCalls(r), bid: a.bid + r.bid, did: a.did + r.did, asthma: a.asthma + r.stats.asthmaBay, oscc: a.oscc + r.stats.oscc, l1: a.l1 + r.stats.l1, l2: a.l2 + r.stats.l2, l3: a.l3 + r.stats.l3, l4: a.l4 + r.stats.l4, l5: a.l5 + r.stats.l5 }); }, { cases: 0, merah: 0, kuning: 0, hijau: 0, ward: 0, ambulance: 0, calls: 0, bid: 0, did: 0, asthma: 0, oscc: 0, l1: 0, l2: 0, l3: 0, l4: 0, l5: 0 });
}
