/**
 * The three pattern TABLES, exercised as tables.
 *
 * `formatGitHubError`, `formatDaLiveError` and `formatHelixError` each classify a
 * failure two ways: by an explicit `code` the caller attached, or — far more
 * often, because most of these errors arrive from octokit and fetch with no code
 * at all — by matching the message against a list of regexes. The existing suite
 * covers one message per formatter and mostly through the code path, so almost
 * every regex in the three tables was matched by nothing.
 *
 * Two things this pins that a single happy-path case per code cannot:
 *
 *   1. Each `.*` is load-bearing. `/sync.*timeout/` and `/sync.timeout/` accept
 *      the same short strings and diverge on the real ones — and a message that
 *      stops matching SYNC_TIMEOUT does not become UNKNOWN, it silently becomes
 *      NETWORK_ERROR, which tells the reader to check their internet connection
 *      for a Helix mirror that is still indexing.
 *   2. The code path WINS over the message path. Every by-code test in the
 *      existing suite uses a message that would match the same code anyway, so
 *      nothing said which branch produced the answer.
 *
 * Messages here are chosen to match exactly ONE pattern in their table, so a
 * failure names the pattern that broke.
 */

import {
    formatGitHubError,
    formatDaLiveError,
    formatHelixError,
} from '@/features/eds/services/errorFormatters';

import { codedError } from '../../../helpers/codedErrorFake';

describe('formatGitHubError — the message table', () => {
    it.each([
        ['OAuth sign-in cancel', 'OAUTH_CANCELLED'],
        ['The name my-site exists in this account', 'REPO_EXISTS'],
        ['repository my-site exists already under that owner', 'REPO_EXISTS'],
        ['token for this app has expired', 'AUTH_EXPIRED'],
        ['403 secondary rate abuse detected', 'RATE_LIMITED'],
    ])('classifies %j as %s', (message, code) => {
        expect(formatGitHubError(new Error(message)).code).toBe(code);
    });
});

describe('formatDaLiveError — the message table', () => {
    it('classifies a refused connection as NETWORK_ERROR', () => {
        // ECONNREFUSED matches nothing else in the DA.live table, so this is the
        // one message that proves that list is consulted at all.
        expect(formatDaLiveError(new Error('connect ECONNREFUSED 127.0.0.1:443')).code).toBe(
            'NETWORK_ERROR',
        );
    });
});

describe('formatHelixError — the message table', () => {
    it.each([
        ['sync operation hit a timeout', 'SYNC_TIMEOUT'],
        ['timeout while resyncing', 'SYNC_TIMEOUT'],
        ['code mirror sync pending', 'SYNC_TIMEOUT'],
        ['config write failed', 'CONFIG_FAILED'],
        ['configuration returned an error', 'CONFIG_FAILED'],
    ])('classifies %j as %s', (message, code) => {
        expect(formatHelixError(new Error(message)).code).toBe(code);
    });
});

/**
 * An explicit `code` is the caller saying "I already know what this is". It must
 * beat the message table, and it must not be trusted blindly — a code the table
 * does not hold has to fall through, not index into it and read fields off
 * `undefined`.
 */
describe('an explicit code beats the message, and an unknown code falls through', () => {
    const formatters = [
        ['GitHub', formatGitHubError, 'RATE_LIMITED'],
        ['DA.live', formatDaLiveError, 'NOT_FOUND'],
        ['Helix', formatHelixError, 'CONFIG_FAILED'],
    ] as const;

    it.each(formatters)('%s: the code decides, not the message', (_name, format, code) => {
        // A message that matches NO pattern in any table, so only the code can
        // produce this answer.
        expect(format(codedError('nothing in here matches anything', { code })).code).toBe(code);
    });

    it.each(formatters)('%s: a code the table does not hold falls through', (_name, format) => {
        expect(format(codedError('nothing in here matches anything', { code: 'NOT_A_REAL_CODE' })))
            .toMatchObject({ code: 'UNKNOWN' });
    });
});

/**
 * `technicalDetails` on the MESSAGE path carries the HTTP status, and it is the
 * only place the status survives — the user-facing message never mentions it.
 * Note which field each formatter reads: GitHub and Helix read `status`, DA.live
 * reads `statusCode`.
 */
describe('technicalDetails carries the status on the pattern path', () => {
    it('GitHub reads status', () => {
        expect(
            formatGitHubError(codedError('Bad credentials', { status: 401 })).technicalDetails,
        ).toBe('Status: 401, Message: Bad credentials');
    });

    it('DA.live reads statusCode', () => {
        expect(
            formatDaLiveError(codedError('Request forbidden', { statusCode: 403 }))
                .technicalDetails,
        ).toBe('Status: 403, Message: Request forbidden');
    });

    it('Helix reads status', () => {
        expect(
            formatHelixError(codedError('service unavailable', { status: 503 })).technicalDetails,
        ).toBe('Status: 503, Message: service unavailable');
    });

    it('says N/A when the error carries no status at all', () => {
        expect(formatGitHubError(new Error('Bad credentials')).technicalDetails).toBe(
            'Status: N/A, Message: Bad credentials',
        );
    });
});
