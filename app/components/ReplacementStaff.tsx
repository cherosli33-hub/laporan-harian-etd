import { useState } from "react";
import Autocomplete from "./Autocomplete";
import { replacementCategories, replacementNames, type Report, type ReplacementStaff } from "../lib/types";
import { staffSuggestionKind } from "../lib/masterSuggestions";

export default function ReplacementStaffCard({ report, onChange }: { report: Report; onChange: (value: ReplacementStaff) => void }) {
  const [open, setOpen] = useState(false);
  const names = replacementNames(report);
  const update = (key: keyof ReplacementStaff, values: string[]) => onChange({ ...names, [key]: values });
  return <section className="replacement-staff">
    <button type="button" className="replacement-toggle" aria-expanded={open} aria-controls="replacement-staff-fields" onClick={() => setOpen(!open)}>
      <span className="replacement-icon" aria-hidden="true"><svg width="25" height="25" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="7" r="4"/><circle cx="18" cy="9" r="3"/><path d="M1 21v-3a8 8 0 0 1 16 0v3zM18 14a6 6 0 0 1 5 6v1h-4v-3a10 10 0 0 0-1-4z"/></svg></span><span className="replacement-heading"><strong>Kakitangan Ganti Tugas <small>Baru</small></strong><span>Rekod kakitangan yang menggantikan tugas pada syif ini.</span></span><span className={`replacement-chevron${open ? " open" : ""}`} aria-hidden="true">⌄</span>
    </button>
    {open && <div id="replacement-staff-fields" className="staff-category-list replacement-fields">{replacementCategories.map(({ key, label, category }, index) => <section className="staff-category-card" key={key}>
      <div className="staff-category-title"><div><span>{index + 1}</span><h3>{label}</h3></div><button type="button" onClick={() => update(key, [...names[key], ""])}>+ Tambah nama</button></div>
      {names[key].length ? <div className="staff-name-list">{names[key].map((name, i) => <div className="staff-name-row" key={`${key}-${i}`}><span>{i + 1}</span><Autocomplete kind={staffSuggestionKind(category)} aria-label={`Nama ganti ${label} ${i + 1}`} value={name} placeholder={`Nama ${label}`} onChange={value => update(key, names[key].map((current, j) => j === i ? value : current))} /><button type="button" className="icon-btn danger" aria-label={`Padam nama ganti ${label} ${i + 1}`} onClick={() => update(key, names[key].filter((_, j) => j !== i))}>×</button></div>)}</div> : <p className="empty-category">Belum ada nama. Tekan “Tambah nama”.</p>}
    </section>)}</div>}
  </section>;
}
