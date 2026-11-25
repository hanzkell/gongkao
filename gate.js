'use strict';
const statusLine=document.getElementById('status'), form=document.querySelector('form'), button=form.querySelector('button'), input=document.getElementById('code');
const base=new URL(document.baseURI), content=new URL('read/',base);
function openContent(){
  if(location.pathname.startsWith(content.pathname))location.reload();
  else location.replace(new URL('index.html',content).href+location.search+location.hash);
}
async function request(worker,op,password){
  const channel=new MessageChannel();
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{channel.port1.close();reject(Error('连接超时，请刷新后重试。'));},60000);
    channel.port1.onmessage=({data})=>{clearTimeout(timer);channel.port1.close();data.error?reject(Error(data.error)):resolve(data.ok);};
    worker.postMessage({op,password},[channel.port2]);
  });
}
(async()=>{
  if(!('serviceWorker' in navigator)||!crypto.subtle)throw Error('请使用支持 HTTPS 和本地存储的现代浏览器打开。');
  await navigator.serviceWorker.register(new URL('worker.js',base),{scope:base.pathname,updateViaCache:'none'});
  const registration=await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise(resolve=>{
    function changed(){if(!navigator.serviceWorker.controller)return;navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve();}
    navigator.serviceWorker.addEventListener('controllerchange',changed);changed();
  });
  const worker=registration.active;
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
