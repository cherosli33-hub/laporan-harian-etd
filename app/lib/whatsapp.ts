import type { Report } from './types';
import { operationalDateForReport } from './operationalDate';

// Empty destination opens the share composer: the user chooses the recipient/group.
export const whatsappConfig = { destination: '' };
const patientTotals = (r: Report) => ({red:r.stats.l1+r.stats.l2,yellow:r.stats.l3,green:r.stats.l4+r.stats.l5+r.stats.asthmaBay,asthma:r.stats.asthmaBay});
export function generateWhatsAppMessage(report: Report, confirmedAt: string, dailyReports?: Report[]): string {
  const day = operationalDateForReport(report);
  const date = new Intl.DateTimeFormat('ms-MY', {day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(`${day}T12:00:00+08:00`));
  const time = new Intl.DateTimeFormat('ms-MY', {hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Kuala_Lumpur'}).format(new Date(confirmedAt));
  const {red,yellow,green,asthma}=patientTotals(report);
  const calls=Object.values(report.calls).reduce((sum,n)=>sum+n,0);
  const lines = ['✅ LAPORAN HARIAN ETD SELESAI','','Hospital Kuala Lipis','',`Tarikh Operasi: ${date}`,`Shift: ${report.shift}`,`Masa Final Save: ${time} (waktu Malaysia)`,'',`Diisi oleh: ${report.filledBy || '—'}`,'',`RINGKASAN PESAKIT SYIF ${report.shift.toUpperCase()}`,`Jumlah Pesakit: ${red+yellow+green}`,`Red Zone: ${red}`,`Yellow Zone: ${yellow}`,`Green Zone: ${green}`,`Asthma Bay: ${asthma}`,'Nota: Asthma Bay termasuk dalam Green Zone dan jumlah pesakit.','','CARRY FORWARD (BAKI AKHIR SYIF)',`Red Zone: ${report.carry?.merah || 0}`,`Yellow Zone: ${report.carry?.kuning || 0}`,`Observation Ward: ${report.carry?.observation || 0}`,'',`BID: ${report.bid || 0}`,`DID: ${report.did || 0}`,`Pergerakan Ambulans & Kenderaan: ${report.ambulances?.length || 0}`,'',`MECC / Call Centre: ${report.calls.mecc}`,`Operator: ${report.calls.operator}`,`Awam: ${report.calls.awam}`,`Palsu: ${report.calls.palsu}`,`Jumlah Panggilan Kecemasan: ${calls}`];
  if (report.shift === 'Malam') {
    lines.push('', 'JUMLAH KESELURUHAN HARI OPERASI (PAGI + PETANG + MALAM)');
    if (!dailyReports) lines.push('Jumlah harian tidak tersedia: gagal mendapatkan laporan syif lain. Ringkasan syif Malam di atas telah disimpan.');
    else {
      const byShift = new Map<string, Report>();
      dailyReports.filter(r=>operationalDateForReport(r)===day).forEach(r=>{
        const previous=byShift.get(r.shift);
        if (!previous || (r.updatedAt || '') >= (previous.updatedAt || '')) byShift.set(r.shift,r);
      });
      byShift.set('Malam',report);
      const totals={red:0,yellow:0,green:0,asthma:0};
      for (const shift of ['Pagi','Petang','Malam']) {
        const r=byShift.get(shift);
        if (!r) { lines.push(`Syif ${shift}: Belum dihantar`); continue; }
        const t=patientTotals(r);Object.keys(totals).forEach(k=>{const key=k as keyof typeof totals;totals[key]+=t[key];});
        lines.push(`Syif ${shift}: ${t.red+t.yellow+t.green} pesakit`, `  Red: ${t.red} | Yellow: ${t.yellow} | Green: ${t.green} | Asthma: ${t.asthma}`,`  Carry forward — Red: ${r.carry?.merah || 0} | Yellow: ${r.carry?.kuning || 0} | Observation: ${r.carry?.observation || 0}`);
      }
      lines.push('',`Jumlah Pesakit Keseluruhan: ${totals.red+totals.yellow+totals.green}`,`Red Zone Keseluruhan: ${totals.red}`,`Yellow Zone Keseluruhan: ${totals.yellow}`,`Green Zone Keseluruhan: ${totals.green}`,`Asthma Bay Keseluruhan: ${totals.asthma}`);
      if (['Pagi','Petang','Malam'].some(s=>!byShift.has(s))) lines.push('Jumlah setakat syif yang telah dihantar; belum lengkap 3 syif.');
      lines.push('Carry forward ialah baki setiap syif; tidak dijumlahkan sebagai pesakit baharu.');
    }
  }
  lines.push('','Status: ✅ Final Save berjaya');
  return lines.join('\n');
}
export function buildWhatsAppUrl(message: string, destination=whatsappConfig.destination): string {
  const phone=destination.replace(/\D/g,'');
  return `https://wa.me/${phone ? phone : ''}?text=${encodeURIComponent(message)}`;
}
