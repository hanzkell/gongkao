'use strict';
const scope=new URL(self.registration.scope),readPath=scope.pathname+'read/';
const dbName='gongkao-access:'+scope.pathname, encoder=new TextEncoder();
let dbPromise,statePromise;
function database(){
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(dbName,1);
    req.onupgradeneeded=()=>req.result.createObjectStore('access');
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}
async function rememberedKey(){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const req=db.transaction('access').objectStore('access').get('key');
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function saveKey(key){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('access','readwrite');tx.objectStore('access').put(key,'key');
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
  });
}
async function remote(relative){
  const res=await fetch(new URL(relative,scope),{cache:'no-store',credentials:'omit',redirect:'error'});
  if(!res.ok)throw Error('发布文件读取失败，请稍后重试。');
  return res;
}
async function config(){return (await remote('version.json')).json();}
async function decrypt(key,id,label){
  if(!/^[a-f0-9]{64}$/.test(id))throw Error('发布清单无效。');
  const bytes=new Uint8Array(await (await remote('vault/'+id+'.bin')).arrayBuffer());
  return crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12),additionalData:encoder.encode(label)},key,bytes.subarray(12));
}
async function unlockState(key,version){
  if(!key)return null;
  try{return {key,files:JSON.parse(new TextDecoder().decode(await decrypt(key,version.manifest,'manifest')))};}
  catch(e){if(e.name==='OperationError')return null;throw e;}
}
async function current(force=false){
  if(!statePromise||force)statePromise=Promise.all([rememberedKey(),config()]).then(([key,version])=>unlockState(key,version)).catch(e=>{statePromise=undefined;throw e;});
  return statePromise;
}
async function access(data){
  if(data.op==='remembered')return !!await current(true);
  if(data.op!=='unlock'||typeof data.password!=='string')return false;
  const v=await config(), seed=await crypto.subtle.importKey('raw',encoder.encode(data.password),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:Uint8Array.from(atob(v.salt),c=>c.charCodeAt(0)),iterations:v.iterations},seed,{name:'AES-GCM',length:256},false,['decrypt']);
  const result=await unlockState(key,v);if(!result)return false;
  await saveKey(key);statePromise=Promise.resolve(result);return true;
}
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{
  const port=e.ports[0];
  if(!port||!e.source?.url)return;
  const sender=new URL(e.source.url);
  if(sender.origin!==scope.origin||!sender.pathname.startsWith(scope.pathname))return;
  e.waitUntil(access(e.data).then(ok=>port.postMessage({ok})).catch(()=>port.postMessage({error:'无法读取发布文件或浏览器存储，请刷新重试。'})));
});
function reply(body,status,headers={}){return new Response(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...headers}});}
async function serve(req,url){
  const name=decodeURIComponent(url.pathname.slice(readPath.length))||'index.html';
  const currentState=await current(req.mode==='navigate');
  if(!currentState){
    if(req.mode==='navigate')return reply(await (await remote('index.html')).text(),200,{'Content-Type':'text/html; charset=utf-8'});
    return reply(null,403);
  }
  const record=Object.hasOwn(currentState.files,name)&&currentState.files[name];
  if(!record)return reply(null,404);
  const [id,type]=record;
  const bytes=await decrypt(currentState.key,id,name), length=bytes.byteLength;
  const headers={'Content-Type':type,'Accept-Ranges':'bytes'};
  const range=req.headers.get('Range');
  if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    const start=match?.[1]?Number(match[1]):Math.max(0,length-Number(match?.[2]));
    const end=match?.[1]&&match[2]?Math.min(length-1,Number(match[2])):length-1;
    if(!match||(!match[1]&&!match[2])||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=length)return reply(null,416,{'Content-Range':'bytes */'+length});
    return reply(req.method==='HEAD'?null:bytes.slice(start,end+1),206,{...headers,'Content-Range':'bytes '+start+'-'+end+'/'+length,'Content-Length':end-start+1});
  }
  return reply(req.method==='HEAD'?null:bytes,200,{...headers,'Content-Length':length});
}
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(url.origin===scope.origin&&url.pathname.startsWith(readPath)&&['GET','HEAD'].includes(e.request.method))
    e.respondWith(serve(e.request,url).catch(()=>reply('文件暂时无法加载，请重新打开站点。',503,{'Content-Type':'text/plain; charset=utf-8'})));
});
