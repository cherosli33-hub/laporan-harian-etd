import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { derivePHCCalls, PHC_SUMMARY_COLLECTION, type CallState, type PHCSummary } from './phcCalls';
import type { Shift } from './types';
const config = { apiKey:'AIzaSyCQQ85ceJep54XbkDFun2Zb1dpECcsCAIw', authDomain:'amo-dashboard-v2.firebaseapp.com', projectId:'amo-dashboard-v2', appId:'1:47317873850:web:aa9928b7bbbfa5207bfe83' };
let ready: Promise<ReturnType<typeof getFirestore>> | null = null;
function database() {
  if (!ready) ready = (async () => {
    const app = getApps().find(a=>a.name==='etd-phc-live') || initializeApp(config,'etd-phc-live');
    const auth = getAuth(app); await auth.authStateReady();
    if (!auth.currentUser) await signInAnonymously(auth);
    return getFirestore(app);
  })().catch(error=>{ready=null;throw error;});
  return ready;
}
/** Each subscription is exactly one operational date and one shift. No counter writes. */
export function listenPHCCalls(date:string, shift:Shift, receive:(state:CallState)=>void, providedDatabase?:ReturnType<typeof getFirestore>):Unsubscribe {
  let stopped=false, unsubscribe:Unsubscribe=()=>{}, last:CallState|undefined;
  const context={operationalDate:date,shift,live:true};
  const emit=(state:CallState)=>{if(!stopped){last=state;receive(state);}};
  const offline=()=>emit({...last,...context,status:'error',message:'Luar talian — sync terganggu. Menunggu sambungan Firebase.'});
  window.addEventListener('offline',offline);
  emit({...context,status:'loading'});
  void (providedDatabase?Promise.resolve(providedDatabase):database()).then(db=>{
    if(stopped)return;
    const scoped = query(collection(db,PHC_SUMMARY_COLLECTION),where('status','==','completed'),where('operationalDate','==',date),where('shift','==',shift.toLowerCase()));
    unsubscribe=onSnapshot(scoped,{includeMetadataChanges:true},snapshot=>{
      if(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || !navigator.onLine){emit({...last,...context,status:'error',message:'Menunggu pengesahan Firebase — data cache belum disahkan.'});return;}
      try {
        const rows=snapshot.docs.map(doc=>{const row=doc.data() as PHCSummary;if(row.phcId!==doc.id)throw new Error('ID PHC tidak sepadan.');return row;});
        emit({...context,status:'ready',calls:derivePHCCalls(rows,date,date,shift),fetchedAt:new Date().toISOString()});
      }catch(error){emit({...context,status:'error',message:error instanceof Error?error.message:'Maklumat PHC tidak sah.'});}
    },error=>emit({...context,status:'error',message:`Sync terganggu (${error.code}). Cuba sambung semula.`}));
  }).catch(()=>emit({...context,status:'error',message:'Sambungan Firebase gagal. Cuba semula.'}));
  return ()=>{stopped=true;unsubscribe();window.removeEventListener('offline',offline);};
}
