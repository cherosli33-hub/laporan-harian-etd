import type { Report } from './types';
import { operationalDateForReport } from './operationalDate';

// Empty destination opens the share composer: the user chooses the recipient/group.
export const whatsappConfig = { destination: '' };
export function generateWhatsAppMessage(report: Report, confirmedAt: string): string {
  const date = new Intl.DateTimeFormat('ms-MY', {day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(`${operationalDateForReport(report)}T12:00:00+08:00`));
  const time = new Intl.DateTimeFormat('ms-MY', {hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Kuala_Lumpur'}).format(new Date(confirmedAt));
  const red=report.stats.l1+report.stats.l2, yellow=report.stats.l3, green=report.stats.l4+report.stats.l5+report.stats.asthmaBay;
  const calls=Object.values(report.calls).reduce((sum,n)=>sum+n,0);
  return ['✅ LAPORAN HARIAN ETD SELESAI','','Hospital Kuala Lipis','',`Tarikh Operasi: ${date}`,`Shift: ${report.shift}`,`Masa Final Save: ${time} (waktu Malaysia)`,'',`Diisi oleh: ${report.filledBy || "—"}`,`Jumlah Pesakit: ${red+yellow+green}`,`Red Zone: ${red}`,`Yellow Zone: ${yellow}`,`Green Zone: ${green}`,`BID: ${report.bid || 0}`,`DID: ${report.did || 0}`,`Pergerakan Ambulans & Kenderaan: ${report.ambulances?.length || 0}`,'',`MECC / Call Centre: ${report.calls.mecc}`,`Operator: ${report.calls.operator}`,`Awam: ${report.calls.awam}`,`Palsu: ${report.calls.palsu}`,`Jumlah Panggilan Kecemasan: ${calls}`,'','Status: ✅ Final Save berjaya'].join('\n');
}
export function buildWhatsAppUrl(message: string, destination=whatsappConfig.destination): string {
  const phone=destination.replace(/\D/g,'');
  return `https://wa.me/${phone ? phone : ''}?text=${encodeURIComponent(message)}`;
}
