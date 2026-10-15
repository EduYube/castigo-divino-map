'use strict';
const fs = require('node:fs');
const path = require('node:path');

function generatePdf(markdown) {
  const W = 595.28;
  const H = 841.89;
  const margin = 46;
  const bodyWidth = W - margin * 2;
  const pages = [];
  let page = null;
  let y = 0;

  function clean(text) {
    return text
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      .replace(/\*\*/g, '').replace(/\*([^*]+)\*/g, '$1').replace(/~~/g, '')
      .replace(/`/g, '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2194/g, '<->')
      .replace(/\u2192/g, '->')
      .replace(/\u2190/g, '<-')
      .replace(/\u2265/g, '>=')
      .replace(/\u2264/g, '<=')
      .replace(/\u2026/g, '...')
      .replace(/\u2610/g, '[ ]')
      .replace(/\u2022/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/[^\u0020-\u00ff]/g, '?');
  }

  function quote(text) {
    return clean(text)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }


  // PDF standard-font glyph advances for WinAnsi characters 32..255, in 1/1000 em.
  const normalWidths = '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584 350 556 350 222 556 333 1000 556 556 333 1000 667 333 1000 350 611 350 350 222 222 333 333 350 556 1000 333 1000 500 333 944 350 500 667 278 333 556 556 556 556 260 556 333 737 370 556 584 333 737 333 400 584 333 333 333 556 537 278 333 333 365 556 834 834 834 611 667 667 667 667 667 667 1000 722 667 667 667 667 278 278 278 278 722 722 778 778 778 778 778 584 778 722 722 722 722 667 667 611 556 556 556 556 556 556 889 500 556 556 556 556 278 278 278 278 556 556 556 556 556 556 556 584 611 556 556 556 556 500 556 500'.split(' ').map(Number);
  const boldWidths = '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584 350 556 350 278 556 500 1000 556 556 333 1000 667 333 1000 350 611 350 350 278 278 500 500 350 556 1000 333 1000 556 333 944 350 500 667 278 333 556 556 556 556 280 556 333 737 370 556 584 333 737 333 400 584 333 333 333 611 556 278 333 333 365 556 834 834 834 611 722 722 722 722 722 722 1000 722 667 667 667 667 278 278 278 278 722 722 778 778 778 778 778 584 778 722 722 722 722 667 667 611 556 556 556 556 556 556 889 556 556 556 556 556 278 278 278 278 611 611 611 611 611 611 611 584 611 611 611 611 611 556 611 556'.split(' ').map(Number);
  function textWidth(text, size, mono = false, bold = false) {
    const widths = bold ? boldWidths : normalWidths;
    let total = 0;
    for (const char of clean(text)) {
      const index = char.charCodeAt(0) - 32;
      total += mono ? 600 : (index >= 0 && index < 224 ? widths[index] : 600);
    }
    return total * size / 1000;
  }

  function wrap(text, maxWidth, size, mono = false, bold = false) {
    const words = clean(text).split(' ').filter(Boolean);
    const lines = [];
    let current = '';
    for (const raw of words) {
      let word = raw;
      while (textWidth(word, size, mono, bold) > maxWidth) {
        let part = '';
        for (const c of word) {
          if (textWidth(part + c, size, mono, bold) > maxWidth && part) break;
          part += c;
        }
        if (current) { lines.push(current); current = ''; }
        lines.push(part);
        word = word.slice(part.length);
      }
      if (!word) continue;
      const candidate = current ? current + ' ' + word : word;
      if (textWidth(candidate, size, mono, bold) <= maxWidth) current = candidate;
      else { if (current) lines.push(current); current = word; }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  function drawText(text, x, baseline, size, font = 'F1', rgb = '0.15 0.20 0.27') {
    if (textWidth(text, size, font === 'F3', font === 'F2') > W - margin - x + 0.2) {
      throw new Error(`Text exceeds content margin: ${text.slice(0, 50)}`);
    }
    page.cmd.push(
      `${rgb} rg BT /${font} ${size.toFixed(2)} Tf 1 0 0 1 ${x.toFixed(2)} ${baseline.toFixed(2)} Tm (${quote(text)}) Tj ET`,
    );
  }

  function drawLine(x1, y1, x2, y2, rgb = '0.80 0.85 0.90') {
    page.cmd.push(
      `${rgb} RG 0.5 w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`,
    );
  }

  function rect(x, baseline, w, h, fill = '0.95 0.97 0.99') {
    page.cmd.push(
      `${fill} rg ${x.toFixed(2)} ${baseline.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`,
    );
  }

  function newPage() {
    page = { cmd: [], annotations: [] };
    pages.push(page);
    drawText('EL ATLAS DE LOS NUEVOS DIOSES  /  MAP-071', margin, 811, 8, 'F2', '0.19 0.35 0.54');
    drawLine(margin, 801, W - margin, 801);
    y = 779;
  }

  function need(height) {
    if (!page) newPage();
    if (y - height < 62) newPage();
  }

  function paragraph(text) {
    const lines = wrap(text, bodyWidth, 9.15);
    need(Math.min(32, 13 * lines.length));
    for (const line of lines) {
      need(13);
      drawText(line, margin, y, 9.15);
      y -= 13.2;
    }
    y -= 4.8;
  }

  function heading(level, text) {
    const size = level === 1 ? 18 : level === 2 ? 13.2 : 10.8;
    const lh = level === 1 ? 23 : level === 2 ? 19 : 15;
    const lines = wrap(text, bodyWidth, size, false, true);
    need(15 + lines.length * lh + 15);
    y -= level === 1 ? 4 : level === 2 ? 13 : 11;
    for (const line of lines) {
      drawText(line, margin, y, size, 'F2', '0.12 0.32 0.51');
      y -= lh;
    }
    if (level === 1) drawLine(margin, y + 5, W - margin, y + 5);
    y -= level === 1 ? 12 : 5.5;
  }

  function listItem(prefix, text) {
    const indent = 19;
    const lines = wrap(text, bodyWidth - indent, 9.1);
    need(Math.min(38, lines.length * 13));
    drawText(prefix, margin + 2, y, 9.0, 'F2', '0.19 0.35 0.54');
    for (const line of lines) {
      need(13);
      drawText(line, margin + indent, y, 9.1);
      y -= 13;
    }
    y -= 2.5;
  }

  function callout(text) {
    const lines = wrap(text, bodyWidth - 26, 9.15);
    const h = lines.length * 13 + 20;
    need(h + 12);
    rect(margin, y - h + 7, bodyWidth, h, '0.94 0.97 0.99');
    rect(margin, y - h + 7, 3.4, h, '0.15 0.38 0.61');
    let b = y - 7;
    for (const line of lines) {
      drawText(line, margin + 12, b, 9.15, 'F1', '0.11 0.26 0.40');
      b -= 13;
    }
    y -= h + 8;
  }


  function table(rows) {
    if (!rows.length) return;
    const count = rows[0].length;
    const fractions =
      count === 2 ? [0.40, 0.60] : count === 3 ? [0.25, 0.40, 0.35] : [0.22, 0.40, 0.12, 0.26];
    const widths = fractions.map((fraction) => fraction * bodyWidth);
    const layout = rows.map((cells, r) => {
      const wrapped = cells.map((cell, c) => wrap(cell, widths[c] - 12, 7.8, false, r === 0));
      const lineCount = Math.max(...wrapped.map((lines) => lines.length));
      return { wrapped, height: Math.max(22, lineCount * 10.2 + 11) };
    });
    const fits = (height) => y - height - 4 >= 62;
    function drawRow(r, header = false) {
      const { wrapped, height } = layout[r];
      if (header) rect(margin, y - height, bodyWidth, height, '0.88 0.93 0.97');
      else if (r % 2 === 0) rect(margin, y - height, bodyWidth, height, '0.975 0.98 0.99');
      drawLine(margin, y - height, margin + bodyWidth, y - height, '0.80 0.85 0.90');
      let x = margin;
      for (let c = 0; c < wrapped.length; c += 1) {
        for (let t = 0; t < wrapped[c].length; t += 1) {
          drawText(wrapped[c][t], x + 6, y - 12 - t * 10.2, 7.8, header ? 'F2' : 'F1');
        }
        x += widths[c];
      }
      y -= height;
    }
    for (let r = 0; r < rows.length; r += 1) {
      if (r === 0) {
        // Do not leave a heading isolated; keep first two rows together.
        if (!fits(layout[0].height + (layout[1]?.height || 0))) newPage();
      } else {
        // Continue tables with the same column headings; keep final two rows together.
        const finalPair = r === rows.length - 2 &&
          !fits(layout[r].height + layout[r + 1].height);
        if (!fits(layout[r].height) || finalPair) {
          newPage();
          drawRow(0, true);
        }
      }
      if (!fits(layout[r].height)) throw new Error('Table row does not fit page');
      drawRow(r, r === 0);
    }
    y -= 10;
  }

  function codeBlock(lines) {
    if (!lines.length) return;
    need(30);
    y -= 2;
    for (const line of lines) {
      for (const segment of wrap(line, bodyWidth - 18, 8.2, true)) {
        need(11);
        rect(margin, y - 3.5, bodyWidth, 12.2, '0.95 0.96 0.97');
        drawText(segment, margin + 9, y, 8.2, 'F3');
        y -= 12.2;
      }
    }
    y -= 6;
  }


  const scenarioIDs = [...markdown.matchAll(/^### (QA-[A-Z0-9]+-\d{2})\b/gm)].map((match) => match[1]);
  const checklistIDs = [...markdown.matchAll(/^\| (QA-[A-Z0-9]+-\d{2}) \|/gm)].map((match) => match[1]);
  if (scenarioIDs.length !== 27 || new Set(scenarioIDs).size !== 27 ||
      scenarioIDs.join('|') !== checklistIDs.join('|')) {
    throw new Error('MAP-071 requires 27 scenarios and 27 matching checklist rows');
  }

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let para = [];
  const flush = () => {
    if (para.length) paragraph(para.join(' '));
    para = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith('~~~')) {
      flush();
      const code = [];
      while (++i < lines.length && !lines[i].trim().startsWith('~~~')) code.push(lines[i]);
      codeBlock(code);
      continue;
    }
    if (line.startsWith('|') && line.endsWith('|')) {
      flush();
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().slice(1, -1).split('|').map((value) => value.trim());
        if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) rows.push(cells);
        i += 1;
      }
      i -= 1;
      table(rows);
      continue;
    }
    const match = /^(#{1,3})\s+(.*)$/.exec(line);
    if (match) {
      flush();
      heading(match[1].length, match[2]);
      continue;
    }
    if (line.startsWith('> ')) {
      flush();
      callout(line.slice(2));
      continue;
    }
    const listMatch = /^(\d+\.|-\s(?:\[ \]\s)?)\s*(.*)$/.exec(line);
    if (listMatch) {
      flush();
      listItem(listMatch[1].startsWith('-') ? '-' : listMatch[1], listMatch[2]);
      continue;
    }
    para.push(line);
  }
  flush();

  for (let i = 0; i < pages.length; i += 1) {
    page = pages[i];
    drawLine(margin, 55, W - margin, 55);
    drawText(
      `MAP-071  |  QA administrativa v1.2  |  Página ${i + 1} / ${pages.length}`,
      margin,
      39,
      7.3,
      'F1',
      '0.35 0.41 0.49',
    );
  }

  const objects = [null];
  const reserve = () => {
    objects.push('');
    return objects.length - 1;
  };
  const catalogId = reserve();
  const pagesId = reserve();
  const regularId = reserve();
  const boldId = reserve();
  const monoId = reserve();
  objects[regularId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[boldId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objects[monoId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>';
  const pageIds = [];
  for (const pageData of pages) {
    const streamId = reserve();
    const pageId = reserve();
    const stream = pageData.cmd.join('\n') + '\n';
    objects[streamId] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
    objects[pageId] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] ` +
      `/Resources << /Font << /F1 ${regularId} 0 R /F2 ${boldId} 0 R /F3 ${monoId} 0 R >> >> ` +
      `/Contents ${streamId} 0 R >>`;
    pageIds.push(pageId);
  }
  objects[pagesId] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

  let binary = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = binary.length;
    binary += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = binary.length;
  binary += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i += 1) {
    binary += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  binary += `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return binary;
}

const root = path.resolve(__dirname, '..');
const markdownPath = path.join(root, 'docs/map-071-admin-qa-guide.md');
const pdfPath = path.join(root, 'docs/map-071-admin-qa-guide.pdf');
const generated = Buffer.from(generatePdf(fs.readFileSync(markdownPath, 'utf8')), 'latin1');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(pdfPath) || !fs.readFileSync(pdfPath).equals(generated)) {
    console.error('PDF de QA administrativa obsoleto: vuelve a generar desde Markdown.');
    process.exitCode = 1;
  } else {
    console.log('PDF de QA administrativa coincide byte a byte con Markdown.');
  }
} else {
  fs.writeFileSync(pdfPath, generated);
  console.log('PDF de QA administrativa regenerado desde Markdown.');
}
