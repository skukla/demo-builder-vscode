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
 * Whole-line comment BLOCKS, mapped last line -> first line.
 *
 * Spans, not lines, and that distinction is the whole point. The first version
 * classified each line as comment-or-not and walked upwards while the line above
 * was a comment. A block comment containing a BLANK LINE — this file has several,
 * the longest running 20 lines with two paragraph breaks — stops that walk in the
 * middle of itself. Applied on 2026-09-09 it cut two blocks in half, left the
 * opening `/*` behind in the god file, and the orphaned tail turned into CSS: the
 * browser dropped `.dashboard-status-badges` and
 * `.dashboard-status-capabilities-link` entirely, and 48 elements moved.
 *
 * THE VISUAL DIFF CAUGHT IT, which is the argument for the diff and not for the
 * care. A block comment is one span whatever is inside it.
 *
 * A block counts only if it occupies its lines WHOLE — nothing but whitespace
 * before the `/*` and after the `*\/`. That excludes a trailing
 * `color: red; /* why *\/`, which documents the declaration it sits on rather than
 * the rule below, and includes an INDENTED block, which the line-start test in
 * `commentLines` reads as code (the 2026-09-08 false-leftover bug).
 */
function docCommentBlocks(text) {
    const lines = text.split('\n');
    const lineStart = [];
    let off = 0;
    for (const l of lines) { lineStart.push(off); off += l.length + 1; }
    const lineOf = (pos) => {
        let lo = 0, hi = lineStart.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStart[mid] <= pos) lo = mid; else hi = mid - 1; }
        return lo;
    };
    const map = new Map();
    for (const m of text.matchAll(/\/\*[\s\S]*?\*\//g)) {
        const a = m.index;
        const b = a + m[0].length;
        const la = lineOf(a);
        const lb = lineOf(b - 1);
        const before = lines[la].slice(0, a - lineStart[la]);
        const after = lines[lb].slice(b - lineStart[lb]);
        if (before.trim() === '' && after.trim() === '') map.set(lb, la);
    }
    return map;
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
    const doc = docCommentBlocks(text);
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

        // The documentation block DIRECTLY above, with no blank line between.
        //
        // A move that takes the rule and leaves its comment splits the two apart in
        // BOTH directions: the feature sheet arrives undocumented and the god file
        // keeps prose about rules it no longer holds. Measured 2026-09-09 across the
        // eight cycles already run — 84 of 185 moved rules left their comment behind,
        // 82 of them directly adjacent like this.
        //
        // ADJACENT ONLY, deliberately. A block one blank line up is as likely to be a
        // SECTION banner covering rules of several families, and taking it would move
        // a heading away from most of what it heads. Two of the 84 are that shape;
        // they are left, and left visible.
        // Walk up through CONSECUTIVE whole-line blocks. A blank line between two
        // blocks ends the walk, because the higher one is as likely to be a section
        // banner over several families as documentation of this rule.
        let docStart = head;
        for (let above = head - 1; doc.has(above); above = docStart - 1) docStart = doc.get(above);

        const selectorText = lines.slice(head, i + 1).join(' ');
        const allClasses = [...selectorText.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((x) => x[1]);
        const prefix = allClasses[0].split('-')[0];
        rules.push({
            start: head,
            docStart,
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

/**
 * Fold `@layer X { A }` immediately followed by `@layer X { B }` into one block.
 *
 * Appending a family to an existing sheet opened a SECOND wrapper of the same name
 * each time — prerequisites.css and brand-cards.css both ended up with two. It is
 * identical to the cascade (same layer, same order) and it reads as though the two
 * halves were in different layers, which is the one thing about this file that has
 * repeatedly been got wrong.
 *
 * ADJACENT ONLY. Two blocks of one name with a rule between them are NOT the same
 * as one block: merging those would move that rule's position in the cascade.
 */
function mergeAdjacentLayerBlocks(text) {
    return text.replace(/\}\s*\n\s*@layer\s+([A-Za-z-]+)\s*\{\n/g, (m, name, offset, whole) => {
        // Only when the `}` being consumed closes a @layer block of the SAME name.
        const before = whole.slice(0, offset);
        const opens = [...before.matchAll(/@layer\s+([A-Za-z-]+)\s*\{/g)];
        if (!opens.length) return m;
        // Walk from the last `@layer` opening. If depth ever returns to 0 the block
        // is ALREADY CLOSED, and the `}` this matched belongs to something else —
        // a rule sitting between two same-named blocks. Merging then would move
        // that rule in the cascade, so refuse. Without this check the separated
        // case merges and control M fails, which is how it was found.
        const last = opens[opens.length - 1];
        if (last[1] !== name) return m;
        let depth = 0;
        for (const ch of before.slice(last.index)) {
            if (ch === '{') depth++;
            else if (ch === '}' && --depth === 0) return m;
        }
        if (depth !== 1) return m;
        return '\n';
    });
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
    let withDocs = 0;
    for (const r of rules) {
        const key = r.layer ?? '';
        if (!byLayer.has(key)) byLayer.set(key, []);
        // From docStart, so the rule arrives with the comment that explains it.
        byLayer.get(key).push(lines.slice(r.docStart, r.end + 1).join('\n'));
        for (let i = r.docStart; i <= r.end; i++) drop.add(i);
        if (r.docStart !== r.start) withDocs++;
    }
    const layersSeen = [...byLayer.keys()];
    const taken = layersSeen.map((layer) =>
        layer
            ? `@layer ${layer} {\n${byLayer.get(layer).join('\n\n')}\n}`
            : byLayer.get(layer).join('\n\n')
    );
    const remaining = lines.filter((_, i) => !drop.has(i)).join('\n');

    const targetPath = join(ROOT, target);
    // The header states REACH, because that is the property ADR-017 §6 turns on and
    // the one a reader cannot get from the file itself. The entry list is left for
    // the operator to fill: the imports are added AFTER this runs (step 4 of the
    // cycle), so anything written here would be a guess.
    const header = existsSync(targetPath)
        ? ''
        : `/**\n * .${prefix}-* styles.\n *\n` +
          ` * FEATURE-SCOPED (ADR-017 §6). This sheet reaches only the esbuild entries\n` +
          ` * that import it — TODO: name them here. A class defined here is absent from\n` +
          ` * every other webview bundle, and an element using it there renders raw with\n` +
          ` * no error anywhere.\n *\n` +
          ` * Moved out of custom-spectrum.css by the CSS migration\n` +
          ` * (.rptc/plans/css-architecture-migration), with the comment above each rule.\n` +
          ` * Verbatim otherwise: a move is only correct when the visual diff is empty.\n */\n\n`;
    const existing = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : '';

    // A feature that has never had a stylesheet has no styles/ directory yet.
    mkdirSync(dirname(targetPath), { recursive: true });

    // Target FIRST, source second. If the target write fails, the god file is
    // untouched and nothing is lost — which is what happened during this script's
    // own self-test, and is the reason the order is stated rather than incidental.
    writeFileSync(
        targetPath,
        mergeAdjacentLayerBlocks(header + existing + (existing ? '\n' : '') + taken.join('\n\n') + '\n')
    );
    writeFileSync(godPath, remaining);

    console.log(`moved ${rules.length} rule(s) .${prefix}-* -> ${target}`);
    console.log(`cascade layers preserved: ${layersSeen.map((l) => l || '(unlayered)').join(', ')}`);
    console.log(`${withDocs} of ${rules.length} rule(s) travelled with the comment block above them`);
    console.log(`\nNOT DONE YET. This changed counts, not pixels. Before committing:`);
    console.log(`  1. import ${target} from the entry/entries whose components use .${prefix}-*`);
    console.log(`  2. capture -> rebuild -> re-capture -> diff  (webview-visual-baseline)`);
    console.log(`  3. the diff MUST be empty; a non-empty diff reverts the move`);
    console.log(`  4. then: node scripts/cssMigrationCycle.mjs --check`);

    const { owned, foreign, dangling } = classifyMentions(prefix);
    if (foreign.length) {
        console.log(`\nreferenced by ${foreign.length} rule(s) of OTHER families — not a leftover:`);
        for (const r of foreign) console.log('   ' + r);
        console.log(
            'Each stays in the god file, unchanged, styling .' + prefix + '-* elements as a\n' +
            'descendant. Its own rendering cannot change, and the moved rules\' new position\n' +
            'IS visible to the visual diff — so this is covered, not hidden.'
        );
    }
    if (owned.length || dangling.length) {
        const rest = [...owned, ...dangling];
        console.error(`\nINCOMPLETE MOVE — ${rest.length} line(s) of .${prefix}-*'s OWN rules remain:`);
        for (const r of rest) console.error('   ' + r);
        console.error('The visual diff CANNOT catch this: a leftover still applies.');
        process.exit(1);
    }
    console.log(`\ncompleteness: no .${prefix}-* rules left behind`);
}

/**
 * Every remaining mention of `.X-` in the god file, split by WHO OWNS THE RULE.
 *
 * THE VISUAL DIFF CANNOT SEE AN OWNED LEFTOVER. A rule of family X left behind
 * still applies — the god file is still imported by the bundle that renders the
 * family — so a half-moved family renders identically and the diff is empty. The
 * split looks done and is not. Found on the first real cycle:
 * `.sidebar-action-tile:hover` stayed behind while its base rule left, and only a
 * direct search found it.
 *
 * BUT DIRECTION MATTERS, AND THE FIRST VERSION OF THIS CHECK IGNORED IT. It
 * refused on ANY remaining mention, which conflated two different things:
 *
 *   owned    `.timeline-step { }` — a rule of the family, left behind. A real
 *            incompleteness. Refuse.
 *   foreign  `.wizard-timeline-column .timeline-step { }` — a rule of ANOTHER
 *            family that styles this one as a descendant. It belongs to `.wizard-*`
 *            and is not part of this move at all.
 *
 * A foreign rule stays in the god file, unedited, so its own rendering cannot
 * change; and the only thing the move DOES change — where the moved rules sit in
 * the cascade relative to it — is exactly what the visual diff measures. So it is
 * covered rather than hidden, and blocking on it is a false refusal.
 *
 * Measured 2026-09-09: 23 cross-family selectors in this file, and 12 families
 * blocked by a foreign rule alone. That includes `.intflow-*` — the largest
 * remaining family at 52 rules — blocked by ONE rule owned by `.manage-*`, and
 * `.timeline-*` (19), blocked by seven owned by `.wizard-*`.
 *
 * A third bucket refuses too: a mention inside NO parsed rule is a dangling
 * fragment the mover left behind, which is worse than either.
 */
function classifyMentions(prefix, source = null) {
    // The text is injectable ONLY so `--selftest` can plant each of the three
    // buckets. Production callers pass nothing and read the real file.
    const text = source ?? readFileSync(join(ROOT, GOD_FILE), 'utf8');

    // Test where the MATCH sits, not where its line starts. A comment that begins
    // after indentation — `    /* Match .brand-card-name ... */` — leaves the line
    // START outside the comment span, so a line-based check reported three such
    // comments as leftover RULES on 2026-09-08 and refused a legitimate move.
    const spans = [...text.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index, m.index + m[0].length]);
    const inComment = (pos) => spans.some(([a, b]) => pos >= a && pos < b);

    const lines = text.split('\n');

    // Which family owns each line, from the SAME parser `--move` selects with, so
    // ownership here and selection there cannot disagree. A line inside no rule
    // stays null and is reported as dangling.
    const ownerOf = new Array(lines.length).fill(null);
    for (const r of readRules(text)) {
        for (let i = r.start; i <= r.end; i++) ownerOf[i] = r.prefix;
    }

    const re = new RegExp(`(?<![\\w-])\\.${prefix}-[\\w-]+`);
    const owned = [];
    const foreign = [];
    const dangling = [];
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
        const m = re.exec(lines[i]);
        if (m && !inComment(offset + m.index)) {
            const line = `${i + 1}: ${lines[i].trim().slice(0, 76)}`;
            if (ownerOf[i] === prefix) owned.push(line);
            else if (ownerOf[i] === null) dangling.push(line);
            else foreign.push(`[.${ownerOf[i]}-*] ${line}`);
        }
        offset += lines[i].length + 1;
    }
    return { owned, foreign, dangling };
}

function cmdLeftovers(prefix) {
    const { owned, foreign, dangling } = classifyMentions(prefix);
    if (foreign.length) {
        console.log(`${foreign.length} rule(s) of OTHER families reference .${prefix}-* — not leftovers:`);
        for (const r of foreign) console.log('   ' + r);
        console.log('');
    }
    const rest = [...owned, ...dangling];
    if (rest.length) {
        console.error(`REFUSED: ${rest.length} line(s) of .${prefix}-*'s own rules remain in the god file:`);
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

    // G: an OWNED leftover is still refused. This is the 2026-09-08 defect the
    //    check was built for — a multi-line selector list whose head stayed behind
    //    while its body left — and making the check direction-aware must not
    //    weaken it.
    const ownedLeft = [
        '.sidebar-action-tile:hover,',
        '.sidebar-action-tile * {',
        '    color: red;',
        '}',
    ].join('\n');
    const g = classifyMentions('sidebar', ownedLeft);
    check('G-owned-leftover-is-refused', g.owned.length === 2 && g.foreign.length === 0,
        `owned ${g.owned.length}, foreign ${g.foreign.length}, dangling ${g.dangling.length}`);

    // H: a FOREIGN rule mentioning the family is reported, not refused. Without
    //    this, `.intflow-*` (52 rules) stays blocked by one `.manage-*` rule.
    const foreignRef = [
        '.manage-apis-body .intflow-api-picker {',
        '    overflow: hidden;',
        '}',
    ].join('\n');
    const h = classifyMentions('intflow', foreignRef);
    check('H-foreign-reference-is-not-a-leftover', h.owned.length === 0 && h.foreign.length === 1,
        `owned ${h.owned.length}, foreign ${h.foreign.length}, dangling ${h.dangling.length}`);

    // I: a mention inside NO rule is a dangling fragment and must refuse. A move
    //    that cut a rule in half leaves exactly this, and it parses as neither.
    const fragment = ['    color: red;', '}', '.intflow-orphan-tail,'].join('\n');
    const iRes = classifyMentions('intflow', fragment);
    check('I-dangling-fragment-is-refused', iRes.dangling.length === 1 && iRes.owned.length === 0,
        `owned ${iRes.owned.length}, foreign ${iRes.foreign.length}, dangling ${iRes.dangling.length}`);

    // J: a comment DIRECTLY above a rule is part of it, so a move takes both.
    const withDoc = ['/* why this rule exists */', '.a-thing {', '    color: red;', '}'].join('\n');
    const j = readRules(withDoc);
    check('J-adjacent-comment-attaches', j.length === 1 && j[0].docStart === 0 && j[0].start === 1,
        `docStart ${j[0]?.docStart}, start ${j[0]?.start}`);

    // K: a blank line breaks the attachment. A block up there is as likely to be a
    //    section banner over several families as documentation of this one rule.
    const gapped = ['/* a section banner */', '', '.a-thing {', '    color: red;', '}'].join('\n');
    const k = readRules(gapped);
    check('K-blank-line-breaks-attachment', k.length === 1 && k[0].docStart === k[0].start,
        `docStart ${k[0]?.docStart}, start ${k[0]?.start}`);

    // L: an INDENTED comment block still attaches, and a TRAILING comment on the
    //    previous line does not. Both are the `commentLines` line-start bug, which
    //    is why doc attachment uses its own detector.
    const indented = ['.prev { color: red; /* trailing note */ }', '    /* real doc */', '.a-thing {', '    color: blue;', '}'].join('\n');
    const l = readRules(indented);
    const target = l.find((r) => r.prefix === 'a');
    check('L-indented-doc-attaches-trailing-note-does-not',
        !!target && target.docStart === 1 && target.start === 2,
        `docStart ${target?.docStart}, start ${target?.start}`);

    // M: appending to a sheet that already has an `@layer theme` block yields ONE
    //    block, not two — and two blocks of the same name with a rule between them
    //    are left alone, because merging those would move that rule in the cascade.
    const twoBlocks = '@layer theme {\n.a { color: red; }\n}\n\n@layer theme {\n.b { color: blue; }\n}\n';
    const merged = mergeAdjacentLayerBlocks(twoBlocks);
    const separated = '@layer theme {\n.a { color: red; }\n}\n.mid { color: green; }\n@layer theme {\n.b { color: blue; }\n}\n';
    check('M-adjacent-layer-blocks-merge',
        (merged.match(/@layer theme \{/g) || []).length === 1 &&
        merged.includes('.a {') && merged.includes('.b {') &&
        (mergeAdjacentLayerBlocks(separated).match(/@layer theme \{/g) || []).length === 2,
        `merged ${(merged.match(/@layer theme \{/g) || []).length}, separated ${(mergeAdjacentLayerBlocks(separated).match(/@layer theme \{/g) || []).length}`);

    // N: a block comment containing a BLANK LINE attaches WHOLE. The line-based
    //    walk this replaced stopped at the blank line, left `/*` behind in the
    //    source file and moved the tail — which parses as CSS and silently kills
    //    the rules after it. 48 elements moved before the visual diff caught it.
    const withBlank = [
        '/* First paragraph of the reason.',
        '',
        '   Second paragraph, after a blank line. */',
        '.a-thing {',
        '    color: red;',
        '}',
    ].join('\n');
    const n = readRules(withBlank);
    check('N-blank-line-inside-a-comment-does-not-split-it',
        n.length === 1 && n[0].docStart === 0 && n[0].start === 3,
        `docStart ${n[0]?.docStart}, start ${n[0]?.start}`);

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
