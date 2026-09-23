/**
 * SOP: no text in `src/` ends in an ellipsis.
 *
 * House style (owner, 2026-09-14): a progress message says what is happening —
 * "Saving the demo package", not "Saving the demo package…" — and a button that
 * opens a picker says what it opens. Before this, 470 strings across 160 files
 * ended in `...` or `…`, in two spellings, and new work kept copying them.
 *
 * WHAT IT READS. String literals, template-literal pieces and JSX text, found by
 * the TypeScript parser rather than a regex (a regex over TSX mistakes an
 * apostrophe in JSX text for the start of a string and reads comments as copy),
 * plus the string values in `src/**\/*.json`, where the prerequisite and logging
 * progress messages live.
 *
 * WHAT IT ALLOWS, because these ellipses carry meaning:
 * - a TRUNCATION marker: right after a value that was cut
 *   (`${text.slice(0, 80)}…`), or a string that is nothing but the marker
 *   (`id.substring(0, 8) + '...'`), or one after a space or comma (`', ...'`);
 * - syntax between two values, like a GitHub compare range `${base}...${head}`;
 * - an ellipsis mid-sentence, meaning "and so on" (`start_demo…). Takes`) — this
 *   rule is about TRAILING ellipses, the progress-message habit.
 *
 * Out of scope: code Demo Builder publishes INTO storefronts (`eds/services/pdp/`)
 * and the AI context it writes into projects (`aiBundle/`), which ship to other
 * programs on their own versioning.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';

const ROOT = join(__dirname, '..', '..');
const OUT_OF_SCOPE = [
    /^src\/features\/eds\/services\/pdp\//,
    /^src\/features\/project-creation\/services\/aiBundle\/(?!thirdPartyToolingSettingListener)/,
];
const ELLIPSIS = /…|\.\.\./g;
/** A template value that was cut: the ellipsis after it marks the cut. */
const CUT_VALUE = /slice|substring|substr|trunc|max/i;

interface Piece {
    text: string;
    /** The template value right before this piece, when there is one. */
    previousValue?: string;
    /** A template piece that sits between two values. */
    betweenValues?: boolean;
}

/** Offences in one piece of text: each trailing, stylistic ellipsis. */
function trailingEllipses({ text, previousValue, betweenValues }: Piece): string[] {
    const found: string[] = [];
    for (const match of text.matchAll(ELLIPSIS)) {
        const at = match.index ?? 0;
        const rest = text.slice(at + match[0].length);
        if (rest.trim() !== '') continue; // mid-sentence: allowed
        if (betweenValues && text.trim().replace(/…|\.\.\./g, '') === '') continue; // `${a}...${b}`
        const before = at > 0 ? text[at - 1] : '';
        if (at === 0 && previousValue !== undefined) {
            if (CUT_VALUE.test(previousValue)) continue; // truncation marker
        } else if (!(previousValue !== undefined && before === ')')) {
            if (!/[A-Za-z]/.test(text)) continue; // a bare marker
            if (before === '' || /[\s,([]/.test(before)) continue; // list continuation
        }
        found.push(text.trim());
    }
    return found;
}

function piecesOfSource(file: string, source: string): Piece[] {
    const sf = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const pieces: Piece[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isTemplateExpression(node)) {
            pieces.push({ text: node.head.text });
            node.templateSpans.forEach((span) => {
                visit(span.expression);
                pieces.push({
                    text: span.literal.text,
                    previousValue: span.expression.getText(sf),
                    betweenValues: ts.isTemplateMiddle(span.literal),
                });
            });
            return;
        }
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) pieces.push({ text: node.text });
        else if (ts.isJsxText(node)) pieces.push({ text: node.getText(sf) });
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return pieces;
}

function piecesOfJson(source: string): Piece[] {
    // Decoded, so an escaped `\u2026` is seen as the ellipsis it renders as.
    return [...source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => ({ text: JSON.parse(`"${m[1]}"`) as string }));
}

/** `file: text` for every offence in the given sources. */
function offences(files: Array<{ file: string; source: string }>): string[] {
    return files.flatMap(({ file, source }) =>
        (file.endsWith('.json') ? piecesOfJson(source) : piecesOfSource(file, source))
            .flatMap(trailingEllipses)
            .map((text) => `${file}: ${text}`),
    );
}

const SOURCES = execSync('git ls-files src', { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(tsx?|json)$/.test(f) && !OUT_OF_SCOPE.some((rule) => rule.test(f)))
    .map((file) => ({ file, source: readFileSync(join(ROOT, file), 'utf8') }));

describe('SOP: no text in src/ ends in an ellipsis', () => {
    it('CONTROL: flags a planted trailing ellipsis in each place text lives', () => {
        const planted = [
            { file: 'a.ts', source: "const a = 'Saving the demo package…';" },
            { file: 'b.ts', source: 'const b = `Deploying ${name}...`;' },
            { file: 'c.ts', source: 'const c = `Checking access (${n}/${total})…`;' },
            { file: 'd.tsx', source: 'const d = <Text>Loading projects...</Text>;' },
            { file: 'e.json', source: '{ "message": "Installing Git..." }' },
        ];
        expect(offences(planted)).toStrictEqual([
            'a.ts: Saving the demo package…',
            'b.ts: ...',
            'c.ts: )…',
            'd.tsx: Loading projects...',
            'e.json: Installing Git...',
        ]);
    });

    it('CONTROL: leaves truncation markers, syntax and mid-sentence ellipses alone', () => {
        const allowed = [
            { file: 'a.ts', source: 'const a = `${text.slice(0, 80)}…`;' },
            { file: 'b.ts', source: "const b = id.substring(0, 8) + '...';" },
            { file: 'c.ts', source: "const c = failed.length > 10 ? ', ...' : '';" },
            { file: 'd.ts', source: 'const d = `compare/${base}...${head}`;' },
            { file: 'e.ts', source: "const e = '(get_project, start_demo…). Takes the path';" },
            { file: 'f.ts', source: 'const f = [...items]; // spread, not text…' },
        ];
        expect(offences(allowed)).toStrictEqual([]);
    });

    it('CONTROL: reads a real tree', () => {
        expect(SOURCES.length).toBeGreaterThan(500);
    });

    it('finds none in src/', () => {
        expect(offences(SOURCES)).toStrictEqual([]);
    });
});
