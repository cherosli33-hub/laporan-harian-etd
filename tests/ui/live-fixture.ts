import {derivePHCCalls} from '../../app/lib/phcCalls';
const fixture=window as any;fixture.liveRows=[];fixture.liveFail=false;fixture.subscriptions=new Map();fixture.started=0;fixture.stopped=0;
fixture.emitLive=()=>{for(const [key,entry] of fixture.subscriptions){entry.receive(fixture.liveFail?{status:'error',live:true,message:'Sync terganggu'}:{status:'ready',live:true,operationalDate:entry.date,shift:entry.shift,fetchedAt:new Date().toISOString(),calls:derivePHCCalls(fixture.liveRows,entry.date,entry.date,entry.shift)});}};
export function listenPHCCalls(date:string,shift:string,receive:any){const id=++fixture.started;fixture.subscriptions.set(id,{date,shift,receive});fixture.emitLive();return ()=>{fixture.subscriptions.delete(id);fixture.stopped++;};}
