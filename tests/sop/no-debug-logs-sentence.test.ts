/**
 * No sentence a person reads sends them to Debug Logs (owner, 2026-11-19, PL-102 decision 1). The
 * Open Debug Logs button stays: a failed run's next step, which the owner chose on 2026-11-10. A
 * sentence pointing there is what the owner found hard to read (release walk F221).
 *
 * Reads every string, template and JSX text in `src/` with the TypeScript parser. Allowed: the
 * button's label, the output channel's own name, log and comment text, and the agent-only diagnostics
 * tools, which an agent reads to fix a problem.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { workingTreeFiles } from './architectureScan';

const ROOT = join(__dirname, '..', '..');
const SENDS_THERE = /debug logs?/iu;
const ALLOWED_TEXT = /^Open Debug Logs$|^Demo Builder: Debug Logs$|^Demo Builder Debug Logs\.log$/u;
/** Agent-only: the tools that read the logs, and their narration. */
const AGENT_ONLY = new Set([
    'src/features/ai/server/diagnosticsTools.ts',
    'src/features/ai/server/toolNarration.ts',
]);

function inLogCall(node: ts.Node): boolean {
    for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
        if (ts.isCallExpression(at)) {
            const callee = at.expression.getText();
            if (/\b(logger|debugChannel|console|log)\b.*\.(info|warn|error|debug|trace|log)$/u.test(callee)) return true;
        }
    }
    return false;
}

/** Each on-screen text that names Debug Logs, as `file:line`. */
export function sentencesSendingToLogs(file: string, source: string): string[] {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const found: string[] = [];
    const visit = (node: ts.Node): void => {
        const text =
            ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
                ? node.text
                : ts.isJsxText(node)
                  ? node.getText(sf).trim()
                  : undefined;
        if (text && SENDS_THERE.test(text) && !ALLOWED_TEXT.test(text.trim()) && !inLogCall(node)) {
            found.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`);
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

describe('no sentence sends a person to Debug Logs', () => {
    it('finds none in src/', () => {
        const files = workingTreeFiles('src').filter((f) => /\.tsx?$/.test(f) && !AGENT_ONLY.has(f));
        const found = files.flatMap((f) => sentencesSendingToLogs(f, readFileSync(join(ROOT, f), 'utf8')));
        expect(found).toStrictEqual([]);
    });

    it('CONTROL: finds a sentence, and leaves the button, the channel name and a log line', () => {
        const planted = [
            "const a = 'Could not install Node. See Debug Logs for details.';",
            'const b = `It stopped. Check the Debug logs.`;',
            "const c = 'Open Debug Logs';",
            "const d = 'Demo Builder: Debug Logs';",
            "logger.info('Debug Logs channel ready');",
        ].join('\n');
        expect(sentencesSendingToLogs('a.ts', planted)).toStrictEqual(['a.ts:1', 'a.ts:2']);
    });
});
