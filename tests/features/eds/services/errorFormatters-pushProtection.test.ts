/**
 * GitHub ruleset rejections — naming the file that was blocked.
 *
 * A real report (2026-08-11, jogosset/brookshires-bgc): Storefront Setup died with
 *
 *     [Storefront Setup] Failed: Repository rule violations found
 *     Secret detected in content
 *      - https://docs.github.com/rest/repos/contents#create-or-update-file-contents
 *
 * and nothing else. That message names no file, no secret type, and does not say
 * whether anything was written — so the reporter could not tell WHICH of the eight
 * files the pipeline pushes had been rejected, and resorted to asking an AI what
 * the error meant.
 *
 * The extension already knows the path: every rejected write goes through
 * `createOrUpdateFile(owner, repo, path, ...)`. These tests pin that the path
 * reaches the message — and, just as importantly, that the message does not claim
 * "secret" for ruleset rules that have nothing to do with secrets.
 */

import {
    describePushProtectionBlock,
    describeRejectionDiagnostics,
} from '@/features/eds/services/errorFormatters';

/** The shape octokit raises for a 422 ruleset rejection. */
function rulesetError(topLine: string, errorsDetail?: string): Error {
    const err = new Error(
        `${topLine}\n\n - https://docs.github.com/rest/repos/contents#create-or-update-file-contents`
    ) as Error & { status?: number; response?: unknown };
    err.status = 422;
    err.response = {
        data: {
            message: topLine,
            errors: errorsDetail ? [{ resource: 'PushRule', message: errorsDetail }] : undefined,
        },
    };
    return err;
}

/** The exact shape from the 2026-08-11 report. */
const reportedError = () =>
    rulesetError('Repository rule violations found\n\nSecret detected in content');

describe('describePushProtectionBlock', () => {
    it('names the file that was blocked', () => {
        // The single most useful fact, and the one the raw error omits.
        const result = describePushProtectionBlock(reportedError(), 'fstab.yaml');

        expect(result).toBeDefined();
        expect(result).toContain('fstab.yaml');
    });

    it('states that nothing was written', () => {
        // Push protection rejects the whole write, so the repo is unchanged. Without
        // saying so, the reader cannot tell whether the repo is half-updated.
        expect(describePushProtectionBlock(reportedError(), 'config.json')).toMatch(
            /nothing was written/i
        );
    });

    it('says a secret was detected when GitHub said so', () => {
        expect(describePushProtectionBlock(reportedError(), 'fstab.yaml')).toMatch(
            /push protection detected a secret/i
        );
    });

    it('carries the secret type through when GitHub names one', () => {
        const result = describePushProtectionBlock(
            rulesetError('Repository rule violations found', 'GitHub Personal Access Token'),
            'scripts/delayed.js'
        );

        expect(result).toContain('GitHub Personal Access Token');
    });

    /**
     * GH013 covers EVERY ruleset rule, not just push protection — file-path
     * restrictions, size limits, required signatures, commit-message patterns. A
     * size rejection reported as "a secret was detected" sends the reader hunting
     * for a secret that does not exist, which is worse than the anonymous message
     * this replaces, because it is confidently wrong.
     */
    it('does NOT claim a secret for a non-secret ruleset rejection', () => {
        const result = describePushProtectionBlock(
            rulesetError(
                'Repository rule violations found',
                'File exceeds the maximum allowed size of 100 MB'
            ),
            'blocks/hero/hero.js'
        );

        expect(result).toBeDefined();
        expect(result).not.toMatch(/secret/i);
        expect(result).toContain('blocks/hero/hero.js');
        expect(result).toContain('File exceeds the maximum allowed size');
    });

    it('truncates a long GitHub detail before it reaches the exportable log', () => {
        // The detail is GitHub-controlled and lands verbatim in the debug log users
        // paste into tickets; its multi-line form would also let a "\n[ERROR] ..."
        // line forge log entries.
        const result = describePushProtectionBlock(
            rulesetError('Repository rule violations found', `${'x'.repeat(500)}\n[ERROR] forged`),
            'fstab.yaml'
        );

        expect(result!.length).toBeLessThan(400);
        expect(result).not.toContain('forged');
    });

    it('returns undefined for an unrelated error', () => {
        // Must not relabel ordinary failures — a 404 has a different remedy entirely.
        const notFound = new Error('Not Found') as Error & { status?: number };
        notFound.status = 404;

        expect(describePushProtectionBlock(notFound, 'fstab.yaml')).toBeUndefined();
    });

    it('returns undefined for a 422 that is not a rule violation', () => {
        // 422 is also returned for a stale SHA on update. Same status, different cause,
        // and pdp404HandlerPublisher retries on it — so misreading it would break that.
        const staleSha = new Error('is at abc123 but expected def456') as Error & {
            status?: number;
        };
        staleSha.status = 422;

        expect(describePushProtectionBlock(staleSha, 'fstab.yaml')).toBeUndefined();
    });

    it('handles a null error without throwing', () => {
        expect(describePushProtectionBlock(null, 'fstab.yaml')).toBeUndefined();
    });
});

/**
 * The reason a write was refused lives in GitHub's response BODY, and the
 * extension discarded all of it — `data.message`, `documentation_url`, every
 * entry in `errors[]`. Three failed reproduction attempts on 2026-08-11 (a fake
 * PAT, a real RSA private key, both accepted on a public repo with push
 * protection enabled) showed the block cannot be triggered locally: it comes
 * from policy on the reporter's account. So the ONLY way anyone learns why is to
 * capture what GitHub said, on their machine, at the moment it said it.
 */
describe('describeRejectionDiagnostics', () => {
    it('captures data.message, which the message-only path drops', () => {
        const err = new Error('Repository rule violations found') as Error & { response?: unknown };
        err.response = {
            data: { message: 'Repository rule violations found', documentation_url: 'https://d' },
        };

        const out = describeRejectionDiagnostics(err);

        expect(out).toContain('Repository rule violations found');
    });

    it('captures EVERY entry in errors[], not just the first', () => {
        // The first entry is often the generic summary; the useful one can be later.
        const err = new Error('boom') as Error & { response?: unknown };
        err.response = {
            data: {
                errors: [
                    { resource: 'PushRule', message: 'generic summary' },
                    { resource: 'PushRule', message: 'Adobe Client Secret detected' },
                ],
            },
        };

        const out = describeRejectionDiagnostics(err);

        expect(out).toContain('generic summary');
        expect(out).toContain('Adobe Client Secret detected');
    });

    it('records the HTTP status and the request id for GitHub Support', () => {
        const err = new Error('boom') as Error & { status?: number; response?: unknown };
        err.status = 422;
        err.response = { headers: { 'x-github-request-id': 'ABC1:123' }, data: {} };

        const out = describeRejectionDiagnostics(err);

        expect(out).toContain('422');
        expect(out).toContain('ABC1:123');
    });

    it('redacts and caps — it lands in a log users paste into tickets', () => {
        const err = new Error('boom') as Error & { response?: unknown };
        err.response = {
            data: { message: 'x'.repeat(4000), errors: [{ message: 'y'.repeat(4000) }] },
        };

        const out = describeRejectionDiagnostics(err);

        expect(out.length).toBeLessThan(1500);
    });

    it('returns empty string when there is no response body to report', () => {
        // A plain network error has nothing to add; do not emit noise.
        expect(describeRejectionDiagnostics(new Error('fetch failed'))).toBe('');
        expect(describeRejectionDiagnostics(null)).toBe('');
    });
});

/**
 * REAL response body, captured 2026-08-11 by reproducing the block on a throwaway
 * public repo with a synthetic Slack webhook URL. Everything before this was
 * guessed: the first version of describeRejectionDiagnostics read `errors[]`,
 * which GitHub does not populate for push protection. The secret type and the
 * bypass id live under metadata.secret_scanning.bypass_placeholders[].
 */
describe('describeRejectionDiagnostics — real push-protection body', () => {
    function realBody(): Error {
        const err = new Error(
            'Repository rule violations found\n\nSecret detected in content\n'
        ) as Error & { status?: number; response?: unknown };
        err.status = 409;
        err.response = {
            data: {
                message: 'Repository rule violations found\n\nSecret detected in content\n',
                metadata: {
                    secret_scanning: {
                        bypass_placeholders: [
                            { placeholder_id: '3HnRVDxAJuxU4qXmB90XxgeAbPa', token_type: 'SLACK_WEBHOOK' },
                        ],
                    },
                },
                documentation_url: 'https://docs.github.com/rest/git/blobs#create-a-blob',
            },
        };
        return err;
    }

    it('reports the token_type — the single fact that identifies the secret', () => {
        expect(describeRejectionDiagnostics(realBody())).toContain('SLACK_WEBHOOK');
    });

    it('reports the placeholder_id, which the bypass endpoint requires', () => {
        expect(describeRejectionDiagnostics(realBody())).toContain('3HnRVDxAJuxU4qXmB90XxgeAbPa');
    });

    it('reports every placeholder when GitHub returns more than one', () => {
        const err = realBody() as Error & { response?: any };
        err.response.data.metadata.secret_scanning.bypass_placeholders.push({
            placeholder_id: 'SECOND',
            token_type: 'STRIPE_API_KEY',
        });

        const out = describeRejectionDiagnostics(err);

        expect(out).toContain('SLACK_WEBHOOK');
        expect(out).toContain('STRIPE_API_KEY');
    });

    it('still reports status and message alongside them', () => {
        const out = describeRejectionDiagnostics(realBody());

        expect(out).toContain('409');
        expect(out).toContain('Repository rule violations found');
    });
});
