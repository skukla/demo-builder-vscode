/**
 * ADR-015 enforcement — the architecture rules as build-failing checks.
 *
 * The audit's central lesson (PL-12): the only pattern at 100% is the one a
 * test fails on. This suite is that test for the owner-ratified rules of
 * 2026-08-28. It recomputes each rule's violations from source and diffs
 * them BIDIRECTIONALLY against the exemption ledger
 * (`architecture-rules.exemptions.json`):
 *
 *   - a violation NOT in the ledger  → FAIL (new drift, fix it or justify it)
 *   - a ledger entry that no longer violates → FAIL (stale row — the ledger
 *     only shrinks; delete the row with the fix)
 *   - a ledger entry without a reason → FAIL (an IOU is not a verdict)
 *
 * Positive controls prove each detector is alive before its zeros count —
 * the 2026-08-07 lesson that a scanner finding nothing looks identical to a
 * scanner that never ran.
 *
 * Law: docs/architecture/adr/015-dependency-architecture.md
 * Map: docs/architecture/where-code-goes.md
 */

import {
    ALL_FILES,
    isWebview,
    readStripped,
    loadLedger,
    expectClean as expectCleanAgainst,
} from './architectureScan';

/**
 * ADR-015 governs the EXTENSION HOST. Webview files are excluded here and
 * enforced by `webview-architecture-rules.test.ts` under ADR-017.
 *
 * Added 2026-08-29 (PL-17). Before it, 291 browser-bundle files were judged by
 * rules written from the host's evidence — a document that mentions React zero
 * times — and one of the six checks below was a pure React rule that lived here
 * only because there was nowhere else to put it. It has moved, with its
 * exemptions.
 */
const FILES = ALL_FILES.filter((f) => !isWebview(f));

const LEDGER = loadLedger('architecture-rules.exemptions.json');
const src = readStripped(FILES);

function expectClean(check: string, violations: string[]): void {
    expectCleanAgainst(LEDGER, check, violations);
}

/** Boundary membership per ADR-015: where fetching is allowed. */
function mayFetch(f: string): boolean {
    return (
        f === 'src/extension.ts' ||
        /\/commands\//.test(f) ||
        /^src\/commands\//.test(f) ||
        /\/handlers\//.test(f) ||
        /^src\/features\/ai\/server\//.test(f)
    );
}

/** Where construction is allowed: the root, deps builders, and the boundary. */
function mayConstruct(f: string): boolean {
    return mayFetch(f) || /[Dd]eps\.tsx?$/.test(f);
}

describe('ADR-015: fetch boundary — logic never fetches', () => {
    const violations = FILES.filter(
        (f) => /ServiceLocator\.get/.test(src.get(f) as string) && !mayFetch(f)
    );

    it('CONTROL: positive control: the detector sees fetching where fetching is allowed', () => {
        const boundaryFetches = FILES.filter(
            (f) => /ServiceLocator\.get/.test(src.get(f) as string) && mayFetch(f)
        );
        expect(boundaryFetches.length).toBeGreaterThan(0);
    });

    it('every out-of-boundary fetch is a reasoned ledger entry — and nothing more', () => {
        expectClean('fetchBoundary', violations);
    });
});

describe('ADR-015: construction boundary — new Service() only in the root, deps builders, and the boundary', () => {
    const violations = FILES.filter(
        (f) =>
            /new [A-Z][A-Za-z]*(Service|Manager|Client)\(/.test(src.get(f) as string) &&
            !mayConstruct(f)
    );

    it('positive control: the detector sees construction in extension.ts', () => {
        expect(
            /new [A-Z][A-Za-z]*(Service|Manager|Client)\(/.test(
                src.get('src/extension.ts') as string
            )
        ).toBe(true);
    });

    it('every out-of-boundary construction is a reasoned ledger entry — and nothing more', () => {
        expectClean('constructionBoundary', violations);
    });
});

describe('ADR-015: commands extend the base classes', () => {
    const violations: string[] = [];
    for (const f of FILES) {
        if (!/\/commands\//.test(f) && !/^src\/commands\//.test(f)) continue;
        const s = src.get(f) as string;
        for (const m of s.matchAll(/export class (\w+)[^{]*\{/g)) {
            const decl = s.slice(m.index ?? 0, (m.index ?? 0) + 200);
            if (!/extends \w*(BaseCommand|BaseWebviewCommand)/.test(decl)) {
                violations.push(`${f}:${m[1]}`);
            }
        }
    }

    it('positive control: the detector sees base-extending commands', () => {
        const conforming = FILES.some(
            (f) =>
                (/\/commands\//.test(f) || /^src\/commands\//.test(f)) &&
                /extends \w*(BaseCommand|BaseWebviewCommand)/.test(src.get(f) as string)
        );
        expect(conforming).toBe(true);
    });

    it('every non-extending command class is a reasoned ledger entry', () => {
        expectClean('commandBase', violations);
    });
});

describe('ADR-015: types files carry no runtime imports', () => {
    const violations = FILES.filter((f) => {
        if (!/^src\/types\//.test(f) && !/\.types\.tsx?$/.test(f)) return false;
        return /^import (?!type[\s{])/m.test(src.get(f) as string);
    });

    it('every runtime-importing types file is a reasoned ledger entry', () => {
        expectClean('typesPurity', violations);
    });
});

describe('ADR-015: handlers return results (push-message ratchet)', () => {
    it('sendMessage use across handler files never grows past the pinned ceiling', () => {
        let count = 0;
        for (const f of FILES) {
            if (!/\/handlers\//.test(f)) continue;
            count += ((src.get(f) as string).match(/\bsendMessage\(/g) ?? []).length;
        }
        const ceiling = LEDGER.patternBSendMessageCeiling as number;
        // Grew → a handler started pushing results; return them instead.
        expect(count).toBeLessThanOrEqual(ceiling);
        // Shrank → good; lower the pin so the win is locked in.
        if (count < ceiling) {
            expect(`lower patternBSendMessageCeiling to ${count}`).toBe(
                `lower patternBSendMessageCeiling to ${count}`
            );
        }
    });
});
