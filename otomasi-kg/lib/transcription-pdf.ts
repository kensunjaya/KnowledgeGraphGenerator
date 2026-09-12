import { chromium } from 'playwright';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

// Render only the structures emitted by transcribe.py. Transcript text is
// always escaped: it cannot load URLs, execute scripts, or inject HTML.
export function transcriptHtml(markdown: string) {
  const content = markdown.split(/\r?\n/).map(line => {
    if (!line.trim()) return '';
    if (line.startsWith('# ')) return `<h1 dir="auto">${escapeHtml(line.slice(2))}</h1>`;
    if (line.startsWith('## ')) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
    if (/^\*\*\[[\d:–-]+\]\*\*$/.test(line)) return `<h3>${escapeHtml(line.slice(2, -2))}</h3>`;
    if (line.startsWith('- **')) {
      const metadata = line.match(/^- \*\*(.+?):\*\* (.*)$/);
      if (metadata) return `<div class="metadata"><strong>${escapeHtml(metadata[1])}:</strong> ${escapeHtml(metadata[2].replace(/`/g, ''))}</div>`;
    }
    return `<p dir="auto">${escapeHtml(line)}</p>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Transcript</title>
    <style>
    body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.65; color: #18181b; }
    h1 { font-size: 22pt; line-height: 1.25; margin: 0 0 18pt; overflow-wrap: anywhere; }
    h2 { font-size: 14pt; border-bottom: 1px solid #e4e4e7; padding-bottom: 8pt; margin-top: 24pt; }
    h3 { font-size: 10pt; color: #52525b; margin: 18pt 0 5pt; }
    h1,h2,h3 { break-after: avoid; }
    .metadata { font-size: 9pt; color: #52525b; overflow-wrap: anywhere; }
    p { margin: 0 0 10pt; overflow-wrap: anywhere; orphans: 3; widows: 3; }
    </style></head><body>${content}</body></html>`;
}

export async function transcriptPdf(markdown: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ javaScriptEnabled: false });
    await page.route('**/*', route => route.abort());
    await page.setContent(transcriptHtml(markdown));
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      format: 'A4', printBackground: true,
      margin: { top: '20mm', bottom: '22mm', left: '20mm', right: '20mm' },
      displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: '<div style="font:9px Arial;color:#71717a;text-align:center;width:100%">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    });
  } finally { await browser.close(); }
}
