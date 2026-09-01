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
    expectBanned as expectBannedAgainst,
    expectClean as expectCleanAgainst,
} from './architectureScan';

const FILES = ALL_FILES.filter(isWebview);
const LEDGER = loadLedger('webview-architecture-rules.exemptions.json');
const src = readStripped(FILES);

function expectClean(check: string, violations: string[]): void {
    expectCleanAgainst(LEDGER, check, violations);
}

/** A rule that reached zero and had its ledger key deleted. See `expectBanned`. */
function expectBanned(check: string, violations: string[]): void {
    expectBannedAgainst(LEDGER, check, violations);
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

describe('ADR-017: a value passed into a hook is stable across renders', () => {
    /**
     * The React footgun this codebase has already been bitten by, and the one the
     * handbook filed as unenforceable.
     *
     * WHAT IS ENFORCED, AND WHY IT IS A SUBSET. The full rule — "no inline array,
     * object or arrow literal as a prop that will reach a dependency array" —
     * genuinely cannot be checked here: knowing whether a prop REACHES a dependency
     * array means following it into the receiving component and through whatever
     * hook it is handed to. `exhaustive-deps` cannot see across that boundary and
     * neither can this.
     *
     * The EMPTY literal can be. `prop={[]}` and `prop={{}}` carry no data, so the
     * only reason to write one is "this component wants a collection and I have
     * none" — and that is exactly the shape that loops: a new reference every
     * render, feeding an effect that sets state. It is the case the root CLAUDE.md
     * records as having already happened, with the fix named
     * (`const EMPTY: never[] = []` at module scope).
     *
     * Measured 2026-08-31 before adopting: **zero** empty-literal props in `src/`,
     * against 90 inline arrows (overwhelmingly event handlers, which are harmless
     * and stay a judgement) and 34 non-empty array/object literals (presentational
     * lists and `UNSAFE_style`, covered by their own rules). So this is a flat ban
     * on the dangerous form with nothing to grandfather, not a ledger.
     *
     * @see .rptc/backlog/2026-08-31-every-convention-enforced.md
     */
    const EMPTY_LITERAL_PROP = /(\w+)=\{\s*(?:\[\s*\]|\{\s*\})\s*\}/g;

    it('CONTROL: the detector sees an empty literal prop and not a filled one', () => {
        const find = (s: string) => [...s.matchAll(/(\w+)=\{\s*(?:\[\s*\]|\{\s*\})\s*\}/g)].length;
        expect(find('<Thing items={[]} />')).toBe(1);
        expect(find('<Thing config={{}} />')).toBe(1);
        expect(find('<Thing items={[a, b]} />')).toBe(0);
        expect(find('<Thing config={{ a: 1 }} />')).toBe(0);
        expect(find('<Thing onPress={() => go()} />')).toBe(0);
        // and the corpus was actually read
        expect(FILES.length).toBeGreaterThan(100);
    });

    it('no empty [] or {} literal is passed as a JSX prop', () => {
        const offenders: string[] = [];
        for (const [file, body] of src) {
            if (!file.endsWith('.tsx')) continue;
            for (const m of body.matchAll(EMPTY_LITERAL_PROP)) {
                offenders.push(`${file}  ${m[0]}`);
            }
        }
        expectBanned('emptyLiteralProps', offenders);
    });
});
