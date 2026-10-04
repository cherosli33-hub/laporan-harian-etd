import { callLabels, callsTotal, type Calls } from '../lib/phcCalls';
export function CallBreakdown({calls}: {calls?: Calls}) {
  return <div className="call-breakdown"><div className="call-breakdown-total"><span>Jumlah Panggilan Kecemasan</span><strong>{calls ? callsTotal(calls) : '—'}</strong></div><dl>{Object.entries(callLabels).map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{calls ? calls[key as keyof Calls] : '—'}</dd></div>)}</dl></div>;
}
