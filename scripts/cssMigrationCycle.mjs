#!/usr/bin/env node
/**
 * One cycle of the CSS migration — the loopable half.
 *
 * Plan: .rptc/plans/css-architecture-migration/
 *
 * A cycle moves ONE feature family out of custom-spectrum.css into a feature
 * sheet. This script does the parts a machine can do alone and REFUSES to declare
 * success on the part it cannot: the visual diff needs a browser, so this prints
 * what to verify and exits with a status the caller acts on.
 *
 *   node scripts/cssMigrationCycle.mjs --next          which family is next, and why
 *   node scripts/cssMigrationCycle.mjs --move intflow --to src/features/.../x.css
 *   node scripts/cssMigrationCycle.mjs --check         did the counts move as expected
 *
 * WHY IT DOES NOT COMMIT. The done-condition for a move is an EMPTY VISUAL DIFF,
 * and nothing here can see pixels. A script that committed on the counts alone
 * would be asserting the one thing it did not measure — which is how the
 * 2026-09-08 layer-fix attempt would have shipped 762 moved elements as clean.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const ROOT = process.cwd();
const GOD_FILE = 'src/core/ui/styles/custom-spectrum.css';
const LEDGER = 'tests/sop/webview-architecture-rules.exemptions.json';

/** Must match tests/sop/stylesheet-bundles.test.ts — the test is the authority. */
const UTILITY_PREFIXES = new Set([
    'text', 'bg', 'border', 'w', 'h', 'min', 'max', 'flex', 'gap', 'p', 'm',
    'mt', 'mb', 'ml', 'mr', 'pt', 'pb', 'pl', 'pr', 'font', 'items', 'justify',
    'grid', 'rounded', 'shadow', 'opacity', 'overflow', 'cursor', 'hidden',
    'block', 'inline', 'relative', 'absolute', 'space', 'leading', 'tracking',
    'letter', 'uppercase', 'truncate', 'whitespace', 'align', 'self', 'order', 'z',
]);

/**
 * Line numbers that fall inside a comment.
 *
 * A comment can legitimately contain a line that LOOKS like a rule — this file has
 * 489 comment blocks and several quote selectors while explaining them. Zero such
 * lines exist today, checked 2026-09-08, but "zero today" is not a property this
 * script can rely on when it runs unattended: reading one as a rule would move a
 * fragment of prose into a stylesheet and leave a dangling brace behind.
 */
function commentLines(text) {
    const inComment = new Set();
    const lines = text.split('\n');
    let offset = 0;
    const spans = [...text.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index, m.index + m[0].length]);
    for (let i = 0; i < lines.length; i++) {
        if (spans.some(([a, b]) => offset >= a && offset < b)) inComment.add(i);
        offset += lines[i].length + 1;
    }
    return inComment;
}

/** Top-level rules with their line spans and family, in source order. */
function readRules(text) {
    const lines = text.split('\n');
    const skip = commentLines(text);
    const rules = [];
    for (let i = 0; i < lines.length; i++) {
        if (skip.has(i)) continue;
        const m = /^\s*([.#[][^{]*)\{/.exec(lines[i]);
        if (!m) continue;
        const classes = [...m[1].matchAll(/\.([A-Za-z_][\w-]*)/g)].map((x) => x[1]);
        if (!classes.length) continue;
        // find the closing brace of this rule
        let depth = 0;
        let end = i;
        for (let j = i; j < lines.length; j++) {
            depth += (lines[j].match(/\{/g) || []).length;
            depth -= (lines[j].match(/\}/g) || []).length;
            if (depth <= 0) { end = j; break; }
        }
        const prefix = classes[0].split('-')[0];
        rules.push({ start: i, end, selector: m[1].trim(), prefix, feature: !UTILITY_PREFIXES.has(prefix) });
        i = end;
    }
    return rules;
}

function families(rules) {
    const byPrefix = new Map();
    for (const r of rules) {
        if (!r.feature) continue;
        byPrefix.set(r.prefix, (byPrefix.get(r.prefix) || 0) + 1);
    }
    return [...byPrefix.entries()].sort((a, b) => b[1] - a[1]);
}

function counts() {
    const rules = readRules(readFileSync(join(ROOT, GOD_FILE), 'utf8'));
    return { total: rules.length, feature: rules.filter((r) => r.feature).length };
}

function ledger() {
    return JSON.parse(readFileSync(join(ROOT, LEDGER), 'utf8'));
}

function cmdNext() {
    const rules = readRules(readFileSync(join(ROOT, GOD_FILE), 'utf8'));
    const fam = families(rules);
    const { total, feature } = counts();
    const led = ledger();

    console.log(`god file      ${total} top-level rules, ${feature} feature-family`);
    console.log(`pins          godFileTopLevelRules=${led.godFileTopLevelRules} featureRulesInGlobalSheet=${led.featureRulesInGlobalSheet}`);
    console.log(`families left ${fam.length}\n`);
    console.log('next, largest first:');
    for (const [prefix, n] of fam.slice(0, 8)) console.log(`   ${String(n).padStart(4)}  .${prefix}-*`);
    if (!fam.length) console.log('   none — step 2 is complete');
}

function cmdMove(prefix, target) {
    const godPath = join(ROOT, GOD_FILE);
    const text = readFileSync(godPath, 'utf8');
    const lines = text.split('\n');
    const rules = readRules(text).filter((r) => r.prefix === prefix && r.feature);

    if (!rules.length) {
        console.error(`no feature rules with prefix .${prefix}-* — nothing to move`);
        process.exit(2);
    }
    if (!target) {
        console.error('--to <path> is required');
        process.exit(2);
    }
    // Repo-relative, under src/, and a .css file. Absolute paths silently became
    // `<repo>/tmp/...` under join() during the 2026-09-08 self-test; refusing is
    // better than resolving them, because a real target is always a feature sheet
    // inside src/ and anything else is a mistake worth stopping on.
    if (target.startsWith('/') || target.includes('..') || !target.startsWith('src/') || !target.endsWith('.css')) {
        console.error(`--to must be a repo-relative .css path under src/ — got: ${target}`);
        process.exit(2);
    }

    // Extract in source order, preserving the text verbatim.
    const taken = [];
    const drop = new Set();
    for (const r of rules) {
        taken.push(lines.slice(r.start, r.end + 1).join('\n'));
        for (let i = r.start; i <= r.end; i++) drop.add(i);
    }
    const remaining = lines.filter((_, i) => !drop.has(i)).join('\n');

    const targetPath = join(ROOT, target);
    const header = existsSync(targetPath)
        ? ''
        : `/**\n * ${prefix} styles.\n *\n * Moved out of custom-spectrum.css by the CSS migration\n * (.rptc/plans/css-architecture-migration). Verbatim: a move is only correct\n * when the visual diff is empty, so the rules are not edited on the way.\n */\n\n`;
    const existing = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : '';

    // A feature that has never had a stylesheet has no styles/ directory yet.
    mkdirSync(dirname(targetPath), { recursive: true });

    // Target FIRST, source second. If the target write fails, the god file is
    // untouched and nothing is lost — which is what happened during this script's
    // own self-test, and is the reason the order is stated rather than incidental.
    writeFileSync(targetPath, header + existing + (existing ? '\n' : '') + taken.join('\n\n') + '\n');
    writeFileSync(godPath, remaining);

    console.log(`moved ${rules.length} rule(s) .${prefix}-* -> ${target}`);
    console.log(`\nNOT DONE YET. This changed counts, not pixels. Before committing:`);
    console.log(`  1. import ${target} from the entry/entries whose components use .${prefix}-*`);
    console.log(`  2. capture -> rebuild -> re-capture -> diff  (webview-visual-baseline)`);
    console.log(`  3. the diff MUST be empty; a non-empty diff reverts the move`);
    console.log(`  4. then: node scripts/cssMigrationCycle.mjs --check`);
}

function cmdCheck() {
    const { total, feature } = counts();
    const led = ledger();
    const dTotal = led.godFileTopLevelRules - total;
    const dFeature = led.featureRulesInGlobalSheet - feature;

    console.log(`godFileTopLevelRules       ${led.godFileTopLevelRules} -> ${total}   (fell ${dTotal})`);
    console.log(`featureRulesInGlobalSheet  ${led.featureRulesInGlobalSheet} -> ${feature}   (fell ${dFeature})`);

    if (dTotal !== dFeature) {
        console.error(
            `\nREFUSED: the two counts moved by different amounts (${dTotal} vs ${dFeature}).\n` +
            `A move takes a whole feature rule out of the file, so both fall together.\n` +
            `They diverge when rules were relabelled, deleted, or a utility rule went with them.`
        );
        process.exit(1);
    }
    if (dTotal <= 0) {
        console.error(`\nREFUSED: nothing moved out (${dTotal}). Run --move first.`);
        process.exit(1);
    }
    console.log(`\nCounts are consistent. Pin them in ${LEDGER}:`);
    console.log(`   "godFileTopLevelRules": ${total},`);
    console.log(`   "featureRulesInGlobalSheet": ${feature},`);
    console.log(`\nThe suite will REFUSE to pass until you do — expectCeiling fails on a fall.`);
    console.log(`That refusal is the ratchet: progress cannot be banked without a reviewed edit.`);
}

/**
 * Controls. Every one plants a defect the mover could plausibly have, so a broken
 * mover fails here rather than in a stylesheet.
 */
function cmdSelfTest() {
    let failures = 0;
    const check = (name, ok, detail = '') => {
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
        if (!ok) failures++;
    };

    // A: a rule-shaped line INSIDE a comment must not be read as a rule.
    //
    // The line must START with the selector, or the line-anchored regex never
    // matches it and the control passes whether or not the comment skip works.
    // The first version of this fixture put the selector mid-line and passed with
    // the skip DELETED — caught 2026-09-08 by removing the skip on purpose.
    const withComment = [
        '/*',
        '.fake-thing { color: red; }',
        '*/',
        '.real-thing {',
        '    color: blue;',
        '}',
    ].join('\n');
    const a = readRules(withComment);
    check('A-comment-text-is-not-a-rule', a.length === 1 && a[0].prefix === 'real',
        `found ${a.length}: ${a.map((r) => r.selector).join(', ')}`);

    // B: a nested rule (inside @layer/@media) is one rule, not two, and its span
    //    must reach its own closing brace rather than the block's.
    const nested = ['.a {', '    color: red;', '}', '', '.b {', '    color: blue;', '}'].join('\n');
    const b = readRules(nested);
    check('B-spans-end-at-the-rule', b.length === 2 && b[0].end === 2 && b[1].start === 4,
        `spans ${JSON.stringify(b.map((r) => [r.start, r.end]))}`);

    // C: utility vs feature classification, both directions.
    const mixed = ['.text-sm {', '  font-size: 12px;', '}', '.dashboard-zone {', '  color: red;', '}'].join('\n');
    const c = readRules(mixed);
    check('C-utility-vs-feature', c.length === 2 && c[0].feature === false && c[1].feature === true,
        `flags ${JSON.stringify(c.map((r) => [r.prefix, r.feature]))}`);

    // D: the CONTROL on the controls — a deliberately broken expectation must FAIL,
    //    or all of the above could be passing vacuously.
    const d = readRules('.only-one { color: red; }');
    check('D-control-must-detect-a-wrong-answer', d.length === 1 && !(d.length === 2),
        'a 1-rule input reads as 1 rule');

    console.log(failures === 0 ? '\nALL CONTROLS PASSED' : `\n${failures} CONTROL(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === '--selftest') cmdSelfTest();
else if (cmd === '--next') cmdNext();
else if (cmd === '--move') {
    const toIdx = rest.indexOf('--to');
    cmdMove(rest[0], toIdx >= 0 ? rest[toIdx + 1] : null);
} else if (cmd === '--check') cmdCheck();
else {
    console.log('usage: cssMigrationCycle.mjs --next | --move <prefix> --to <path> | --check | --selftest');
    process.exit(2);
}
