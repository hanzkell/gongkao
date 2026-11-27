/* 旧入口和新阅读页使用同一份可携带的记录格式。只读写本页的记录键。 */
(() => {
  const host = document.querySelector('[data-progress-key]');
  if (!host) return;
  const key = host.dataset.progressKey;
  const main = key === 'gongkao.knowledge-training.v1';
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const mapOf = (x, accepts) => object(x) && Object.entries(x).every(([k, v]) =>
    !['__proto__', 'constructor', 'prototype'].includes(k) && accepts(v));
  const text = x => typeof x === 'string';
  function valid(v) {
    if (!object(v)) return false;
    if (main) return Array.isArray(v.manual) && v.manual.every(e => object(e) && text(e.q) && text(e.n)
        && ['直接考查','解题依据'].includes(e.role)) &&
      mapOf(v.choices, text) && mapOf(v.drafts, text);
    return Array.isArray(v.pinned) && v.pinned.every(text) && text(v.last) &&
      mapOf(v.attempts, a => object(a) && text(a.pick) && text(a.draft) && typeof a.submitted === 'boolean');
  }
  function button(label, action) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.addEventListener('click', action); host.append(b);
  }
  const status = document.createElement('span');
  status.setAttribute('role','status');
  function download(raw) {
    const url = URL.createObjectURL(new Blob([JSON.stringify({format:'gongkao-progress-v1',key,records:raw})],
      {type:'application/json'}));
    const a = document.createElement('a');
    a.href = url; a.download = (main ? '知识与训练' : '非时政练习') + '-学习记录.json';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  button('导出学习记录', () => {
    try {
      const value = localStorage.getItem(key);
      if (value) { download(JSON.parse(value)); status.textContent = '已导出。'; }
      else status.textContent = '此浏览器尚无本页记录。';
    } catch { status.textContent = '此浏览器无法读取记录。'; }
  });
  if (!host.hasAttribute('data-export-only')) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
    input.addEventListener('change', async () => {
      try {
        const file = input.files[0];
        if (!file) return;
        const data = JSON.parse(await file.text());
        if (data.format !== 'gongkao-progress-v1' || data.key !== key || !valid(data.records))
          throw Error('请选择由此阅读页导出的有效记录。');
        if (localStorage.getItem(key) && !confirm('导入会替换此页已有记录。继续吗？')) return;
        localStorage.setItem(key, JSON.stringify(data.records)); location.reload();
      } catch (e) { status.textContent = e.message || '导入失败。'; }
      finally { input.value = ''; }
    });
    host.append(input); button('导入学习记录', () => input.click());
  }
  host.append(status);
})();
