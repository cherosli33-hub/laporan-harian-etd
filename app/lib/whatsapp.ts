import type { Report } from './types';
import { operationalDateForReport } from './operationalDate';

// Empty destination opens the share composer: the user chooses the recipient/group.
export const whatsappConfig = { destination: '' };
const patientTotals = (r: Report) => ({red:r.stats.l1+r.stats.l2,yellow:r.stats.l3,green:r.stats.l4+r.stats.l5+r.stats.asthmaBay,asthma:r.stats.asthmaBay});
export function generateWhatsAppMessage(report: Report, _confirmedAt: string, dailyReports?: Report[]): string {
  const day = operationalDateForReport(report);
  const date = new Intl.DateTimeFormat('ms-MY', {day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(`${day}T12:00:00+08:00`));
  const {red,yellow,green,asthma}=patientTotals(report);
  const lines = ['✅ LAPORAN ETD HOSPITAL KUALA LIPIS','',`Tarikh Operasi: ${date}`,`Shift: ${report.shift}`,'',`RINGKASAN PESAKIT SYIF ${report.shift.toUpperCase()}`,`Jumlah Pesakit: ${red+yellow+green}`,`Red Zone: ${red}`,`Yellow Zone: ${yellow}`,`Green Zone: ${green}`,`Asthma Bay: ${asthma}`,'','CARRY FORWARD (BAKI AKHIR SYIF)',`Red Zone: ${report.carry?.merah || 0}`,`Yellow Zone: ${report.carry?.kuning || 0}`,`Observation Ward: ${report.carry?.observation || 0}`];
  if (report.shift === 'Malam') {
    lines.push('', 'JUMLAH KESELURUHAN HARI OPERASI');
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
        if (!r) continue;
        const t=patientTotals(r);Object.keys(totals).forEach(k=>{const key=k as keyof typeof totals;totals[key]+=t[key];});
      }
      lines.push('',`JUMLAH KESELURUHAN: ${totals.red+totals.yellow+totals.green} PESAKIT`,`Red Zone: ${totals.red}`,`Yellow Zone: ${totals.yellow}`,`Green Zone: ${totals.green}`,`Asthma Bay: ${totals.asthma}`);
      if (['Pagi','Petang','Malam'].some(s=>!byShift.has(s))) lines.push('Jumlah setakat syif yang telah dihantar; belum lengkap 3 syif.');
    }
  }
  return lines.join('\n');
}
export function buildWhatsAppUrl(message: string, destination=whatsappConfig.destination): string {
  const phone=destination.replace(/\D/g,'');
  return `https://wa.me/${phone ? phone : ''}?text=${encodeURIComponent(message)}`;
}
