/**
 * The contact sheet: one card per shipped example, with its screenshot, block, source, verdict
 * and the reason for it. A plain HTML file opened from disk.
 */

const escape = (text) => String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const COLOURS = { PASS: '#1a7f37', FAIL: '#cf222e', 'STRUCTURE ONLY': '#9a6700' };

function card(result) {
    const colour = COLOURS[result.verdict] ?? '#57606a';
    const shot = result.screenshot
        ? `<a href="${escape(result.screenshot)}"><img src="${escape(result.screenshot)}" alt="${escape(result.blockId)}"></a>`
        : '<div class="none">No screenshot</div>';
    return `<section>
  <h2>${escape(result.blockId)} <span style="background:${colour}">${escape(result.verdict)}</span></h2>
  <p class="meta">${escape(result.source)}: ${escape(result.repo)} @ ${escape(result.ref)}</p>
  <p>${escape(result.reason)}</p>
  ${shot}
</section>`;
}

/** The sheet's HTML for the results of one run. */
export function contactSheet(results, ranAt) {
    const counts = Object.entries(results.reduce((all, r) => ({ ...all, [r.verdict]: (all[r.verdict] ?? 0) + 1 }), {}))
        .map(([verdict, n]) => `${n} ${verdict}`).join(', ');
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Block Examples Contact Sheet</title>
<style>
  body { font: 14px/1.4 -apple-system, system-ui, sans-serif; margin: 24px; color: #1f2328; }
  section { border: 1px solid #d0d7de; border-radius: 8px; padding: 12px 16px; margin: 0 0 24px; }
  h2 { font-size: 18px; margin: 0 0 4px; }
  h2 span { color: #fff; font-size: 12px; padding: 2px 8px; border-radius: 10px; vertical-align: middle; }
  .meta { color: #57606a; margin: 0 0 8px; }
  img { max-width: 100%; border: 1px solid #d0d7de; }
  .none { color: #57606a; font-style: italic; }
</style></head>
<body>
<h1>Block Examples Contact Sheet</h1>
<p>${escape(ranAt)}: ${escape(counts)}. Each example rendered at 1280px with the block's real code.</p>
${results.map(card).join('\n')}
</body></html>
`;
}
