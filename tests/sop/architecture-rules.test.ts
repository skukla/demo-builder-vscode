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
    accumulatesState,
    classBodies,
    statefulClosure,
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

/**
 * Composition points recognised by ROLE, not by filename.
 *
 * ADR-015 permits construction in `extension.ts` and a feature's
 * `create...Deps` builder. The `*Deps.ts` regex below finds builders that happen
 * to be NAMED that way; these two do the same job under older names. Both
 * assemble `HandlerContext` — the dependency bundle every handler receives, and
 * which already carries `prereqManager`, `errorLogger` and `progressUnifier`.
 * They are the composition point handlers are meant to pull services FROM.
 *
 * Listed explicitly rather than renamed: a file renamed to satisfy a regex is
 * gaming the check, and the next composition point would be misnamed again. An
 * allowlist with reasons is the same discipline as the exemption ledger — the
 * difference is that these are RULINGS, not debt, so they do not need to shrink.
 */
/**
 * SESSION ACCESSORS — they MEMOISE, so they build once however often they are
 * called. That is the property the lifetime rule cares about, and it is why they
 * are listed apart from the per-call factories below rather than filtered out of
 * them by filename.
 */
const SESSION_ACCESSORS: Readonly<Record<string, string>> = {
    'src/features/eds/handlers/edsServiceCache.ts':
        "the EDS feature's client builder — assembles the four GitHub clients and the " +
        'DA.live auth service and CACHES them; 18 files use it. Its caching is ' +
        'load-bearing: GitHubTokenService holds a token-validation cache, so a file ' +
        'building its own re-validates against GitHub (D-2).',
    'src/features/components/services/componentRegistryInstance.ts':
        'memoises ONE ComponentRegistryManager so its transformToGroupedStructure memo ' +
        'survives past a single message.',
    'src/features/prerequisites/services/prerequisitesManagerInstance.ts':
        'memoises ONE PrerequisitesManager so its CLI-result cache can hit at all — a ' +
        'hit is <10ms against a 500-3000ms miss.',
};

/**
 * PER-CALL composition points — they assemble a fresh bundle every time they are
 * called, so anything stateful they construct is forked at that rate. Recognised
 * by ROLE rather than filename: both build `HandlerContext`, the dependency
 * bundle every handler receives, which already carries `prereqManager`,
 * `errorLogger` and `progressUnifier`.
 *
 * Listed rather than renamed to match a regex — a file renamed to satisfy a check
 * is gaming it, and the next composition point would be misnamed again.
 */
const COMPOSITION_POINTS: Readonly<Record<string, string>> = {
    'src/commands/handlerContextFactory.ts':
        'builds HandlerContext for the webview side; called PER INCOMING MESSAGE by all ' +
        'six surfaces (17 call sites)',
    'src/features/ai/server/headlessHandlerContext.ts':
        'builds the same bundle for the MCP side, where there is no panel',
};

/**
 * Stateful construction that is NOT fragmentation — rulings, not debt.
 *
 * The state rule flags a file that builds a stateful class. That is the right
 * question only when a SECOND live instance can exist. These three cannot, and no
 * static detector can see it: it depends on how many times the constructing code
 * itself runs.
 *
 * They sat in the debt ledger after the 2026-08-29 re-aim, where they would have
 * stayed forever — a ledger that only shrinks is the wrong home for something
 * that is already correct.
 */
const NOT_FRAGMENTED: Readonly<Record<string, string>> = {
    'src/features/authentication/services/authenticationService.ts':
        'builds AdobeSDKClient + AuthCacheManager, and is itself constructed EXACTLY ONCE ' +
        '(extension.ts:304 — the only non-README site). One owner, one cache.',
    'src/core/state/stateManager.ts':
        'builds RecentProjectsManager, and is itself constructed EXACTLY ONCE ' +
        '(extension.ts:205). Same reasoning.',
    'src/core/communication/webviewCommunicationManager.ts':
        'constructs itself in its own factory, once per PANEL. The state it carries — ' +
        'handshake, disposables, config — is per-panel state, so a second panel SHOULD ' +
        'have a second instance. Sharing one would be the bug.',
};

function mayConstruct(f: string): boolean {
    return (
        f === 'src/extension.ts' ||
        /[Dd]eps\.tsx?$/.test(f) ||
        f in COMPOSITION_POINTS ||
        f in SESSION_ACCESSORS ||
        f in NOT_FRAGMENTED
    );
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

describe('ADR-015: a class that ACCUMULATES STATE comes from one place', () => {
    /**
     * Re-aimed 2026-08-29. This rule used to ask WHERE a service was constructed;
     * it now asks WHETHER a second instance would silently fork state.
     *
     * The location proxy was measured against its own 47-row ledger: 15 rows
     * built a stateful class, 13 were stateless but module-mocked by 10+ suites
     * (a test-design cost — ADR-016's job, tracked separately), and 19 protected
     * nothing whatsoever. It also mis-fired on its largest cluster: HelixService
     * held 13 rows, is stateless, and its supposed hazard had been fixed on
     * 2026-08-15. Two rounds of design were spent ruling that out.
     *
     * See `.rptc/research/construction-boundary-is-the-wrong-question/`.
     */
    const bodies = classBodies(src);
    const stateful = new Set(
        [...bodies].filter(([, body]) => accumulatesState(body)).map(([name]) => name),
    );

    const violations = FILES.filter((f) => {
        if (mayConstruct(f)) return false;
        const source = src.get(f) as string;
        for (const m of source.matchAll(/new ([A-Z][A-Za-z]*(?:Service|Manager|Client))\(/g)) {
            if (stateful.has(m[1])) return true;
        }
        return false;
    });

    it('CONTROL: the detector separates stateful from stateless, on known cases', () => {
        // The three this repo learned at cost. If these ever flip, the rule has
        // stopped meaning what the research established.
        expect(stateful.has('GitHubTokenService')).toBe(true); // validationCache
        expect(stateful.has('ComponentRegistryManager')).toBe(true); // transformedRegistry
        expect(stateful.has('PrerequisitesCacheManager')).toBe(true); // a mutated Map
        expect(stateful.has('HelixService')).toBe(false); // credentials, never mutated
        expect(stateful.size).toBeGreaterThan(3);
        expect(bodies.size).toBeGreaterThan(30);
    });

    it('every out-of-boundary construction of a STATEFUL class is a reasoned ledger entry', () => {
        expectClean('constructionBoundary', violations);
    });
});

describe('ADR-015: a repeated composition point builds nothing STATEFUL', () => {
    /**
     * The lifetime half of the construction rule. That one asks whether a second
     * instance would fork state; this asks whether the instance lives long enough
     * for its state to be worth carrying.
     *
     * `extension.ts` runs once, so state built there is shared for the session.
     * The other composition points do not: all six webview surfaces call
     * `createPanelHandlerContext` PER INCOMING MESSAGE, 17 call sites between
     * them. A cache built there is empty every time it is read.
     *
     * Found by `PrerequisitesCacheManager`, which advertises a 95% reduction in
     * repeated CLI checks (a hit <10ms, a miss 500-3000ms) and cannot hit at all.
     * Pinned in `prerequisiteCacheLifetime.test.ts`.
     */
    // Every per-call point. Session accessors are a separate list precisely so
    // this does not need a filename exclusion — memoising IS the distinction.
    const REPEATED_COMPOSITION_POINTS = Object.keys(COMPOSITION_POINTS);

    const stateful = statefulClosure(classBodies(src));

    const violations: string[] = [];
    for (const f of REPEATED_COMPOSITION_POINTS) {
        const source = src.get(f);
        if (!source) continue;
        for (const m of source.matchAll(/new ([A-Z][A-Za-z]*(?:Service|Manager|Client))\(/g)) {
            if (stateful.has(m[1])) violations.push(`${f}:${m[1]}`);
        }
    }

    it('CONTROL: the repeated composition points exist and are being read', () => {
        // A typo in a path would empty the loop and report a clean result.
        expect(REPEATED_COMPOSITION_POINTS.length).toBeGreaterThan(1);
        for (const f of REPEATED_COMPOSITION_POINTS) expect(src.has(f)).toBe(true);
        expect(stateful.size).toBeGreaterThan(3);
    });

    it('every stateful class built in a repeated composition point is a reasoned ledger entry', () => {
        expectClean('compositionPointLifetime', violations);
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
