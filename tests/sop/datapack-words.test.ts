/**
 * SOP: one set of words for datapacks (datapack simplification, Phase 1, owner 2026-11-10).
 *
 * A datapack is INSTALLED into Commerce and UNINSTALLED from it (D1); the dry run is CHECK FIRST
 * (D6); the thing is a "datapack", never a "pack" on its own; a setting is named in words, never by
 * its raw `demoBuilder.` key; and a sentence breaks with a colon or a full stop, not a long dash.
 * The repeated phrases live in `src/features/data-installer/datapackWords.ts`.
 *
 * It reads every string literal, template literal and JSX text in the data installer and the
 * three wait files, with the TypeScript parser, and skips what never reaches a screen: comments
 * (not literals at all), module paths, type names, property keys, comparisons, identifier-shaped
 * tokens (`'import'`, `'dryRun'`, `'demoBuilder.dataInstaller'`) and log lines. A string that
 * looks like a sentence but only an agent reads is marked where it stands with a
 * `datapack-words: not on screen` comment, or listed in the ledger with its reason.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';

const ROOT = join(__dirname, '..', '..');

const SCANNED_DIRS = ['src/features/data-installer'];
const SCANNED_FILES = [
    'src/core/utils/waitStages.ts',
    'src/core/utils/datapackStages.ts',
    'src/core/utils/creationStages.ts',
];

/** The marker that says a sentence is read by an agent or a log, never drawn on a screen. */
const NOT_ON_SCREEN = 'datapack-words: not on screen';

interface Finding {
    file: string;
    line: number;
    rule: string;
    text: string;
}

const RULES: ReadonlyArray<{ rule: string; test: (text: string) => boolean }> = [
    { rule: 'Install, not Import', test: (text) => /\bimport(s|ing|ed)?\b/i.test(text) },
    { rule: 'Check First, not Dry Run', test: (text) => /\bdry[ -]?run\b/i.test(text) },
    { rule: 'datapack, not pack', test: (text) => /\bpacks?\b/i.test(text) },
    { rule: 'no raw setting key', test: (text) => /\bdemoBuilder\.\w/.test(text) },
    { rule: 'no long dash in a sentence', test: (text) => text.includes('—') && text.trim() !== '—' },
];

/**
 * A string the rules do not apply to, by file and its exact text, with why. Shrink only.
 */
const LEDGER: ReadonlyArray<{ file: string; text: string; reason: string }> = [];

/** A token with no space that starts lower case: an id, a key, a path, a mode. Never a sentence. */
const IDENTIFIER_SHAPED = /^[a-z@./_][\w.\-/:@*]*$/;

const LOG_CALLEE = /(^|\.)(log|logger|debugLogger|console|info|debug|warn|trace|error)\b/i;

function listFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return listFiles(full);
        return /\.tsx?$/.test(entry) && !entry.endsWith('.d.ts') ? [full] : [];
    });
}

function scannedFiles(): string[] {
    return [...SCANNED_DIRS.flatMap((dir) => listFiles(join(ROOT, dir))), ...SCANNED_FILES.map((file) => join(ROOT, file))];
}

function isLogCall(node: ts.Node): boolean {
    for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
        if (ts.isCallExpression(at) && LOG_CALLEE.test(at.expression.getText())) {
            const callee = at.expression.getText();
            // `logger.error(…)`, `this.logger.info(…)`, `console.warn(…)`: the object is a logger.
            if (/(^|\.)(logger|debugLogger|console|log)(\.|$)/i.test(callee)) return true;
        }
        if (ts.isStatement(at) || ts.isFunctionLike(at)) break;
    }
    return false;
}

function isMarkedNotOnScreen(node: ts.Node, source: ts.SourceFile): boolean {
    const text = source.getFullText();
    for (let at: ts.Node | undefined = node; at && !ts.isSourceFile(at); at = at.parent) {
        const ranges = ts.getLeadingCommentRanges(text, at.getFullStart()) ?? [];
        if (ranges.some((range) => text.slice(range.pos, range.end).includes(NOT_ON_SCREEN))) return true;
        if (ts.isStatement(at) && !ts.isBlock(at) && !ts.isReturnStatement(at)) {
            // Stop at the statement, but let a marker on a whole declaration cover everything in it.
            if (!ts.isVariableStatement(at)) break;
        }
    }
    return false;
}

/** Whether this literal sits where nothing is drawn: a path, a type, a key, a comparison. */
function isStructural(node: ts.Node): boolean {
    const parent = node.parent;
    if (!parent) return true;
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return true;
    if (ts.isLiteralTypeNode(parent)) return true;
    if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) return true;
    if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true;
    if (ts.isCaseClause(parent)) return true;
    if (ts.isJsxAttribute(parent) && /^(className|key|id|data-[\w-]+|aria-controls|htmlFor|role)$/.test(parent.name.getText())) return true;
    if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind)) return true;
    if (ts.isCallExpression(parent) && /^(require|jest\.mock|import)$/.test(parent.expression.getText())) return true;
    return false;
}

/** The words a literal puts on screen, with `${}` where a value goes. */
function wordsOf(node: ts.Node): string | undefined {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) {
        return [node.head.text, ...node.templateSpans.map((span) => `\${}${span.literal.text}`)].join('');
    }
    if (ts.isJsxText(node)) return node.getText().replace(/\s+/g, ' ').trim();
    return undefined;
}

export function scanSource(source: ts.SourceFile, file: string): Finding[] {
    const findings: Finding[] = [];
    const visit = (node: ts.Node): void => {
        const text = wordsOf(node);
        if (text !== undefined && text.trim() !== '' && !IDENTIFIER_SHAPED.test(text.trim())) {
            const failed = RULES.filter((rule) => rule.test(text));
            if (failed.length > 0 && !isStructural(node) && !isLogCall(node) && !isMarkedNotOnScreen(node, source)) {
                const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
                for (const { rule } of failed) findings.push({ file, line, rule, text });
            }
        }
        // A template's spans are read as part of it, not again on their own.
        if (!ts.isTemplateExpression(node)) ts.forEachChild(node, visit);
        else node.templateSpans.forEach((span) => ts.forEachChild(span.expression, visit));
    };
    visit(source);
    return findings;
}

function parse(fileName: string, text: string): ts.SourceFile {
    return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function scanAll(): { findings: Finding[]; strings: number } {
    let strings = 0;
    const findings = scannedFiles().flatMap((full) => {
        const source = parse(full, readFileSync(full, 'utf8'));
        const count = (node: ts.Node): void => {
            if (wordsOf(node) !== undefined) strings += 1;
            ts.forEachChild(node, count);
        };
        count(source);
        return scanSource(source, relative(ROOT, full));
    });
    return { findings, strings };
}

const ledgered = (finding: Finding): boolean =>
    LEDGER.some((entry) => entry.file === finding.file && entry.text === finding.text);

describe('SOP: one set of words for datapacks', () => {
    const { findings, strings } = scanAll();

    it('CONTROL: catches a planted string for every rule, and passes what is not on screen', () => {
        const planted = parse(
            'planted.tsx',
            [
                "const a = 'Import My Luma';",
                "const b = <Button>Dry Run</Button>;",
                "const c = `Every data type in the pack`;",
                "const d = 'Set demoBuilder.dataInstaller.apiBaseUrl first.';",
                "const e = 'Saved — it is ready.';",
                // None of these reach a screen.
                "import { x } from './importModal';",
                "if (mode === 'import') {}",
                "const f = { import: 1 };",
                "const g = 'dryRun';",
                "logger.info('Import finished for the pack');",
                `// ${NOT_ON_SCREEN}`,
                "const h = 'Imports a datapack into Commerce.';",
                "type T = 'import' | 'Dry Run';",
                "const i = 'Install My Luma';",
            ].join('\n'),
        );
        const caught = scanSource(planted, 'planted.tsx');

        expect(caught.map((finding) => finding.rule)).toStrictEqual(RULES.map((rule) => rule.rule));
        expect(caught.map((finding) => finding.line)).toStrictEqual([1, 2, 3, 4, 5]);
    });

    it('CONTROL: reads the real files, not an empty list', () => {
        expect(scannedFiles().length).toBeGreaterThan(100);
        expect(strings).toBeGreaterThan(1500);
    });

    it('finds no datapack word off the convention', () => {
        const report = findings
            .filter((finding) => !ledgered(finding))
            .map((finding) => `${finding.file}:${finding.line} [${finding.rule}] ${JSON.stringify(finding.text)}`);

        expect(report).toStrictEqual([]);
    });

    it('keeps no ledger entry for a string that is gone', () => {
        const stale = LEDGER.filter((entry) => !findings.some((finding) => finding.file === entry.file && finding.text === entry.text));

        expect(stale).toStrictEqual([]);
    });
});
