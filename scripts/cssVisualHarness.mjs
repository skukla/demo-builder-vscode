#!/usr/bin/env node
/**
 * Stand up the visual-baseline harness in one command.
 *
 * Every CSS migration cycle needs the same seven steps before a single rule can
 * be verified: compile, stage the bundles, stage the stylesheets and harness,
 * build the fixtures, write a sentinel, serve it on a free port, and prove the
 * browser reads YOUR server rather than something else already on that port.
 *
 * Those were re-derived by hand from `.claude/skills/webview-visual-baseline/`
 * on every cycle of 2026-09-08/09. Seven steps recalled from prose is a memory
 * test that eventually fails, and two of them are load-bearing in a way that is
 * invisible when skipped:
 *
 *   - **the sentinel**, because port 8899 was already answered by an unrelated
 *     app inside the browser container. Every iframe got a JSON 404, which reads
 *     as "the surface renders nothing" rather than "wrong server".
 *   - **a FREE port**, for the same reason. This picks one and says which.
 *
 * It cannot drive the browser, so it stops at the point where a human or an agent
 * must, and prints the exact call to make next.
 *
 *     node scripts/cssVisualHarness.mjs            # compile, stage, serve
 *     node scripts/cssVisualHarness.mjs --no-build # reuse the current dist/
 *     node scripts/cssVisualHarness.mjs --stop     # tear down
 */

import { execSync, spawn } from 'child_process';
import { createServer } from 'net';
import { existsSync, mkdirSync, rmSync, writeFileSync, copyFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DIR = '/tmp/vr';
const SKILL = '.claude/skills/webview-visual-baseline';
const FIRST_PORT = 8917; // NOT 8899 — squatted inside the browser container

function freePort(from) {
    for (let p = from; p < from + 40; p++) {
        try {
            const s = createServer();
            const ok = new Promise((res, rej) => { s.once('error', rej); s.once('listening', () => s.close(() => res(true))); });
            s.listen(p, '127.0.0.1');
            // synchronous-enough: if listen throws immediately we move on
            void ok;
            return p;
        } catch {
            continue;
        }
    }
    throw new Error('no free port found');
}

function stop() {
    try { execSync(`pkill -f "http.server ${FIRST_PORT}"`, { stdio: 'ignore' }); } catch { /* none running */ }
    for (let p = FIRST_PORT; p < FIRST_PORT + 40; p++) {
        try { execSync(`pkill -f "http.server ${p}"`, { stdio: 'ignore' }); } catch { /* none */ }
    }
    rmSync(DIR, { recursive: true, force: true });
    console.log('harness stopped, staging directory removed');
}

if (process.argv.includes('--stop')) { stop(); process.exit(0); }

if (!process.argv.includes('--no-build')) {
    console.log('compiling…');
    execSync('npm run compile', { stdio: 'ignore' });
}
if (!existsSync('dist/webview')) {
    console.error('dist/webview is missing — run without --no-build');
    process.exit(1);
}

stop();
mkdirSync(DIR, { recursive: true });

for (const f of readdirSync('dist/webview')) {
    if (f.endsWith('-bundle.js')) copyFileSync(join('dist/webview', f), join(DIR, f));
}
for (const f of ['src/core/ui/styles/reset.css', 'src/core/ui/styles/tokens.css']) {
    copyFileSync(f, join(DIR, f.split('/').pop()));
}
copyFileSync(join(SKILL, 'harness.html'), join(DIR, 'h.html'));
copyFileSync(join(SKILL, 'capture.js'), join(DIR, 'capture.js'));
copyFileSync(join(SKILL, 'capture-interactions.js'), join(DIR, 'capture-interactions.js'));
if (existsSync('node_modules/axe-core/axe.min.js')) {
    copyFileSync('node_modules/axe-core/axe.min.js', join(DIR, 'axe.min.js'));
}
execSync(`node ${SKILL}/build-fixtures.mjs ${DIR}`, { stdio: 'ignore' });

const sentinel = `VR-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
writeFileSync(join(DIR, 'sentinel.txt'), sentinel + '\n');

const port = freePort(FIRST_PORT);
const server = spawn('python3', ['-m', 'http.server', String(port)], {
    cwd: DIR, detached: true, stdio: 'ignore',
});
server.unref();

const bundles = readdirSync(DIR).filter((f) => f.endsWith('-bundle.js')).length;
console.log(`
harness up
  staged     ${bundles} bundles + fixtures in ${DIR}
  serving    http://localhost:${port}   (browser: http://host.docker.internal:${port})
  sentinel   ${sentinel}

NEXT — and do the sentinel check FIRST, it is not optional:

  1. browser_run_code: goto http://host.docker.internal:${port}/sentinel.txt
     and confirm the body reads exactly   ${sentinel}
     Anything else means another server holds this port; the captures would be
     of blank pages and every diff would be empty.

  2. Capture the baseline into localStorage so it survives the rebuild:
       await page.goto(BASE + '/capture.js');
       const code = await page.evaluate(() => document.body.innerText);
       await page.goto(BASE + '/h.html?b=dashboard&cb=' + Date.now());
       await page.waitForTimeout(2500);
       await page.evaluate(async (c) => {
         (0, eval)(c + '\\n; window.__cap = capture;');
         localStorage.setItem('baseline', JSON.stringify(await window.__cap()));
       }, code);

  3. Make ONE change, then:  npm run compile && cp dist/webview/*-bundle.js ${DIR}/
  4. Re-capture and diff against localStorage 'baseline'. EMPTY commits.
  5. node scripts/cssVisualHarness.mjs --stop
`);
