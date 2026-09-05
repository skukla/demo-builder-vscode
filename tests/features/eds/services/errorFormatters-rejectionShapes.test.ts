/**
 * The SHAPES a GitHub rejection actually arrives in.
 *
 * `describeRejectionDiagnostics` and `describePushProtectionBlock` walk four
 * levels of a response body that GitHub populates differently per rule type —
 * push protection fills `metadata.secret_scanning`, other repository rules fill
 * `errors[]`, and the CLI-git path arrives with no `response` at all. Every step
 * of that walk is written with `?.` for a reason, and none of those reasons was
 * pinned: the existing suites feed two well-formed bodies, so a walk that threw
 * on a half-populated one would look identical.
 *
 * That matters more here than in most code. This runs INSIDE the catch that is
 * already reporting a failure — a throw from it replaces the diagnostic the user
 * needed with a TypeError from the diagnostic itself.
 *
 * The whole-output assertions are deliberate. Every line in the block is
 * conditional, so "contains the request id" cannot tell a block that gained a
 * spurious `docs:` line from one that did not.
 */

import {
    describePushProtectionBlock,
    describeRejectionDiagnostics,
} from '@/features/eds/services/errorFormatters';

/** An octokit-shaped rejection: `status` on the error, everything else in `response`. */
function rejection(
    data: Record<string, unknown> | undefined,
    extra: { status?: number; headers?: Record<string, string>; message?: string } = {},
): Error {
    const err = new Error(extra.message ?? 'Repository rule violations found') as Error & {
        status?: number;
        response?: unknown;
    };
    if (extra.status !== undefined) err.status = extra.status;
    err.response = { headers: extra.headers, data };
    return err;
}

describe('describeRejectionDiagnostics — the whole block', () => {
    it('emits every field it found, in order, once', () => {
        const out = describeRejectionDiagnostics(
            rejection(
                {
                    message: 'Repository rule violations found',
                    documentation_url: 'https://docs.github.com/x',
                    metadata: {
                        secret_scanning: {
                            bypass_placeholders: [
                                { placeholder_id: 'PID1', token_type: 'SLACK_WEBHOOK' },
                            ],
                        },
                    },
                    errors: [{ resource: 'PushRule', message: 'generic summary' }],
                },
                { status: 409, headers: { 'x-github-request-id': 'ABC1:123' } },
            ),
        );

        expect(out).toBe(
            [
                'GitHub rejection detail:',
                '  status: 409',
                '  request-id: ABC1:123',
                '  message: Repository rule violations found',
                '  docs: https://docs.github.com/x',
                '  detected: SLACK_WEBHOOK (bypass id PID1)',
                '  errors[0] (PushRule): generic summary',
            ].join('\n'),
        );
    });

    it('emits ONLY the fields it found — no placeholder lines for absent ones', () => {
        // No status, no request id, no docs, no metadata, no errors.
        const out = describeRejectionDiagnostics(rejection({ message: 'boom' }));

        expect(out).toBe('GitHub rejection detail:\n  message: boom');
    });

    it('says nothing at all when the body holds no reportable field', () => {
        // A present-but-empty `data` is not the same as no response, and it must
        // not produce a bare header with nothing under it.
        expect(describeRejectionDiagnostics(rejection({}))).toBe('');
    });
});

describe('describeRejectionDiagnostics — half-populated bodies', () => {
    it('survives metadata with no secret_scanning', () => {
        const out = describeRejectionDiagnostics(
            rejection({ message: 'boom', metadata: { some_other_rule: {} } }),
        );

        expect(out).toBe('GitHub rejection detail:\n  message: boom');
    });

    it('skips a placeholder entry that names neither the secret nor a bypass id', () => {
        const out = describeRejectionDiagnostics(
            rejection({
                metadata: { secret_scanning: { bypass_placeholders: [{}] } },
            }),
        );

        expect(out).toBe('');
    });

    it('reports a placeholder that names only the secret type', () => {
        // token_type alone is still the fact that identifies the secret; the
        // bypass id is what the bypass ENDPOINT needs and is often absent.
        const out = describeRejectionDiagnostics(
            rejection({
                metadata: {
                    secret_scanning: { bypass_placeholders: [{ token_type: 'STRIPE_API_KEY' }] },
                },
            }),
        );

        expect(out).toBe('GitHub rejection detail:\n  detected: STRIPE_API_KEY');
    });

    it('steps over a null placeholder entry rather than dying on it', () => {
        const out = describeRejectionDiagnostics(
            rejection({
                metadata: {
                    secret_scanning: {
                        bypass_placeholders: [null, { token_type: 'SLACK_WEBHOOK' }],
                    },
                },
            }),
        );

        expect(out).toBe('GitHub rejection detail:\n  detected: SLACK_WEBHOOK');
    });

    it('skips an errors[] entry with no message, and steps over a null one', () => {
        const out = describeRejectionDiagnostics(
            rejection({ errors: [null, { resource: 'PushRule' }] }),
        );

        expect(out).toBe('');
    });
});

/**
 * Long filler built from SHORT words. A single 300-character run of one
 * character is collapsed to `<redacted>` by `sanitizeErrorForLogging`'s
 * generic-API-key pattern, which makes every length assertion pass whether the
 * cap is applied or not — that is exactly why the missing cap survived here.
 */
const filler = (length: number) => 'ab '.repeat(Math.ceil(length / 3)).slice(0, length);

describe('describeRejectionDiagnostics — the two caps', () => {
    it('caps each quoted field at 200 characters', () => {
        const out = describeRejectionDiagnostics(rejection({ message: filler(300) }));

        expect(out).toBe(`GitHub rejection detail:\n  message: ${filler(300).slice(0, 200)}`);
    });

    it('caps the whole block at 1200 characters', () => {
        // Ten capped errors[] lines run past 2000 characters on their own; the
        // per-field cap does not bound the block, and this lands in an
        // exportable debug log.
        const out = describeRejectionDiagnostics(
            rejection({
                errors: Array.from({ length: 10 }, () => ({
                    resource: 'PushRule',
                    message: filler(200),
                })),
            }),
        );

        expect(out).toHaveLength(1200);
    });
});

describe('describePushProtectionBlock — bodies it must not die on', () => {
    it('reports the block when the error carries no response at all', () => {
        // The CLI-git push path raises a plain Error with stderr as its message.
        const out = describePushProtectionBlock(
            new Error('Repository rule violations found'),
            'fstab.yaml',
        );

        expect(out).toBe(
            "GitHub blocked writing fstab.yaml — the repository's rules rejected the content. " +
                'Nothing was written.',
        );
    });

    it('accepts a non-Error value', () => {
        // `catch (e)` gives `unknown`; a thrown string reaches here as one.
        expect(describePushProtectionBlock('Repository rule violations found', 'fstab.yaml')).
            toContain('fstab.yaml');
    });

    it.each([
        ['metadata with no secret_scanning', { metadata: { other: {} } }],
        ['secret_scanning with no placeholders', { metadata: { secret_scanning: {} } }],
        [
            'placeholders that name no token type',
            { metadata: { secret_scanning: { bypass_placeholders: [{ placeholder_id: 'X' }] } } },
        ],
        [
            'a null placeholder entry',
            { metadata: { secret_scanning: { bypass_placeholders: [null] } } },
        ],
        ['an errors[] entry with no message', { errors: [{ resource: 'PushRule' }] }],
    ])('falls back to the anonymous message on %s', (_label, data) => {
        const out = describePushProtectionBlock(rejection(data, { status: 422 }), 'config.json');

        expect(out).toBe(
            "GitHub blocked writing config.json — the repository's rules rejected the content. " +
                'Nothing was written.',
        );
    });
});

describe('describePushProtectionBlock — when it is allowed to say "secret"', () => {
    it('says so when only the DETAIL mentions one', () => {
        // The top line here carries no push-protection marker; the evidence is
        // in `errors[].message`. Reading only the top line reported this as an
        // ordinary rule rejection.
        const out = describePushProtectionBlock(
            rejection({ errors: [{ message: 'Adobe Client Secret detected' }] }, { status: 422 }),
            'config.json',
        );

        expect(out).toMatch(/push protection detected a secret/);
        expect(out).toContain('Adobe Client Secret detected');
    });

    it('caps the detail at 200 characters before it reaches the log', () => {
        const out = describePushProtectionBlock(
            rejection({ errors: [{ message: filler(400) }] }, { status: 422 }),
            'fstab.yaml',
        );

        expect(out).toBe(
            "GitHub blocked writing fstab.yaml — the repository's rules rejected the content: " +
                `${filler(400).slice(0, 200)}. Nothing was written.`,
        );
    });
});
