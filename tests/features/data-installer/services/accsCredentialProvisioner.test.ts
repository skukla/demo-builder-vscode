/**
 * Console-free ACCS credential provisioning — the loop proven live 2026-08-13.
 *
 * Every step was rehearsed against the real Console and service before this
 * module existed: create the `demo-builder-s2s` credential (the extension's own
 * SDK call), subscribe `ACCS-REST-API` to it (scopes went from `AdobeID,openid`
 * to `commerce.accs` + `additional_info.*`, and the Data Installer's pre-flight
 * flipped from 400 to 200), download the workspace config with EXPLICIT ids, and
 * read the pair out of `oauth_server_to_server.client_secrets`.
 *
 * The rules this suite pins, each paid for:
 *
 * - **Subscribe the UNION, never just the new code.** The subscribe endpoint is
 *   a PUT: sending one code unsubscribes everything else on the shared
 *   credential (the appbuilder full-union rule).
 * - **Do not subscribe at all when the service is already there** — the PUT is
 *   not idempotent-cheap, and pre-flight already passes.
 * - **Explicit ids on the download, never the selected CLI context** — the
 *   user's selected workspace 404'd live while the project's real workspace was
 *   fine.
 * - **The secret never reaches a log.** The deps logger gets step names only.
 *
 * Strict TDD: written BEFORE the module exists.
 */

import { provisionAccsCredentials } from '@/features/data-installer/services/accsCredentialProvisioner';

const TARGET = { orgId: '285361', projectId: 'proj-1', workspaceId: 'ws-1' };

/** A workspace-download JSON carrying the S2S pair. */
function workspaceJson(clientId: string, secret: string): string {
    return JSON.stringify({
        project: {
            workspace: {
                details: {
                    credentials: [
                        { integration_type: 'apikey', api_key: { client_id: 'mesh-key' } },
                        {
                            integration_type: 'oauth_server_to_server',
                            oauth_server_to_server: {
                                client_id: clientId,
                                client_secrets: [secret],
                            },
                        },
                    ],
                },
            },
        },
    });
}

function makeDeps(overrides: Record<string, unknown> = {}) {
    const written: Record<string, string> = {};
    const deps = {
        auth: {
            getWorkspaceS2SCredential: jest
                .fn()
                .mockResolvedValue({ clientId: 'cid-1', idIntegration: 'int-1' }),
            createWorkspaceS2SCredentialFor: jest
                .fn()
                .mockResolvedValue({ clientId: 'cid-1', idIntegration: 'int-1' }),
            getSubscribedServiceCodes: jest.fn().mockResolvedValue(['GraphQLServiceSDK']),
            subscribeOAuthServerToServerIntegrationToServices: jest.fn().mockResolvedValue(undefined),
        },
        downloadWorkspaceJson: jest
            .fn()
            .mockResolvedValue(workspaceJson('cid-1', 'fake-test-secret-not-a-secret')),
        log: jest.fn((line: string) => {
            written[line] = line;
        }),
        ...overrides,
    };
    return { deps, written };
}

describe('provisionAccsCredentials', () => {
    it('returns the pair from an end-to-end run', async () => {
        const { deps } = makeDeps();

        const result = await provisionAccsCredentials(deps, TARGET);

        expect(result).toEqual({
            ok: true,
            clientId: 'cid-1',
            clientSecret: 'fake-test-secret-not-a-secret',
        });
    });

    it('creates the credential only when none exists', async () => {
        const { deps } = makeDeps();
        (deps.auth.getWorkspaceS2SCredential as jest.Mock).mockResolvedValue(undefined);

        await provisionAccsCredentials(deps, TARGET);

        expect(deps.auth.createWorkspaceS2SCredentialFor).toHaveBeenCalledWith(
            TARGET.orgId,
            TARGET.projectId,
            TARGET.workspaceId,
        );
    });

    it('does not create when the credential already exists', async () => {
        const { deps } = makeDeps();

        await provisionAccsCredentials(deps, TARGET);

        expect(deps.auth.createWorkspaceS2SCredentialFor).not.toHaveBeenCalled();
    });

    // The PUT replaces the subscription list — one code alone would unsubscribe
    // everything else on the shared credential.
    it('subscribes the UNION of existing codes plus ACCS-REST-API', async () => {
        const { deps } = makeDeps();

        await provisionAccsCredentials(deps, TARGET);

        expect(deps.auth.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledWith(
            TARGET.orgId,
            'int-1',
            [
                { sdkCode: 'GraphQLServiceSDK', licenseConfigs: null, roles: null },
                { sdkCode: 'ACCS-REST-API', licenseConfigs: null, roles: null },
            ],
        );
    });

    it('skips the subscribe entirely when ACCS-REST-API is already there', async () => {
        const { deps } = makeDeps();
        (deps.auth.getSubscribedServiceCodes as jest.Mock).mockResolvedValue([
            'GraphQLServiceSDK',
            'ACCS-REST-API',
        ]);

        await provisionAccsCredentials(deps, TARGET);

        expect(deps.auth.subscribeOAuthServerToServerIntegrationToServices).not.toHaveBeenCalled();
    });

    it('reports a workspace whose download carries no secret', async () => {
        const { deps } = makeDeps();
        (deps.downloadWorkspaceJson as jest.Mock).mockResolvedValue(
            JSON.stringify({ project: { workspace: { details: { credentials: [] } } } }),
        );

        const result = await provisionAccsCredentials(deps, TARGET);

        expect(result).toEqual({
            ok: false,
            reason: expect.stringContaining('secret'),
        });
    });

    it('never passes the secret to the logger', async () => {
        const { deps } = makeDeps();

        await provisionAccsCredentials(deps, TARGET);

        const logged = (deps.log as jest.Mock).mock.calls.flat().join('\n');
        expect(logged).not.toContain('fake-test-secret-not-a-secret');
        expect(logged).not.toContain('cid-1');
    });

    it('reports a failed step as a reason, never a throw', async () => {
        const { deps } = makeDeps();
        (deps.auth.getWorkspaceS2SCredential as jest.Mock).mockRejectedValue(
            new Error('SDK not initialized'),
        );
        (deps.auth.createWorkspaceS2SCredentialFor as jest.Mock).mockRejectedValue(
            new Error('SDK not initialized'),
        );

        const result = await provisionAccsCredentials(deps, TARGET);

        expect(result).toMatchObject({ ok: false });
    });
});

/**
 * SECURITY: the workspace download holds the client secret, and Node's
 * JSON.parse SyntaxError quotes ~30 characters of the input it choked on. If
 * that message escaped through `log()` or the returned `reason`, part of a
 * secret would land in Debug Logs — which `debugLogger.debug()` does not redact
 * and which people paste into tickets.
 */
describe('a malformed workspace download', () => {
    it('never lets the parse error quote the secret', async () => {
        const secret = 'fake-test-secret-not-a-secret';
        const lines: string[] = [];
        const { deps } = makeDeps({
            downloadWorkspaceJson: jest.fn().mockResolvedValue(
                `{"project":{"workspace":{"details":{"credentials":[{"client_secrets":["${secret}"`,
            ),
            log: (line: string) => lines.push(line),
        });

        const result = await provisionAccsCredentials(deps, TARGET);

        expect(result.ok).toBe(false);
        expect(JSON.stringify(result)).not.toContain(secret);
        expect(lines.join('\n')).not.toContain(secret);
    });
});
