/**
 * A failure a PERSON reads is translated, never the library's own words.
 *
 * THE RULE. A failure returned toward a webview or an agent carries a message written
 * for an SC. It never carries a caught error's `.message` straight through.
 *
 * WHY. The extension's job at a failure is to say what went wrong and what to do about
 * it. `Request failed with status code 403` does neither: it names a transport detail
 * and leaves the person to guess which permission, which account, which site. The
 * architecture doc already sets this bar for the three provider formatters — "if the
 * output is not more actionable than the input, the formatter is not earning its place"
 * — and most failure paths never reach one.
 *
 * WHAT COUNTS AS TRANSLATED: a per-provider formatter (three exist — Adobe IMS/Console,
 * GitHub/DA.live/Helix, and `aio api-mesh`), or a domain error's own message. A feature
 * with no provider-specific knowledge uses an honest generic — "Could not reach Adobe
 * Console. See Debug Logs for details." — which is less specific and never misleading.
 * The raw text still goes to the Debug Logs channel, where it is useful.
 *
 * WHY A LEDGER AND NOT A BAN. 67 sites predate the rule. A rule that arrives as 67
 * build failures is a rule people switch off, so the list may only shrink — the same
 * mechanism that retired every other inherited violation here.
 *
 * WHAT THIS CHECK CANNOT DECIDE, and it is the important limit. The rule is about WHOSE
 * words reach the person, and that is not visible at the call site — it depends on what
 * threw. `componentUpdater` passes its caught message through and is CORRECT to: every
 * error reaching it was thrown by this extension with a deliberate sentence ("Build
 * failed (exit 1): tsc: 3 errors"). Six tests caught that distinction on 2026-09-11
 * when a generic was substituted for it and made the product worse.
 *
 * So this detects the SHAPE — a user-facing failure built directly from a caught
 * error's message — and a human decides which kind each one is when they retire it. A
 * row leaving this ledger is a claim that someone looked.
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

import { expectClean, loadLedger } from './architectureScan';

const ROOT = join(__dirname, '..', '..');
const LEDGER = loadLedger('user-facing-errors.ledger.json');

/**
 * A failure field built straight from a caught error.
 *
 * Anchored on `error:` — the field name the webview envelope and the MCP tool results
 * both use — rather than on any assignment of `.message`, because the rule is about
 * what crosses the boundary, not about reading a message at all. Logging the raw text
 * is not merely allowed, it is where the raw text is supposed to go.
 */
const PATTERNS: RegExp[] = [
    /error:\s*\(?\s*(?:e|err|error)\s+as\s+Error\s*\)?\.message/,
    /error:\s*(?:e|err|error)\s+instanceof\s+Error\s*\?\s*(?:e|err|error)\.message/,
    /error:\s*(?:extractErrorMessage|toError)\((?:e|err|error)\)/,
    /error:\s*\w*[Aa]ppError\.userMessage/,
];

function sourceFiles(): string[] {
    return execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx'", { cwd: ROOT, encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);
}

function violations(): string[] {
    const found: string[] = [];
    for (const file of sourceFiles()) {
        const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
        lines.forEach((line, i) => {
            if (PATTERNS.some((p) => p.test(line))) found.push(`${file}:${i + 1}`);
        });
    }
    return found.sort();
}

describe("a failure a person reads is translated, never the library's own words", () => {
    it('CONTROL: the scan reads a real corpus', () => {
        // Without this, a broken path empties the list and every site reads as fixed —
        // the false all-clear this directory exists to prevent.
        expect(sourceFiles().length).toBeGreaterThan(500);
    });

    it('CONTROL: the detector sees the shape, and ignores logging the same text', () => {
        // Literals, not the tree, so the control keeps working once the corpus is clean.
        const hits = (s: string): boolean => PATTERNS.some((p) => p.test(s));
        expect(hits('return { success: false, error: (error as Error).message };')).toBe(true);
        expect(hits('error: err instanceof Error ? err.message : String(err),')).toBe(true);
        expect(hits('error: appError.userMessage,')).toBe(true);
        // The raw text SHOULD reach the logs. That is not a violation.
        expect(hits("context.logger.error('Failed:', (error as Error).message);")).toBe(false);
        // A translated failure is the whole point of the rule.
        expect(hits("return { success: false, error: 'Could not reach Adobe Console.' };")).toBe(
            false
        );
    });

    it('every site handing over a raw message is a reasoned ledger entry', () => {
        expectClean(LEDGER, 'rawMessageToUser', violations());
    });
});
