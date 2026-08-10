const CACHE='pricewatcher-app-v2';
const SHELL=['/app','/style.css?v=16','/dashboard.css?v=1','/app.js?v=17','/icon.svg','/manifest.webmanifest','/pwa.js?v=1'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin)return;if(req.mode==='navigate'){if(url.pathname==='/app'||url.pathname.startsWith('/app/'))event.respondWith(fetch(req).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put('/app',copy));return r}).catch(()=>caches.match('/app')));return}event.respondWith(caches.match(req).then(hit=>hit||fetch(req))) });
