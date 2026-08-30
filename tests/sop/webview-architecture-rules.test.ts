/**
 * ADR-017 — webview architecture enforcement.
 *
 * The counterpart to `architecture-rules.test.ts`, which enforces ADR-015 over
 * the extension host. The two split on 2026-08-29 (PL-17) because the repo is
 * two programs with different runtimes, and one document was claiming both.
 *
 * The rule below arrived here from ADR-015, where it had been enforced under a
 * document that mentions React zero times. It is React's re-render trap: a
 * custom hook whose `useEffect` depends on a prop, called with an inline `[]` or
 * `{}`, re-runs forever because the literal is a new reference every render.
 *
 * NOT enforced here yet, and named in ADR-017 §6 as this document's weakest
 * link: the stylesheet-belongs-to-its-bundle rule. Checking it means walking each
 * entry's import graph and collecting reachable classes. Tracked as its own item.
 *
 * Ledger contract is identical to ADR-015's: a violation must be listed with a
 * reason, a listed entry that no longer violates also fails, so the list only
 * shrinks.
 */

import {
    ALL_FILES,
    isWebview,
    readStripped,
    loadLedger,
    expectClean as expectCleanAgainst,
} from './architectureScan';

const FILES = ALL_FILES.filter(isWebview);
const LEDGER = loadLedger('webview-architecture-rules.exemptions.json');
const src = readStripped(FILES);

function expectClean(check: string, violations: string[]): void {
    expectCleanAgainst(LEDGER, check, violations);
}

describe('ADR-017: the scan sees the webview half at all', () => {
    it('POSITIVE CONTROL: webview files are found', () => {
        // A zero here would make every check below pass vacuously — the exact
        // failure mode this repo has paid for repeatedly (a zero from a probe
        // that cannot look reads identically to a zero from a clean scan).
        expect(FILES.length).toBeGreaterThan(200);
        expect(FILES).toContain('src/core/ui/utils/WebviewClient.ts');
    });

    it('and does NOT see extension-host files', () => {
        expect(FILES).not.toContain('src/extension.ts');
    });
});

describe('ADR-017 §5: custom-hook calls do not take inline []/{} literals', () => {
    // Coarse by design: React's own hooks (useState/useEffect/...) are
    // excluded — their literals are idiomatic. Custom-hook literals are the
    // re-render trap the memory records; flagged files are adjudicated in
    // the ledger, not silently ignored.
    const HOOK_CALL =
        /\buse(?!State|Effect|Memo|Callback|Ref\b|Context|Reducer|LayoutEffect|Id\b|Sync)[A-Z]\w*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
    const violations = FILES.filter((f) => {
        const s = src.get(f) as string;
        for (const m of s.matchAll(HOOK_CALL)) {
            if (/(?:^|[,(\s])(\[\]|\{\})\s*(?:,|$)/.test(m[1])) return true;
        }
        return false;
    });

    it('every flagged file is a reasoned ledger entry', () => {
        expectClean('hookRefs', violations);
    });
});

describe('ADR-017: one message channel per bundle, and it is a singleton', () => {
    /**
     * `acquireVsCodeApi()` may be called ONCE per webview — VS Code throws on the
     * second call — so ADR-017 ratifies the channel as a singleton rather than
     * treating it as a design choice. There is nothing to vary.
     *
     * The check is a ledger rather than "exactly one", because each BUNDLE is its
     * own webview and so legitimately gets its own call. What must not happen is a
     * second call reaching the same bundle, and the cheap guard against that is
     * requiring every call site to be named and justified. A new unlisted one is
     * the thing to look at.
     */
    const callers = FILES.filter((f) => /acquireVsCodeApi\(\)/.test(src.get(f) as string));

    it('CONTROL: the detector finds the call sites that exist', () => {
        // A detector that finds nothing reports "all clear" in the same words as
        // one that verified — and this rule's whole value is the count.
        expect(callers.length).toBeGreaterThan(0);
    });

    it('every channel-acquiring file is a reasoned ledger entry', () => {
        expectClean('messageChannelOwners', callers);
    });
});
