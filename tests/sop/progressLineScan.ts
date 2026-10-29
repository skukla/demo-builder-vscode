/**
 * The progress lines we write are short (handbook, "progress"; owner 2026-10-16:
 * "Why should we need lines that are so long?").
 *
 * Line 2 is at most 40 characters of text we write; line 3's expectation at most 25,
 * with the run's clock after it; line 1 at most 25. The stage table's three columns
 * are held by `tests/core/utils/operationStages.test.ts`. This scan holds the line-2
 * text written at the call sites, which the table cannot see. The display's one-line
 * ellipsis (`LoadingDisplay`'s `steady`) is only the backstop for names we do not
 * write: a repository, an ERP, a project, a file.
 *
 * WHERE LINE-2 TEXT IS FOUND, by the TypeScript parser over `src/`:
 * - the detail of `jobLine(name, detail)`, and of `settingsLine(detail)`;
 * - the text after a stage reference (`S.x.label`) in any call: the second argument,
 *   `report(S.copyingContent.label, 'From …')`, or the third when the second is a
 *   percentage, as creation's tracker takes it (`progressTracker(S.x.label, 80, '…')`);
 * - the text an App Builder step reports, `onStep('…')` (PL-59: a step is the line
 *   under the stage);
 * - the `subMessage:` and `message:` of an object handed to progress (`onProgress?.({…})`, or
 *   `sendMessage` on a `…-progress` channel). A status message's `subMessage`, such
 *   as an auth error's explanation, is not progress and is not read.
 *
 * WHAT IS MEASURED: the text written into the code. A template's placeholders count
 * as nothing, because what fills them is a count or a name ("40 of 103 files",
 * "acme/citisignal"): `${itemCount(n, 'page')} published` is measured as " published".
 * A choice (`a ? 'x' : 'y'`, `??`, `||`) is measured by its longest branch; a `+`
 * by the sum of its parts.
 *
 * What it cannot see: text assigned to a variable first and passed by name, and a
 * reporter under another name.
 *
 * The suite that applies it is `progress-steps.test.ts` ("line 2 text we write"); this
 * module is the scan, kept out of that file so it stays one job per file.
 *
 * No ledger: when this landed (2026-10-16) every line it found was rewritten to fit.
 *
 * @module tests/sop/progressLineScan
 */

import * as ts from 'typescript';

/** Line 2's limit for text we write. */
export const LINE_2_MAX = 40;

/** Called with the line-2 text as this argument. */
const DETAIL_ARG: Record<string, number> = { jobLine: 1, settingsLine: 0, onStep: 0 };

export interface LineSite {
    file: string;
    /** The text as written, whitespace collapsed. */
    text: string;
    /** Characters of it we wrote. */
    length: number;
}

function calleeName(call: ts.CallExpression): string | undefined {
    const callee = call.expression;
    if (ts.isIdentifier(callee)) return callee.text;
    if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
    return undefined;
}

/** The characters of an expression written into the code, or undefined when it has none. */
function writtenLength(node: ts.Expression): number | undefined {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text.length;
    if (ts.isTemplateExpression(node)) {
        return node.templateSpans.reduce((sum, span) => sum + span.literal.text.length, node.head.text.length);
    }
    if (ts.isParenthesizedExpression(node)) return writtenLength(node.expression);
    if (ts.isConditionalExpression(node)) return longest(node.whenTrue, node.whenFalse);
    if (ts.isBinaryExpression(node)) {
        const op = node.operatorToken.kind;
        if (op === ts.SyntaxKind.PlusToken) {
            const [l, r] = [writtenLength(node.left), writtenLength(node.right)];
            return l === undefined && r === undefined ? undefined : (l ?? 0) + (r ?? 0);
        }
        if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
            return longest(node.left, node.right);
        }
    }
    return undefined;
}

function longest(a: ts.Expression, b: ts.Expression): number | undefined {
    const [x, y] = [writtenLength(a), writtenLength(b)];
    return x === undefined && y === undefined ? undefined : Math.max(x ?? 0, y ?? 0);
}

/** A stage reference: `S.copyingContent.label`, `OPERATION_STAGES.x.label`. */
const isStageRef = (node: ts.Expression | undefined): boolean =>
    !!node && ts.isPropertyAccessExpression(node) && node.name.text === 'label';

/** The line-2 text this node carries, if it is a place line-2 text is written. */
function line2Text(node: ts.Node): ts.Expression | undefined {
    if (ts.isCallExpression(node)) {
        const index = DETAIL_ARG[calleeName(node) ?? ''];
        if (index !== undefined) return node.arguments[index];
        if (isStageRef(node.arguments[0])) {
            // Creation's tracker takes a percentage between the two: (stage, 80, line).
            const [, next, after] = node.arguments;
            return next && ts.isNumericLiteral(next) ? after : next;
        }
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && (node.name.text === 'subMessage' || node.name.text === 'message')) {
        return isProgressPush(node.parent) ? node.initializer : undefined;
    }
    return undefined;
}

/**
 * Whether an object is handed to progress: `onProgress?.({…})`, `progressCallback({…})`,
 * `sendMessage('storefront-setup-progress', {…})`. Not a status message such as
 * `sendMessage('auth-status', {…})`, whose `subMessage` is an error's explanation and
 * may run to a sentence.
 */
function isProgressPush(object: ts.Node): boolean {
    const call = object.parent;
    if (!ts.isCallExpression(call)) return false;
    const name = calleeName(call) ?? '';
    if (/progress/i.test(name)) return true;
    const channel = call.arguments[0];
    return name === 'sendMessage' && !!channel && ts.isStringLiteral(channel) && /progress/.test(channel.text);
}

/** Every place line-2 text is written, with how much of it we wrote. */
export function line2Sites(file: string, source: string): LineSite[] {
    const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
    const found: LineSite[] = [];
    const visit = (node: ts.Node): void => {
        const text = line2Text(node);
        const length = text && writtenLength(text);
        if (text && length !== undefined) {
            found.push({ file, text: text.getText(sf).replace(/\s+/g, ' '), length });
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

/** The sites over the limit, as `file | length | text`. */
export const tooLong = (sites: LineSite[]): string[] =>
    sites.filter((s) => s.length > LINE_2_MAX).map((s) => `${s.file} | ${s.length} | ${s.text}`);
