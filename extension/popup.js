const SUPABASE_URL='https://hmsldwpcaupanooestfr.supabase.co',EDGE_URL=`${SUPABASE_URL}/functions/v1/pricewatcher-api`,OVERVIEW_URL=`${SUPABASE_URL}/functions/v1/pricewatcher-overview`,PUBLISHABLE_KEY='sb_publishable_QCWt9V-_up-ePCszAB9S1A_k2-bPOQj';
const storage=chrome.storage.local,$=selector=>document.querySelector(selector);
let accessToken='',refreshToken='',currentTab=null,currentMonitor=null,account=null,monitors=[],selected=null,hoverTimer=null,peekTransition=0,pendingSetup=null;

function message(text='',type=''){const el=$('#message');el.textContent=text;el.className=type}
function closeAccountMenu(){$('#account-dropdown').hidden=true;$('#account-trigger').setAttribute('aria-expanded','false')}
function showSignedOut(){$('#loading').hidden=true;$('#dashboard').hidden=true;$('#signed-out').hidden=false;$('#refresh').hidden=true;$('#account-menu').hidden=true;$('#usage').textContent='';closeAccountMenu()}
function showDashboard(){$('#loading').hidden=true;$('#signed-out').hidden=true;$('#dashboard').hidden=false;$('#refresh').hidden=false;$('#account-menu').hidden=false}
function canonicalUrl(value){const url=new URL(value);url.hash='';['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'].forEach(key=>url.searchParams.delete(key));url.pathname=url.pathname.replace(/\/+$/,'')||'/';url.hostname=url.hostname.toLowerCase();return url.toString()}
function domain(value){try{return new URL(value).hostname.replace(/^www\./,'')}catch{return value}}
function defaultName(tab){const title=String(tab?.title||'').split(/[|–—]/)[0].trim();return title&&!/^pricing$/i.test(title)?title:domain(tab.url).split('.')[0].replace(/^./,letter=>letter.toUpperCase())}
function nameFromUrl(value){return domain(value).split('.')[0].replace(/[-_]+/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase())||'Pricing page'}
function ago(value){if(!value)return'Not checked';const minutes=Math.max(0,Math.floor((Date.now()-new Date(value))/60000));if(minutes<1)return'Now';if(minutes<60)return`${minutes}m`;const hours=Math.floor(minutes/60);return hours<24?`${hours}h`:`${Math.floor(hours/24)}d`}
function displayPrice(plan){if(plan?.raw_price)return plan.raw_price;if(plan?.price)return plan.price;if(plan?.amount===0)return'Free';if(plan?.amount!=null){const symbol=plan.currency==='EUR'?'€':plan.currency==='GBP'?'£':'$';return`${symbol}${plan.amount}`}return'Custom'}
function openMonitor(id){const monitor=monitors.find(item=>item.id===id);if(monitor?.url)chrome.tabs.create({url:monitor.url})}
async function visiblePageSource(value){
  try{
    if(!currentTab?.id||!currentTab.url||canonicalUrl(currentTab.url)!==canonicalUrl(value))return{};
    const results=await chrome.scripting.executeScript({
      target:{tabId:currentTab.id},
      func:()=>{
        const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
        const selectorFor=element=>{if(element.id)return`#${CSS.escape(element.id)}`;const path=[];for(let node=element;node&&node!==document.body&&path.length<7;node=node.parentElement){let part=node.localName;if(!part)break;const stable=[...node.attributes].find(attribute=>/^(data-testid|data-test|data-qa|itemprop)$/.test(attribute.name)&&attribute.value);if(stable){part+=`[${stable.name}="${CSS.escape(stable.value)}"]`;path.unshift(part);break}const siblings=node.parentElement?[...node.parentElement.children].filter(sibling=>sibling.localName===node.localName):[];if(siblings.length>1)part+=`:nth-of-type(${siblings.indexOf(node)+1})`;path.unshift(part)}return path.join('>')};
        const pricePattern=/^(?:From\s+|Starting at\s+)?(?:[$€£]\s*[0-9][0-9,.]*(?:\s*\/\s*(?:month|mo|year|yr))?|Free|Contact sales|Custom)$/i;
        const planWord=/\b(?:free|basic|starter|hobby|plus|pro|professional|premium|business|team|enterprise|growth|scale|ultra|max)\b/i;
        const prices=[],seen=new Set();
        const planLabels=[...document.querySelectorAll('h2,h3,h4,[role="heading"],div,span')].filter(element=>element.matches('h2,h3,h4,[role="heading"]')||element.children.length===0);
        for(const heading of planLabels){
          const name=clean(heading.textContent);
          if(!name||name.length>60||/pricing|plans|compare|features|questions/i.test(name))continue;
          if(!heading.matches('h2,h3,h4,[role="heading"]')&&!planWord.test(name))continue;
          let card=heading.parentElement;
          for(let depth=0;card&&depth<7;depth++,card=card.parentElement){
            const cardText=clean(card.innerText);
            if(cardText.length>1400)break;
            const all=[...card.querySelectorAll('*')].filter(element=>{
              const text=clean(element.textContent);
              return element.children.length===0&&element.tagName!=='SCRIPT'&&text.length<180&&(pricePattern.test(text)||/(?:usually\s+[$€£][\d,.]+,\s*)?now\s+[$€£][\d,.]+\s*\/\s*(?:month|mo|year|yr)/i.test(text));
            });
            const visible=all.filter(element=>{
              if(element.closest('[aria-hidden="true"],s,del'))return false;
              for(let node=element;node&&node!==card.parentElement;node=node.parentElement){
                if(getComputedStyle(node).textDecorationLine.includes('line-through'))return false;
              }
              return true;
            });
            const candidate=visible.sort((a,b)=>Number(/month|mo|year|yr/i.test(clean(b.textContent)))-Number(/month|mo|year|yr/i.test(clean(a.textContent))))[0];
            if(!candidate)continue;
            const capacity=cardText.match(/\b\d+(?:\.\d+)?\s*(?:TB|GB)\b/i)?.[0]||'';
            const label=capacity&&!name.toLowerCase().includes(capacity.toLowerCase())?`${name} · ${capacity}`:name;
            const candidateText=clean(candidate.textContent);
            const rawPrice=candidateText.match(/then\s+([$€£]\s*[\d,.]+\s*\/\s*(?:month|mo|year|yr))/i)?.[1]||candidateText.match(/now\s+([$€£]\s*[\d,.]+\s*\/\s*(?:month|mo|year|yr)(?:\s+for\s+[^,]+)?)/i)?.[1]||candidateText;
            const key=`${label.toLowerCase()}|${rawPrice.toLowerCase()}`;
            if(!seen.has(key)){
              seen.add(key);
              const context=clean(candidate.parentElement?.innerText);
              const target_id=label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
              prices.push({target_id,selector:selectorFor(candidate),name:label,raw_price:rawPrice,billing_period:/billed yearly|annual|\/\s*(?:year|yr)/i.test(`${rawPrice} ${context}`)?'year':/month|monthly|\/\s*(?:month|mo)/i.test(`${rawPrice} ${context}`)?'month':null});
            }
            break;
          }
        }
        return{text:document.body?.innerText||'',title:document.title||'',prices:prices.slice(0,12)};
      }
    });
    const source=results?.[0]?.result||{};
    if(source.text?.length<80)throw new Error('The visible page did not return enough readable content.');
    return{page_text:source.text.slice(0,2500000),page_title:String(source.title||'').slice(0,300),page_prices:Array.isArray(source.prices)?source.prices:[]};
  }catch(error){
    console.warn('PlanSentry page capture unavailable',error);
    return{page_capture_error:error instanceof Error?error.message:'Page capture unavailable'};
  }
}

function closePriceSetup(){pendingSetup=null;$('#price-setup').hidden=true;$('#setup-options').textContent=''}
function setupRows(prices,selectedTargets=[]){
  const chosen=new Map(selectedTargets.map(target=>[target.target_id,target]));
  const unique=[...new Map(prices.filter(price=>price?.target_id&&price?.name&&price?.raw_price).map(price=>[price.target_id,price])).values()].slice(0,20),box=$('#setup-options');
  box.textContent='';
  unique.forEach(price=>{const target=chosen.get(price.target_id),row=document.createElement('label');row.className='setup-option';row.dataset.targetId=price.target_id;row.dataset.selector=price.selector||target?.selector||'';row.innerHTML='<input type="checkbox"><span class="setup-fields"><input class="setup-name" aria-label="Plan name"><input class="setup-price" aria-label="Plan price"></span>';row.querySelector('[type=checkbox]').checked=!!target;row.querySelector('.setup-name').value=target?.name||price.name;row.querySelector('.setup-price').value=price.raw_price;row.dataset.period=price.billing_period||'';box.appendChild(row)});
  return unique.length;
}
async function beginPriceSetup({url,name,monitor=null,button=null}){
  if(button)button.disabled=true;
  message('Reading visible pricing cards…');
  try{
    if(!currentTab?.url||canonicalUrl(currentTab.url)!==canonicalUrl(url))throw new Error('Open this pricing page in the current tab, then choose its prices.');
    const source=await visiblePageSource(url),count=setupRows(source.page_prices||[],monitor?.price_targets||[]);
    if(!count)throw new Error('No selectable pricing cards were found on this page.');
    pendingSetup={url,name,monitor,source};$('#price-setup').hidden=false;$('#price-setup').scrollIntoView({behavior:'smooth',block:'start'});message('Select and review the prices to track.','success');
  }catch(error){message(error.message)}finally{if(button)button.disabled=false}
}
async function savePriceSetup(){
  if(!pendingSetup)return;
  const button=$('#setup-save'),targets=[...document.querySelectorAll('.setup-option')].filter(row=>row.querySelector('[type=checkbox]').checked).map(row=>({target_id:row.dataset.targetId,selector:row.dataset.selector,name:row.querySelector('.setup-name').value.trim(),raw_price:row.querySelector('.setup-price').value.trim(),billing_period:row.dataset.period||null})).filter(target=>target.name&&target.raw_price&&target.selector);
  if(!targets.length){message('Select at least one price to track.');return}
  button.disabled=true;message('Saving verified prices…');
  try{
    const page_prices=targets.map(target=>({...target}));
    if(pendingSetup.monitor){await api('update',{id:pendingSetup.monitor.id,price_targets:targets});await api('check',{id:pendingSetup.monitor.id,...pendingSetup.source,page_prices});message('Tracked prices updated.','success')}
    else await api('create',{name:pendingSetup.name,url:pendingSetup.url,check_interval_minutes:1440,...pendingSetup.source,page_prices,price_targets:targets});
    $('#quick-url').value='';closePriceSetup();message('Verified prices are now tracked.','success');await load(true);
  }catch(error){message(error.status===402?`${error.message} Manage your plan on PlanSentry.`:error.message)}finally{button.disabled=false}
}

async function saveSession(data){accessToken=data.access_token||accessToken;refreshToken=data.refresh_token||refreshToken;await storage.set({accessToken,refreshToken})}
async function clearSession(){accessToken='';refreshToken='';await storage.remove(['accessToken','refreshToken'])}
async function authRequest(path,body){const response=await fetch(`${SUPABASE_URL}${path}`,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.msg||data.message||data.error_description||data.error||'Unable to sign in.');return data}
async function refreshSession(){if(!refreshToken)return false;try{await saveSession(await authRequest('/auth/v1/token?grant_type=refresh_token',{refresh_token:refreshToken}));return true}catch{await clearSession();return false}}
async function api(action,payload={},retry=true){const response=await fetch(EDGE_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action,...payload,access_token:accessToken})}),data=await response.json().catch(()=>({}));if(response.status===401&&retry&&await refreshSession())return api(action,payload,false);if(!response.ok){const error=new Error(data.error||'PlanSentry could not complete that request.');error.status=response.status;throw error}return data}
async function structuredOverview(retry=true){const response=await fetch(OVERVIEW_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({access_token:accessToken})}),data=await response.json().catch(()=>({}));if(response.status===401&&retry&&await refreshSession())return structuredOverview(false);if(!response.ok)throw new Error(data.error||'Pricing overview unavailable.');return data}

function renderCurrent(){const card=$('#current-page');if(!currentTab?.url||!/^https?:\/\//i.test(currentTab.url)){card.hidden=true;return}card.hidden=false;$('#current-title').textContent=currentMonitor?.name||currentTab.title||domain(currentTab.url);$('#current-url').textContent=domain(currentTab.url);$('#current-tracked').hidden=!currentMonitor;$('#current-untracked').hidden=!!currentMonitor;$('#custom-form').hidden=true}
function populatePeek(m){selected=m;document.querySelectorAll('.monitor-row').forEach(row=>row.classList.toggle('active',row.dataset.id===m.id));const row=document.querySelector(`.monitor-row[data-id="${CSS.escape(m.id)}"]`),peek=$('#peek');if(row)row.insertAdjacentElement('afterend',peek);peek.hidden=false;$('#peek-name').textContent=m.name;$('#peek-date').textContent=m.pricing_overview?.captured_at?new Date(m.pricing_overview.captured_at).toLocaleDateString():ago(m.last_checked_at);const status=m.is_active?m.last_status:'paused';$('#peek-status').className=`dot ${status==='error'?'error':status==='paused'?'paused':''}`;const plans=Array.isArray(m.pricing_overview?.plans)?m.pricing_overview.plans.slice(0,5):[],box=$('#peek-prices');box.textContent='';if(!plans.length)box.innerHTML='<div class="no-price">No verified prices yet. Open the page and choose prices.</div>';plans.forEach(plan=>{const el=document.createElement('div'),name=document.createElement('span'),price=document.createElement('strong'),period=document.createElement('small');el.className='price';name.textContent=plan.name||'Plan';price.textContent=displayPrice(plan);period.textContent=plan.billing_period||plan.interval||'';el.append(name,price,period);box.appendChild(el)});const latest=m.changes?.[0];$('#peek-note').textContent=latest?.summary||`${m.change_count||0} changes · ${m.snapshot_count||0} snapshots`;$('#peek-targets').onclick=()=>beginPriceSetup({url:m.url,name:m.name,monitor:m,button:$('#peek-targets')});$('#peek-check').disabled=!m.is_active;$('#peek-check').onclick=()=>checkMonitor(m,$('#peek-check'));$('#peek-open').onclick=()=>openMonitor(m.id);$('#peek-remove').onclick=()=>removeMonitor(m,$('#peek-remove'))}
function renderPeek(m){if(selected?.id===m.id&&!$('#peek').hidden)return;const peek=$('#peek'),token=++peekTransition;if(peek.hidden){populatePeek(m);requestAnimationFrame(()=>peek.classList.add('visible'));return}peek.classList.remove('visible');peek.classList.add('leaving');setTimeout(()=>{if(token!==peekTransition)return;populatePeek(m);peek.classList.remove('leaving');requestAnimationFrame(()=>peek.classList.add('visible'))},130)}
function queuePeek(m){clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>renderPeek(m),90)}
function renderList(){clearTimeout(hoverTimer);peekTransition++;const query=$('#search').value.trim().toLowerCase(),filtered=monitors.filter(m=>!query||m.name.toLowerCase().includes(query)||m.url.toLowerCase().includes(query)),list=$('#monitor-list'),peek=$('#peek');list.parentElement.insertBefore(peek,$('#empty'));list.textContent='';peek.hidden=true;peek.classList.remove('visible','leaving');$('#empty').hidden=monitors.length>0;filtered.forEach(m=>{const row=document.createElement('article'),status=m.is_active?m.last_status:'paused',attention=Number(m.unreviewed_count||0);row.className='monitor-row';row.dataset.id=m.id;row.tabIndex=0;row.innerHTML=`<span class="status-dot ${status==='error'?'error':status==='paused'?'paused':''}"></span><div class="row-copy"><strong></strong><span></span></div><span class="row-meta${attention?' attention':''}">${attention?`${attention} new`:ago(m.last_checked_at)}</span>`;row.querySelector('.row-copy strong').textContent=m.name;row.querySelector('.row-copy span').textContent=domain(m.url);row.addEventListener('mouseenter',()=>queuePeek(m));row.addEventListener('focus',()=>renderPeek(m));row.addEventListener('click',()=>renderPeek(m));list.appendChild(row)});if(monitors.length&&!filtered.length)list.innerHTML='<div class="empty">No matches.</div>';const next=filtered.find(m=>m.id===selected?.id);if(next){selected=null;renderPeek(next)}}
function matchCurrentMonitor(){currentMonitor=null;if(currentTab?.url&&/^https?:\/\//i.test(currentTab.url)){const page=canonicalUrl(currentTab.url);currentMonitor=monitors.find(m=>{try{return canonicalUrl(m.url)===page}catch{return false}})||null}}
function render(){matchCurrentMonitor();const limit=account?.limit===null?'∞':account?.limit||0,plan=String(account?.plan||'free');$('#usage').textContent=`${monitors.length}/${limit}`;$('#account-plan').textContent=plan.replace(/^./,letter=>letter.toUpperCase());$('#account-initial').textContent=String(account?.email||'A').charAt(0).toUpperCase();$('#monitor-count').textContent=`${monitors.length} page${monitors.length===1?'':'s'}`;renderCurrent();renderList();showDashboard()}
async function syncActiveTab(){[currentTab]=await chrome.tabs.query({active:true,currentWindow:true});if(!$('#dashboard').hidden){matchCurrentMonitor();renderCurrent()}}

async function load(silent=false){if(!silent){$('#loading').hidden=false;$('#dashboard').hidden=true;message()}[currentTab]=await chrome.tabs.query({active:true,currentWindow:true});const session=await storage.get(['accessToken','refreshToken']);accessToken=session.accessToken||'';refreshToken=session.refreshToken||'';if(!accessToken&&!refreshToken){showSignedOut();return}try{const base=await Promise.all([api('account'),api('list')]),overview=await structuredOverview().catch(()=>({}));account=base[0];monitors=base[1].map(m=>overview[m.id]?{...m,pricing_overview:overview[m.id]}:m);render()}catch(error){if(error.status===401){await clearSession();showSignedOut();message('Session expired. Sign in again.')}else{showSignedOut();message(error.message)}}}
async function addUrl(value,name,button){try{const url=canonicalUrl(value);if(!/^https?:\/\//i.test(url))throw new Error('Enter a public http or https URL.');await beginPriceSetup({url,name:name||nameFromUrl(url),button})}catch(error){message(error.message)}}
async function addCurrent(name,button){return addUrl(currentTab.url,name||defaultName(currentTab),button)}
async function checkMonitor(m,button){button.disabled=true;message(`Checking ${m.name}…`);try{const source=await visiblePageSource(m.url);if(source.page_capture_error)throw new Error(`PlanSentry cannot read this tab yet. Open the pricing page, then click the PlanSentry toolbar icon to grant access to that page.`);const targets=Array.isArray(m.price_targets)?m.price_targets:[];if(!targets.length)throw new Error('Choose the prices for this tracker before checking it.');const found=new Map((source.page_prices||[]).map(price=>[price.target_id,price])),page_prices=targets.map(target=>found.get(target.target_id)).filter(Boolean).map(price=>({...price,name:targets.find(target=>target.target_id===price.target_id)?.name||price.name}));const result=await api('check',{id:m.id,...source,page_prices});message(result.changed?'Verified price change detected.':`${result.plan_count||'Plan'} verified prices refreshed.`,'success');await load(true)}catch(error){message(error.message);await load(true).catch(()=>{})}finally{button.disabled=false}}
async function removeMonitor(m,button){if(!confirm(`Remove ${m.name}? Its snapshots and change history will also be deleted.`))return;button.disabled=true;message(`Removing ${m.name}…`);try{await api('delete',{id:m.id});selected=null;message('Tracker removed.','success');await load(true)}catch(error){message(error.message)}finally{button.disabled=false}}

$('#signin-form').addEventListener('submit',async event=>{event.preventDefault();const button=$('#signin');button.disabled=true;message('Signing in…');try{await saveSession(await authRequest('/auth/v1/token?grant_type=password',{email:$('#email').value.trim(),password:$('#password').value}));await load()}catch(error){message(error.message)}finally{button.disabled=false}});
$('#track').addEventListener('click',()=>addCurrent('', $('#track')));
$('#quick-add').addEventListener('submit',event=>{event.preventDefault();addUrl($('#quick-url').value.trim(),'', $('#quick-submit'))});
$('#customize').addEventListener('click',()=>{const form=$('#custom-form');form.hidden=!form.hidden;if(!form.hidden){$('#monitor-name').placeholder=defaultName(currentTab);$('#monitor-name').focus()}});
$('#custom-form').addEventListener('submit',event=>{event.preventDefault();addCurrent($('#monitor-name').value.trim(),event.currentTarget.querySelector('button'))});
$('#check-current').addEventListener('click',()=>currentMonitor&&checkMonitor(currentMonitor,$('#check-current')));
$('#setup-save').addEventListener('click',savePriceSetup);
$('#setup-cancel').addEventListener('click',closePriceSetup);
$('#setup-close').addEventListener('click',closePriceSetup);
$('#search').addEventListener('input',renderList);
$('#refresh').addEventListener('click',()=>load());
$('#account-trigger').addEventListener('click',event=>{event.stopPropagation();const menu=$('#account-dropdown'),open=menu.hidden;menu.hidden=!open;$('#account-trigger').setAttribute('aria-expanded',String(open))});
$('#account-dropdown').addEventListener('click',event=>event.stopPropagation());
document.addEventListener('click',closeAccountMenu);
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeAccountMenu();closePriceSetup();$('#account-trigger').focus()}});
chrome.tabs.onActivated.addListener(()=>setTimeout(syncActiveTab,60));
chrome.tabs.onUpdated.addListener((_tabId,change,tab)=>{if(tab.active&&(change.url||change.status==='complete'))syncActiveTab()});
$('#signout').addEventListener('click',async()=>{closeAccountMenu();try{await fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${accessToken}`}})}catch{}await clearSession();monitors=[];selected=null;message();showSignedOut()});
load().catch(error=>{showSignedOut();message(error.message||'Unable to load PlanSentry.')});
