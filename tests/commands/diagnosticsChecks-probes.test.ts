/**
 * What the three `aio` probes make of what the CLI prints.
 *
 * `checkAdobeCLI` runs them together (see `-parallelProbes`); this suite is
 * about the parsing each one does afterwards, which is where a diagnostic
 * turns a valid answer into a wrong one. Every case here is a shape the CLI
 * actually produces: a clean exit with empty stdout, a non-zero exit that still
 * prints, a context with no org selected, and an org list that came back as an
 * error string rather than JSON.
 *
 * The failure mode these guard against is the one that earned the suite:
 * a probe that reports the OPPOSITE of the truth costs more than one that
 * reports nothing, because it sends someone chasing a state that already holds.
 */

import { mockExecute } from './diagnosticsChecks.testUtils';
import {
    checkAuthenticationStatus,
    checkCurrentContext,
    checkOrganizations,
    parseAuthConfig,
} from '@/commands/diagnosticsChecks';
import type { AdobeCLIInfo } from '@/commands/diagnosticsReport';

/** Every `aio` read answers with this exit code and stdout. */
function cliAnswers(stdout: string, code = 0) {
    mockExecute.mockResolvedValue({ stdout, stderr: '', code });
}

const NOW = 1_700_000_000_000;

beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
});

describe('checkAuthenticationStatus — the exit code decides, not the output', () => {
    it('reports NOT authenticated when the config read fails but still prints', async () => {
        // `aio config get` prints to stdout on some failures. Reading the text
        // without checking the exit code reports a signed-in user who is not.
        cliAnswers(JSON.stringify({ access_token: 'x' }), 1);
        const adobe = {} as AdobeCLIInfo;

        await checkAuthenticationStatus(adobe);

        expect(adobe.authConfigured).toBe(false);
        expect(adobe.hasToken).toBeUndefined();
    });

    it('tries the legacy context only after the current one comes back empty', async () => {
        cliAnswers('');
        const adobe = {} as AdobeCLIInfo;

        await checkAuthenticationStatus(adobe);

        expect(mockExecute.mock.calls.map((c) => String(c[0]))).toEqual([
            'aio config get ims.contexts.cli',
            'aio config get ims.contexts.aio-cli-plugin-auth',
        ]);
    });

    it('stops at the first context that holds a token', async () => {
        cliAnswers(JSON.stringify({ access_token: 'x' }));
        const adobe = {} as AdobeCLIInfo;

        await checkAuthenticationStatus(adobe);

        expect(mockExecute.mock.calls.map((c) => String(c[0]))).toEqual([
            'aio config get ims.contexts.cli',
        ]);
    });
});

describe('parseAuthConfig', () => {
    it('records which credentials the blob holds', () => {
        const adobe = {} as AdobeCLIInfo;

        parseAuthConfig(
            adobe,
            JSON.stringify({ access_token: 'a', refresh_token: 'r' }),
        );

        expect(adobe.hasToken).toBe(true);
        expect(adobe.hasRefreshToken).toBe(true);
    });

    it('records their ABSENCE rather than leaving the field unset', () => {
        const adobe = {} as AdobeCLIInfo;

        parseAuthConfig(adobe, JSON.stringify({ access_token: 'a' }));

        expect(adobe.hasToken).toBe(true);
        expect(adobe.hasRefreshToken).toBe(false);
    });

    it('reports an unexpired token with the expiry it will reach', () => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        const adobe = {} as AdobeCLIInfo;

        parseAuthConfig(adobe, JSON.stringify({ expires_in: String(NOW + 3_600_000) }));

        expect(adobe.tokenExpired).toBe(false);
        expect(adobe.expiryDate).toBe(new Date(NOW + 3_600_000).toISOString());
    });

    it('reports an expired token', () => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        const adobe = {} as AdobeCLIInfo;

        parseAuthConfig(adobe, JSON.stringify({ expires_in: String(NOW - 1) }));

        expect(adobe.tokenExpired).toBe(true);
    });

    it('treats an expiry exactly at now as NOT yet expired', () => {
        // The boundary: `<` and `<=` differ on this input alone, and only one
        // of them matches "expired" meaning the moment has passed.
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        const adobe = {} as AdobeCLIInfo;

        parseAuthConfig(adobe, JSON.stringify({ expires_in: String(NOW) }));

        expect(adobe.tokenExpired).toBe(false);
    });

    it('leaves the expiry fields alone when the blob carries no expiry', () => {
        // `parseInt(undefined)` is NaN, and `new Date(NaN).toISOString()`
        // THROWS — so computing an expiry unconditionally would turn a
        // perfectly readable blob into a parse error.
        const adobe = {} as AdobeCLIInfo;

        parseAuthConfig(adobe, JSON.stringify({ access_token: 'a' }));

        expect(adobe.tokenExpired).toBeUndefined();
        expect(adobe.expiryDate).toBeUndefined();
        expect(adobe.authParseError).toBeUndefined();
    });

    it('records a parse error for output that is not a blob at all', () => {
        const adobe = {} as AdobeCLIInfo;

        parseAuthConfig(adobe, 'Error: config not found');

        expect(adobe.authParseError).toBe('Invalid auth data format');
        expect(adobe.hasToken).toBeUndefined();
    });

    it('records a parse error for a literal null', () => {
        // Valid JSON, no object — the guard has to catch this one too, or the
        // property read below it throws a message about `null` instead.
        const adobe = {} as AdobeCLIInfo;

        parseAuthConfig(adobe, 'null');

        expect(adobe.authParseError).toBe('Invalid auth data format');
    });
});

describe('checkCurrentContext', () => {
    it('names the org, project and workspace the CLI is pointed at', async () => {
        cliAnswers(
            JSON.stringify({
                org: { name: 'Acme' },
                project: { name: 'demo' },
                workspace: { name: 'Stage' },
            }),
        );
        const adobe = {} as AdobeCLIInfo;

        await checkCurrentContext(adobe);

        expect(adobe.currentContext).toEqual({
            org: 'Acme',
            project: 'demo',
            workspace: 'Stage',
        });
    });

    it('says "Not selected" for a level the CLI reports without a name', async () => {
        // `aio console where --json` omits levels that have not been chosen.
        // Reading through the missing level unguarded throws, and the whole
        // context then falls back to the raw text.
        cliAnswers(JSON.stringify({ workspace: { name: 'Stage' } }));
        const adobe = {} as AdobeCLIInfo;

        await checkCurrentContext(adobe);

        expect(adobe.currentContext).toEqual({
            org: 'Not selected',
            project: 'Not selected',
            workspace: 'Stage',
        });
    });

    it('falls back to the raw output when the CLI did not print JSON', async () => {
        cliAnswers('You are not signed in.');
        const adobe = {} as AdobeCLIInfo;

        await checkCurrentContext(adobe);

        expect(adobe.currentContext).toBe('You are not signed in.');
    });

    it('records nothing when the probe exits non-zero, whatever it printed', async () => {
        cliAnswers(JSON.stringify({ org: { name: 'Acme' } }), 1);
        const adobe = {} as AdobeCLIInfo;

        await checkCurrentContext(adobe);

        expect(adobe.currentContext).toBeUndefined();
    });

    it('records nothing when the probe printed nothing', async () => {
        cliAnswers('');
        const adobe = {} as AdobeCLIInfo;

        await checkCurrentContext(adobe);

        expect(adobe.currentContext).toBeUndefined();
    });
});

describe('checkOrganizations', () => {
    it('counts the orgs the CLI listed', async () => {
        cliAnswers(JSON.stringify([{ id: '1' }, { id: '2' }, { id: '3' }]));
        const adobe = {} as AdobeCLIInfo;

        await checkOrganizations(adobe);

        expect(adobe.canListOrgs).toBe(true);
        expect(adobe.organizationCount).toBe(3);
    });

    it('reports an empty list as zero orgs, not as a failure', async () => {
        cliAnswers('[]');
        const adobe = {} as AdobeCLIInfo;

        await checkOrganizations(adobe);

        expect(adobe.canListOrgs).toBe(true);
        expect(adobe.organizationCount).toBe(0);
    });

    it('cannot list orgs when the probe exits non-zero, whatever it printed', async () => {
        cliAnswers(JSON.stringify([{ id: '1' }]), 1);
        const adobe = {} as AdobeCLIInfo;

        await checkOrganizations(adobe);

        expect(adobe.canListOrgs).toBe(false);
        expect(adobe.organizationCount).toBeUndefined();
    });

    it('cannot list orgs when the CLI printed an error on a clean exit', async () => {
        // `aio console org list --json` exits 0 and prints "Error: ..." when
        // the token is stale. Counting that as a successful listing is how a
        // signed-out CLI reports it can see organizations.
        cliAnswers('Error: cannot get organizations');
        const adobe = {} as AdobeCLIInfo;

        await checkOrganizations(adobe);

        expect(adobe.canListOrgs).toBe(false);
    });

    it('leaves the count unset when the listing is valid JSON but not a list', async () => {
        cliAnswers('null');
        const adobe = {} as AdobeCLIInfo;

        await checkOrganizations(adobe);

        expect(adobe.canListOrgs).toBe(true);
        expect(adobe.organizationCount).toBeUndefined();
    });

    it('leaves the count unset when the listing is not JSON at all', async () => {
        cliAnswers('one org');
        const adobe = {} as AdobeCLIInfo;

        await checkOrganizations(adobe);

        expect(adobe.organizationCount).toBeUndefined();
    });
});
