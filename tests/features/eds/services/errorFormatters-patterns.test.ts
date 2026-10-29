/**
 * The three pattern TABLES, exercised as tables.
 *
 * `formatGitHubError` and `formatHelixError` each classify a
 * failure two ways: by an explicit `code` the caller attached, or — far more
 * often, because most of these errors arrive from octokit and fetch with no code
 * at all — by matching the message against a list of regexes. The existing suite
 * covers one message per formatter and mostly through the code path, so almost
 * every regex in the tables was matched by nothing.
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

import { formatGitHubError, formatHelixError } from '@/features/eds/services/errorFormatters';

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
 * Both formatters read `status`.
 */
describe('technicalDetails carries the status on the pattern path', () => {
    it('GitHub reads status', () => {
        expect(
            formatGitHubError(codedError('Bad credentials', { status: 401 })).technicalDetails,
        ).toBe('Status: 401, Message: Bad credentials');
    });

    it('Helix reads status', () => {
        expect(
            formatHelixError(codedError('service unavailable', { status: 503 })).technicalDetails,
        ).toBe('Status: 503, Message: service unavailable');
    });

    it('says N/A on the code path too when the error carries no status', () => {
        expect(
            formatHelixError(codedError('nothing in here matches anything', { code: 'SYNC_TIMEOUT' }))
                .technicalDetails,
        ).toBe('Status: N/A, Message: nothing in here matches anything');
    });

    it('says N/A when the error carries no status at all', () => {
        expect(formatGitHubError(new Error('Bad credentials')).technicalDetails).toBe(
            'Status: N/A, Message: Bad credentials',
        );
    });
});

/**
 * Every row's words, exactly. These are what the SC reads, and since 2026-10-09
 * both formatters classify through one shared matcher, so each row is reached
 * here once by its code and the words are compared byte for byte. A row that
 * changed its wording, or a matcher that answered from the wrong table, fails
 * by name.
 */
describe('each table row answers with its own words', () => {
    const githubRows: [string, string, string][] = [
        [
            'OAUTH_CANCELLED',
            'GitHub sign-in was cancelled. Please try again to authenticate.',
            'Click the Sign In button to start the authentication process again.',
        ],
        [
            'REPO_EXISTS',
            'A repository with this name already exists. Please choose a different name for your project.',
            'Go back and enter a different project name, or delete the existing repository first.',
        ],
        [
            'AUTH_EXPIRED',
            'Your GitHub session has expired. Please sign in again to continue.',
            'Click Sign In to authenticate with GitHub again.',
        ],
        [
            'RATE_LIMITED',
            'Too many requests to GitHub. Please try again in a few minutes.',
            'Wait 5-10 minutes before trying again. GitHub limits API requests.',
        ],
        [
            'NETWORK_ERROR',
            'Could not connect to GitHub. Please check your internet connection.',
            'Verify your internet connection and try again.',
        ],
        [
            'UNKNOWN',
            'An unexpected error occurred with GitHub. Please try again.',
            'If the problem persists, check GitHub status at status.github.com.',
        ],
    ];
    const helixRows: [string, string, string][] = [
        [
            'SERVICE_UNAVAILABLE',
            'The Helix configuration service is temporarily unavailable. Please try again in a few minutes.',
            'This is usually a temporary issue. Try again in a few minutes.',
        ],
        [
            'SYNC_TIMEOUT',
            'Code synchronization is taking longer than expected. The repository may still be processing.',
            'You can retry the setup or check back in a few minutes. The synchronization may complete in the background.',
        ],
        [
            'CONFIG_FAILED',
            'Failed to configure the Helix site. The server encountered an error.',
            'Try again. If the problem persists, verify your project settings.',
        ],
        [
            'NETWORK_ERROR',
            'Could not connect to the Helix service. Please check your internet connection.',
            'Verify your internet connection and try again.',
        ],
        [
            'UNKNOWN',
            'An unexpected error occurred with Helix configuration. Please try again.',
            'If the problem persists, contact support.',
        ],
    ];

    it.each(githubRows)('GitHub %s', (code, userMessage, recoveryHint) => {
        expect(formatGitHubError(codedError('nothing in here matches anything', { code, status: 418 })))
            .toStrictEqual({
                code,
                message: 'nothing in here matches anything',
                userMessage,
                recoveryHint,
                technicalDetails: 'Status: 418, Message: nothing in here matches anything',
            });
    });

    it.each(helixRows)('Helix %s', (code, userMessage, recoveryHint) => {
        expect(formatHelixError(codedError('nothing in here matches anything', { code, status: 418 })))
            .toStrictEqual({
                code,
                message: 'nothing in here matches anything',
                userMessage,
                recoveryHint,
                technicalDetails: 'Status: 418, Message: nothing in here matches anything',
            });
    });

    it('the fallback carries no status, whatever the error had', () => {
        expect(formatHelixError(codedError('nothing in here matches anything', { status: 418 })))
            .toStrictEqual({
                code: 'UNKNOWN',
                message: 'nothing in here matches anything',
                userMessage: 'An unexpected error occurred with Helix configuration. Please try again.',
                recoveryHint: 'If the problem persists, contact support.',
                technicalDetails: 'Message: nothing in here matches anything',
            });
    });

    it('a message matching rows in both tables is answered from the table asked', () => {
        // "network" sits in both NETWORK_ERROR rows; the words name the service.
        expect(formatGitHubError(new Error('network down')).userMessage).toBe(
            'Could not connect to GitHub. Please check your internet connection.',
        );
        expect(formatHelixError(new Error('network down')).userMessage).toBe(
            'Could not connect to the Helix service. Please check your internet connection.',
        );
    });
});
