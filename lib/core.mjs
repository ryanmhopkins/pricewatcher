const SUPABASE_URL='https://hmsldwpcaupanooestfr.supabase.co';
const ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhtc2xkd3BjYXVwYW5vb2VzdGZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMTQ2MjAsImV4cCI6MjEwMTg5MDYyMH0.3VZCIp0hrXAHxQlUdtAXulo9q7AOPlchdxPKfhaHPdw';

export async function edge(action,payload={}){
  const r=await fetch(`${SUPABASE_URL}/functions/v1/pricewatcher-api`,{
    method:'POST',
    headers:{Authorization:`Bearer ${ANON_KEY}`,apikey:ANON_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({action,...payload})
  });
  const text=await r.text();
  let data;try{data=JSON.parse(text)}catch{data={error:text||`HTTP ${r.status}`}}
  if(!r.ok)throw new Error(data?.error||`HTTP ${r.status}`);
  return data;
}
export const listMonitors=()=>edge('list');
export const createMonitor=(name,url)=>edge('create',{name,url});
export const runCheck=id=>edge('check',{id});
export const runAll=()=>edge('checkAll');
