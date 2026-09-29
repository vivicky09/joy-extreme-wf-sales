const CACHE='jx-wf-v6';
const ASSETS=['./','./index.html','./app.js','./config.js','./manifest.webmanifest','./icon.svg','./zxing-browser.min.js'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  if(event.request.mode==='navigate'||url.pathname.endsWith('/config.js')){
    event.respondWith(fetch(event.request).then(response=>{
      if(response.ok&&event.request.mode==='navigate'){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put('./index.html',copy));
      }
      return response;
    }).catch(()=>caches.match(event.request.mode==='navigate'?'./index.html':event.request)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
      if(response.ok){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      }
      return response;
    }))
  );
});
