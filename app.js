const $=s=>document.querySelector(s),list=$('#list'),msg=$('#msg'),count=$('#count'),gate=$('#gate'),app=$('#app'),loginMsg=$('#login-msg');
const EDGE='https://hmsldwpcaupanooestfr.supabase.co/functions/v1/pricewatcher-api';
let session=localStorage.getItem('pw_session')||'';
async function request(action,payload={},authenticated=true){
  const body={action,...payload};
  if(authenticated&&session)body.session=session;
  const r=await fetch(EDGE,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(body)});
  const text=await r.text();
  let d;try{d=JSON.parse(text)}catch{throw new Error(text||`Request failed (${r.status})`)}
  if(!r.ok){const e=new Error(d.error||'Request failed');e.status=r.status;throw e}
  return d
}
const api=(action,payload={})=>request(action,payload,true);
function locked(message=''){app.hidden=true;gate.hidden=false;if(message)loginMsg.textContent=message;setTimeout(()=>$('#access-code')?.focus(),50)}
function unlocked(){gate.hidden=true;app.hidden=false;loginMsg.textContent=''}
async function load(){try{msg.textContent='';const rows=await api('list');unlocked();count.textContent=`${rows.length} competitor${rows.length===1?'':'s'}`;list.innerHTML=rows.length?'':'<div class="empty">No competitors yet. Add your first pricing page.</div>';rows.forEach(m=>{const changes=[...(m.changes||[])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)),c=changes[0],el=document.createElement('article');el.className='monitor';el.innerHTML=`<div class="top"><div><h3>${esc(m.name)}</h3><a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.url)}</a></div><span class="status ${esc(m.last_status)}">${esc(m.last_status)}</span></div><div class="meta"><span>Last checked: ${m.last_checked_at?new Date(m.last_checked_at).toLocaleString():'Never'}${changes.length?` · ${changes.length} change${changes.length===1?'':'s'}`:''}</span><div class="actions"><button class="check">Check now</button><button class="delete">Remove</button></div></div>${c?`<div class="change"><b>Latest change · ${new Date(c.created_at).toLocaleString()}</b>${(c.added_lines||[]).slice(0,5).map(x=>`<div class="plus">+ ${esc(x)}</div>`).join('')}${(c.removed_lines||[]).slice(0,5).map(x=>`<div class="minus">− ${esc(x)}</div>`).join('')}</div>`:''}`;el.querySelector('.check').onclick=()=>check(m.id);el.querySelector('.delete').onclick=()=>removeMonitor(m.id,m.name);list.appendChild(el)})}catch(e){if(e.status===401){localStorage.removeItem('pw_session');session='';locked('Session expired. Enter your access code again.')}else{locked(`Connection error: ${e.message}`)}}}
async function check(id){msg.textContent='Checking…';try{const d=await api('check',{id});msg.textContent=d.changed?'Pricing change detected.':'No pricing change detected.';await load()}catch(e){msg.textContent=e.message}}
async function removeMonitor(id,name){if(!confirm(`Stop monitoring ${name}?`))return;msg.textContent='Removing monitor…';try{await api('delete',{id});msg.textContent='Monitor removed.';await load()}catch(e){msg.textContent=e.message}}
$('#login-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');loginMsg.textContent='Opening dashboard…';button.disabled=true;try{const code=$('#access-code').value.trim().toUpperCase();const d=await request('login',{code},false);session=d.token;localStorage.setItem('pw_session',session);$('#access-code').value='';unlocked();await load()}catch(err){loginMsg.textContent=err.message||'Unable to sign in.'}finally{button.disabled=false}});
$('#form').onsubmit=async e=>{e.preventDefault();msg.textContent='Capturing first snapshot…';try{const d=await api('create',{name:$('#name').value.trim(),url:$('#url').value.trim()});$('#name').value='';$('#url').value='';msg.textContent=d.warning?`Added, initial check warning: ${d.warning}`:'Monitor added and first snapshot captured.';await load()}catch(e){msg.textContent=e.message}};
$('#refresh').onclick=load;$('#logout').onclick=async()=>{try{await api('logout')}catch{}localStorage.removeItem('pw_session');session='';locked('Signed out.');};
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
if(session)load();else locked();
