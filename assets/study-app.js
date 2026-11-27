window.kbStartStudy = function(view, compile){
'use strict';
let node, picker, pickLimit, toastTimer;
const {nodes,qs,mats,missing,catalog,reviewSources,study,training,strategies,redirects={}}=window.kbGraph;
const listeners=new AbortController();
function listen(target,type,fn,options={}){target?.addEventListener?.(type,fn,{...options,signal:listeners.signal});}
const loadedAssets=new Set();
const artwork=window.kbQuestionFigures,materialFiles={};
if(view?.first)mergeCard(view.first);
for(const item of view?.firstMaterials||[]){
 window.studyPages.remember('materials/'+materialFiles[item.key],item);mergeMaterial(item);
}
function mergeMaterial(item){
 mats[item.key]=item.value;if(item.art)artwork.materials[item.label]=item.art;
}
function neededMaterials(id){
 return (qs[id]?.m||[]).filter(k=>!mats[k]).map(k=>'materials/'+materialFiles[k]);
}
function mergeCard(batch){
 Object.assign(qs,batch.qs);Object.assign(materialFiles,batch.materialFiles);
 for(const [id,term] of Object.entries(batch.terms))if(!nodes[id])nodes[id]=term;
 Object.assign(artwork.questions,batch.questions);
}
async function loadAsset(name,priority='auto',signal){
 if(loadedAssets.has(name))return;
 const part=await window.studyPages.asset(name,priority,signal);
 if(name.startsWith('cards/'))mergeCard(part);
 else if(name.startsWith('materials/'))mergeMaterial(part);
 else if(name.startsWith('parts/')){
  for(const [id,fields] of Object.entries(part.qs||{}))Object.assign(qs[id],fields);
  for(const [id,fields] of Object.entries(part.nodes||{}))Object.assign(nodes[id],fields);
  Object.assign(mats,part.mats);
 }
 loadedAssets.add(name);
}
const paperAsset=id=>'parts/'+window.kbGraph.parts.papers[qs[id].paper];
const hasQuestion=id=>typeof qs[id]?.stem==='string';
const cardAsset=id=>'cards/'+(view.packs?.[id]||view.questions?.[id]?.card);
const $=id=>window.document?.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=esc, clip=(s,n=80)=>s.length>n?s.slice(0,n)+'…':s;
const all=Object.values(nodes).sort((a,b)=>a.priority-b.priority||b.qs.length-a.qs.length||a.title.localeCompare(b.title,'zh-CN'));
const byTitle=new Intl.Collator('zh-CN',{numeric:true});
let choices={},drafts={},manual=[],reveal=new Set();
const STORE='gongkao.knowledge-training.v1';
const canonicalId=id=>redirects[id]||id;
try {
 const v=JSON.parse(localStorage.getItem(STORE)||'{}');
 for(const edge of v.manual||[]){
  const n=canonicalId(edge.n), q=edge.q;
  if(!nodes[n]||!qs[q]||!['直接考查','解题依据'].includes(edge.role)||baseEdge(n,q))continue;
  const prior=localEdge(n,q);
  if(!prior)manual.push({...edge,n});
  else if(edge.role==='直接考查')prior.role=edge.role;
 }
 choices=v.choices||{};drafts=v.drafts||{};
}catch{}
function save(){try{const saved=JSON.parse(localStorage.getItem(STORE)||'{}');localStorage.setItem(STORE,JSON.stringify({manual:view?(saved.manual||[]):manual,choices:{...saved.choices,...choices},drafts:{...saved.drafts,...drafts}}));return true;}catch{notify('此浏览器无法保存，改动仅在本次打开时有效。');return false;}}
function notify(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2600);}
function refTitle(q){return q.paper+' · 第 '+q.n+' 题';}
const sourceFolders = {".pdf": "pdfs/lectures/", ".docx": "docs/"};
function originalHref(path) {
  return window.kbProtectedDownloads ? 'download.html?file=' + encodeURIComponent(path.split('/').map(s=>decodeURIComponent(s)).join('/')) : path;
}
function sourceUrl(name) {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  const folder = /^[0-9a-f]{20}[.]pdf$/.test(name) ? 'pdfs/exams/' : (sourceFolders[ext] || '');
  return originalHref(folder + encodeURIComponent(name));
}
function sourceLink(ref,text){return '<a target="_blank" rel="noopener" href="'+attr(sourceUrl(ref[0])+'#page='+ref[1])+'">'+esc(text||'原卷第 '+ref[1]+' 页')+'</a>';}
function localEdge(n,q){return manual.find(e=>e.n===n&&e.q===q);}
function baseEdge(n,q){return qs[q]?.links?.find(l=>l.id===n);}
function related(n){return [...new Set([...nodes[n].qs,...manual.filter(e=>e.n===n).map(e=>e.q)])];}
function reviewedUse(n,q){return nodes[n]?.aspects?.flatMap(a=>a.uses).find(u=>u.qids.includes(q));}
function rel(n,q){return reviewedUse(n,q)?.role||baseEdge(n,q)?.role||localEdge(n,q)?.role||'';}
function groups(node){
 if(node.publishedSets)return node.publishedSets;
 if(node.practiceSets)return node.practiceSets;
 if(skillLessons[node.id]){
  const sets=practiceSetsOf(skillLessons[node.id].sets);
  const added=manual.filter(e=>e.n===node.id&&!node.qs.includes(e.q)).map(e=>e.q);
  if(added.length)sets.push({name:'手动关联的题目',ids:added});
  return sets;
 }
 const definitions=node.id==='s-base'?[
  {name:'基础计算',ids:['江苏 2023 A类 行测#131','国考 2025 副省级 行测#133']},
  {name:'还原后比较',ids:['国考 2024 地市级 行测#111','国考 2024 行政执法 行测#127','江苏 2024 A类 行测#129']}
 ]:(node.trainingGroups||[]);
 const result=[], assigned=new Set();
 const copies=skillCopies.get(node.id);
 const add=(name,ids)=>{
  const units=[];
  for(const id of ids){
   if(assigned.has(id))continue;
   const unit=copies?.get(id)||[id];
   units.push([id,...unit.filter(other=>other!==id)]);
   for(const other of unit)assigned.add(other);
  }
  if(units.length)result.push({name,ids:units.map(unit=>unit[0]),units});
 };
 for(const g of definitions){
  const batch=g.ids.filter(id=>node.qs.includes(id)&&!assigned.has(id));
  if(batch.length)add(g.name,batch);
 }
 const materials=new Map();
 for(const id of node.qs){
  const q=qs[id];
  if(assigned.has(id)||!q.m.length)continue;
  const key=JSON.stringify([q.paper,...q.m]);
  if(!materials.has(key))materials.set(key,[]);
  materials.get(key).push(id);
 }
 for(const batch of materials.values()){
  if(batch.length>1)add(qs[batch[0]].paper+' · 第 '+batch.map(id=>qs[id].n).join('、')+' 题共用材料',batch);
 }
 const rest=node.qs.filter(id=>!assigned.has(id));
 if(rest.length)add(result.length?'其余同技能题目':node.title,rest);
 const added=manual.filter(e=>e.n===node.id&&!assigned.has(e.q)).map(e=>e.q);
 if(added.length)add('手动关联的题目',added);
 return result;
}
function figureImages(section,label,zoom=true){
 return (section?.clips||[]).map(c=>{
  const [left,top,right,bottom]=c.box,url='assets/figures/'+c.file;
  const alt=label+'（原卷第 '+c.src[1]+' 页）';
  const priority=path?.startsWith('practice/')?'loading="eager" fetchpriority="high"':'loading="lazy"';
  const img='<img class="questionPic" '+priority+' decoding="async" width="'+Math.ceil((right-left)*4/3)+'" height="'+Math.ceil((bottom-top)*4/3)+'" src="'+attr(url)+'" alt="'+attr(alt)+'">';
  return zoom?'<a class="figureZoom" href="'+attr(url)+'" target="_blank" rel="noopener" title="打开原图">'+img+'</a>':img;
 }).join('');
}
function questionStem(id){
 const q=qs[id],section=window.kbQuestionFigures.questions[id]?.stem;
 return (section?.inline?'':'<p class="stem">'+esc(pdfReadingText(q.stem))+'</p>')+
  figureImages(section,section?.inline?q.stem:'第 '+q.n+' 题题图');
}
function figurePageLinks(sections){
 const refs=new Map();
 for(const section of sections)for(const {src} of section.clips)refs.set(src.join('#'),src);
 return refs.size?'<small class="figurePages">配图原页　'+[...refs.values()].map(ref=>sourceLink(ref,'第 '+ref[1]+' 页')).join(' · ')+'</small>':'';
}
function questionMaterials(id,expanded=false){
 const q=qs[id];
 if(!q.m.length)return '';
 let hasImages=false;
 const blocks=q.m.map(k=>{
  const [name,txt,ref]=mats[k],section=window.kbQuestionFigures.materials[q.paper+'|'+name];
  if(section)hasImages=true;
  return '<div class="sourceRule"><b>'+esc(name)+'</b>　'+sourceLink(ref,'材料原页')+'</div>'+
   (section?.inline?'':'<div class="fulltext">'+esc(pdfReadingText(txt))+'</div>')+figureImages(section,'给定材料 '+name)+
   (section?figurePageLinks([section]):'');
 }).join('');
 if(hasImages)return '<section class="illustratedMaterial" aria-label="给定材料">'+blocks+'</section>';
 return '<details'+(expanded?' open':'')+'><summary>给定材料 · '+q.m.length+'</summary>'+blocks+'</details>';
}
function questionChoices(id,pick,shown,locked=false){
 const q=qs[id],parts=window.kbQuestionFigures.questions[id]||{};
 return '<div class="choices" role="group" aria-label="选择答案">'+['A','B','C','D'].map((letter,i)=>{
   const chosen=pick===letter;
   const result=shown && letter===q.answer?' right':shown && chosen?' wrong':'';
   const section=parts[letter],text=pdfReadingText(q.options[i]||'');
   const body=(section?.inline||text===letter?'':esc(text))+figureImages(section,letter+' 项'+(text?' '+text:''),false);
   return '<button type="button" class="choice'+(chosen?' chosen':'')+result+'" data-choice="'+letter+
     '" aria-pressed="'+chosen+'"'+(locked?' disabled':'')+'><b>'+letter+'</b><span>'+body+'</span></button>';
 }).join('')+'</div>';
}
function work(id){
 const q=qs[id],shown=reveal.has(id),pick=choices[id],editable=!!q.answer,links=[...new Set([...q.links.map(l=>l.id),...manual.filter(e=>e.q===id).map(e=>e.n)])];
 const link=baseEdge(node.id,id);
 const origin=node.practiceSets&&q.mod!==node.type?' · '+q.mod:'';
 let h='<div class="work" data-work="'+attr(id)+'"><div class="work-head"><span>'+esc(refTitle(q)+origin)+'</span>'+(q.state==='待核'?'<span class="warn">关联信息待核实</span>':'')+sourceLink(q.src)+'</div>';
 if(node.mode==='s' && link){
  const points=[...new Set([link,...(link.additionalEvidence||[])].filter(e=>e.origin==='逐题标记').map(e=>e.label))];
  if(points.length && (points.length>1 || points[0]!==node.title))
   h+='<p class="questionFocus"><b>本题练习</b> '+points.map(esc).join('、')+'</p>';
 }
 if(id==='江苏 2023 A类 行测#131'&&q.m.length){
  const excerpt=mats[q.m[0]][1].match(/2021年，我国对外贸易总额[^，]+，比上年增长[0-9.]+%/);
  if(excerpt)h+='<p class="mat"><b>材料摘录</b>　'+esc(excerpt[0])+'。</p>';
 }
 h+=questionMaterials(id);
 h+=questionStem(id);
 if(editable){
   if(q.options.length!==4)h+='<p class="note">选项详见题干或原页，点选答案字母。</p>';
   h+=questionChoices(id,pick,shown)+figurePageLinks(Object.values(window.kbQuestionFigures.questions[id]||{}));
 }else h+='<label class="note">作答草稿<textarea class="draft" data-draft="'+attr(id)+'" placeholder="写下要点…">'+esc(drafts[id]||'')+'</textarea></label>';
 if(!node.practiceSets || pick)h+='<div class="actions"><button class="'+(shown?'outline':'primary')+'" data-reveal>'+ (shown?'收起解析':(editable?'查看解析':'查看参考写法'))+'</button></div>';
 if(shown){
  const mark=!q.answer?'参考写法':pick?(pick===q.answer?'答对了 · ' : '已选 '+pick+' · ')+'参考答案 '+q.answer:'参考答案 '+q.answer;
  h+='<div class="answerbox"><strong>'+esc(mark)+'</strong>　'+sourceLink(q.asrc,'解析原页')+'<div class="fulltext">'+esc(pdfReadingText(q.analysis))+'</div></div>';
  if(id==='江苏 2023 A类 行测#131')h+='<div class="calculation">基期贸易额 = 6.9 ÷ (1 + 30.2%) ≈ 5.30 万亿美元</div>';
  const audited=reviewedUse(node.id,id);
  if(audited)h+='<div class="callout"><b>'+esc(audited.role)+' · '+esc(node.title)+'</b><p>'+esc(audited.use)+'</p><div class="quote">'+esc(pdfReadingText(audited.evidence))+'</div><small>引文见 '+esc(refTitle(qs[audited.qids[0]]))+'</small></div>';
  else if(link)h+='<div class="callout"><b>'+esc(link.role)+' · '+esc(node.title)+'</b><div class="quote">'+esc(pdfReadingText(link.quote))+'</div><p>'+esc(link.why)+'</p></div>';
  h+=questionReadings(node,id);
  if(link?.additionalEvidence?.length)h+=fold('其他标记题据',link.additionalEvidence.map(e=>'<blockquote>'+esc(pdfReadingText(e.quote))+'</blockquote><p>'+esc(e.why)+'</p>').join(''),'evidence-'+id);
  if(q.notes.length)h+='<p class="warn">'+esc(q.notes.join(' '))+'</p>';
 }
 const linked=links.filter(id=>id!==node.id && !nodes[id].basisGroup).map(id=>nodes[id]);
 const linkedTerms=linked.filter(n=>n.mode==='k').sort(heatOrder);
 const linkedSkills=linked.filter(n=>n.mode==='s');
 const basic=links.filter(n=>nodes[n].basisGroup).sort((a,b)=>heatOrder(nodes[a],nodes[b]));
 if((!node.practiceSets||shown)&&basic.length)h+='<details class="basics"><summary>本题用到的计算依据</summary>'+basic.map(n=>'<p>'+(nodes[n].review?'<button class="tag" data-basis="'+attr(n)+'">'+esc(nodes[n].title)+'</button>':esc(nodes[n].title))+'</p>').join('')+'</details>';
 if(!node.practiceSets||shown)h+='<div class="linkbar"><span>本题关联</span>'+[...linkedTerms,...linkedSkills].map(nodeButton).join('')+'<button class="outline" data-attachn="'+attr(id)+'">＋ 关联条目</button></div>';
 return h+'</div>';
}
async function openPicker(kind,qid=''){
 picker={kind,qid,nid:node.id};pickLimit=30;
 $('dialogTitle').textContent=kind==='q'?'关联题目':'关联条目';
 const input=$('pickSearch');input.value='';input.placeholder=kind==='q'?'输入卷名、题号或题干关键词':'输入知识点或技能名称';$('role').value='直接考查';
 $('dialog').showModal();input.focus();
 if(kind==='q' && !window.kbStems){
  $('picks').textContent='正在读取题目目录…';
  try{await loadAsset('question-stems');}catch{if(picker)$('picks').textContent='题目目录读取失败，请关闭后重试。';return;}
 }
 picks();
}
function picks(){
 if(!picker || (picker.kind==='q'&&!window.kbStems))return;
 const word=$('pickSearch').value.trim().toLowerCase(), words=word.split(/\s+/).filter(Boolean);
 let records=picker.kind==='q'?Object.entries(qs).map(([id,q])=>({id,title:refTitle(q),sub:window.kbStems[id],n:picker.nid,q:id,search:id+' '+refTitle(q)+' '+window.kbStems[id]+' '+q.task})):
 all.map(n=>({id:n.id,title:n.title,sub:(n.mode==='k'?'知识点':'技能训练')+' · '+n.type,n:n.id,q:picker.qid,search:[n.title,...n.aliases,n.type].join(' ')}));
 records=records.filter(r=>words.every(w=>r.search.toLowerCase().includes(w)));
 if(!word)records.sort((a,b)=>Number(!!localEdge(b.n,b.q))-Number(!!localEdge(a.n,a.q))||Number(!!baseEdge(b.n,b.q))-Number(!!baseEdge(a.n,a.q)));
 $('picks').innerHTML=records.slice(0,pickLimit).map(r=>{
  const edge=baseEdge(r.n,r.q),local=localEdge(r.n,r.q);
  const act=edge?'<span class="note">'+esc(rel(r.n,r.q))+' · 已关联</span>':local?'<button class="outline" data-unlink>撤销关联</button>':'<button class="outline" data-link>关联</button>';
  return '<div class="pick" data-pn="'+r.n+'" data-pq="'+attr(r.q)+'"><div><b>'+esc(r.title)+'</b><small>'+esc(clip(r.sub,85))+'</small>'+(local?'<span class="badgelocal">'+esc(local.role)+' · 手动</span>':'')+'</div>'+act+'</div>';
 }).join('')+(records.length>pickLimit?'<button class="more" data-pickmore>显示更多结果 ↓</button>':'')+(!records.length?'<p class="empty">没有匹配结果</p>':'');
}

;
// 仅在阅读时接合物理行。原页、引文定位和检索数据仍使用原始文本。
function pdfReadingText(text, title = '') {
  if (!text || !/[\r\n]/.test(text)) return text || '';
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  const item = /^(?:[①-⑳]|[A-D][.．、]|[A-D]\s*项[，、：正错]|[（(][一二三四五六七八九十百\d]+[）)]|\d+[.．、](?!\d)|[一二三四五六七八九十百]+[、．]|第[一二三四五六七八九十\d]+步[，、：:]|【|——|(?:要求|解析|参考答案说明|参考答案|答题思路)[：:]|故正确答案为)/;
  const label = /^(?:材料\s*[一二三四五六七八九十\d]+|给定[资材]料|作答要求|【[^】]{1,12}】|[（(][一二三四五六七八九十\d]+[）)]|[A-D][.．、]|(?:解析|答案|参考答案)[：:])$/;
  const letterLine = /^(?:(?:尊敬的|亲爱的|各位|同志们|同学们).{0,24}[：:]|(?:建议人|倡议人|发言人|署名)[：:].{1,16}|[×Xx〇一二三四五六七八九十\d]{2,4}年[×Xx〇一二三四五六七八九十\d]{1,3}月[×Xx〇一二三四五六七八九十\d]{1,3}日)$/;
  const closed = /[。！？!?；：:][”’」』）)\]]*$/;
  const punctuation = /^[，。；：、！？）》」』”’％%]/;
  const stripNumber = s => s.replace(/^(?:考点[一二三四五六七八九十百]+|[一二三四五六七八九十百]+[、．]|\d+[.．、](?!\d))\s*/, '').replace(/\s+/g, '');
  const heading = stripNumber(title);
  const blocks = [];
  let previous = '', paragraph = '', gap = false, previousLayout = false;
  function topicHeading(s) {
    return /^考点[一二三四五六七八九十百]+\s/.test(s);
  }
  function unfinishedHeading(s) {
    return /《[^》]*$|（[^）]*$|\([^)]*$/.test(s);
  }
  function isHeading(s) {
    return label.test(s) || letterLine.test(s) || (heading && stripNumber(s) === heading) ||
      topicHeading(s);
  }
  function isLayoutRow(raw, s) {
    // 对齐的数据栏与并排的选项需要行边界；普通句子里的填空仍留在句中。
    if (/^\s{8,}\d{1,4}\s*$/.test(raw) || /[A-D][.．、].*\s{2,}[A-D][.．、]/.test(s)) return true;
    const cells = s.split(/ {2,}|\t+/);
    return cells.length > 1 && cells.every(cell => cell.length <= 16 && !/[，。！？；“”《》（）]/.test(cell));
  }
  for (const raw of rows) {
    const line = raw.trim();
    if (!line) { gap = true; continue; }
    const aligned = isLayoutRow(raw,line);
    // 正文有时每一物理行之间都有空行。句中空行本身不足以判定换段。
    const shortTitle = !blocks.length && paragraph === previous && previous.length <= 26 && !/[，。；：、]/.test(previous);
    const indented = /^\s{2,}\S/.test(raw);
    const continuingTitle = topicHeading(paragraph) && unfinishedHeading(paragraph);
    const boundary = previous && !continuingTitle && (aligned || previousLayout || isHeading(paragraph) ||
      (!punctuation.test(line) && (item.test(line) || isHeading(line) || closed.test(previous) ||
        (indented && (shortTitle || gap && previous.length <= 22) && !/[，、（(“]$/.test(previous)))));
    if (boundary) {
      blocks.push(paragraph);
      paragraph = '';
    }
    if (paragraph && /[A-Za-z]$/.test(previous) && /^[A-Za-z]/.test(line)) paragraph += ' ';
    paragraph += aligned ? raw.trimEnd() : line;
    previous = line;
    previousLayout = aligned;
    gap = false;
  }
  if (paragraph) blocks.push(paragraph);
  return blocks.join('\n');
}

;
const classPrompts = {
  facts:'某件事发生在何时何地，对应哪次会议、哪份文件或哪项任务？',
  concepts:'这个词语或政策术语准确指什么，换一个近义词会改变哪一层含义？',
  principles:'在什么前提下，这一数学、逻辑或社会运行关系才成立？',
  rules:'哪类主体拥有什么职权，适用哪些程序、条件或例外？',
  methods:'遇到特定决策准则、单位换算或调研规范时，按什么步骤处理？',
  arguments:'材料里的核心主张是什么，需要哪些依据，结论能推多远？'
};
const topicGroups = [
  ['经济产业',['innovation','industry','market','open','finance','ip']],
  ['公共治理',['law','party','digital','governance']],
  ['社会民生',['rural','modern','employment','regional']],
  ['文化生态',['culture','ecology']]
];
const featuredEvents = {
  2026:[
    ['94fd2d7ef9a6','扩大内需、乡村全面振兴与重点领域风险防范等年度目标和举措。'],
    ['6a94c2ad76dd','2026年10月全会公报要点与配套解读词条。'],
    ['6cfbc5f4b768','规划纲要的核心框架与主要指标。'],
    ['40e79121c3f6','2026年农业农村现代化与乡村全面振兴意见要点。']
  ],
  2025:[
    ['3fa550c09f13','阶段目标、因地制宜发展新质生产力与地区规划部署。'],
    ['48ec22c382da','县域经济、高标准自贸区网络与年度改革任务。'],
    ['a99b735e426d','现代农业建设首要任务与县城、小城镇功能分工。'],
    ['cae160794cec','2025年4月会议明确的周边工作理念方针与定位。']
  ],
  2024:[
    ['26cc3fcc655d','财税体制改革、收入分配、对外开放与科研、民营经济部署。'],
    ['bbc98bc0a06e','扩大职业伤害保障试点等就业政策要求。'],
    ['c643ac279ffc','面向2025年工作年度的举措归属与任务部署。']
  ],
  2023:[
    ['775e9c515af9','2023年10月会议明确的金融资源投向与政策口径。'],
    ['db4c6adf3942','2023年7月大会提出的四项转变与保障措施。'],
    ['843923170257','会议指示明确的首要政治任务。'],
    ['f6e1c7a4ecc4','2023年7月考察提出的四项任务与江苏卷对应举措。']
  ]
};
const skillPrompts = {
  '政治理论':'从原卷真题或专项题练习原理对应、政策举措和制度表述。',
  '常识判断':'从案例判断法律责任，从现象推断科学机制，或用时间、地点核对史实。',
  '言语理解与表达':'结合语境与搭配该选哪个词，哪句话准确概括了文段主旨？',
  '数量关系':'怎样把行程、几何、和差倍比等文字条件写成方程或计数式？',
  '判断推理':'给定图形规律、题内定义或多条约束条件，怎样推出唯一结论？',
  '资料分析':'面对统计图表，怎样找准指标、时期与单位并完成增长、比重比较？',
  '归纳概括':'几则材料分别写了什么，哪些要点可以合并、哪些差异必须保留？',
  '综合分析':'材料里的这句话怎样理解，一种做法为何在这里有效、换到别处有何启示？',
  '提出对策':'问题出在哪个环节，由谁采取什么措施？',
  '应用文写作':'以什么身份写给谁，对方读完需要知道什么、做什么？',
  '文章写作':'准备论证什么判断，材料中的事例怎样支持这个判断？'
};
function guideRow({address,title,count,description}) {
  return '<a class="guideRow" data-route="'+attr(address)+'" href="#'+attr(address)+'"><strong>'+esc(title)+'</strong>'+
    '<small>'+esc(count)+'</small>'+(description?'<span>'+esc(description)+'</span>':'')+'</a>';
}
function guideIntro(...paragraphs) {
  return '<div class="guideIntro">'+paragraphs.map(p=>'<p>'+p+'</p>').join('')+'</div>';
}
const skillIntroductions={
  '政治理论':'读材料时先找它描述的关系，再判断对应的理论原理。遇到文件题，分清政策要达到的目标、负责的主体和落实的举措。',
  '常识判断':'法律案例先找当事人和有权处理的机关，再核对适用条件。科技与地理题从现象追到机制，历史人文题则要把人物、作品和事件放回对应的时代。',
  '言语理解与表达':'选词填空可从搭配对象、转折和上下句呼应入手。片段阅读先区分作者的主张与例证，语句排序再看指代和前后衔接。',
  '数量关系':'先圈出题目所求的量。行程和工程题把速度、效率与时间对应起来；排列组合题先看顺序和限制条件，再决定怎样计数。',
  '判断推理':'图形题比较位置、数量或结构的变化；定义判断把条件逐项代入案例；论证题先找结论和理由，再看选项怎样改变两者的联系。',
  '资料分析':'先在材料中对准时期、指标和单位，再判断所求的是增长量、增长率、比重还是倍数。共用材料的题可以来回对照原表和图。'
};
const supplementPoolTitle='练习册补充题';
function isSupplement(id) {
  return qs[id].mod==='政治理论专项';
}
function practiceCount(ids) {
  const special=ids.filter(isSupplement).length;
  return [ids.length>special?(ids.length-special)+' 道真题':'',special?special+' 道练习册题':''].filter(Boolean).join(' · ');
}
function examOverview(paragraphs,pools) {
  const ids=pools.flatMap(p=>p.ids);
  const books=[...new Set(ids.filter(isSupplement).map(id=>'《'+esc(qs[id].paper)+'》'))];
  const links=pools.map(p=>'<a class="practicePool" data-route="'+attr(p.address)+'" href="#'+attr(p.address)+'">'+
    '<strong>'+esc(p.title)+'</strong><span>'+p.ids.length+' 道 <i aria-hidden="true">→</i></span></a>').join('');
  return guideIntro(...paragraphs)+'<section class="practiceBank" aria-labelledby="practiceBankTitle">'+
    '<h2 id="practiceBankTitle">按来源练习'+(pools.length>1?'<small>共 '+ids.length+' 道</small>':'')+'</h2>'+
    '<nav aria-label="按题目来源练习">'+links+'</nav>'+
    (books.length?'<p class="practiceSource">补充题选自'+books.join('、')+'。</p>':'')+'</section>';
}
function skillOverview(module){
  const paragraphs=[skillIntroductions[module]];
  if(module==='政治理论'){
    const {exams}=practiceModules[module];
    const own=exams.filter(unit=>qs[unit[0]].mod===module).length;
    paragraphs.push('真题含政治理论原卷 '+own+' 道、历年常识判断中的政治题 '+(exams.length-own)+' 道。');
  }
  const pools=modulePools.get(module).map(p=>({title:p.title,address:slugFor(p),ids:p.practiceSets[0].ids}));
  return examOverview(paragraphs,pools)+'<h2 class="practiceCategories">分类训练</h2>';
}
function guideGroup(title,body,count='') {
  return '<section class="guideGroup"><h2>'+esc(title)+(count?' <small>'+esc(count)+'</small>':'')+'</h2>'+body+'</section>';
}
function classHome() {
  const total=publicTerms.length.toLocaleString('zh-CN');
  const intro=guideIntro('全库'+total+'个词条按知识性质分为六类。时间、地点与会议出处归在<strong>事实与事件</strong>，近义词与术语辨析归在<strong>概念与词义</strong>，公式与成立条件归在<strong>原理与机制</strong>，主体职权与适用程序归在<strong>制度与规则</strong>，单题用到的特定算法或调研做法归在<strong>方法与技能</strong>，材料主张与论证范围归在<strong>观点与论证</strong>。',
    '收录范围包括真题词条与讲义补充词条；按题型成组刷题在顶部的'+controlLink('skills/xingce','技能训练')+'。');
  const rows=courses.map(c=>guideRow({address:tocAddress(path,c.id),title:c.name,
    count:publicTerms.filter(n=>n.type===c.name).length+' 条',description:classPrompts[c.id]}));
  return intro+rows.join('')+'<p class="guideMore">'+controlLink('index/class/all','按考查热度浏览全部'+total+'个词条')+'</p>';
}
function topicRow(t) {
  return {address:'index/topic/'+t.slug,title:t.title,count:t.questions.length+' 题',description:t.question};
}
function topicHome() {
  const example=controlLink('index/topic/governance','基层治理与群众参与');
  const intro=guideIntro('分类页把词条按知识性质拆开，主题页把同一个现实议题下的真题、词条与讲义补充收在一起。以'+example+'为例，居民协商、矛盾化解、社区服务三条线跨年份并列呈现，行测与申论对同一议题的考法可以对照查看。',
    '全库共整理'+study.topics.length+'个专题，下方按领域分组列出。');
  const topics=new Map(study.topics.map(t=>[t.slug,t]));
  const groups=topicGroups.map(([name,slugs])=>{
    const rows=slugs.filter(slug=>topics.has(slug)).map(slug=>{
      const t=topics.get(slug);topics.delete(slug);return guideRow(topicRow(t));
    });
    return rows.length?guideGroup(name,rows.join('')):'';
  });
  if(topics.size)groups.push(guideGroup('其他专题',[...topics.values()].map(t=>guideRow(topicRow(t))).join('')));
  return intro+groups.join('');
}
function eventRow(e,withYear=false) {
  const questions=e.questions.length, sources=e.supplement?.length||0;
  const count=[questions?questions+' 题':'',sources?sources+' 条资料':''].filter(Boolean).join(' · ');
  const example=featuredEvents[e.year]?.find(([id])=>id===e.slug);
  return {address:'index/event/'+e.slug,title:e.title,count:(withYear?e.year+' 年 · ':'')+count,description:example?.[1]||''};
}
function eventHome() {
  const meeting=study.events.find(e=>e.slug==='26cc3fcc655d');
  const example=meeting?'，例如2024年'+controlLink('index/event/'+meeting.slug,meeting.title)+'关联'+meeting.questions.length+'道题，涉及财税体制改革、收入分配与对外开放':'';
  const intro=guideIntro('这里按年份归集重要会议、文件与讲话。2023至2025年以真题关联事件为主，同一场会议在不同试卷里常考不同方向'+example+'。2026年条目主要来自时政讲义与文件解读，如'+controlLink('index/event/94fd2d7ef9a6','政府工作报告')+'与'+controlLink('index/event/6a94c2ad76dd','党的二十届五中全会')+'。');
  const groups=eventYears.map(year=>{
    const events=study.events.filter(e=>e.year===year);
    const linked=events.filter(e=>e.questions.length).length;
    const route='index/event/'+year;
    if(events.length===1){
      const e=events[0];
      return '<p class="guideMore">'+year+'年 · '+(linked?'真题关联':'讲义补充')+'　'+controlLink('index/event/'+e.slug,e.title)+'</p>';
    }
    const featured=featuredEvents[year];
    const selected=featured?featured.map(([slug])=>events.find(e=>e.slug===slug)).filter(Boolean):events.slice(0,4);
    const footer='<p class="guideMore">'+controlLink(route,'查看'+year+'年全部'+events.length+'项事件')+'</p>';
    return guideGroup(year+'年',selected.map(e=>guideRow(eventRow(e))).join('')+footer,
      '共'+events.length+'项 · '+(linked?linked+'项含真题':'讲义与热点资料'));
  });
  return intro+groups.join('');
}
function skillsHome(directory) {
  const total=directory.sections.reduce((sum,[,items])=>sum+items.length,0);
  let intro;
  if(directory.subject==='行测'){
    intro=guideIntro('同样带数字的题，<strong>数量关系</strong>侧重把文字条件写成方程或分类计数，<strong>资料分析</strong>侧重先从统计材料里定位时期、指标与单位再估算；同样读文字，<strong>言语理解与表达</strong>看语境和文段意图，<strong>判断推理</strong>看图形规律、题内定义与约束条件。',
      '各模块的专题概览可进入全部真题，也可按考点选题。题后可查相应的'+controlLink('index/class','知识词条')+'。');
  }else{
    const first=qLink('江苏 2025 A类 申论#1','s-c898afc5816920c2','第一题');
    const last=qLink('江苏 2025 A类 申论#4','s-b8139af04b609dce','第四题');
    intro=guideIntro('江苏2025年A类卷写到，一些年轻人体验《大梦·红楼》沉浸展后，决定回去重读《红楼梦》。在'+first+'里，这个细节落成一句成效：沉浸式体验激发了年轻人阅读原著的兴趣；到了'+last+'，用来论述文化创新时，还要解释展览改变年轻人接触经典的方式后，为什么能把人重新带回作品。',
      '同一份给定材料，设问不同，留下的事实、要解释的关系与面向的读者都会跟着变。全库'+total+'项申论技能按五类题型分列。');
  }
  return intro+skillModuleOrder(directory.subject).map(module=>{
    if(module===wordingTitle)return wordingHome();
    const pools=modulePools.get(module);
    if(pools){
      const pages=modulePracticeLists.get(module);
      return guideRow({address:tocAddress(path,module),title:module,description:skillPrompts[module],
        count:(pages?pages.length+' 类':skillsByModule.get(module).length+' 项技能')+' · '+
          practiceCount(pools.flatMap(p=>p.practiceSets[0].ids))});
    }
    const items=skillsByModule.get(module);
    return guideRow({address:tocAddress(path,module),title:module,
      count:items.length+' 项技能 · '+new Set(items.flatMap(n=>n.qs)).size+' 题',description:skillPrompts[module]});
  }).join('');
}

;
const referenceBooks=window.kbBooks;
const strategyTabs=strategies.groups.map(group=>({
  route:'strategy/'+group.id,
  title:group.title,
  shortTitle:group.shortTitle||group.title
}));
const defaultStrategyRoute='strategy/'+(strategies.defaultGroup||strategies.groups[0]?.id||'prep');
const referencePages=new Map();
const chapterPaths=new Map();
const referenceRedirects=new Map();
const bookRouteRedirects=strategies.redirects||{};
const chapterRouteRedirects=strategies.chapterRedirects||{};
for(const book of referenceBooks){
  const bookPath='reference/'+book.id;
  referencePages.set(bookPath,{book,title:book.title});
  referenceRedirects.set(bookPath,bookRouteRedirects[bookPath]||defaultStrategyRoute);
  book.chapters.forEach((chapter,index)=>{
    const route=bookPath+'/'+index;
    const key=book.title+'|'+chapter.title;
    referencePages.set(route,{book,chapter,index,title:chapter.title});
    chapterPaths.set(key,route);
    referenceRedirects.set(route,chapterRouteRedirects[key]||referenceRedirects.get(bookPath)||defaultStrategyRoute);
  });
}
function referenceTarget(route){
  return referenceRedirects.get(route)||defaultStrategyRoute;
}

;
// 文档说明沿用《资料索引与备考路线》，文件、页数及包内目录来自当前原件。
const sourceDescriptions={
  '国考行测.zip':'2023—2025 年国考行测试卷与答案解析，涵盖副省级、地市级和行政执法三类卷。',
  '国考申论.zip':'2023—2025 年国考申论三类卷的给定材料、作答要求和参考解析，可按年份和卷别对读。',
  '江苏行测.zip':'江苏省考行测试卷及解析，含 2023 年 A、B 类，以及 2024、2025 年 A、B、C 类。',
  '江苏申论.zip':'江苏省考申论题本和解析，含 2023、2024 年 A、B、C 类及 2025 年 A、C 类。',
  '江苏省考A类申论22-24.zip':'2022—2024 年江苏 A 类申论原合卷，每个年度文件将试题与答案收在一起。',
  '政治理论必学手册.pdf':'前 13 页梳理基础理论，第 14—29 页整理新时代中国特色社会主义思想。',
  '国省考政治理论必刷100题.pdf':'第 1—30 页是 100 道专项练习，第 31—97 页可核对答案和解析。',
  '2027年国省考时政热点考前大盘点.pdf':'按会议讲话、重要文件、文章、法律、事件、科技进展和周年纪念汇编时政材料。',
  '《2026年政府工作报告》粉笔解读.pdf':'按上年工作回顾、年度总体要求和重点任务编排，包含报告摘登和机构解读。',
  '《中国共产党第二十届中央委员会第五次全体会议公报》解读.pdf':'第 2 页介绍会议概况，第 10 页起解读指导思想，第 12 页起梳理原则和部署。',
  '公务员考试应试指南_行测申论与国考江苏省考比较.docx':'对照国考与江苏省考的考试内容，列出考场时间分配方法和错题复盘表。',
  '申论写作应试指南_江苏A类与国考综合管理类.docx':'从材料阅读进入五类题型、大作文与机关应用文，末章附小题和作文复盘表。',
  '申论内容主题分布研究.docx':'按年份、卷别梳理申论主题，比较题型，并整理十大专题及六类跨领域关系。'
};
const originals=window.kbOriginals;
const originalById=new Map(originals.map(s=>[s.id,s]));
const originalBook=id=>referenceBooks.find(b=>b.id===id);
function originalRoute(raw){
  const parts=raw.split('/');
  if(parts.length===1)return {route:'about'};
  const source=originalById.get(parts[1]);
  if(!source || parts.length>3)return {route:'about'};
  if(parts.length===3 && !originalBook(source.id)?.chapters[Number(parts[2])])return {route:'sources/'+source.id};
  return {route:raw};
}
function originalLink(s,label){
  if(s.kind==='讲义与专项')return '<a href="'+attr(sourceUrl(s.file))+'" target="_blank" rel="noopener">'+esc(label)+'</a>';
  return controlLink('sources/'+s.id,label);
}
function originalBlock([tag,value]){
  if(tag==='table')return '<div class="referenceTable" tabindex="0"><table class="strategyTable">'+value.map((row,i)=>{
    const cell=i?'td':'th';
    return '<tr>'+row.map(t=>'<'+cell+'>'+esc(t)+'</'+cell+'>').join('')+'</tr>';
  }).join('')+'</table></div>';
  if(tag==='ul'||tag==='ol')return '<'+tag+'>'+value.map(t=>'<li>'+esc(t)+'</li>').join('')+'</'+tag+'>';
  return tag==='h2'?'<h2>'+esc(value)+'</h2>':'<p>'+esc(value)+'</p>';
}
function originalCatalogHtml(){
  return ['真题试卷','讲义与专项','备考指南'].map(kind=>{
    const rows=originals.filter(s=>s.kind===kind).map(s=>{
      const units=s.members?s.members.length+' 份 PDF':s.pages?s.pages+' 页':originalBook(s.id).chapters.length+' 章';
      return '<li><strong class="sourceItemTitle">'+originalLink(s,s.file)+'</strong><small>'+esc(units)+'</small><p>'+esc(sourceDescriptions[s.file]||'')+'</p></li>';
    }).join('');
    return '<div class="sourceGroup"><h3>'+kind+'</h3><ul class="sourceList">'+rows+'</ul></div>';
  }).join('');
}
function renderOriginals(){
  const [,id,chapter]=path.split('/');
  const source=originalById.get(id);
  if(!source){
    renderAbout();
    return;
  }
  const back=controlLink('about','关于与原始资料');
  let body='<p>'+esc(sourceDescriptions[source.file]||'')+'</p>';
  let title=source.file,crumb=back;
  if(source.members){
    body+='<ul class="sourceList">'+source.members.map(m=>'<li><a target="_blank" rel="noopener" href="'+attr(originalHref(m.href))+'">'+esc(m.name)+'</a><small>'+esc(m.paper)+' · '+m.pages+' 页</small></li>').join('')+'</ul>';
  }else if(source.kind==='备考指南'){
    const book=originalBook(id);
    const links=book.chapters.map((c,i)=>controlLink('sources/'+id+'/'+i,c.title));
    if(chapter!==undefined){
      const index=Number(chapter),c=book.chapters[index];
      title=c.title;crumb+=' / '+controlLink('sources/'+id,book.title);
      body='<div class="referenceProse">'+c.blocks.map(originalBlock).join('')+'</div><nav class="referencePaging" aria-label="切换章节">'+
        (index?controlLink('sources/'+id+'/'+(index-1),'上一章'):'')+
        (index+1<links.length?controlLink('sources/'+id+'/'+(index+1),'下一章'):'')+'</nav>';
    }else{
      title=book.title;
      body+='<p><a href="'+attr(sourceUrl(source.file))+'">打开 Word 原稿</a></p><ol class="sourceChapters">'+links.map(link=>'<li>'+link+'</li>').join('')+'</ol>';
    }
  }else body+=originalLink(source,'打开 PDF 原文');
  root.innerHTML='<article class="sourcePage"><nav class="practicePath" aria-label="资料位置">'+crumb+'</nav><h1>'+esc(title)+'</h1>'+body+'</article>';
}

;
const libraryKinds=['知识词条','技能','应考策略','原始资料','备考参考','题目','材料','知识专题','时政事件','知识点','专题','原页'];
const kindLabel=k=>({'知识点':'讲义知识点','专题':'讲义章节'}[k]||k);
const searchText=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
let libraryData;
let libraryPages;

function libraryReadingText(record){
  const {source,text,label}=record;
  if(record.k!=='专题' || source.first===source.last)return pdfReadingText(text,label);
  if(!libraryPages)libraryPages=new Map(window.kbLibrary.filter(r=>r.k==='原页').map(r=>[r.source.doc+'|'+r.source.first,r.text]));
  let reading=text;
  for(let n=source.first;n<source.last;n++){
    const page=libraryPages.get(source.doc+'|'+n);
    const next=libraryPages.get(source.doc+'|'+(n+1));
    // 必须与两侧原页吻合，才跳过页末独占一行的页码及随附的固定页脚。
    const end=page?.match(/([^\n]*\S[^\n]*)(\n(?:[ \t]*\n)*[ \t]{8,}\d{1,4}(?:\n[ \t]*本资料仅供内部交流使用)?)\s*$/);
    if(!end || !next?.trim())continue;
    const start=next.trimStart().split('\n')[0].trimEnd();
    const at=reading.indexOf(end[1]+end[2]);
    if(at<0)continue;
    const tail=reading.slice(at+end[1].length+end[2].length);
    if(tail.trimStart().startsWith(start))reading=reading.slice(0,at)+end[1]+tail;
  }
  return pdfReadingText(reading,label);
}

function libraryRecords(){
  if(libraryData)return libraryData;
  const rows=[...window.kbLibrary];
  for(const module of modulePools.keys()){
    rows.push({k:'技能',label:module+' · 专题概览',route:tocAddress('skills/xingce',module),
      text:skillIntroductions[module],tags:['行测',module,'全部真题']});
  }
  for(const [module,pages] of modulePracticeLists){
    for(const p of pages)rows.push({k:'技能',label:module+' · '+p.title,route:slugFor(p),
      text:[p.intro,...p.practiceSets.map(s=>s.name+' '+s.basis)].join(' '),tags:['行测',module]});
  }
  rows.push({k:'技能',label:'时政措辞辨析',route:wordingRoute,
    text:wordingTopic.groups.map(group=>group.name).join(' '),tags:['行测','政治理论']});
  for(const [route,group] of wordingGroupPages){
    rows.push({k:'技能',label:group.name,route,tags:['行测','政治理论','时政措辞辨析'],
      text:[group.summary,...group.points.flatMap(p=>[p.title,p.text]),...group.cards.map(c=>c.title)].join(' ')});
  }
  for(const s of originals){
    rows.push({k:'原始资料',label:s.file,route:s.kind==='讲义与专项'?'':'sources/'+s.id,
      href:s.kind==='讲义与专项'?sourceUrl(s.file):'',text:sourceDescriptions[s.file]||'',tags:[s.kind]});
    for(const m of s.members||[])rows.push({k:'原始资料',label:m.name,href:originalHref(m.href),paper:m.paper,text:s.file});
  }
  for(const n of all){
    const text=[textOf(n),n.review?.explanation,n.authority?.text,n.intro,n.method,...n.sources.map(s=>s.text),
      ...(n.supplement||[]).map(s=>s.text),...(n.aspects||[]).flatMap(a=>[a.title,...a.uses.map(u=>u.use)]),
      ...(n.readings||[]).flatMap(r=>[r.title,r.definition,r.explanation,r.evidence])].filter(Boolean).join(' ');
    const tags=[...(n.aliases||[]),...Object.values(n.tags||{}).flat(),n.domain,n.type,n.subject,
      ...(n.tags?.['专题']||[]).map(slug=>topicTitles.get(slug)),...(n.eventTags||[]).map(e=>e.title)];
    rows.push({k:n.mode==='s'?'技能':'知识词条',label:n.title,route:slugFor(n),text,tags});
  }
  for(const [route,page] of strategyPages){
    const sections=(page.sections||[]).flatMap(s=>[s.title,s.text,s.official,...(s.table||[]).flat(),
      ...(s.list||[]),...(s.links||[]).map(link=>link[1]),...(s.rules||[]).map(key=>strategies.rules[key]?.[0])]);
    rows.push({k:'应考策略',label:page.title,route,text:[page.intro,page.scope,page.summary,...sections].filter(Boolean).join(' ')});
  }
  for(const t of study.topics)rows.push({k:'知识专题',label:t.title,route:topicRow(t).address,
    text:[t.question,t.summary,...t.facets.map(f=>f.label)].join(' ')});
  for(const e of study.events)rows.push({k:'时政事件',label:e.title,route:eventRow(e).address,text:String(e.year)});
  libraryData={rows,index:new Map(),questions:new Map(rows.filter(r=>r.qid).map(r=>[r.qid,r])),
    materials:new Map(rows.filter(r=>r.k==='材料').map(r=>[r.paper+'|'+r.label,r]))};
  return libraryData;
}
function libraryAddress(filters={}){
  const query=new URLSearchParams(Object.entries(filters).filter(([,v])=>v)).toString();
  return 'search'+(query?'?'+query:'');
}
function libraryRoute(raw){
  const params=new URLSearchParams(raw.split('?')[1]);
  const filters=Object.fromEntries([...params].filter(([k])=>['kind','qid','paper','q','category','topic','module','ans'].includes(k)));
  if(raw.startsWith('library-legacy') && filters.kind==='备考参考'){
    const ref=chapterPaths.get(filters.paper+'|'+filters.q);
    if(ref)return {route:referenceTarget(ref)};
    const book=referenceBooks.find(b=>b.title===filters.paper);
    if(!filters.q && book)return {route:referenceTarget('reference/'+book.id)};
  }
  return {route:'library',filters};
}
function libraryRecordBody(r,data){
  const source=s=>sourceLink([s.file,s.page],'查看 PDF 原页 · '+s.first+(s.last!==s.first?'–'+s.last:''));
  const materialArt=x=>x.k==='材料'?window.kbQuestionFigures.materials[x.paper+'|'+x.label]:null;
  const textBlock=(text,section,label)=>(section?.inline?'':'<p class="originalText">'+esc(text)+'</p>')+
    figureImages(section,label)+(section?figurePageLinks([section]):'');
  const block=(label,x)=>{
    const section=materialArt(x);
    return '<details'+(section?' open':'')+'><summary>'+esc(label)+'</summary>'+source(x.source)+textBlock(pdfReadingText(x.text,x.label),section,label)+'</details>';
  };
  const parts=window.kbQuestionFigures.questions[r.qid],q=qs[r.qid];
  let body='<p>'+source(r.source)+'</p>';
  if(parts&&q&&q.options.length===4){
    body+=questionStem(r.qid)+q.options.map((text,i)=>{
      const letter='ABCD'[i],section=parts[letter];
      return '<div class="libraryOption"><b>'+letter+'</b> '+(text===letter||section?.inline?'':esc(pdfReadingText(text)))+figureImages(section,letter+' 项')+'</div>';
    }).join('')+figurePageLinks(Object.values(parts));
  }else body+=textBlock(libraryReadingText(r),materialArt(r),r.label);
  if(r.qid && qs[r.qid]?.links.length)body+='<p>'+qLink(r.qid,null,'查看本题关联的知识与技能')+'</p>';
  if(r.tags?.length)body+='<p>原解析考点　'+esc(r.tags.join('、'))+'</p>';
  if(r.basis)body+='<p class="note">'+esc([r.category,r.topic,r.basis].filter(Boolean).join(' · '))+'</p>';
  const related=[];
  for(const id of new Set([r.example,...(r.mentions||[])].filter(Boolean))){
    const question=data.questions.get(id);
    if(question)related.push('<a class="libraryRelated" data-toc-link href="#'+attr(libraryAddress({qid:id}))+'">'+esc(question.paper+' · '+question.label)+'</a>');
  }
  if(related.length)body+='<details><summary>'+(r.example?'查看例题':'题干提及此术语')+'（'+related.length+'）</summary>'+related.join('')+'</details>';
  for(const label of r.refs||[]){
    const m=data.materials.get(r.paper+'|'+label);
    if(m)body+=block(label,m);
  }
  if(r.paperContext){
    const rest=[...data.materials.values()].filter(m=>m.paper===r.paper && !r.refs.includes(m.label));
    if(rest.length)body+='<details><summary>本卷其余材料</summary>'+rest.map(m=>block(m.label,m)).join('')+'</details>';
  }
  if(r.answer)body+=block('参考答案与解析',r.answer);
  return body;
}
function renderLibrary(){
  const data=libraryRecords(),filters={...state.filters};
  const target=data.questions.get(filters.qid);
  if(target){filters.kind='题目';filters.paper=target.paper;delete filters.q;}
  else delete filters.qid;
  const kind=libraryKinds.includes(filters.kind)?filters.kind:'';
  const subset=kind?data.rows.filter(r=>r.k===kind):data.rows;
  if(kind!=='知识点'){delete filters.category;delete filters.topic;}
  if(kind!=='题目'){delete filters.module;delete filters.ans;}

  function select(name,label,values,caption=v=>v){
    const choices=[...new Set(values.filter(Boolean))];
    if(!choices.includes(filters[name]))delete filters[name];
    return '<label>'+label+'<select name="'+name+'"><option value="">全部</option>'+choices.map(v=>
      '<option value="'+attr(v)+'"'+(filters[name]===v?' selected':'')+'>'+esc(caption(v))+'</option>').join('')+'</select></label>';
  }
  const values=(field,rows=subset)=>[...new Set(rows.map(r=>r[field]).filter(Boolean))].sort(byTitle.compare);
  let fields=select('kind','内容类型',libraryKinds,kindLabel);
  if(kind==='知识点'){
    fields+=select('category','知识类别',values('category'));
    fields+=select('topic','知识主题',values('topic',subset.filter(r=>!filters.category||filters.category===r.category)));
  }
  const papers=values('paper',subset.filter(r=>(!filters.category||filters.category===r.category)&&(!filters.topic||filters.topic===r.topic)));
  if(papers.length)fields+=select('paper','试卷或资料',papers);
  if(kind==='题目')fields+=select('module','考试模块',values('module'));
  const back=state.from?'<button class="back" data-back="index/class">返回上一页</button>':'';
  root.innerHTML='<section class="searchPage libraryReader">'+back+'<h1>全库搜索</h1>'+
    '<form id="libraryForm" class="libraryForm" aria-label="筛选搜索结果">'+fields+
    (kind==='题目'?'<label class="libraryCheckbox"><input type="checkbox" name="ans"'+(filters.ans?' checked':'')+'>包含答案正文</label>':'')+
    '</form><p id="libraryCount" class="note" role="status"></p><div id="libraryResults"></div><button id="libraryMore" class="btn" hidden>再显示 40 条</button></section>';
  const form=$('libraryForm'),out=$('libraryResults'),more=$('libraryMore');
  let visible=[];
  function addRows(start,end){
    const fragment=document.createDocumentFragment();
    for(const r of visible.slice(start,end)){
      const row=document.createElement('div');
      row.className='libraryRow';
      const meta=[kindLabel(r.k),r.paper,r.topic].filter(Boolean).join(' · ');
      const chapter=r.k==='备考参考' && chapterPaths.get(r.paper+'|'+r.label);
      const route=r.route || (chapter && chapter.replace('reference/','sources/'));
      if(r.href){
        row.innerHTML='<small>'+esc(meta)+'</small><a target="_blank" rel="noopener" href="'+attr(r.href)+'">'+esc(r.label)+'</a>';
      }else if(route){
        row.innerHTML='<small>'+esc(meta)+'</small>'+controlLink(route,r.label,route);
      }else{
        const preview=libraryReadingText(r).replace(/\s+/g,' ').trim().slice(0,110);
        row.innerHTML='<small>'+esc(meta)+'</small><details><summary>'+esc(r.label)+'</summary></details><p class="libraryExcerpt">'+esc(preview)+'</p>';
        const details=row.querySelector('details');
        async function populate(){
          if(!details.open || details.childElementCount!==1)return;
          const loading=document.createElement('p');
          loading.textContent='正在读取…';details.append(loading);
          try{
            if(r.qid && qs[r.qid] && window.kbQuestionFigures.questions[r.qid])await loadAsset(paperAsset(r.qid));
            loading.outerHTML=libraryRecordBody(r,data);
          }catch{
            loading.textContent='资料读取失败。';
            const retry=document.createElement('button');retry.textContent='重新读取';
            retry.onclick=()=>{loading.remove();populate();};loading.append(retry);
          }
        }
        details.addEventListener('toggle',populate);
        if(filters.qid===r.qid && r.qid){details.open=true;populate();}
      }
      fragment.append(row);
    }
    out.append(fragment);more.hidden=end>=visible.length;
  }
  function refresh(){
    const word=searchText(filters.q);
    out.replaceChildren();
    if(!word && !kind && !filters.paper){
      visible=[];more.hidden=true;$('libraryCount').textContent='';return;
    }
    const hits=[];
    for(const r of subset){
      if(filters.qid && r.qid!==filters.qid)continue;
      if(['paper','module','category','topic'].some(k=>filters[k] && r[k]!==filters[k]))continue;
      let rank=2;
      if(word){
        let item=data.index.get(r);
        if(!item){
          item={title:searchText(r.label),id:searchText(r.qid),
            body:searchText([r.paper,r.label,r.qid,r.topic,r.category,r.module,...(r.tags||[]),r.text].join(' '))};
          data.index.set(r,item);
        }
        if(!item.body.includes(word)){
          if(kind&&!filters.ans)continue;
          item.answer??=searchText(r.answer?.text);
          if(!item.answer.includes(word))continue;
        }
        if(item.title===word || item.id===word)rank=0;
        else if(item.title.includes(word))rank=1;
      }
      hits.push({r,rank});
    }
    visible=hits.sort((a,b)=>a.rank-b.rank).map(h=>h.r);
    $('libraryCount').textContent=visible.length?'找到 '+visible.length.toLocaleString('zh-CN')+' 条':'没有符合条件的结果。';
    addRows(0,state.libraryLimit||40);
  }
  function saveFilters(){
    delete filters.qid;
    state.filters={...filters};state.libraryLimit=40;
    history.replaceState(state,'','#'+libraryAddress(filters));renderedHash=location.hash;
  }
  form.onchange=ev=>{
    const field=ev.target.name;if(field==='q')return;
    if(field==='kind')for(const key of ['category','topic','paper','module','ans'])delete filters[key];
    if(field==='category'){delete filters.topic;delete filters.paper;}
    if(field==='topic')delete filters.paper;
    filters[field]=field==='ans'?(ev.target.checked?'1':''):ev.target.value;
    saveFilters();renderLibrary();$('libraryForm').elements.namedItem(field)?.focus({preventScroll:true});
  };
  form.onsubmit=ev=>{ev.preventDefault();refresh();};
  more.onclick=()=>{const start=state.libraryLimit||40;state.libraryLimit=start+40;addRows(start,state.libraryLimit);};
  refresh();
}

;
'use strict';
const wordingRoute='practice/wording';
const wordingTitle='时政措辞辨析';
const wordingTopic=window.kbGraph.wording;
const wordingGroupPages=new Map(wordingTopic.groups.map(group=>[wordingRoute+'/'+group.slug,group]));
const wordingCards=wordingTopic.groups.flatMap(group=>group.cards);
const wordingSourceId=card=>card.qids.find(id=>!isSupplement(id))||card.qids[0];
const wordingPools=[
  {address:wordingRoute+'/all',name:'全部真题',cards:wordingCards.filter(card=>!isSupplement(wordingSourceId(card)))},
  {address:wordingRoute+'/supplement',name:supplementPoolTitle,cards:wordingCards.filter(card=>isSupplement(wordingSourceId(card)))}
].filter(pool=>pool.cards.length);
const wordingPracticePages=new Map([...wordingGroupPages,...wordingPools.map(pool=>[pool.address,pool])]);
if(view?.words)wordingPracticePages.set(view.key,view.words);
const wordingAnswers=window.kbWordingAnswers??=new Map();

function isWordingRoute(route) {
  return route===wordingRoute || wordingPracticePages.has(route);
}
function wordingAddress(route,id) {
  return id ? route+'?qid='+encodeURIComponent(id) : route;
}
function wordingDestination(raw) {
  const [route,query]=raw.split('?');
  const group=wordingPracticePages.get(route);
  if(!group)return {route:wordingRoute};
  const id=new URLSearchParams(query).get('qid');
  return id && group.cards.some(c=>c.qids[0]===id)?{route,question:id,scrollQuestion:true}:{route};
}
function wordingHome() {
  return guideRow({address:wordingRoute,title:wordingTitle,count:wordingTopic.groups.length+' 类 · '+practiceCount(wordingCards.map(wordingSourceId)),
    description:'从许可与义务、目标进度、制度权限等六类关系，辨认一个词怎样改变整句话的意思。'});
}
function wordingTree() {
  const links=[tocLink(wordingRoute,'','专题概览')];
  for (const [route,group] of wordingGroupPages) links.push(tocLink(route,'',group.name));
  return tocBranch('wording',wordingTitle,links.join(''),isWordingRoute(path));
}
function wordingSources(names) {
  if (!names.length) return '';
  const links=names.map(name=>'<a target="_blank" rel="noopener" href="'+attr(wordingTopic.sources[name])+'">'+esc(name)+'</a>');
  return '<p class="wordingSources">文件依据　'+links.join(' · ')+'</p>';
}
function wordingComparison(row) {
  const {part,quote,basis,focus=quote}=row;
  const start=quote.indexOf(focus);
  const excerpt=esc(quote.slice(0,start))+'<strong>'+esc(focus)+'</strong>'+esc(quote.slice(start+focus.length));
  return '<tr><th scope="row">'+esc(part)+'</th><td>'+excerpt+'</td><td>'+esc(basis)+'</td></tr>';
}
function wordingTerms(ids,owner) {
  return '<p class="wordingTerms">知识点　'+ids.map(id=>{
    const n=nodes[id];
    return controlLink(slugFor(n),n.title,owner+'/'+id);
  }).join(' · ')+'</p>';
}
function wordingFeedback(card,pick) {
  const id=card.qids[0],q=qs[id];
  const papers=card.qids.map(id=>{
    const q=qs[id];
    return '<li>'+esc(refTitle(q))+'　'+sourceLink(q.src,'试题第 '+q.src[1]+' 页')+' · '+
      sourceLink(q.asrc,'解析第 '+q.asrc[1]+' 页')+'</li>';
  });
  const result=pick===q.answer?'答对了，正确答案是 '+q.answer:'你选了 '+pick+'，正确答案是 '+q.answer;
  return '<section class="answerbox" aria-labelledby="wordingResult"><h3 id="wordingResult" tabindex="-1">'+esc(result)+'</h3>'+
    '<p><b>'+esc(card.title)+'</b></p><p>'+esc(card.explanation)+'</p>'+
    '<table aria-label="原题措辞对照"><thead><tr><th scope="col">小项</th><th scope="col">原题措辞</th><th scope="col">准确表述或适用条件</th></tr></thead><tbody>'+
    card.comparisons.map(wordingComparison).join('')+'</tbody></table>'+
    wordingTerms(card.entries,id)+wordingSources(card.references||[])+
    '<details data-memo="'+attr('wording-'+id)+'"><summary>原卷解析与出处</summary><ul class="wordingPapers">'+papers.join('')+'</ul>'+
    '<div class="fulltext">'+esc(pdfReadingText(q.analysis))+'</div></details></section>';
}
function wordingPractice(group) {
  const cards=group.cards;
  const index=Math.max(0,cards.findIndex(card=>card.qids[0]===state.question));
  const card=cards[index],id=card.qids[0],q=qs[id],pick=wordingAnswers.get(id);
  return '<article class="work wordingExample" data-row="'+attr(id)+'" tabindex="-1" aria-label="本类题目训练">'+
    practiceNavigation(cards.map(c=>c.qids[0]),index,'',qid=>wordingAddress(path,qid))+
    '<div class="work-head">'+esc(refTitle(q))+'　'+sourceLink(q.src)+'</div>'+questionMaterials(id,true)+
    questionStem(id)+questionChoices(id,pick,Boolean(pick),Boolean(pick))+
    (pick?wordingFeedback(card,pick):'')+'</article>';
}
function wordingGuide(group) {
  const points=group.points.map(point=>{
    const examples=point.examples.map(id=>controlLink(wordingAddress(path,id),refTitle(qs[id])));
    return '<div><dt>'+esc(point.title)+'</dt><dd>'+esc(point.text)+wordingTerms(point.entries,point.title)+
      '<p class="wordingExamples">例题　'+examples.join(' · ')+'</p></dd></div>';
  });
  return wordingPractice(group)+'<details class="wordingNotes" data-memo="wording-notes"><summary>辨析要点</summary>'+
    guideIntro(esc(group.summary))+'<dl class="wordingPoints">'+points.join('')+'</dl>'+wordingSources(group.references)+'</details>';
}
function wordingDirectory() {
  const groups=[];
  for (const [address,g] of wordingGroupPages) {
    groups.push(guideRow({address,title:g.name,count:practiceCount(g.cards.map(wordingSourceId)),description:g.summary}));
  }
  const pools=wordingPools.map(p=>({address:p.address,title:p.name,ids:p.cards.map(wordingSourceId)}));
  return examOverview(['遇到只差一两个词的表述，可以先问：换了这个词，原来允许的做法是否成了义务？原来要达到的目标是否成了已经取得的结果？主体、权限和历史次序也可以这样逐项核对。'],pools)+
    '<h2 class="practiceCategories">六类措辞差异</h2>'+groups.join('');
}
function wordingPage() {
  const group=wordingPracticePages.get(path);
  const trail=controlLink('skills/xingce','行测技能')+(group?'<span>/</span>'+controlLink(wordingRoute,'时政措辞辨析'):'');
  const head='<div class="practiceHead"><nav class="practicePath" aria-label="当前专题路径">'+trail+'</nav>'+
    '<h1 tabindex="-1">'+esc(group?.name||'时政措辞辨析')+'</h1></div>';
  return studyLayout(true,'xingce',tocSidebar('行测技能目录',skillTree('行测','')),
    '<section class="results directory wordingGuide">'+head+
    (group?.points?wordingGuide(group):group?wordingPractice(group):wordingDirectory())+'</section>');
}

function renderWording(){root.innerHTML=wordingPage();}

;
// 六类词条各有独立的导读、编排和真题，沿用原题与词条的稳定编号。
const courses = [
  {id:'facts',name:'事实与事件',lead:'把事实放回具体的时间、地点与对象。',
   groups:[['会议与文件','报告|会议|全会|座谈会|大会|规划|文件|讲话|政策'],['历史与人文','历史|文化|文学|艺术|哲学'],['科学与地理','科技|地理|生态环境|航天|气候|资源'],['经济与社会','经济|政治理论|社会治理|公共管理']]},
  {id:'concepts',name:'概念与词义',lead:'读准词义，再看换一个词会改变什么。',
   groups:[['成语与实词','汉语|词义|成语'],['政策与社会概念','政治理论|公共管理|经济|社会治理'],['法律术语','法律'],['科学与逻辑概念','统计|数学|科技|形式逻辑|地理']]},
  {id:'principles',name:'原理与机制',lead:'从成立条件出发，理解关系怎样导出结论。',
   groups:[['数量与统计关系','数学|统计'],['逻辑与哲学','形式逻辑|哲学'],['自然科学机制','科技|地理|生态环境'],['经济与社会运行','经济|政治理论|社会治理|公共管理']]},
  {id:'rules',name:'制度与规则',lead:'把主体、职权和适用条件放在一起看。',
   groups:[['法律权利与程序','法律'],['党和国家制度','政治理论'],['经济与公共管理','经济|公共管理|社会治理'],['环境与资源管理','生态环境|地理']]},
  {id:'methods',name:'方法与技能',lead:'看清任务和操作顺序，再换一道题练习。',
   groups:[['计算与方案选择','统计|数学|取大|取小|整数'],['调查与公共事务','公共管理|社会治理|政治理论'],['科学与技术方法','科技|生态环境'],['材料归纳与表达','汉语|文化|历史']]},
  {id:'arguments',name:'观点与论证',lead:'分清谁提出主张、证据支持哪一步、结论能说多远。',
   groups:[['发展目标与价值','政治理论|哲学'],['社会治理与公共服务','社会治理|公共管理|法律'],['文化传承与表达','文化|汉语|历史'],['经济与环境议题','经济|生态环境|地理']]}
];
function courseGuide(c){
 switch(c.id){
 case 'facts':return stripHead('同一年的两次航天任务')+'<ol class="timeMarks"><li><time>2022 年 6 月 5 日</time><h3>神舟十四号发射</h3><p>陈冬、刘洋、蔡旭哲随神舟十四号前往中国空间站。记住乘组与任务的对应关系。</p>'+termRead('k-99be74656b1029c9')+'</li><li><time>2022 年 11 月 28 日</time><h3>神舟十五号任务新闻发布会</h3><p>发布会上公布了包括舱外安装在内的计划任务。这里的日期指任务发布，不能据此推定安装完成日期。</p>'+termRead('k-3e924841778939bd')+'</li></ol><p class="sideNote">地理事实可以按地点和属性记忆。例如，'+termLink('k-a1d4d5a78415eadf')+'对应新疆的盐湖资源。</p>';
 case 'concepts':return stripHead('两种“有关系”有什么区别？')+'<dl class="wordPair"><div><dt>息息相关</dt><dd>强调联系紧密。要说明的是两件事的关系有多密切。</dd></div><div><dt>相辅相成</dt><dd>强调彼此配合、相互补充。判断时要看文段有没有写出双方各自的作用。</dd></div></dl>'+termRead('k-b66f5908fe5557d4')+'<details class="learnFold"><summary>换一个语境理解“另辟蹊径”</summary><p>同一个成语可以写宏观调控另寻方法，也可以形容大熊猫独特的取食方式。两处都保留了“另找途径”的词义。</p>'+termRead('k-idiom')+'</details>';
 case 'principles':return stripHead('从一个条件推出什么？')+'<div class="logicFlow"><div><small>已知关系</small><strong>如果 P，那么 Q</strong><p>P 成立时，Q 必须成立。</p></div><div><small>等价推论</small><strong>如果非 Q，那么非 P</strong><p>否则会与已知关系矛盾。</p></div></div><details class="learnFold"><summary>若只知道 Q 成立，能反推 P 吗？</summary><p>不能。还可能有其他条件使 Q 成立。原命题与逆否命题等价，交换前后件另需依据。</p></details>'+termRead('k-3a208c42ed1b69b4');
 case 'rules':return stripHead('三项制度分别规定什么？')+'<div class="ruleTable" role="table" aria-label="制度的对象与要求">'+
  [['k-7c21a486552ce461','政府之间的财政资金','依预算和制度安排划拨，用于调节地区财力等。'],['k-caedc47bc4c7745b','耕地保护','同时维护耕地数量、农业生产能力与生态条件。'],['k-afebf20e30b5ec05','基本经济制度','公有制经济的巩固发展与非公有制经济的鼓励、支持、引导相对应。']].map(([id,who,rule])=>'<div role="row"><strong role="cell">'+termLink(id)+'</strong><span role="cell">'+esc(who)+'</span><p role="cell">'+esc(rule)+'</p></div>').join('')+'</div><p class="sideNote">条目内可对照相应文件和原题，核对规定适用的对象与时期。</p>';
 case 'methods':return stripHead('收益有多种可能，先比较哪一个数？')+'<p>演算示例：甲方案的两种可能收益为 2 和 9，乙方案为 4 和 6。</p><div class="practiceMethods">'+
  [['k-fc73dc052c4260b8','先保住最低收益','分别取甲、乙的最低值 2 和 4，再取较大值 4，选乙。'],['k-47d3f93ad044253d','追求最高可能收益','分别取两者最高值 9 和 6，再取较大值 9，选甲。']].map(([id,label,body])=>'<details class="learnFold"><summary>'+esc(label)+'</summary><p>'+esc(body)+'</p>'+termRead(id)+'</details>').join('')+'</div><p class="sideNote">'+linkTo('browse-s','进入技能训练')+'</p>';
 case 'arguments':return stripHead('地理标志保护怎样影响地方品牌？')+'<dl class="argumentNotes"><div><dt>主张</dt><dd>保护地方特色产品的地理标志，可以支持品牌和相关产业发展。</dd></div><div><dt>材料依据</dt><dd>L 市材料引述川兴米粉企业负责人的观察：产品获得地理标志保护后，企业品牌和行业发展受到带动。</dd></div><div><dt>论证范围</dt><dd>这是一项地方实践的证据。要论证其他地区也能取得相同效果，还需说明产品特色、保护措施和市场条件。</dd></div></dl>'+termRead('k-aafae58dc3dcc99d');
 }
}

const root = $('content');
const reader = $('entryDialog'), readerBody = $('entryBody'), readerScroll = $('entryScroll');
const indexNames = {class:'分类', topic:'主题', event:'时政'};
const slugFor = n => (n.mode === 's' ? 'practice/' : 'entry/') + n.id;
const publicTerms = all.filter(n => n.mode === 'k' && (n.qs.length || n.tags) && !n.basisGroup);
const skillNodes = all.filter(n => n.mode === 's' && n.qs.length);
const publicIds = new Set(publicTerms.map(n => n.id));
const sourceEntries = all.filter(n => n.mode==='k' && n.sourceOnly && !n.basisGroup && !publicIds.has(n.id));
const textOf = n => n.review?.definition || n.authority?.text || n.intro || n.supplement?.[0]?.text || n.sources?.[0]?.text || n.directorySummary || '';
const counts = n => n.count ?? n.qs.length;
const heatLabel = n => n.qs.length ? '热度 '+counts(n)+' 次' : '仅讲义 · 0 次';
const topicTitles = new Map(study.topics.map(t=>[t.slug,t.title]));
const heatOrder = (a,b) => counts(b)-counts(a) || byTitle.compare(a.title,b.title) || a.id.localeCompare(b.id);
const subjectNames = {xingce:'行测', shenlun:'申论'};
const strategyPages = new Map();
const strategyRedirects = new Map(Object.entries(strategies.redirects||{}));
for (const group of strategies.groups) {
  const groupRoute = 'strategy/' + group.id;
  strategyPages.set(groupRoute, group);
  for (const article of group.articles) strategyPages.set(groupRoute + '/' + article.id, article);
}
const subjectRoute = subject => 'skills/'+(subject==='申论'?'shenlun':'xingce');
const isSkillList = route => route.startsWith('skills/');
const skillsByModule = new Map(Object.values(training).flat().map(module => [
  module, skillNodes.filter(n=>n.type===module).sort(heatOrder)
]));
const modulePracticePages=new Map();
const modulePracticeLists=new Map();
const modulePools=new Map();
const skillCopies=new Map();
const {modules:practiceModules,skills:skillLessons}=window.kbGraph.practiceSyllabus;
const practiceSetsOf=sets=>sets.map(set=>({...set,ids:set.units.map(unit=>unit[0])}));
const examSlugs={'政治理论':'politics-all','常识判断':'commons-all','言语理解与表达':'verbal-all',
  '数量关系':'quantity-all','判断推理':'reasoning-all','资料分析':'data-all'};
for(const [module,{topics,exams,supplements}] of Object.entries(practiceModules)){
  function practicePage(topic){
    const practiceSets=practiceSetsOf(topic.sets);
    const page={id:topic.slug,title:topic.title,intro:topic.intro,type:module,subject:'行测',mode:'s',
      practiceSets};
    modulePracticePages.set(slugFor(page),page);
    return page;
  }
  const pools=[];
  function addPool(slug,title,units){
    if(units.length)pools.push(practicePage({slug,title,sets:[{name:title,basis:'',units}]}));
  }
  addPool(examSlugs[module],'全部真题',exams);
  addPool(examSlugs[module]+'-supplement',supplementPoolTitle,supplements);
  modulePools.set(module,pools);
  if(topics.length)modulePracticeLists.set(module,topics.map(practicePage));
  const unitById=new Map();
  for(const unit of [...exams,...supplements])for(const id of unit)unitById.set(id,unit);
  for(const skill of skillsByModule.get(module)){
    const byUnit=new Map();
    for(const id of skill.qs){
      const source=unitById.get(id)||[id];
      if(!byUnit.has(source))byUnit.set(source,[]);
      byUnit.get(source).push(id);
    }
    const copies=new Map();
    for(const unit of byUnit.values())for(const id of unit)copies.set(id,unit);
    skillCopies.set(skill.id,copies);
  }
}
if(view?.node?.mode==='s' && view.node.practiceSets)modulePracticePages.set(view.key,view.node);
const termsInQuestion = id => [...new Set(qs[id].links.map(l => l.id))].filter(id => publicIds.has(id));
const types = courses.map(c => c.name);
const eventYears = [...new Set(study.events.map(e=>e.year))].sort((a,b)=>b-a);
const smallScreen = window.matchMedia?.('(max-width:760px)');
const compactHeader = window.matchMedia?.('(max-width:880px)');
const searchToggle = $('openGlobalSearch'), searchForm = $('globalSearch');
const headerTools = window.document?.querySelector('.headerTools');
function placeSiteTools() {
  (compactHeader.matches ? $('mobileTools') : searchForm.parentElement).append(headerTools);
}
if(window.document)placeSiteTools();
function closeHeaderSearch(restoreFocus=false) {
  if(searchToggle.getAttribute('aria-expanded')!=='true')return;
  searchToggle.setAttribute('aria-expanded','false');
  if(restoreFocus)searchToggle.focus({preventScroll:true});
}
listen(searchToggle,'click',()=>{
  searchToggle.setAttribute('aria-expanded','true');
  searchForm.elements.q.focus();
});
listen($('closeGlobalSearch'),'click',()=>closeHeaderSearch(true));
listen(searchForm,'keydown',ev=>{
  if(ev.key==='Escape' && !ev.isComposing && compactHeader.matches){
    ev.preventDefault();
    closeHeaderSearch(true);
  }
});
listen(compactHeader,'change',ev=>{
  const editing=searchForm.contains(document.activeElement);
  placeSiteTools();
  closeHeaderSearch();
  if(editing){
    if(ev.matches)searchToggle.focus();
    else searchForm.elements.q.focus();
  }
});
const pageSize = 20;
const newViewId = () => crypto.getRandomValues(new Uint32Array(2)).join('-');
let state, path, renderedHash;
let mountedPageId=window.kbHostId, readerHostDirty=false;
let currentDirectory;
const emptyState = () => ({pick:'', year:'', section:'', tocOpen:null, page:1, top:0, rail:0, focus:'', opened:[], revealed:[], question:'', group:0, step:0, from:''});

function initial(route) {
  return {...emptyState(), route};
}
function resolveRoute(raw) {
  if(view){
    if(window.studyPages.address(raw)===view.key){
      if(view.words)return wordingDestination(raw);
      const id=new URLSearchParams(raw.split('?')[1]).get('qid');
      return id && view.questions?.[id]?{...view.state,question:id,scrollQuestion:true}:view.state;
    }
    const dest=window.studyPages.destination(raw);
    if(dest)return dest;
  }
  if(/^(entry|practice)\/[^?]+\?qid=/.test(raw) && !raw.startsWith(wordingRoute+'/')){
    const [base,query]=raw.split('?'),id=new URLSearchParams(query).get('qid'),dest=resolveRoute(base);
    return qs[id]?{...dest,question:id,scrollQuestion:true}:dest;
  }
  if(modulePracticePages.has(raw))return {route:raw};
  if(isWordingRoute(raw))return {route:raw};
  if(raw.startsWith(wordingRoute+'/'))return wordingDestination(raw);
  if(raw==='sources'||raw.startsWith('sources/'))return originalRoute(raw);
  if (/^(?:search|library(?:-legacy)?)(?:\?|$)/.test(raw)) return libraryRoute(raw);
  if (strategyRedirects.has(raw)) return {route:strategyRedirects.get(raw)};
  if (referenceRedirects.has(raw)) return {route:referenceRedirects.get(raw)};
  if (raw.startsWith('reference/')) return {route:defaultStrategyRoute};
  if (raw === 'strategy' || raw.startsWith('strategy/')) {
    return {route:strategyPages.has(raw) ? raw : defaultStrategyRoute};
  }
  if(raw==='heat'||raw==='index/heat'||raw==='index/class/all')return {route:'index/class',pick:'all'};
  const [area,kind,item,part]=raw.split('/');
  if(area==='index' && item){
    if(kind==='class' && courses.some(c=>c.id===item)){
      let section='';
      try{section=decodeURIComponent(part||'');}catch{}
      return {route:'index/class',pick:item,section};
    }
    if(kind==='topic' && study.topics.some(t=>t.slug===item))return {route:'index/topic',pick:item};
    if(kind==='event' && eventYears.some(y=>String(y)===item))return {route:'index/event',pick:item,year:item};
    const event=kind==='event' && study.events.find(e=>e.slug===item);
    if(event)return {route:'index/event',pick:item,year:String(event.year)};
  }
  if(area==='skills'){
    let label='', module='';
    try{label=decodeURIComponent(kind||'');module=decodeURIComponent(item||'');}catch{}
    if(subjectNames[label]){
      const subject=subjectNames[label];
      return {route:subjectRoute(subject),pick:training[subject].includes(module)?module:''};
    }
    if(label==='申论')return {route:subjectRoute(label),pick:''};
    const legacy={'图形与空间':'判断推理','条件与逻辑':'判断推理','资料计算':'资料分析','政治理论专项':'政治理论'};
    const oldModule=legacy[label]||label;
    return {route:subjectRoute('行测'),pick:training['行测'].includes(oldModule)?oldModule:''};
  }
  const oldId=area==='entry'||area==='practice'?kind:raw;
  if(redirects[oldId])return {route:slugFor(nodes[redirects[oldId]])};
  if (raw.startsWith('entry/') && nodes[raw.slice(6)]?.mode === 'k' ||
      raw.startsWith('practice/') && nodes[raw.slice(9)]?.mode === 's' ||
      raw==='about' || Object.keys(indexNames).some(key=>raw==='index/'+key)) return {route:raw};
  if (nodes[raw]) return {route:slugFor(nodes[raw])};
  if (raw.startsWith('source-') && catalog[raw.slice(7)]) return {route:slugFor(nodes[catalog[raw.slice(7)]])};
  if (raw.startsWith('question=')) {
    let id;
    try { id=decodeURIComponent(raw.slice(9)); } catch { id=''; }
    if (missing[id]) return {route:'library',filters:{qid:id}};
    if (qs[id]) return questionTarget(id);
  }
  const course=courses.find(c=>'learn-'+c.id===raw);
  if (course) return {route:'index/class', pick:course.id};
  const topic=study.topics.find(t=>'topic-'+t.slug===raw);
  if (topic) return {route:'index/topic', pick:topic.slug};
  const event=study.events.find(e=>'event-'+e.slug===raw);
  if (event) return {route:'index/event', pick:event.slug, year:String(event.year)};
  const aliases={'browse-s':'skills/xingce',current:'index/event',topics:'index/topic'};
  return {route:aliases[raw] || 'index/class'};
}
function questionTarget(id, preferred) {
  preferred=canonicalId(preferred);
  const links=qs[id].links;
  const target=nodes[preferred] && related(preferred).includes(id) ? preferred :
    (links.find(l=>publicIds.has(l.id)&&l.role==='直接考查') || links.find(l=>publicIds.has(l.id)) || links[0])?.id;
  return target ? {route:slugFor(nodes[target]), question:id} : {route:'library',filters:{qid:id}};
}
function routeName(route) {
  if(view?.title && route===view.key)return view.title;
  if(view && route.startsWith('skills/'))return subjectNames[route.split('/')[1]]+'技能';
  if(modulePracticePages.has(route))return modulePracticePages.get(route).title;
  if(isWordingRoute(route))return wordingPracticePages.get(route)?.name||'时政措辞辨析';
  if (route==='library') return '全库搜索';
  if(route==='sources'||route.startsWith('sources/'))return originalById.get(route.split('/')[1])?.file||'原始资料';
  if (strategyPages.has(route)) return strategyPages.get(route).title;
  const [area,id]=route.split('/');
  if(area==='index') return (indexNames[id]||'分类')+'索引';
  if(area==='skills') return subjectNames[id]+'技能';
  if(area==='about') return '关于';
  if(area==='practice') return '上一项练习';
  return nodes[canonicalId(id)]?.title || '知识索引';
}
function savePlace() {
  if(!state || state.route!==path || window.studyPages?.pending()) return;
  const inReader=path.startsWith('entry/');
  state.top=inReader?readerScroll.scrollTop:window.scrollY;
  if(!inReader)rememberToc();
  state.opened=[...(inReader?readerBody:root).querySelectorAll('details[open][data-memo]')].map(d=>d.dataset.memo);
  state.revealed=[...reveal];
  history.replaceState(state,'');
}
function navigate(target, extra={}) {
  savePlace();
  const next={...initial(target), ...extra, from:path};
  const nested=target.startsWith('entry/') && path.startsWith('entry/');
  if(target.startsWith('entry/')){
    next.readerHost=nested?state.readerHost:{...state};
    if(nested)next.from=state.from;
  }
  const address=target==='library'?libraryAddress(next.filters):
    wordingPracticePages.has(target)?wordingAddress(target,next.question):
    target.startsWith('index/')||isSkillList(target)?tocAddress(target,next.pick,next.section):target;
  if(nested)history.replaceState(next,'','#'+address);
  else history.pushState(next,'','#'+address);
  renderRoute();
}
function backControl(fallback) {
  const label=state.from?'返回'+routeName(state.from):fallback.startsWith('skills')?'返回技能目录':'浏览知识索引';
  return '<button class="back" data-back="'+attr(fallback)+'">'+esc(label)+'</button>';
}
function controlLink(route,label,key='') {
  return '<a href="#'+attr(route)+'" data-route="'+attr(route)+'"'+(key?' data-key="'+attr(key)+'"':'')+'>'+esc(label)+'</a>';
}
function nodeButton(n) {return controlLink(slugFor(n),n.mode==='k'?n.title+'（'+heatLabel(n)+'）':n.title,n.id);}
function termLink(id) {return nodeButton(nodes[canonicalId(id)]);}
function linkTo(id,label) {return controlLink(resolveRoute(id).route,label);}
function qLink(id,preferred,label=refTitle(qs[id])) {
  return '<a href="#question='+encodeURIComponent(id)+'" data-question="'+attr(id)+'" data-prefer="'+attr(preferred||'')+'" data-key="'+attr(id)+'">'+esc(label)+'</a>';
}
const stripHead=label=>'<h3>'+esc(label)+'</h3>';
function termRead(id) {id=canonicalId(id);return '<div class="pillrow">'+termLink(id)+qLink(nodes[id].qs[0],id)+'</div>';}
function tocAddress(route,pick,section='') {
  if(!pick)return route;
  return route+'/'+encodeURIComponent(pick)+(section?'/'+encodeURIComponent(section):'');
}
function tocLink(route,pick,label,section='') {
  const selected=path===route && state.pick===pick && (route!=='index/class'||state.section===section);
  return '<a data-toc-link href="#'+attr(tocAddress(route,pick,section))+'"'+(selected?' aria-current="page"':'')+'>'+esc(label)+'</a>';
}
function tocBranch(key,label,children,initialOpen) {
  const open=state.tocOpen?state.tocOpen.includes(key):initialOpen;
  return '<details data-branch="'+attr(key)+'"'+(open?' open':'')+'><summary>'+esc(label)+'</summary><div class="tocChildren">'+children+'</div></details>';
}
function knowledgeTree(d) {
  const home=tocLink(path,'',indexNames[path.split('/')[1]]+'首页');
  if(path==='index/topic')return home+study.topics.map(t=>tocLink(path,t.slug,t.title)).join('');
  if(path==='index/event'){
    return home+eventYears.map(year=>tocBranch('year-'+year,year+' 年',tocLink(path,String(year),'全部事件')+study.events.filter(e=>e.year===year)
      .map(e=>tocLink(path,e.slug,e.title)).join(''),String(year)===state.year)).join('');
  }
  const items=[home,tocLink(path,'all','全部知识点')];
  for(const c of courses){
    items.push(tocLink(path,c.id,c.name));
    if(c.id===state.pick && d.groups.length){
      items.push('<div class="tocSub">'+d.groups.map(name=>tocLink(path,c.id,name,name)).join('')+'</div>');
    }
  }
  return items.join('');
}
function tabbedLayout(label,tabs,selected,side,body,barClass='') {
  const tabId=route=>'tab-'+route.split('/').pop();
  const links=tabs.map(({route,title,shortTitle})=>{
    const active=route===selected;
    const caption=shortTitle?'<span class="tabFull">'+esc(title)+'</span><span class="tabShort">'+esc(shortTitle)+'</span>':esc(title);
    return '<a id="'+attr(tabId(route))+'" href="#'+attr(route)+'" role="tab" data-tab="'+attr(route)+'" aria-controls="studyPanel" aria-selected="'+active+'" tabindex="'+(active?0:-1)+'">'+caption+'</a>';
  }).join('');
  return '<div class="tabBar '+barClass+'">'+tocTrigger()+'<div class="sectionTabs" role="tablist" aria-label="'+attr(label)+'">'+links+'</div></div>'+
    '<div class="tocLayout" role="tabpanel" id="studyPanel" aria-labelledby="'+attr(tabId(selected))+'">'+side+body+'</div>';
}
function studyLayout(skill,selected,side,body) {
  const area=skill?'skills/':'index/', labels=skill?subjectNames:indexNames;
  const tabs=Object.entries(labels).map(([key,title])=>({route:area+key,title}));
  return tabbedLayout(skill?'训练科目':'知识索引方式',tabs,area+selected,side,body);
}
function skillModuleOrder(subject) {
  return training[subject].flatMap(name=>subject==='行测' && name==='政治理论'?[name,wordingTitle]:[name]);
}
function skillTree(subject,module,selected='') {
  if(view?.tree)return view.tree;
  const home=tocLink(subjectRoute(subject),'',subject+'技能首页');
  return home+skillModuleOrder(subject).map(name=>{
    if(name===wordingTitle)return wordingTree();
    const links=(modulePracticeLists.get(name)||skillsByModule.get(name)).map(n=>'<a data-toc-link href="#'+slugFor(n)+'"'+(selected===n.id?' aria-current="page"':'')+'>'+esc(n.title)+'</a>').join('');
    const overview=subject==='行测'?tocLink(subjectRoute(subject),name,'专题概览'):'';
    return tocBranch('module-'+name,name,overview+links,module===name);
  }).join('');
}
function tocSidebar(title,items) {
  return '<aside id="tocRail" aria-label="'+attr(title)+'"><h2>'+esc(title)+'</h2><nav class="tocTree" id="tocTree" aria-label="'+attr(title)+'">'+items+'</nav></aside>';
}
function tocTrigger() {
  return '<button type="button" id="openToc" aria-controls="tocDrawer" aria-expanded="false" aria-haspopup="dialog"><i aria-hidden="true"></i>目录</button>';
}
function fold(label,body,key) {
  return '<details data-memo="'+attr(key)+'"><summary>'+esc(label)+'</summary>'+body+'</details>';
}
function questionList(units) {
  return units.map(ids=>'<div class="questionLine">'+qLink(ids[0])+ '<small>'+esc(qs[ids[0]].task)+'</small>'+(ids.length>1?fold('其他卷本（'+(ids.length-1)+'）','<div class="pillrow">'+ids.slice(1).map(q=>qLink(q)).join('')+'</div>','versions-'+ids[0]):'')+'</div>').join('');
}
function classView() {
  const s=state;
  const course=courses.find(c=>c.id===s.pick);
  const items=course?publicTerms.filter(n=>n.type===course.name):publicTerms;
  const facets=course?course.groups.map(([name,pattern])=>[name,new RegExp(pattern)]):[];
  const facet=n=>course?(facets.find(([,pattern])=>pattern.test(n.domain+' '+n.title))?.[0]||'综合内容'):n.type;
  const groups=course?[...new Set(items.map(facet))].sort(byTitle.compare):[];
  if(!groups.includes(s.section))s.section='';
  return {title:s.section||course?.name||(s.pick?'全部知识点':'分类'),home:!s.pick?classHome:null,
    groups,
    rowLabel:n=>course?(s.section?'':facet(n)):n.type,
    guide:course?{label:'分类示例',body:courseGuide(course)}:null,
    sections:[['',items.filter(n=>!s.section||facet(n)===s.section)]]};
}
function topicView() {
  const t=study.topics.find(t=>t.slug===state.pick);
  if(!t)return {title:'主题',home:topicHome,destinations:study.topics.map(topicRow),unit:'个专题'};
  const paper=t.facets.map(f=>'<h3>'+esc(f.label)+'</h3>'+questionList(f.units)).join('');
  return {title:t.title,
    guide:{label:'专题导读与真题',body:'<h3>'+esc(t.question)+'</h3><p>'+esc(t.summary)+'</p>'+fold('专题真题（'+t.questions.length+'）',paper,'topic-questions')},
    sections:[...t.facets.map(f=>[f.label,f.nodes.filter(id=>publicIds.has(id)).map(id=>nodes[id])]),
      ['讲义补充',(t.supplement||[]).filter(id=>publicIds.has(id)).map(id=>nodes[id])]]};
}
function eventView() {
  const e=study.events.find(e=>e.slug===state.pick);
  if(!e){
    const year=Number(state.year);
    const events=year?study.events.filter(item=>item.year===year):study.events;
    return {title:year?year+'年时政事件':'时政',home:year?null:eventHome,
      destinations:events.map(item=>eventRow(item,!year)),unit:'项事件'};
  }
  const terms=[...new Set(e.questions.flatMap(termsInQuestion))].map(id=>nodes[id]);
  const sections=[];
  if(e.title==='党的二十届三中全会与进一步全面深化改革') {
    for(const [label,pattern] of [['财税体制改革',/财政|财税|预算/],['收入分配',/收入分配|再分配/],['对外开放',/对外开放|制度型开放/]]) {
      sections.push([label,terms.filter(n=>pattern.test(n.title))]);
    }
  }
  for(const type of types) sections.push([type,terms.filter(n=>n.type===type)]);
  sections.push(['事件资料',(e.supplement||[]).filter(id=>publicIds.has(id)).map(id=>nodes[id])]);
  const material=e.units.map(ids=>'<p>'+esc(qs[ids[0]].current_affairs.basis||qs[ids[0]].task)+'</p>'+questionList([ids])).join('');
  return {title:e.title,year:e.year,sections,
    guide:e.questions.length?{label:'事件材料与真题',body:material}:null};
}
function skillView() {
  const subject=subjectNames[path.split('/')[1]], overview=!state.pick;
  const modules=overview?training[subject]:[state.pick];
  const pages=modulePracticeLists.get(state.pick);
  function practiceDirectory(){
    return pages.map(p=>guideRow({address:slugFor(p),title:p.title,
      count:practiceCount(p.practiceSets.flatMap(set=>set.ids)),description:p.intro})).join('');
  }
  return {subject,overview,home:overview?skillsHome:pages?practiceDirectory:null,title:overview?subject+'技能':state.pick,
    introduction:modulePools.has(state.pick)?skillOverview(state.pick):'',
    sections:modules.map(module=>[module,skillsByModule.get(module)])};
}
function entryRow(n,section) {
  const knowledge=n.mode==='k';
  if(!knowledge){
    const copies=skillCopies.get(n.id);
    const count=copies?practiceCount([...new Set(copies.values())].map(unit=>unit[0])):n.qs.length+' 题';
    const description=currentDirectory.overview?n.type:n.method;
    return '<a class="entry skillRow" data-key="'+attr(n.id)+'" href="#'+slugFor(n)+'" data-route="'+slugFor(n)+'"><div class="entryTitle"><strong>'+esc(n.title)+'</strong></div><small>'+esc(count)+'</small>'+(description?'<span class="skillMethod">'+esc(description)+'</span>':'')+'</a>';
  }
  const label=section||(currentDirectory.rowLabel?currentDirectory.rowLabel(n):n.type);
  const summary=(n.directorySummary ?? textOf(n)) || n.type;
  const meta=label?'<small>'+esc(label)+'</small>':'';
  const heat='<span class="frequency" data-heat="'+counts(n)+'">'+(counts(n)?'热度 <b>'+counts(n)+'</b> 次':'仅讲义 · 0 次')+'</span>';
  return '<a class="entry'+(knowledge?' heatRow':'')+'" data-key="'+attr(n.id)+'" href="#'+slugFor(n)+'" data-route="'+slugFor(n)+'" data-recent="'+(state.focus===n.id)+'"><div class="entryTitle"><strong>'+esc(n.title)+'</strong>'+meta+'</div><span class="entrySummary">'+esc(summary)+'</span>'+heat+'</a>';
}
function directoryRows(sections) {
  const seen=new Set(), rows=[];
  for(const [section,items] of sections) for(const n of items) {
    if(!seen.has(n.id))rows.push([section,n]);
    seen.add(n.id);
  }
  if(path==='index/class' && (!state.pick||state.pick==='all')){
    for(const n of sourceEntries)if(manual.some(edge=>edge.n===n.id))rows.push(['讲义原文',n]);
  }
  return rows.sort((a,b)=>heatOrder(a[1],b[1]));
}
function directoryMarkup() {
  const skill=isSkillList(path),mode=path.split('/')[1];
  const d=currentDirectory=skill?skillView():({class:classView,topic:topicView,event:eventView})[mode]();
  let count='',lines='',pager='',pages=1;
  if(d.home)lines=d.home(d);
  else {
    const results=d.destinations||directoryRows(d.sections);
    pages=Math.max(1,Math.ceil(results.length/pageSize));
    state.page=Math.max(1,Math.min(state.page,pages));
    count=(d.year?d.year+' 年 · ':'')+results.length.toLocaleString('zh-CN')+' '+(d.unit||(skill?'项技能':'个知识点'));
    lines=results.slice((state.page-1)*pageSize,state.page*pageSize).map(row=>d.destinations?guideRow(row):entryRow(row[1],row[0])).join('')||'<p class="empty">暂无条目。</p>';
    if(pages>1)pager='<nav class="pager" aria-label="列表翻页"><button class="btn" data-page="-1" '+(state.page===1?'disabled':'')+'>上一页</button><span>'+state.page+' / '+pages+'</span><button class="btn" data-page="1" '+(state.page===pages?'disabled':'')+'>下一页</button></nav>';
  }
  const items=skill?skillTree(d.subject,state.pick):knowledgeTree(d);
  const guide=d.guide?'<details class="directoryGuide" data-memo="guide-'+attr(state.pick)+'"><summary>'+esc(d.guide.label)+'</summary><div>'+d.guide.body+'</div></details>':'';
  const html=studyLayout(skill,mode,tocSidebar(skill?d.subject+'技能目录':indexNames[mode]+'目录',items),
    '<section class="results directory"><div class="directoryHead"><h1 tabindex="-1">'+esc(d.title)+'</h1></div>'+(d.introduction||'')+
    '<div class="resultHead"'+(d.home?' hidden':'')+'><div class="resultMeta"><span id="resultCount" role="status">'+esc(count)+'</span></div>'+guide+'</div><div id="rows">'+lines+pager+'</div></section>');
  return {html,pages,groups:d.groups||[]};
}
function directory(){root.innerHTML=directoryMarkup().html;}

function strategyTocLink(route,label=strategyPages.get(route).title) {
  const selected = path === route ? ' aria-current="page"' : '';
  return '<a data-toc-link href="#'+attr(route)+'"'+selected+'>'+esc(label)+'</a>';
}
function strategyArticleList(group) {
  return group.articles.map(article=>{
    const address='strategy/'+group.id+'/'+article.id;
    return '<a class="strategyRow" href="#'+attr(address)+'" data-route="'+attr(address)+'"><strong>'+
      esc(article.title)+'</strong><small class="strategyScope">'+esc(article.scope)+'</small><span>'+esc(article.summary)+'</span></a>';
  }).join('');
}
function strategyParagraphs(text) {
  return String(text||'').split(/\n{2,}/).filter(Boolean).map(p=>'<p>'+esc(p)+'</p>').join('');
}
function strategySection(part) {
  let body='';
  if (part.official) {
    const links=part.rules.map(key=>{
      const [title,url]=strategies.rules[key];
      return '<a href="'+attr(url)+'" target="_blank" rel="noopener">'+esc(title)+'</a>';
    });
    body+='<aside class="strategyRule"><strong>考试规定</strong><p>'+esc(part.official)+'</p><div class="pillrow">'+links.join('')+'</div></aside>';
  }
  if(part.text)body+=strategyParagraphs(part.text);
  if(part.list?.length){
    body+='<ul class="strategyList">'+part.list.map(item=>{
      const lead=item.match(/^([^：]{2,14}：)(.+)$/);
      return '<li>'+(lead?'<strong>'+esc(lead[1])+'</strong>'+esc(lead[2]):esc(item))+'</li>';
    }).join('')+'</ul>';
  }
  if(part.table){
    const [head,...rows]=part.table;
    body+='<div class="referenceTable" role="region" aria-label="策略对照表" tabindex="0"><table class="strategyTable"><thead><tr>'+head.map(t=>'<th scope="col">'+esc(t)+'</th>').join('')+
      '</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+esc(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  }
  if(part.questions){
    const links=part.questions.map(id=>{
      const skill=qs[id].links.find(link=>nodes[link.id].mode==='s');
      return qLink(id,skill?.id);
    });
    body+='<div class="strategyQuestions"><span>对照真题</span><div class="pillrow">'+links.join('')+'</div></div>';
  }
  if(part.links?.length){
    body+='<div class="strategyLinks"><span>相关内容</span><div class="pillrow">'+part.links.map(([target,label])=>controlLink(target,label)).join('')+'</div></div>';
  }
  return section(part.title,body);
}
function readingLayout(side,body,extraClass=''){
  const article='<article class="reader strategyReader '+extraClass+'">'+body+'</article>';
  if(strategyPages.has(path)){
    const activeTab='strategy/'+path.split('/')[1];
    return tabbedLayout('应考策略',strategyTabs,activeTab,side,article,'strategyTabs');
  }
  return '<div class="strategyMobile">'+tocTrigger()+'</div><div class="tocLayout">'+side+article+'</div>';
}
function strategyMarkup() {
  const group=strategies.groups.find(g=>g.id===path.split('/')[1])||strategies.groups[0];
  const groupRoute='strategy/'+group.id;
  const page=strategyPages.get(path)||group;
  const tree=strategyTocLink(groupRoute,'本页概览')+group.articles.map(a=>strategyTocLink(groupRoute+'/'+a.id)).join('');
  const side=tocSidebar(group.tocTitle||(group.title+'目录'),tree);
  let body=page!==group?'<nav class="practicePath" aria-label="上级页面">'+controlLink(groupRoute,group.title)+'</nav>':'';
  body+='<h1 tabindex="-1">'+esc(page.title)+'</h1><p class="strategyLead">'+esc(page.intro||page.summary)+'</p>';
  if(page===group){
    if(group.situations?.length){
      body+='<section class="strategySituations" aria-label="按处境进入"><h2>按处境进入</h2><div class="situationGrid">'+
        group.situations.map(s=>'<a class="situationRow" href="#'+attr(s.route)+'" data-route="'+attr(s.route)+'"><strong>'+esc(s.title)+'</strong><span>'+esc(s.text)+'</span></a>').join('')+
        '</div></section>';
    }
    body+='<section><h2>'+(group.situations?.length?'全部栏目':'专题目录')+'</h2>'+strategyArticleList(group)+'</section>';
    if(group.footerLink)body+='<p class="guideMore">'+controlLink(group.footerLink[0],group.footerLink[1])+'</p>';
  }else{
    body+='<p class="muted">'+esc(page.scope)+'</p>'+page.sections.map(strategySection).join('');
    if(page.skills?.length)body+=section('对应技能训练','<div class="pillrow">'+page.skills.map(id=>controlLink(slugFor(nodes[id]),nodes[id].title)).join('')+'</div>');
    if(group.footerLink)body+='<p class="guideMore">'+controlLink(group.footerLink[0],group.footerLink[1])+'</p>';
  }
  return readingLayout(side,body);
}
function renderAbout() {
  root.innerHTML='<article class="reader aboutPage">'+backControl('index/class')+'<h1>关于</h1>'+
    section('收录内容','<p>考公突击收录国考、江苏省考的行测和申论试题，以及政治理论专项。政治理论手册、政府工作报告和全会公报解读、时政汇编中的知识点也可在分类、主题和时政目录中查阅。词条中的出处可打开 PDF 原页。</p><p>'+controlLink('search','全库搜索')+'</p>')+
    section('原始资料',originalCatalogHtml())+
    section('热度','<p>热度是一个知识点在本题库中出现的次数。同一道题收录在三份试卷，计三次。同一题号多处涉及同一个词条，计一次。个人补充的关联单独列出。</p>')+
    section('作答记录','<p>选过的答案、申论草稿和个人补充的关联保存在当前浏览器中。</p>')+'</article>';
}

const frames = {
  '事实与事件':['事实与对象','时间、地点与题中依据'],
  '概念与词义':['释义','用法与辨析'],
  '原理与机制':['基本原理','成立条件与应用'],
  '制度与规则':['制度规定','适用范围与题中用法'],
  '方法与技能':['适用任务','操作与应用'],
  '观点与论证':['核心主张','理由与材料依据']
};
function section(title,body) {return '<section><h2>'+esc(title)+'</h2>'+body+'</section>';}
function unitsOf(n) {
  return study.questionUnits[n.id] || n.qs.map(id=>[id]);
}
function originalNotes(n) {
  const originals=n.sources.map(s=>'<p>'+sourceLink([s.source.file,s.source.page],sourceCaption(s.source.file,s.source.first||s.source.page,s.source.last||s.source.page))+' · '+esc(s.basis||s.topic)+'</p><p class="fulltext">'+esc(pdfReadingText(s.text,s.label))+'</p>');
  if(n.legacySkill) originals.push('<a href="non-current.html#'+attr(n.legacySkill)+'">查看训练题组及改编练习</a>');
  return originals.length?fold('资料原文',originals.join(''),'original'):'';
}
function sourceCaption(file,first,last) {
  return file.replace(/\.pdf$/i,'')+' · 第 '+first+(last!==first?'–'+last:'')+' 页';
}
function lectureNotes(n) {
  if(!n.supplement?.length)return '';
  const paragraphs=n.supplement.map((p,i)=>{
    const ref=sourceLink([p.file,p.first],sourceCaption(p.file,p.first,p.last));
    const official=p.reference?' · <a target="_blank" rel="noopener" href="'+attr(p.reference.url)+'">'+esc(p.reference.name)+'</a>':'';
    const question=p.questionId?' · '+qLink(p.questionId,n.id):'';
    const body=p.text===textOf(n)?'':'<p>'+esc(p.text)+'</p>';
    return '<h3>'+esc(p.relation)+'</h3>'+body+'<p>'+ref+' · '+esc(p.basis)+official+question+'</p>'+
      fold('核对引文','<blockquote>'+esc(pdfReadingText(p.quote))+'</blockquote>','lecture-'+i);
  });
  return section('资料补充',paragraphs.join(''));
}
function entryTags(n) {
  if(!n.tags)return '';
  const links=(n.tags['专题']||[]).map(slug=>tocLink('index/topic',slug,topicTitles.get(slug)));
  for(const e of n.eventTags||[])links.push(tocLink('index/event',e.slug,e.year+' 年 · '+e.title));
  const labels=['学科','时间索引','史实年份','资料类别','来源主题','出处性质']
    .filter(k=>n.tags[k]?.length).map(k=>'<p class="meta"><strong>'+esc(k==='资料类别'?'原资料类别':k)+'</strong>　'+n.tags[k].map(esc).join('、')+'</p>');
  return section('归类与标签',labels.join('')+(links.length?'<div class="pillrow">'+links.join('')+'</div>':''));
}
function references(n) {
  const items=(n.review?.references||[]).map(r=>{
    const source=reviewSources[r.source];
    if(!source) return '';
    return '<p><a target="_blank" rel="noopener" href="'+attr(source.url)+'">'+esc(source.name)+'</a>　'+esc(r.location)+'</p>'+(r.quote?'<blockquote>'+esc(r.quote)+'</blockquote>':'');
  });
  if(n.authority&&!items.length) {
    const a=n.authority;
    items.push('<p><a target="_blank" rel="noopener" href="'+attr(a.url)+'">'+esc(a.source)+'</a>　'+esc(a.location)+'</p>');
  }
  const q=qs[n.qs[0]];
  if(q) items.push('<div class="pillrow">'+sourceLink(q.src,'题本第 '+q.src[1]+' 页')+sourceLink(q.asrc,'解析第 '+q.asrc[1]+' 页')+'</div>');
  if(n.sources.length) items.push(originalNotes(n));
  return items.length?section('出处',items.join('')):'';
}
function questionRow(ids) {
  const id=ids.includes(state.question)?state.question:ids[0], selected=id===state.question;
  const copies=ids.length>1?fold('同题卷本（'+ids.length+'）','<div class="pillrow">'+ids.map(q=>qLink(q,node.id)).join('')+'</div>','copies-'+ids[0]):'';
  return '<div class="questionRow" data-row="'+attr(id)+'"><button class="questionToggle" data-toggle-q="'+attr(id)+'" aria-expanded="'+selected+'"><span>'+esc(refTitle(qs[id]))+(ids.length>1?' · '+ids.length+' 个卷本':'')+'</span><small>'+esc(rel(node.id,id))+'</small></button>'+(selected?work(id)+copies:'')+'</div>';
}
function mergedUsage(n,units) {
  return units.map((ids,i)=>{
    const readings=n.readings.filter(r=>r.qs.some(q=>ids.includes(q)));
    const reading=readings.find(r=>!r.doubt)||readings[0];
    const use=ids.map(q=>reviewedUse(n.id,q)).find(Boolean);
    const body=n.review?.examFocus?.[ids[0]] || use?.use || reading?.explanation || baseEdge(n.id,ids[0])?.why || '';
    const label=refTitle(qs[ids[0]])+(ids.length>1?' · '+ids.length+' 个卷本':'');
    const doubts=[...new Set(readings.map(r=>r.doubt).filter(Boolean))];
    const detail='<p>'+esc(body)+'</p>'+doubts.map(t=>'<p class="disclaimer">'+esc(t)+'</p>').join('')+
      '<div class="pillrow">'+qLink(ids[0],n.id,'查看这道题')+'</div>';
    return units.length===1?detail:fold(label,detail,'usage-'+i);
  }).join('');
}
function questionReadings(n,id) {
  if(!n.readings)return '';
  const entries=n.readings.filter(r=>r.qs.includes(id));
  const passages=new Set();
  for(const r of entries){
    for(const t of [r.definition,r.explanation,r.evidence,r.doubt])if(t)passages.add(t);
  }
  return passages.size?fold('本卷中的释义与题据',[...passages].map(t=>'<p>'+esc(t)+'</p>').join(''),'reading-'+id):'';
}
function renderArticle() {
  const n=node, r=n.review||{}, frame=frames[n.type]||['知识点','题中用法'];
  const units=unitsOf(n), supplemental=manual.filter(e=>e.n===n.id&&!n.qs.includes(e.q));
  $('entryKind').textContent=n.type||frame[0];
  const out=['<h1 id="entryTitle">'+esc(n.title)+'</h1><p class="kind" data-heat="'+counts(n)+'">'+heatLabel(n)+'</p>'];
  if(n.reading) out.push('<p class="muted">'+esc(n.reading)+'</p>');
  out.push('<p class="definition">'+esc(pdfReadingText(textOf(n),n.title))+'</p>');
  if(n.reviewDoubt) out.push('<p class="disclaimer">'+esc(n.reviewDoubt)+'</p>');
  if(n.readings)out.push(section(frame[1],mergedUsage(n,units)));
  else if(r.explanation) out.push(section(frame[1],'<p>'+esc(r.explanation)+'</p>'));
  if(!n.readings && n.aspects) out.push(section('题中考法',n.aspects.map(a=>'<h3>'+esc(a.title)+'</h3>'+a.uses.map(u=>{
    const id=u.qids[0];
    return '<p>'+esc(r.examFocus?.[id]||u.use)+'</p><div class="pillrow">'+qLink(id,n.id)+'</div>';
  }).join('')).join('')));
  else if(!n.readings && r.evidence) out.push(section('题中依据','<blockquote>'+esc(pdfReadingText(r.evidence))+'</blockquote>'));
  out.push(lectureNotes(n),entryTags(n));
  out.push(section('关联真题','<p class="meta">'+units.length+' 道独立题 · '+n.qs.length+' 个题号</p>'+units.map(questionRow).join('')+
    (supplemental.length?'<h3>个人补充</h3>'+supplemental.map(e=>questionRow([e.q])).join(''):'')+'<button class="quiet" data-attachq>关联题目</button>'));
  const related=[...new Set([...(r.related||[]),...(n.seeAlso||[])])].map(id=>nodes[id]).filter(Boolean);
  if(related.length) out.push(section('相关词条','<div class="pillrow">'+related.sort(heatOrder).map(nodeButton).join('')+'</div>'));
  out.push(references(n));
  readerBody.innerHTML=out.join('');
}
function practiceNavigation(ids,index,groupControl='',addressFor=null) {
  function step(offset,label) {
    const id=ids[index+offset];
    if(!id)return '<button type="button" class="btn" disabled>'+label+'</button>';
    if(addressFor){
      const route=attr(addressFor(id));
      return '<a class="btn" data-route="'+route+'" href="#'+route+'">'+label+'</a>';
    }
    return '<button type="button" class="btn" data-step="'+offset+'">'+label+'</button>';
  }
  return '<nav class="practiceProgress" aria-label="切换训练题">'+
    (groupControl?'<span class="practiceGroup">'+groupControl+'</span>':'')+
    '<div class="practicePaging"><b>第 '+(index+1)+' / '+ids.length+' 题</b>'+
    '<span class="practiceSteps">'+step(-1,'上一题')+step(1,'下一题')+'</span></div></nav>';
}
function practicePosition(sets,view) {
  let {group,step,question}=view;
  if(question) {
    for(const [i,set] of sets.entries()){
      const found=set.units?set.units.findIndex(unit=>unit.includes(question)):set.ids.indexOf(question);
      if(found!==-1){group=i;step=found;break;}
    }
  }
  group=Math.max(0,Math.min(group,sets.length-1));
  const g=sets[group];
  step=Math.max(0,Math.min(step,g.ids.length-1));
  const versions=g.units?.[step]||[];
  return {group,step,versions,qid:versions.includes(question)?question:g.ids[step]};
}
function renderPractice() {
  const sets=groups(node);
  if(!sets.length) {
    root.innerHTML='<article class="reader">'+backControl('skills')+'<h1>'+esc(node.title)+'</h1><p>'+esc(pdfReadingText(textOf(node),node.title))+'</p>'+originalNotes(node)+'<button class="quiet" data-attachq>关联题目</button></article>';
    return;
  }
  const {group,step,versions,qid}=practicePosition(sets,state);
  state.group=group;state.step=step;
  const g=sets[group];
  const subject=node.subject, subjectPage=subjectRoute(subject);
  const home=tocAddress(subjectPage,node.type);
  const groupControl=sets.length>1?'<label class="groupControl">题组 <select id="practiceSet">'+sets.map((set,i)=>'<option value="'+i+'"'+(i===state.group?' selected':'')+'>'+esc(set.name)+'（'+set.ids.length+' 题）</option>').join('')+'</select></label>':g.name===node.title?'':esc(g.name);
  const side=tocSidebar(subject+'技能目录',skillTree(subject,node.type,node.id));
  const head='<div class="practiceHead"><nav class="practicePath" aria-label="当前技能路径">'+controlLink(subjectPage,subject)+'<span>/</span><a data-toc-link href="#'+home+'">'+esc(node.type)+'</a></nav><h1 tabindex="-1">'+esc(node.title)+'</h1>'+(state.from?backControl(home):'')+'</div>';
  const copies=versions.length>1?fold('同题卷本（'+versions.length+'）',versions.map(id=>{
    const q=qs[id];
    return '<p>'+esc(refTitle(q))+'　'+sourceLink(q.src,'试题原页')+' · '+sourceLink(q.asrc,'解析原页')+'</p>';
  }).join(''),'practice-versions-'+qid):'';
  const extra=copies+(node.practiceSets?'':originalNotes(node)+'<button class="quiet" data-attachq>关联题目</button>');
  const method=g.basis||node.method;
  root.innerHTML=studyLayout(true,subjectPage.split('/')[1],side,'<section class="results directory">'+head+
    practiceNavigation(g.ids,state.step,groupControl)+(method?'<p class="questionFocus">'+esc(method)+'</p>':'')+
    work(qid)+extra+'</section>');

}
function useView(next) {
  state=next;
  path=next.route;
  reveal=new Set(next.revealed);
  node=modulePracticePages.get(path)||nodes[path.split('/')[1]]||null;
}
function restoreDetails(outlet) {
  for(const box of outlet.querySelectorAll('[data-work]')) {
    [...box.querySelectorAll('details')].forEach((d,i)=>d.dataset.memo='question-'+box.dataset.work+'-'+i);
  }
  outlet.querySelectorAll('details[data-memo]').forEach(d=>{d.open=state.opened.includes(d.dataset.memo);});
}
function restorePosition(outlet) {
  if(outlet===readerBody)readerScroll.scrollTop=state.top;
  else window.scrollTo(0,state.top);
  if(state.scrollQuestion){
    const row=outlet.querySelector('[data-row="'+CSS.escape(state.question)+'"]');
    row?.scrollIntoView({block:'start'});
    if(row?.classList.contains('wordingExample'))row.focus({preventScroll:true});
    state.scrollQuestion=false;
  }
  if(state.focus)outlet.querySelector('[data-key="'+CSS.escape(state.focus)+'"]')?.focus({preventScroll:true});
}
function paintPage(next,keepContent=false) {
  useView(next);
  const area=path.split('/')[0];
  for(const input of document.querySelectorAll('[data-global-form] input'))
    input.value=area==='library'?(state.filters?.q||''):'';
  $('nIndex').toggleAttribute('aria-current',area==='index');
  $('nSkill').toggleAttribute('aria-current',area==='skills'||area==='practice');
  $('nStrategy').toggleAttribute('aria-current',area==='strategy');
  $('nAbout').toggleAttribute('aria-current',area==='about'||area==='sources');
  document.querySelectorAll('header [aria-current],#mobileTools [aria-current]').forEach(el=>el.setAttribute('aria-current','page'));
  if(!keepContent){
    if(view?.html){
      root.innerHTML=view.html;
      if(state.tocOpen)for(const branch of root.querySelectorAll('[data-branch]'))branch.open=state.tocOpen.includes(branch.dataset.branch);
    }
    else if(isWordingRoute(path))renderWording();
    else if(area==='practice')renderPractice();
    else if(area==='strategy')root.innerHTML=strategyMarkup();
    else if(area==='library')renderLibrary();
    else if(area==='sources')renderOriginals();
    else if(area==='about')renderAbout();
    else directory();
    restoreDetails(root);
  }
  window.kbHostId=mountedPageId=next.viewId;
  document.title=(node?.title||routeName(path))+' · 考公突击';
  if(!smallScreen.matches)restoreTocScroll();
  restorePosition(root);
}
function syncEntryTop() {
  const header=document.querySelector('header');
  const top=header?Math.max(0,Math.round(header.getBoundingClientRect().bottom)):0;
  document.documentElement.style.setProperty('--entry-top',top+'px');
}
function viewAssets(next) {
  if(view?.html)return [];
  if(view){
    const id=questionFor(next);
    return id && !hasQuestion(id) ? [cardAsset(id)] : neededMaterials(id);
  }
  const {route}=next, entries=window.kbGraph.parts.entries;
  if(route==='library')return ['library','question-figures',...Object.values(entries).map(file=>'parts/'+file)];
  const files=[];
  let qid;
  if(route.startsWith('entry/')){
    const type=nodes[route.slice(6)].type;
    if(entries[type])files.push('parts/'+entries[type]);
    qid=next.question;
  }else if(wordingPracticePages.has(route)){
    const cards=wordingPracticePages.get(route).cards;
    qid=(cards.find(c=>c.qids[0]===next.question)||cards[0]).qids[0];
  }else if(route.startsWith('practice/') && route!==wordingRoute){
    const skill=modulePracticePages.get(route)||nodes[route.slice(9)];
    if(!skill.practiceSets && !skill.sources && entries[skill.type])files.push('parts/'+entries[skill.type]);
    const sets=groups(skill);
    if(sets.length)qid=practicePosition(sets,next).qid;
  }
  if(qs[qid])files.push(paperAsset(qid),'question-figures');
  return files;
}
function questionIds(next){
 if(view?.words)return view.words.cards.map(c=>c.qids[0]);
 if(view?.node?.mode==='s'){
  const sets=groups(view.node);
  if(sets.length)return sets[practicePosition(sets,next).group].ids;
 }
 return [];
}
function questionFor(next){
 if(view.node?.mode==='k')return view.questions[next.question]?next.question:'';
 if(view.words)return (view.words.cards.find(c=>c.qids[0]===next.question)||view.words.cards[0]).qids[0];
 const sets=groups(view.node);return sets.length?practicePosition(sets,next).qid:'';
}
let previewController,previewTimer;
const previewImages=new Map();
function stopPreview(){clearTimeout(previewTimer);previewController?.abort();}
function prepareNext(next,sequence){
 stopPreview();
 if(!view || view.html || !next.route.startsWith('practice/') || document.hidden || navigator.connection?.saveData)return;
 const ids=questionIds(next),current=questionFor(next),index=view.words?ids.indexOf(current):next.step;
 const following=ids[index+1];if(!following)return;
 const controller=previewController=new AbortController();
 previewTimer=setTimeout(async()=>{
  try{
   const activeImages=[...root.querySelectorAll('img.questionPic')];
   await Promise.all(activeImages.map(img=>img.decode?.().catch(()=>{})));
   if(controller.signal.aborted||sequence!==renderSequence)return;
   const after=[following,ids[index+2]].filter(Boolean);
   const missing=after.find(id=>!hasQuestion(id));
   if(missing)await loadAsset(cardAsset(missing),'low',controller.signal);
   if(controller.signal.aborted||sequence!==renderSequence)return;
   const q=qs[following];if(!hasQuestion(following))return;
   await Promise.all(neededMaterials(following).map(file=>loadAsset(file,'low',controller.signal)));
   if(controller.signal.aborted||sequence!==renderSequence)return;
   const sections=[...Object.values(artwork.questions[following]||{}),...q.m.map(k=>artwork.materials[q.paper+'|'+mats[k][0]])];
   const used=new Set(activeImages.map(im=>im.getAttribute('src')));
   const urls=new Set(sections.flatMap(s=>(s?.clips||[]).map(c=>'assets/figures/'+c.file)));
   for(const url of urls){
    if(used.has(url)||previewImages.has(url))continue;
    if(controller.signal.aborted)break;
    const img=new Image();img.fetchPriority='low';img.decoding='async';img.src=url;
    previewImages.set(url,img);if(previewImages.size>16)previewImages.delete(previewImages.keys().next().value);
    await img.decode?.().catch(()=>{});
   }
  }catch{/* A foreground request retries any interrupted background transfer. */}
 },60);
}
let renderSequence=0;
function renderRoute() {
  if(!window.studyPages.owns(view)){window.studyPages.open();return;}
  const sequence=++renderSequence;
  closeHeaderSearch();
  if(drawer.open)dockToc();
  const raw=location.hash.slice(1), target=resolveRoute(raw);
  const route=target.route, saved=history.state;
  const next={...initial(route),...(saved?.route===route?saved:target)};
  if(isSkillList(route)&&next.pick==='all')next.pick='';
  if(saved?.route===raw && (raw.startsWith('entry/')||raw.startsWith('practice/')) && raw!==route)
    Object.assign(next,saved,{route});
  if(next.focus)next.focus=canonicalId(next.focus);
  if(saved?.filter && saved.section===undefined && route==='index/class')next.section=saved.filter;
  next.viewId??=newViewId();
  const inReader=route.startsWith('entry/');
  if(inReader && !next.readerHost){
    next.readerHost={...initial('index/class'),viewId:newViewId()};
    next.from='';
  }
  const address=route==='library'?libraryAddress(next.filters):
    next.question && (route.startsWith('practice/')||route.startsWith('entry/'))?wordingAddress(route,next.question):
    route.startsWith('index/')||isSkillList(route)?tocAddress(route,next.pick,next.section):route;
  history.replaceState(next,'','#'+address);
  renderedHash=location.hash;
  const files=viewAssets(next);
  if(!view && inReader && mountedPageId!==next.readerHost.viewId)files.push(...viewAssets(next.readerHost));
  const needed=files.filter(file=>!loadedAssets.has(file));
  if(needed.length){
    useView(next);
    const outlet=inReader && reader.open?readerBody:root;
    if(outlet===root){
      if(reader.open){reader.close();document.documentElement.classList.remove('readingEntry');}
      mountedPageId=null;
    }
    window.studyPages.status('正在读取页面资料…');
    Promise.all(needed.map(file=>loadAsset(file,'high'))).then(()=>{
      if(sequence===renderSequence)renderRoute();
    }).catch(error=>{
      if(sequence!==renderSequence)return;
      if(error.status===404)window.studyPages.status('请重新读取当前版本的题卡。',()=>location.reload());
      else window.studyPages.status('页面资料读取失败。',renderRoute);
    });
    return;
  }
  window.studyPages.status('');
  if(inReader){
    const host=next.readerHost;
    if(mountedPageId!==host.viewId && !view)paintPage(host);
    const entering=!reader.open, changed=path!==route;
    useView(next);
    renderArticle();
    restoreDetails(readerBody);
    if(entering){
      document.documentElement.classList.add('readingEntry');
      syncEntryTop();
      reader.showModal();
    }else{
      syncEntryTop();
    }
    if(entering||changed)$('closeEntry').focus({preventScroll:true});
    document.title=node.title+' · 考公突击';
    restorePosition(readerBody);
    window.studyPages.ready();
    return;
  }
  const resume=reader.open && mountedPageId===next.viewId && !readerHostDirty;
  if(reader.open){
    reader.close();
    document.documentElement.classList.remove('readingEntry');
    readerBody.replaceChildren();
    readerHostDirty=false;
  }
  paintPage(next,resume);
  prepareNext(next,sequence);window.studyPages.ready();
}
function closeReader() {
  if(!reader.open)return;
  savePlace();
  if(state.from){history.back();return;}
  // 从书签直接打开词条时，关闭后留在本站的知识索引。
  const host=state.readerHost;
  history.replaceState(host,'','#'+tocAddress(host.route,host.pick,host.section));
  renderRoute();
  $('studyPanel')?.querySelector('h1')?.focus({preventScroll:true});
}
function update(changes) {
  savePlace();
  Object.assign(state,changes);
  history.replaceState(state,'');
  renderRoute();
}
const drawer=$('tocDrawer');
let closingDrawer=null;
function rememberToc() {
  const tree=$('tocTree');
  if(!tree)return;
  state.tocOpen=[...tree.querySelectorAll('details[open]')].map(el=>el.dataset.branch);
  if(drawer.open||!smallScreen.matches)state.rail=tree.scrollTop;
}
function restoreTocScroll() {
  const tree=$('tocTree');
  if(!tree)return;
  tree.scrollTop=state.rail;
  const selected=tree.querySelector('[aria-current="page"]');
  if(!state.rail && selected && selected.getClientRects().length){
    const offset=selected.getBoundingClientRect().top-tree.getBoundingClientRect().top;
    if(offset+selected.offsetHeight>tree.clientHeight)tree.scrollTop=offset-tree.clientHeight/2;
  }
}
function openDrawer() {
  const tree=$('tocTree');
  if(!smallScreen.matches||!tree||drawer.open||document.querySelector('dialog:modal'))return;
  $('drawerTitle').textContent=tree.getAttribute('aria-label');
  $('drawerSlot').append(tree);
  drawer.showModal();
  $('openToc').setAttribute('aria-expanded','true');
  document.documentElement.classList.add('tocOpen');
  restoreTocScroll();
  $('closeToc').focus({preventScroll:true});
}
function dockToc() {
  rememberToc();
  if(closingDrawer){closingDrawer.cancel();closingDrawer=null;}
  drawer.close();
  document.documentElement.classList.remove('tocOpen');
  const tree=$('tocTree'),rail=$('tocRail');
  if(tree&&rail)rail.append(tree);
  $('openToc')?.setAttribute('aria-expanded','false');
}
async function closeDrawer() {
  if(!drawer.open)return true;
  if(closingDrawer)return false;
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    closingDrawer=drawer.animate([{transform:'translateX(0)'},{transform:'translateX(-100%)'}],{duration:150,easing:'ease-in',fill:'forwards'});
    try{await closingDrawer.finished;}catch{return false;}
  }
  dockToc();
  $('openToc')?.focus({preventScroll:true});
  return true;
}
async function chooseToc(el) {
  const address=el.hash?.slice(1);
  if(!await closeDrawer())return;
  if(address!==location.hash.slice(1)){
    const dest=resolveRoute(address);
    navigate(dest.route,dest);
  }
  const focus=smallScreen.matches?$('openToc'):$('tocTree')?.querySelector('[aria-current="page"]');
  focus?.focus({preventScroll:true});
}
listen(reader,'cancel',ev=>{ev.preventDefault();closeReader();});
listen(reader,'click',ev=>{
  if(ev.target===reader){
    const bounds=reader.getBoundingClientRect();
    if(ev.clientX<bounds.left||ev.clientX>bounds.right||ev.clientY<bounds.top||ev.clientY>bounds.bottom)closeReader();
  }
});
listen(drawer,'cancel',ev=>{ev.preventDefault();closeDrawer();});
listen(drawer,'click',ev=>{
  if(ev.target!==drawer)return;
  const rect=drawer.getBoundingClientRect();
  if(ev.clientX>rect.right||ev.clientX<rect.left)closeDrawer();
});
listen(smallScreen,'change',()=>{
  if(!smallScreen.matches&&drawer.open){dockToc();restoreTocScroll();}
});
let swipe=null;
listen(window.document,'touchstart',ev=>{
  swipe=null;
  if(!smallScreen.matches||!$('tocTree')||ev.touches.length!==1)return;
  const touch=ev.touches[0];
  if(drawer.open || (touch.clientX<=26 && !document.querySelector('dialog:modal') && !ev.target.closest('input,textarea,select'))){
    swipe={x:touch.clientX,y:touch.clientY,close:drawer.open};
  }
},{passive:true});
listen(window.document,'touchend',ev=>{
  if(!swipe)return;
  const start=swipe;swipe=null;
  if(ev.touches.length)return;
  const touch=ev.changedTouches[0];
  const dx=touch.clientX-start.x,dy=touch.clientY-start.y;
  if(Math.abs(dx)<56||Math.abs(dx)<Math.abs(dy)*1.6)return;
  if(start.close&&dx<0)closeDrawer();
  else if(!start.close&&dx>0)openDrawer();
},{passive:true});
listen(window.document,'touchcancel',()=>{swipe=null;},{passive:true});
function openQuestion(id,pref) {
  if(view){
    if(pref && /^[ks]-/.test(pref))navigate((pref.startsWith('s-')?'practice/':'entry/')+pref,{question:id,scrollQuestion:true});
    else location.hash='question='+encodeURIComponent(id);
    return;
  }
  const target=questionTarget(id,pref);
  if(target.route==='library'){navigate('library',target);return;}
  const changes={question:id,scrollQuestion:true,focus:''};
  if(target.route===path) update(changes);else navigate(target.route,changes);
}
function changeSearchQuery(q){
  const filters={q};
  state.filters=filters;
  state.libraryLimit=40;
  history.replaceState(state,'','#'+libraryAddress(filters));
  renderedHash=location.hash;
  renderRoute();
}
listen(window.document,'submit',ev=>{
  if(!ev.target.matches('[data-global-form]'))return;
  ev.preventDefault();
  const q=ev.target.elements.q.value.trim();
  closeHeaderSearch();
  if(path==='library')changeSearchQuery(q);
  else navigate('library',{filters:{q}});
  if(compactHeader.matches)root.focus({preventScroll:true});
  else searchForm.elements.q.focus();
});
listen(window.document,'click',ev=>{
  const el=ev.target.closest('button,a');
  if(!el||el.disabled||ev.button!==0||ev.ctrlKey||ev.metaKey||ev.altKey||ev.shiftKey)return;
  const ds=el.dataset;
  if(el.classList.contains('skip')) {ev.preventDefault();root.focus();return;}
  if(el.id==='closeEntry'){closeReader();return;}
  if(el.id==='openToc'){openDrawer();return;}
  if(el.id==='closeToc'){closeDrawer();return;}
  if(el.hasAttribute('data-toc-link')){ev.preventDefault();chooseToc(el);return;}
  if(ds.tab){
    ev.preventDefault();
    if(ds.tab!==path||state.pick){
      navigate(ds.tab);
      root.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});
    }
    return;
  }
  if(ds.key)state.focus=ds.key;
  if(el.id==='nIndex'||el.id==='nSkill'||ds.route) {
    ev.preventDefault();const target=ds.route||el.hash.slice(1);
    const dest=resolveRoute(target);
    if(dest.route!==path || (dest.pick||'')!==state.pick || dest.scrollQuestion ||
      (wordingPracticePages.has(path) && state.question)) navigate(dest.route,dest);
    return;
  }
  if(ds.question){ev.preventDefault();openQuestion(ds.question,ds.prefer);return;}
  if(ds.back){if(state.from)history.back();else {const dest=resolveRoute(ds.back);navigate(dest.route,dest);}return;}
  if(ds.page){update({page:state.page+Number(ds.page),top:0,focus:''});return;}
  if(ds.step){
    update({step:state.step+Number(ds.step),question:'',top:0,focus:'',opened:[]});
    const next=root.querySelector('[data-step="'+ds.step+'"]')||root.querySelector('[data-step]');
    next?.focus({preventScroll:true});
    return;
  }
  if(ds.choice && el.closest('.wordingExample')){
    const id=el.closest('.wordingExample').dataset.row;
    if(wordingAnswers.has(id))return;
    wordingAnswers.set(id,ds.choice);
    update({focus:''});
    $('wordingResult').focus();
    return;
  }
  if(ds.toggleQ){update({question:state.question===ds.toggleQ?'':ds.toggleQ,focus:''});return;}
  if(ds.basis){navigate('entry/'+ds.basis);return;}
  const qid=el.closest('[data-work]')?.dataset.work;
  if(qid&&ds.choice){choices[qid]=ds.choice;if(qs[qid].answer)reveal.add(qid);save();update({focus:''});return;}
  if(qid&&'reveal' in ds){if(reveal.has(qid))reveal.delete(qid);else reveal.add(qid);update({focus:''});return;}
  if(view && ('attachq' in ds || 'attachn' in ds)){window.studyPages.fullPicker('attachq' in ds?'q':'n',ds.attachn);return;}
  if('attachq' in ds){openPicker('q');return;}
  if(ds.attachn){openPicker('n',ds.attachn);return;}
  if(el.id==='closeDlg'){$('dialog').close();return;}
  if('pickmore' in ds){pickLimit+=40;picks();return;}
  if('link' in ds||'unlink' in ds){
    const row=el.closest('[data-pn]'),n=row.dataset.pn,q=row.dataset.pq;
    if('link' in ds){if(!localEdge(n,q)&&!baseEdge(n,q))manual.push({n,q,role:$('role').value});}
    else manual=manual.filter(e=>e.n!==n||e.q!==q);
    if(reader.open)readerHostDirty=true;
    const ok=save();picks();update({focus:''});
    if(ok)notify('link' in ds?'已关联。':'已撤销关联。');
  }
});
listen(window.document,'keydown',ev=>{
  const tab=ev.target.closest('[role="tab"]');
  if(!tab||!['ArrowRight','ArrowLeft','Home','End'].includes(ev.key))return;
  const tabs=[...tab.parentElement.querySelectorAll('[role="tab"]')], i=tabs.indexOf(tab);
  const next=ev.key==='Home'?0:ev.key==='End'?tabs.length-1:(i+(ev.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  ev.preventDefault();tabs[next].click();
});
listen(window.document,'change',ev=>{
  if(ev.target.id==='practiceSet'){
    update({group:Number(ev.target.value),step:0,question:'',opened:[],top:0,focus:''});
    $('practiceSet')?.focus({preventScroll:true});
  }
});
listen(window.document,'input',ev=>{
  const el=ev.target;
  if(path==='library' && el.matches('header [data-global-form] input') && !ev.isComposing)changeSearchQuery(el.value);
  if(el.id==='pickSearch'){pickLimit=30;picks();}
  if(el.dataset.draft){drafts[el.dataset.draft]=el.value;save();}
});
listen($('dialog'),'click',ev=>{if(ev.target===$('dialog'))$('dialog').close();});
listen($('dialog'),'close',()=>{picker=null;});

listen(window,'resize',()=>{if(reader.open)syncEntryTop();});
listen(window,'pagehide',savePlace);
if(compile)return compile({nodes,qs,mats,study,training,reviewSources,skillNodes,skillTree,courses,eventYears,
  modulePracticePages,wordingPracticePages,wordingRoute,wordingTopic,wordingDirectory,wordingPage,
  resolveRoute,questionTarget,initial,useView,groups,unitsOf,slugFor,directoryMarkup,tocAddress,canonicalId,
  strategyPages,strategyMarkup,defaultStrategyRoute,strategyTabs,strategyRedirects});
if('scrollRestoration' in history)history.scrollRestoration='manual';
renderRoute();
return {render:renderRoute, picker:openPicker, cancelPreview:stopPreview, dispose(){
  renderSequence++;listeners.abort();stopPreview();clearTimeout(toastTimer);
  if(drawer.open)dockToc();
  if($('dialog').open)$('dialog').close();
}};

};
