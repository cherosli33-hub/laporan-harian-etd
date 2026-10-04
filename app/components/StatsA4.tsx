import type { RemoteStats, StatsTotals } from '../lib/reportRepository';
import { CallBreakdown } from './CallBreakdown';
const dateLabel = (date:string) => new Intl.DateTimeFormat('ms-MY',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(`${date}T12:00:00+08:00`));
export function StatsA4({stats,groups}: {stats:RemoteStats;groups:Array<{key:string}&StatsTotals>}) {
  const t=stats.totals;
  const metrics:Array<[string,number]>=[['L1',t.l1],['L2',t.l2],['L3',t.l3],['L4',t.l4],['L5',t.l5],['Red Zone',t.merah],['Yellow Zone',t.kuning],['Green Zone',t.hijau],['Asthma Bay',t.asthma],['OSCC',t.oscc],['Masuk Wad',t.ward],['Kes Baru',t.kesBaru],['Kes Ulangan',t.kesUlangan],['BID',t.bid],['DID',t.did],['Pergerakan Ambulans & Kenderaan',t.ambulance]];
  const title=stats.period==='week'?'Mingguan':stats.period==='month'?'Bulanan':'Tahunan';
  const header=<header className="a4-header"><p>JABATAN KECEMASAN DAN TRAUMA</p><h1>Hospital Kuala Lipis</h1><h2>Laporan Statistik {title}</h2><p>{dateLabel(stats.start)} – {dateLabel(stats.end)} · Semua syif</p></header>;
  const max=Math.max(1,...groups.map(g=>g.cases));
  return <article className="stats-a4" aria-label="Laporan Statistik A4">
    <section className="a4-sheet">{header}<div className="a4-kpis"><div><span>JUMLAH PESAKIT</span><strong>{t.cases}</strong></div><div><span>LAPORAN SYIF DISIMPAN</span><strong>{stats.reports.length}</strong></div></div>
    <h3>Statistik operasi</h3><table><thead><tr><th>Kategori</th><th>Jumlah</th></tr></thead><tbody>{metrics.map(([label,n])=><tr key={label}><th scope="row">{label}</th><td>{n}</td></tr>)}</tbody></table>
    <h3>Panggilan kecemasan</h3><CallBreakdown calls={stats.callState?.status==='ready'?stats.callState.calls:undefined} />
    <p className="a4-note">Pesakit dan pergerakan kenderaan berdasarkan laporan ETD yang disimpan. Panggilan selepas 3 Oktober 2026 berdasarkan PHC completed unik; panggilan sebelum tarikh tersebut mengekalkan rekod manual. Syif Malam 21:00–06:59 menggunakan tarikh operasi hari mula syif. Rekod syif belum dihantar tidak dianggarkan.</p><footer>Ringkasan operasi · Waktu Malaysia · Halaman 1 / 2</footer></section>
    <section className="a4-sheet">{header}<h3>Trend jumlah pesakit</h3><svg className="a4-chart" viewBox="0 0 600 125" role="img" aria-label="Trend pesakit daripada rekod sebenar">{groups.map((g,i)=>{const w=580/groups.length,x=10+i*w,h=85*g.cases/max;return <g key={g.key}><rect x={x+1} y={95-h} width={Math.max(1,w-2)} height={h} fill="#287663"/><text x={x+w/2} y="115" textAnchor="middle" fontSize="10">{groups.length<=12 || i%5===0 ? g.key.slice(-2):''}</text></g>;})}</svg>
    <table className="a4-trend-table"><thead><tr><th>{stats.period==='year'?'Bulan':'Tarikh operasi'}</th><th>Pesakit</th><th>Merah</th><th>Kuning</th><th>Hijau</th><th>Panggilan</th></tr></thead><tbody>{groups.map(g=><tr key={g.key}><th scope="row">{g.key}</th><td>{g.cases}</td><td>{g.merah}</td><td>{g.kuning}</td><td>{g.hijau}</td><td>{g.calls}</td></tr>)}</tbody><tfoot><tr><th>Jumlah</th><td>{t.cases}</td><td>{t.merah}</td><td>{t.kuning}</td><td>{t.hijau}</td><td>{stats.callState?.status==='ready'?t.calls:'—'}</td></tr></tfoot></table><p className="a4-note">Nilai 0 menunjukkan tiada rekod dalam dataset tempoh dipilih. Pecahan sumber panggilan dan jumlah keseluruhan dipaparkan pada halaman 1.</p><footer>Ringkasan operasi · Waktu Malaysia · Halaman 2 / 2</footer></section>
  </article>;
}
