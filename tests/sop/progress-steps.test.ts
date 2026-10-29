/**
 * SOP: one progress vocabulary (handbook, "progress"; plan
 * `.rptc/plans/progress-vocabulary/overview.md`, owner 2026-10-16).
 *
 * - **Line 1 is a step from the stage table.** Every call that reports a STEP passes a
 *   label from `OPERATION_STAGES` (or a list built from it), never a string literal or
 *   a template: a literal step has no expectation line, and it drifts from the table
 *   the day either is reworded.
 * - **"(n of N)" is only ever a step's position.** A count of pages, types, attempts or
 *   projects is a COUNT, and counts go on line 2 ("32 of 64 pages", `countLine`).
 *
 * The table's own rules (a label of at most 25 characters, a detail of 40, an
 * expectation of 25, no label twice) are held by
 * `tests/core/utils/operationStages.test.ts` and not repeated here; the line-2 text
 * written at call sites is the last suite below (`progressLineScan.ts`). Nor is the
 * table's list of files that report stages by reference repeated, which this scan
 * widens to all of `src/`.
 *
 * HOW A STEP SITE IS FOUND. By the TypeScript parser, file by file:
 * - calls to `reportStep(…)`, `stageLine(…)` and `onStage`. Not `onStep`: in the
 *   App Builder runner a "step" is the line UNDER the stage (PL-59's words), so an
 *   `onStep` there carries line 2, and a literal is right;
 * - calls to a REPORTER: the first parameter of the callback handed to
 *   `withOperationProgress`, `withProgressRegister` or `withComponentProgress`; a name
 *   declared with the type `ReportStage`, `StepSink` or `PositionedReport`; and a name
 *   assigned from `numberedSteps(…)`.
 * The step is the first argument. It offends when it is (or can be, through `?:`,
 * `??`, `||` or `+`) a string literal or a template.
 *
 * HOW A COUNT-AS-POSITION IS FOUND, and what is not mechanical. Two shapes are:
 * - a template that writes a position itself, `(${a} of ${b})` or `(${a}/${b})`, or
 *   a progress `message:` that starts `${a}/${b}: …`, outside `stageLine.ts`, which is the one place a position is
 *   written. Log lines are not progress and are skipped (a `logger.*` call, or text
 *   starting with a `[Tag]`);
 * - a position object, `{ index, total }`, built anywhere but the step-position
 *   builders named below. One with a `name` is the other form, which member of a
 *   pair is in flight (`stageLine` shows the name, never the count), and is left. WHETHER a builder's index counts steps or items cannot be
 *   read from the code; each builder here was read and says which steps it counts, so
 *   a new one fails until someone has done the same.
 *
 * What the scan cannot see: a step passed through a variable that a literal was
 * assigned to; a reporter under another name than the ones above (an `onProgress`
 * carries line 1 in some services and line 2 in others, so it is not read here;
 * `operationStages.test.ts` holds the App Builder files where it is line 1); and a
 * reporter that takes the step's NUMBER first (`report(1, label)`). The one such
 * reporter, the Adobe project teardown, names its steps from the table since
 * 2026-10-16 (`adobeProjectStages.ts`); a new one would not be caught here.
 *
 * No ledger: when this suite landed (2026-10-16) every offender it found was fixed,
 * so a new one fails outright.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { workingTreeFiles } from './architectureScan';
import { line2Sites, tooLong } from './progressLineScan';

const ROOT = join(__dirname, '..', '..');

/** Called directly with the step first. */
const STEP_FUNCTIONS = new Set(['reportStep', 'stageLine', 'onStage']);
/** Their callback's first parameter is the run's reporter. */
const PROGRESS_RUNNERS = new Set(['withOperationProgress', 'withProgressRegister', 'withComponentProgress']);
/** A name declared with one of these types is a reporter. */
const REPORTER_TYPES = new Set(['ReportStage', 'StepSink', 'PositionedReport']);

/** The one module that writes a position as text. */
const POSITION_WRITER = 'src/core/utils/stageLine.ts';

/**
 * Where a position object is built, each read and found to count the run's STEPS.
 * Not a ledger: these are right, and stay.
 */
const STEP_POSITION_BUILDERS: Record<string, string> = {
    'src/core/utils/numberedSteps.ts':
        'stepPosition: the index of a step in the list of steps the run reports, known before it starts.',
    'src/features/eds/services/reset/edsResetUI.ts':
        "The reset service's own step number and step total (executeEdsReset's fixed list of steps).",
    'src/features/prerequisites/handlers/installHandler.ts':
        "A prerequisite install's steps from prerequisites.json, counted as they run, total known up front.",
    'src/features/dashboard/handlers/aiHandlers.ts':
        "Regenerate AI Files' four or five steps, the total fixed by whether the project needs AI tooling.",
    'src/features/ai/server/edsResetTool.ts':
        "The agent's reset: the same step number and total the button's reset shows (executeEdsReset).",
    'src/features/ai/server/adobeResourceTools.ts':
        "Deleting an Adobe project from the agent: teardownConsoleProject's four fixed steps.",
    'src/features/authentication/handlers/deleteAdobeProjectHandler.ts':
        "Deleting an Adobe project from the button: teardownConsoleProject's four fixed steps.",
};

interface Site {
    file: string;
    /** The call or text, as written, whitespace collapsed. */
    text: string;
}

const where = (site: Site): string => `${site.file} | ${site.text}`;

/** The callee's own name: `report` for `report(…)`, `onStage` for `deps.onStage?.(…)`. */
function calleeName(call: ts.CallExpression): string | undefined {
    const callee = call.expression;
    if (ts.isIdentifier(callee)) return callee.text;
    if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
    return undefined;
}

/** Whether an expression is, or can evaluate to, text written into the code. */
function isLiteralText(node: ts.Expression): boolean {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
        return true;
    }
    if (ts.isParenthesizedExpression(node)) return isLiteralText(node.expression);
    if (ts.isConditionalExpression(node)) return isLiteralText(node.whenTrue) || isLiteralText(node.whenFalse);
    if (ts.isBinaryExpression(node)) return isLiteralText(node.left) || isLiteralText(node.right);
    return false;
}

function parse(file: string, source: string): ts.SourceFile {
    const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
}

function firstParamName(fn: ts.Expression): string | undefined {
    if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return undefined;
    const name = fn.parameters[0]?.name;
    return name && ts.isIdentifier(name) ? name.text : undefined;
}

/** The names this file reports steps through. */
function reporterNames(sf: ts.SourceFile): Set<string> {
    const names = new Set<string>();
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && PROGRESS_RUNNERS.has(calleeName(node) ?? '')) {
            for (const arg of node.arguments) {
                const name = firstParamName(arg);
                if (name) names.add(name);
            }
        }
        if ((ts.isParameter(node) || ts.isVariableDeclaration(node)) && ts.isIdentifier(node.name)) {
            const typed = node.type && ts.isTypeReferenceNode(node.type) ? node.type.typeName.getText(sf) : '';
            const init = ts.isVariableDeclaration(node) ? node.initializer : undefined;
            const fromNumbered = init && ts.isCallExpression(init) && calleeName(init) === 'numberedSteps';
            if (REPORTER_TYPES.has(typed) || fromNumbered) names.add(node.name.text);
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return names;
}

/** Every call that reports a step, and whether its step is written text. */
function stepCalls(file: string, source: string): Array<Site & { literal: boolean }> {
    const sf = parse(file, source);
    const reporters = reporterNames(sf);
    const found: Array<Site & { literal: boolean }> = [];
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
            const name = calleeName(node) ?? '';
            const isReporterCall = ts.isIdentifier(node.expression) && reporters.has(name);
            const step = node.arguments[0];
            if ((STEP_FUNCTIONS.has(name) || isReporterCall) && step) {
                found.push({ file, text: node.getText(sf).replace(/\s+/g, ' '), literal: isLiteralText(step) });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

/** (a) Every step reported as written text. */
const literalSteps = (file: string, source: string): Site[] =>
    stepCalls(file, source).filter((call) => call.literal);

/** A template that writes "(a of b)" or "(a/b)" between two values. */
const WRITTEN_POSITION = /\(\$\{[^}]+\}(?: of |\/)\$\{[^}]+\}\)/;
/** A progress message that leads with "a/b: …"; elsewhere that is an owner/repo. */
const LEADING_POSITION = /^`\$\{[^}]+\}\/\$\{[^}]+\}:/;

function isMessageValue(node: ts.Node): boolean {
    const { parent } = node;
    return ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name) && parent.name.text === 'message';
}

const LOG_CALL = /(^|\.)(logger|log)\b|\.(debug|info|warn|error|trace)$/;

/** Whether the text sits in a log line, which is not progress. */
function inLogLine(node: ts.Node, sf: ts.SourceFile): boolean {
    if (/^`\[[^\]]+\]/.test(node.getText(sf))) return true;
    for (let up = node.parent; up && !ts.isSourceFile(up); up = up.parent) {
        if (ts.isCallExpression(up) && LOG_CALL.test(up.expression.getText(sf))) return true;
        if (ts.isBlock(up)) return false;
    }
    return false;
}

/** `{ index, total }` without a `name`: a position `stageLine` shows as "(n of N)". */
function isCountedPosition(node: ts.ObjectLiteralExpression): boolean {
    const props = node.properties.map((p) => (p.name && ts.isIdentifier(p.name) ? p.name.text : ''));
    return props.includes('index') && props.includes('total') && !props.includes('name');
}

/** (b) Every position written or built outside the places that count steps. */
function countPositions(file: string, source: string): Site[] {
    const sf = parse(file, source);
    const found: Site[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isTemplateExpression(node) && file !== POSITION_WRITER) {
            const text = node.getText(sf);
            const written = WRITTEN_POSITION.test(text) || (LEADING_POSITION.test(text) && isMessageValue(node));
            if (written && !inLogLine(node, sf)) found.push({ file, text });
        }
        if (ts.isObjectLiteralExpression(node) && isCountedPosition(node) && !(file in STEP_POSITION_BUILDERS)) {
            found.push({ file, text: node.getText(sf).replace(/\s+/g, ' ') });
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

const SOURCES = workingTreeFiles('src')
    .filter((f) => /\.tsx?$/.test(f))
    .map((file) => ({ file, source: readFileSync(join(ROOT, file), 'utf8') }));

const scan = (find: (file: string, source: string) => Site[]): Site[] =>
    SOURCES.flatMap(({ file, source }) => find(file, source));

describe('SOP: progress steps come from the stage table', () => {
    it('CONTROL: reads a real tree, and finds the reporters it is meant to', () => {
        expect(SOURCES.length).toBeGreaterThan(500);
        // A file known to name both kinds of reporter. Until 2026-10-20 this was the update
        // command; PL-80 moved its checking into a screen and it reports nothing itself.
        const known = SOURCES.find((s) => s.file === 'src/features/updates/services/extensionUpdater.ts');
        expect(known).toBeDefined();
        const names = reporterNames(parse(known!.file, known!.source));
        expect([...names]).toEqual(expect.arrayContaining(['narrate', 'step']));
    });

    it('CONTROL: flags a planted literal step at each kind of site', () => {
        const planted = [
            "reportStep('Saving your changes');",
            'stageLine(`Checking access`, at);',
            "deps.onStage?.('Removing pages');",
            "withProgressRegister({ title: 'T' }, async (narrate) => { narrate('Up to date'); });",
            "withOperationProgress(opts, async (report) => { report(ok ? 'Done' : S.a.label); });",
            "const step = numberedSteps(STEPS, show); step('Copying');",
            "function f(report: ReportStage) { report('Publishing ' + n); }",
        ].join('\n');
        expect(literalSteps('a.ts', planted).map((s) => s.text)).toStrictEqual([
            "reportStep('Saving your changes')",
            'stageLine(`Checking access`, at)',
            "deps.onStage?.('Removing pages')",
            "narrate('Up to date')",
            "report(ok ? 'Done' : S.a.label)",
            "step('Copying')",
            "report('Publishing ' + n)",
        ]);
    });

    it('CONTROL: leaves a step from the table, and the line under it, alone', () => {
        const allowed = [
            'reportStep(S.publishingCode.label, `${n} files`);',
            "withProgressRegister({ title: 'T' }, async (narrate) => { narrate(stageLine(stage, at)); });",
            "const step = numberedSteps(STEPS, show); step(S.copying.label, 'the pages');",
            "other('a literal to something that is not a reporter');",
        ].join('\n');
        expect(literalSteps('a.ts', allowed)).toStrictEqual([]);
    });

    // The census: how many step reports the scan reads across src/ (102 on
    // 2026-10-16; 90 on 2026-10-20, when PL-80 deleted the update picker's dozen).
    // Every one of them is checked below; if the scan stops finding them, the zero
    // below proves nothing.
    it('CONTROL: finds the real corpus of step reports', () => {
        expect(scan(stepCalls).length).toBeGreaterThan(80);
    });

    it('every step reported in src/ is a reference, never written text', () => {
        expect(scan(literalSteps).map(where)).toStrictEqual([]);
    });
});

describe('SOP: a position is only ever a step position', () => {
    it('CONTROL: flags a position written from a count, and a position object built from one', () => {
        const planted = [
            'progress.report({ message: `${name} (${i + 1}/${all.length})` });',
            'onProgress(`Waiting for access (${attempt} of ${total})`);',
            'progress.report({ message: `${i + 1}/${sites.length}: ${site}` });',
            'show({ index: counter.index, total: counter.total });',
        ].join('\n');
        expect(countPositions('a.ts', planted).map((s) => s.text)).toStrictEqual([
            '`${name} (${i + 1}/${all.length})`',
            '`Waiting for access (${attempt} of ${total})`',
            '`${i + 1}/${sites.length}: ${site}`',
            '{ index: counter.index, total: counter.total }',
        ]);
    });

    it('CONTROL: leaves log lines, counts on line 2, and the step-position builders alone', () => {
        const allowed = [
            'logger.debug(`Still waiting (${attempt}/${attempts})`);',
            'this.logger.info(`[Sync] Pushed (${owner}/${repo})`);',
            'report(S.copying.label, `${done} of ${total} files`);',
            'report(S.copying.label, countLine(done, total, "file"));',
            'result.errors.push(`${owner}/${repo}: sync failed`);',
            'report(S.moving.label, undefined, { index: 1, total: 2, name: "erp-sync" });',
        ].join('\n');
        expect(countPositions('a.ts', allowed)).toStrictEqual([]);
        const builder = 'return { index, total: steps.length };';
        expect(countPositions('src/core/utils/numberedSteps.ts', builder)).toStrictEqual([]);
        expect(countPositions(POSITION_WRITER, 'const s = `${stage} (${p.index} of ${p.total})`;')).toStrictEqual([]);
    });

    // Read as if it were any other file, each builder must still build a counted
    // position: one that stopped is a stale entry, and an exemption nobody needs.
    it('CONTROL: every step-position builder exists and still builds a position', () => {
        const stale = Object.keys(STEP_POSITION_BUILDERS).filter((file) => {
            const source = SOURCES.find((s) => s.file === file)?.source ?? '';
            return countPositions('elsewhere.ts', source).length === 0;
        });
        expect(stale).toStrictEqual([]);
    });

    it('no position in src/ is built from a count', () => {
        expect(scan(countPositions).map(where)).toStrictEqual([]);
    });
});

// Line 2 is short by design: 40 characters of text we write (owner, 2026-10-16: "Why
// should we need lines that are so long?"). The scan, and what it reads, is
// `progressLineScan.ts`.
const LINE_2_SITES = SOURCES.flatMap(({ file, source }) => line2Sites(file, source));

describe('SOP: line 2 text we write is 40 characters at most', () => {
    it('CONTROL: finds each kind of site, and measures only what we wrote', () => {
        const planted = [
            "jobLine(STOREFRONT_JOBS.copyingContent, 'Finding every page the template has, to copy them');",
            "settingsLine('Reading the project settings from the storefront repository');",
            "report(S.copyingContent.label, `From ${org}/${site}, the template's content source`);",
            "onStep('Running aio app deploy against the workspace this app is in');",
            "onProgress?.({ subMessage: ok ? 'Done' : 'Waiting for Adobe to say the mesh is deployed' });",
            "jobLine(S.x.label, `${itemCount(n, 'page')} published`);",
            "progressTracker(S.settingUpProject.label, 10, 'Creating the project directory structure on disk');",
        ].join('\n');
        const sites = line2Sites('a.ts', planted);
        expect(sites.map((s) => s.length)).toStrictEqual([49, 59, 37, 59, 45, 10, 48]);
        expect(tooLong(sites).map((s) => s.split(' | ')[1])).toStrictEqual(['49', '59', '59', '45', '48']);
    });

    it('CONTROL: leaves names, counts and line 1 alone', () => {
        const allowed = [
            'jobLine(STOREFRONT_JOBS.resettingRepository, `${owner}/${repo}`);',
            "report(S.copyingContent.label, countLine(done, total, 'file'));",
            "reportStep('A step literal is progress-steps.test.ts\\'s business, not this one');",
            "sendMessage('auth-status', { subMessage: 'An error explained in a sentence, which is not progress' });",
        ].join('\n');
        // A template that is all placeholders is measured as 0: it is a name.
        expect(tooLong(line2Sites('a.ts', allowed))).toStrictEqual([]);
    });

    // The census: how many line-2 sites the scan reads across src/. If it stops
    // finding them, the empty list below proves nothing.
    it('CONTROL: finds the real corpus of line-2 text', () => {
        expect(LINE_2_SITES.length).toBeGreaterThan(40);
        expect(LINE_2_SITES.map((s) => s.file)).toEqual(
            expect.arrayContaining([
                'src/features/eds/services/helix/helixSiteContent.ts',
                'src/features/eds/services/storefront/storefrontRepublishService.ts',
            ]),
        );
    });

    it('every line-2 text written in src/ fits', () => {
        expect(tooLong(LINE_2_SITES)).toStrictEqual([]);
    });
});
