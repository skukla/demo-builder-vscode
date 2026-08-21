/**
 * REQUEST_TIMEOUTS coverage
 *
 * The frontend's default request budget is 30s (`FRONTEND_TIMEOUTS.REQUEST_TIMEOUT`);
 * anything slower must appear in the backend `REQUEST_TIMEOUTS` map, which sends a
 * `__timeout_hint__` to extend it. A message missing from that map fails in the most
 * confusing way available: the UI reports "Request timeout: <type>" while the
 * extension log shows the work SUCCEEDING moments later.
 *
 * That is exactly what shipped — `list-org-console-apis` (wizard) was budgeted at
 * 180s while its dashboard twin `listConsoleApis` was not, so a 35.2s catalog fetch
 * timed out in the Manage APIs modal and returned 96 services in the log
 * (2026-07-31). This suite reads the map from SOURCE so a new slow message, or a new
 * twin of an existing one, has to be listed.
 */

import * as fs from 'fs';
import * as path from 'path';

const SOURCE = path.join(
    __dirname,
    '../../../src/core/communication/webviewCommunicationManager.ts'
);

/** The message types the REQUEST_TIMEOUTS map budgets. */
function budgetedTypes(): Set<string> {
    const source = fs.readFileSync(SOURCE, 'utf8');
    const start = source.indexOf('const REQUEST_TIMEOUTS');
    const end = source.indexOf('};', start);
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, end);
    // Keys appear quoted ('get-projects') or bare (listConsoleApis) — prettier
    // unquotes any key that is a valid identifier, so match both forms.
    return new Set(
        [...body.matchAll(/^\s*(?:'([^']+)'|([A-Za-z_$][\w$]*)):\s*TIMEOUTS\./gm)].map(
            (m) => m[1] ?? m[2]
        )
    );
}

describe('REQUEST_TIMEOUTS', () => {
    it('budgets something (guards against a vacuous suite)', () => {
        expect(budgetedTypes().size).toBeGreaterThan(5);
    });

    // The three that shipped un-budgeted, named so the regression is legible.
    it.each(['listConsoleApis', 'addConsoleApis', 'setConsoleApis'])(
        'budgets the dashboard console-API message %s',
        (type) => {
            expect([...budgetedTypes()]).toContain(type);
        }
    );

    // These bound an SDK attempt (SDK_ENTITY_FETCH, 10s) and THEN fall back to the
    // `aio` CLI, so the slow path is the sum of both — 30s timed out on work that
    // would have completed (2026-07-31, the destination picker).
    it.each(['get-projects', 'get-workspaces'])('budgets the entity fetch %s past 30s', (type) => {
        expect([...budgetedTypes()]).toContain(type);
    });

    // Both sign-in messages AWAIT a browser flow (human think-time + 2FA), so the
    // 30s default cannot cover either. `reAuthenticate` shipped unbudgeted while its
    // sibling `authenticate` was covered — found when the API picker's new
    // "Sign In with Adobe" action needed to await it (2026-07-31).
    it.each(['authenticate', 'reAuthenticate'])('budgets the browser sign-in %s', (type) => {
        expect([...budgetedTypes()]).toContain(type);
    });

    // The Code Sync check is fast ONLY when the caller passes `skipTrigger`.
    // "Check Again" does not, so on a repo Helix has never indexed the handler
    // triggers a real code sync and polls it for up to TIMEOUTS.LONG. Unbudgeted,
    // the frontend gave up at 30s and rendered "couldn't verify" over a sync that
    // was still running — and the gate on that step reads that verdict.
    it('budgets the Code Sync check for the path that triggers a sync', () => {
        expect([...budgetedTypes()]).toContain('check-github-app');
    });

    // Every Adobe-console call routes through getServicesForOrg or a subscribe PUT,
    // both measured well past the 30s default. If a twin exists for one, it exists
    // for the other.
    it('budgets BOTH the wizard and dashboard catalog fetches', () => {
        const budgeted = budgetedTypes();

        expect(budgeted.has('list-org-console-apis')).toBe(true);
        expect(budgeted.has('listConsoleApis')).toBe(true);
    });
});
