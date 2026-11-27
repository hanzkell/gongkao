'use strict';
const statusLine=document.getElementById('status'), form=document.querySelector('form'), button=form.querySelector('button'), input=document.getElementById('code');
const base=new URL(document.baseURI), content=new URL('read/',base);
const fromPath=location.pathname.startsWith(content.pathname);
const name=fromPath?decodeURIComponent(location.pathname.slice(content.pathname.length)):new URL(location.href).searchParams.get('file');
const valid=typeof name==='string' && /^(pdfs|docs|exports)\//.test(name) && name.split('/').every(p=>p && p!=='.' && p!=='..' && !p.includes('\\'));
function openContent(){
  if(fromPath)location.reload();
  else location.replace(new URL(name.split('/').map(encodeURIComponent).join('/'),content).href+location.hash);
}
async function request(worker,op,password){
  const channel=new MessageChannel();
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{channel.port1.close();reject(Error('连接超时，请刷新后重试。'));},60000);
    channel.port1.onmessage=({data})=>{clearTimeout(timer);channel.port1.close();data.error?reject(Error(data.error)):resolve(data.ok);};
    worker.postMessage({op,password},[channel.port2]);
  });
}
async function connect(){
  const script=new URL('worker.js',base);
  await navigator.serviceWorker.register(script,{scope:base.pathname,updateViaCache:'none'});
  await navigator.serviceWorker.ready;
  const controlsSite=()=>navigator.serviceWorker.controller?.scriptURL===script.href;
  if(!controlsSite())await new Promise(resolve=>{
    function changed(){if(!controlsSite())return;navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve();}
    navigator.serviceWorker.addEventListener('controllerchange',changed);changed();
  });
  return navigator.serviceWorker.controller;
}
(async()=>{
  if(!valid){location.replace(new URL('index.html',base).href+location.hash);return;}
  if(!('serviceWorker' in navigator)||!globalThis.crypto?.subtle)throw Error('此浏览器无法打开加密站点，请在支持 HTTPS、Service Worker 和本地存储的浏览器中打开。');
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('浏览器未能启动站点服务。请刷新重试，或在系统浏览器中打开。')),30000);});
  const worker=await Promise.race([connect(),timeout]).finally(()=>clearTimeout(timer));
  if(await request(worker,'remembered')){openContent();return;}
  statusLine.textContent='';button.disabled=false;input.focus();
  form.addEventListener('submit',async e=>{
    e.preventDefault();button.disabled=true;statusLine.textContent='正在解锁…';
    try{
      if(await request(worker,'unlock',input.value)){input.value='';openContent();return;}
      statusLine.textContent='密钥不正确，请重新输入。';input.select();
    }catch(err){statusLine.textContent=err.message;}finally{button.disabled=false;}
  });
})().catch(err=>{statusLine.textContent=err.message;});
