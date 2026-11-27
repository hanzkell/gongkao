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
