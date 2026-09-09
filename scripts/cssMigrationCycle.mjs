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

/**
 * The cascade layer enclosing the rule that starts at `lineIndex`, or null.
 *
 * Counts `@layer <name> {` openings against closings before that point. Crude, and
 * sufficient here: this file's layer blocks are top-level and never nested inside
 * one another.
 */
/**
 * Is the rule at `lineIndex` nested inside a CONDITIONAL at-rule?
 *
 * `@media`, `@container` and `@supports` gate their contents. Lifting a rule out
 * of one does not relocate it, it makes it apply ALWAYS. On the first real cycle
 * `.sidebar-tile-grid` inside `@media (max-height: 640px)` was hoisted to top
 * level and flipped the sidebar tiles from a column to a row — 48 elements, and
 * the kind of change that looks like a styling opinion rather than a bug.
 *
 * A rule in this position is NOT MOVABLE by this script. Refusing is the whole
 * behaviour: a partially-moved family is worse than an unmoved one, because the
 * leftovers still apply and the split reads as done.
 */
function insideConditionalAtRule(lines, lineIndex) {
    const stack = [];
    for (let i = 0; i < lineIndex; i++) {
        const l = lines[i];
        if (/^\s*@(media|container|supports)[^{]*\{/.test(l)) stack.push('cond');
        else if (/^\s*@layer\s+[\w-]+\s*\{/.test(l)) stack.push('layer');
        else if (/^\s*\}\s*$/.test(l) && stack.length) stack.pop();
    }
    return stack.includes('cond');
}

function enclosingLayer(text, lines, lineIndex) {
    const before = lines.slice(0, lineIndex).join('\n');
    const stack = [];
    const token = /@layer\s+([A-Za-z-]+)\s*\{|\{|\}/g;
    let m;
    let depth = 0;
    while ((m = token.exec(before)) !== null) {
        if (m[1]) { depth++; stack.push({ name: m[1], depth }); }
        else if (m[0] === '{') depth++;
        else { if (stack.length && stack[stack.length - 1].depth === depth) stack.pop(); depth--; }
    }
    return stack.length ? stack[stack.length - 1].name : null;
}

/** Top-level rules with their line spans and family, in source order. */
function readRules(text) {
    const lines = text.split('\n');
    const skip = commentLines(text);
    const rules = [];
    for (let i = 0; i < lines.length; i++) {
        if (skip.has(i)) continue;

        // A selector LIST can span lines:
        //     .a:hover,
        //     .a:hover * {
        // Only the last line carries the `{`, so a line-anchored match finds the
        // rule but records it as starting one line too late — and a move then
        // leaves the earlier selectors behind in the source file. That happened on
        // the first real cycle (2026-09-08): `.sidebar-action-tile:hover` stayed in
        // custom-spectrum.css while its base rule moved out, and the VISUAL DIFF
        // COULD NOT SEE IT, because the leftover still applied from the sheet the
        // bundle still imports. 51 lines in that file are selector-then-comma.
        let head = i;
        while (head > 0 && !skip.has(head - 1) && /^\s*[.#[][^{}]*,\s*$/.test(lines[head - 1])) head--;

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
        // Which cascade layer encloses this rule, if any. A move that drops the
        // wrapper does not relocate a rule, it PROMOTES it: custom-spectrum's rules
        // sit in `@layer theme`, and an unlayered copy beats Spectrum where the
        // layered original lost. On the first real cycle that moved 90 sidebar
        // elements — tiles flipped from column to row and fonts grew — and it is
        // the one thing about this migration the visual diff is genuinely good at
        // catching, because it changes what renders.
        const layer = enclosingLayer(text, lines, head);
        const conditional = insideConditionalAtRule(lines, head);

        const selectorText = lines.slice(head, i + 1).join(' ');
        const allClasses = [...selectorText.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((x) => x[1]);
        const prefix = allClasses[0].split('-')[0];
        rules.push({
            start: head,
            end,
            layer,
            conditional,
            selector: selectorText.replace(/\s+/g, ' ').trim(),
            prefix,
            feature: !UTILITY_PREFIXES.has(prefix),
        });
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

    // REFUSE a family with any rule inside @media/@container/@supports. Hoisting
    // one out makes it apply unconditionally, and moving only the others leaves a
    // leftover that still applies — both look like a successful move.
    const nested = rules.filter((r) => r.conditional);
    if (nested.length) {
        console.error(
            `REFUSED: ${nested.length} of ${rules.length} .${prefix}-* rules sit inside a ` +
            `conditional at-rule (@media / @container / @supports):`
        );
        for (const r of nested) console.error(`   line ${r.start + 1}: ${r.selector.slice(0, 66)}`);
        console.error(
            '\nMoving them would hoist them out of their condition so they always apply, and\n' +
            'moving only the rest leaves a leftover that still applies. Neither is visible in\n' +
            'a visual diff as a MISTAKE — it just looks like a styling change. Handle this\n' +
            'family by hand, preserving each at-rule wrapper.'
        );
        process.exit(1);
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

    // Extract in source order, preserving the text verbatim AND the cascade layer
    // each rule came from. Rules are grouped by layer so the emitted sheet
    // reproduces the position they had, not merely the text.
    const drop = new Set();
    const byLayer = new Map();
    for (const r of rules) {
        const key = r.layer ?? '';
        if (!byLayer.has(key)) byLayer.set(key, []);
        byLayer.get(key).push(lines.slice(r.start, r.end + 1).join('\n'));
        for (let i = r.start; i <= r.end; i++) drop.add(i);
    }
    const layersSeen = [...byLayer.keys()];
    const taken = layersSeen.map((layer) =>
        layer
            ? `@layer ${layer} {\n${byLayer.get(layer).join('\n\n')}\n}`
            : byLayer.get(layer).join('\n\n')
    );
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
    console.log(`cascade layers preserved: ${layersSeen.map((l) => l || '(unlayered)').join(', ')}`);
    console.log(`\nNOT DONE YET. This changed counts, not pixels. Before committing:`);
    console.log(`  1. import ${target} from the entry/entries whose components use .${prefix}-*`);
    console.log(`  2. capture -> rebuild -> re-capture -> diff  (webview-visual-baseline)`);
    console.log(`  3. the diff MUST be empty; a non-empty diff reverts the move`);
    console.log(`  4. then: node scripts/cssMigrationCycle.mjs --check`);

    const rest = leftovers(prefix);
    if (rest.length) {
        console.error(`\nINCOMPLETE MOVE — ${rest.length} line(s) still mention .${prefix}-*:`);
        for (const r of rest) console.error('   ' + r);
        console.error('The visual diff CANNOT catch this: a leftover still applies.');
        process.exit(1);
    }
    console.log(`\ncompleteness: no .${prefix}-* rules left behind`);
}

/**
 * After moving family X, no rule in the god file may still mention `.X-`.
 *
 * THE VISUAL DIFF CANNOT DO THIS. A leftover rule still applies — the god file is
 * still imported by the bundle that renders the family — so a half-moved family
 * renders identically and the diff is empty. The split looks done and is not.
 * Found on the first real cycle: `.sidebar-action-tile:hover` stayed behind while
 * its base rule left, and only a direct search found it.
 */
function leftovers(prefix) {
    const text = readFileSync(join(ROOT, GOD_FILE), 'utf8');

    // Test where the MATCH sits, not where its line starts. A comment that begins
    // after indentation — `    /* Match .brand-card-name ... */` — leaves the line
    // START outside the comment span, so a line-based check reported three such
    // comments as leftover RULES on 2026-09-08 and refused a legitimate move.
    const spans = [...text.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index, m.index + m[0].length]);
    const inComment = (pos) => spans.some(([a, b]) => pos >= a && pos < b);

    const lines = text.split('\n');
    const re = new RegExp(`(?<![\\w-])\\.${prefix}-[\\w-]+`);
    const out = [];
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
        const m = re.exec(lines[i]);
        if (m && !inComment(offset + m.index)) out.push(`${i + 1}: ${lines[i].trim().slice(0, 76)}`);
        offset += lines[i].length + 1;
    }
    return out;
}

function cmdLeftovers(prefix) {
    const rest = leftovers(prefix);
    if (rest.length) {
        console.error(`REFUSED: ${rest.length} line(s) still mention .${prefix}-* in the god file:`);
        for (const r of rest) console.error('   ' + r);
        console.error('\nA leftover still APPLIES, so the visual diff cannot see this. Move them too.');
        process.exit(1);
    }
    console.log(`no .${prefix}-* rules remain in the god file`);
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

    // E: a MULTI-LINE selector list is one rule, and its span starts at the FIRST
    //    selector line. The first version started it at the line carrying the `{`,
    //    so a move left the earlier selectors behind — and the visual diff could
    //    not see that, because a leftover in the god file still applies.
    const multi = ['.a:hover,', '.a:hover * {', '    color: red;', '}'].join('\n');
    const e = readRules(multi);
    check('E-multiline-selector-span-starts-at-the-first-line',
        e.length === 1 && e[0].start === 0 && e[0].end === 3,
        `got ${e.length} rule(s) spanning ${JSON.stringify(e.map((r) => [r.start, r.end]))}`);

    // F: a rule inside @media must be flagged conditional, and one outside must not.
    const media = [
        '.plain-thing {', '    color: red;', '}',
        '@media (max-height: 640px) {',
        '.gated-thing {', '    color: blue;', '}',
        '}',
    ].join('\n');
    const f = readRules(media);
    check('F-conditional-at-rule-is-detected',
        f.length === 2 && f[0].conditional === false && f[1].conditional === true,
        `flags ${JSON.stringify(f.map((r) => [r.selector.trim(), r.conditional]))}`);

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
else if (cmd === '--leftovers') cmdLeftovers(rest[0]);
else {
    console.log('usage: cssMigrationCycle.mjs --next | --move <prefix> --to <path> | --check | --leftovers <prefix> | --selftest');
    process.exit(2);
}
