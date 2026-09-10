/**
 * What each cloud-resource tool does with the ARGUMENTS an agent sends, and the
 * declarations it registers itself under.
 *
 * These are the two halves nothing was checking. An MCP client can call a tool
 * with no argument object at all — every reader here is written `args?.x` for
 * that reason, and dropping one chain turns a validation message into a
 * TypeError the agent cannot act on. And the DEFINITION is not decoration: the
 * real server reads `annotations.readOnlyHint` and `destructiveHint` to decide
 * whether a call needs the user's consent, `needsAuth` to route a sign-in, and
 * `inputSchema` is the only validation an agent's arguments get before the
 * handler runs.
 *
 * Both irreversible tools are covered on both sides, because for those the
 * declaration IS the safety: a `destructiveHint: false` would let a repository
 * deletion through the consent gate unannounced.
 */

import { z } from 'zod';
import {
    ctxFactory,
    DaLiveOrgOperations,
    fakeServer,
    getGitHubServicesMock,
    gh,
    mockDeleteAllSiteContent,
    mockInspectToken,
    mockListOrgSites,
    registerCloudResourceTools,
    resetCloudResourceMocks,
} from './cloudResourceTools.testUtils';

/** A registered server with GitHub signed in and DA.live answering. */
function server(overrides: Parameters<typeof gh>[0] = {}) {
    getGitHubServicesMock.mockReturnValue(gh(overrides));
    const s = fakeServer();
    registerCloudResourceTools(s, ctxFactory);
    return s;
}

/** Parse `args` with a tool's DECLARED input schema. */
function parseWithSchema(s: ReturnType<typeof fakeServer>, tool: string, args: unknown) {
    const shape = s.definition(tool).inputSchema as Record<string, z.ZodTypeAny>;
    return z.object(shape).safeParse(args);
}

beforeEach(() => {
    resetCloudResourceMocks();
});

describe('being called with no argument object at all', () => {
    it('list_github_repos returns its first page', async () => {
        const s = server({ repos: [{ fullName: 'me/a', isPrivate: false, updatedAt: '2026-01-01' }] });

        expect(await s.call('list_github_repos')).toMatchObject({ offset: 0, limit: 30, total: 1 });
    });

    it('create_github_repo asks for the fields it needs', async () => {
        const s = server();

        expect(await s.call('create_github_repo')).toEqual({
            error: 'templateOwner, templateRepo and name are required',
        });
    });

    it('delete_github_repo asks for the fields it needs', async () => {
        const s = server();

        expect(await s.call('delete_github_repo')).toEqual({ error: 'owner and repo are required' });
    });

    it('list_dalive_sites asks for the org', async () => {
        const s = server();

        expect(await s.call('list_dalive_sites')).toEqual({ error: 'org is required' });
    });

    it('cleanup_dalive_site asks for the fields it needs', async () => {
        const s = server();

        expect(await s.call('cleanup_dalive_site')).toEqual({ error: 'org and site are required' });
    });
});

describe('arguments that are only whitespace', () => {
    it('create_github_repo treats a blank name as missing', async () => {
        const s = server();

        expect(
            await s.call('create_github_repo', {
                templateOwner: 'adobe',
                templateRepo: 'boilerplate',
                name: '   ',
            }),
        ).toEqual({ error: 'templateOwner, templateRepo and name are required' });
    });

    it('delete_github_repo treats a blank repo as missing', async () => {
        const s = server();

        expect(await s.call('delete_github_repo', { owner: 'acme', repo: '  ' })).toEqual({
            error: 'owner and repo are required',
        });
    });

    it('list_dalive_sites treats a blank org as missing', async () => {
        const s = server();

        expect(await s.call('list_dalive_sites', { org: ' ' })).toEqual({
            error: 'org is required',
        });
    });

    it('cleanup_dalive_site treats a blank site as missing', async () => {
        const s = server();

        expect(await s.call('cleanup_dalive_site', { org: 'acme', site: '\t' })).toEqual({
            error: 'org and site are required',
        });
    });

    it('delete_github_repo treats a blank owner as missing', async () => {
        const s = server();

        expect(await s.call('delete_github_repo', { owner: '  ', repo: 'site' })).toEqual({
            error: 'owner and repo are required',
        });
    });

    it('cleanup_dalive_site treats a blank org as missing', async () => {
        const s = server();

        expect(await s.call('cleanup_dalive_site', { org: '  ', site: 'demo' })).toEqual({
            error: 'org and site are required',
        });
    });

    it('create_github_repo trims the values it passes to the service', async () => {
        // The names go into a URL path; untrimmed they produce a 404 that reads
        // like a missing template.
        const createFromTemplate = jest.fn(async () => ({
            id: 1,
            name: 'my-site',
            fullName: 'acme/my-site',
            htmlUrl: 'https://github.com/acme/my-site',
            cloneUrl: 'https://github.com/acme/my-site.git',
            defaultBranch: 'main',
            isPrivate: false,
        }));
        const s = server({ createFromTemplate });

        await s.call('create_github_repo', {
            templateOwner: ' adobe ',
            templateRepo: ' boilerplate ',
            name: ' my-site ',
            targetOwner: ' acme ',
        });

        expect(createFromTemplate).toHaveBeenCalledWith(
            'adobe',
            'boilerplate',
            'my-site',
            false,
            'acme',
        );
    });

    it('create_github_repo omits the namespace entirely when none was given', async () => {
        // undefined, not an empty string: the service reads "no namespace" as
        // the personal account, and '' would be sent as an org name.
        const createFromTemplate = jest.fn(async () => ({
            id: 1,
            name: 'my-site',
            fullName: 'me/my-site',
            htmlUrl: 'https://github.com/me/my-site',
            cloneUrl: 'https://github.com/me/my-site.git',
            defaultBranch: 'main',
            isPrivate: false,
        }));
        const s = server({ createFromTemplate });

        await s.call('create_github_repo', {
            templateOwner: 'adobe',
            templateRepo: 'boilerplate',
            name: 'my-site',
        });

        expect(createFromTemplate).toHaveBeenCalledWith(
            'adobe',
            'boilerplate',
            'my-site',
            false,
            undefined,
        );
    });

    it('create_github_repo passes privacy through as a strict boolean', async () => {
        const createFromTemplate = jest.fn(async () => ({
            id: 1,
            name: 'my-site',
            fullName: 'me/my-site',
            htmlUrl: 'https://github.com/me/my-site',
            cloneUrl: 'https://github.com/me/my-site.git',
            defaultBranch: 'main',
            isPrivate: true,
        }));
        const s = server({ createFromTemplate });

        await s.call('create_github_repo', {
            templateOwner: 'adobe',
            templateRepo: 'boilerplate',
            name: 'my-site',
            isPrivate: true,
        });

        expect(createFromTemplate).toHaveBeenCalledWith(
            'adobe',
            'boilerplate',
            'my-site',
            true,
            undefined,
        );
    });
});

describe('each required field is required on its own', () => {
    const base = { templateOwner: 'adobe', templateRepo: 'boilerplate', name: 'my-site' };

    it.each(['templateOwner', 'templateRepo', 'name'] as const)(
        'create_github_repo refuses when only %s is missing',
        async (field) => {
            const s = server();
            const args = { ...base, [field]: '' };

            expect(await s.call('create_github_repo', args)).toEqual({
                error: 'templateOwner, templateRepo and name are required',
            });
        },
    );

    it.each(['owner', 'repo'] as const)(
        'delete_github_repo refuses when only %s is missing',
        async (field) => {
            const s = server();
            const args = { owner: 'acme', repo: 'site', [field]: '' };

            expect(await s.call('delete_github_repo', args)).toEqual({
                error: 'owner and repo are required',
            });
        },
    );

    it.each(['org', 'site'] as const)(
        'cleanup_dalive_site refuses when only %s is missing',
        async (field) => {
            const s = server();
            const args = { org: 'acme', site: 'demo', [field]: '' };

            expect(await s.call('cleanup_dalive_site', args)).toEqual({
                error: 'org and site are required',
            });
        },
    );
});

describe('the irreversible gate needs BOTH halves', () => {
    it('delete_github_repo refuses a correct confirmName without confirm:true', async () => {
        // Each half guards a different mistake: the echo proves the agent read
        // which repo it is about, confirm:true proves it meant to proceed.
        const deleteRepository = jest.fn(async () => undefined);
        const s = server({ deleteRepository });

        const res = await s.call('delete_github_repo', {
            owner: 'acme',
            repo: 'site',
            confirmName: 'acme/site',
        });

        expect(res).toMatchObject({ irreversible: true });
        expect(deleteRepository).not.toHaveBeenCalled();
    });

    it('cleanup_dalive_site refuses a correct confirmName without confirm:true', async () => {
        const s = server();

        const res = await s.call('cleanup_dalive_site', {
            org: 'acme',
            site: 'demo',
            confirmName: 'acme/demo',
        });

        expect(res).toMatchObject({ irreversible: true });
        expect(mockDeleteAllSiteContent).not.toHaveBeenCalled();
    });
});

describe('pagination defaults', () => {
    it('list_dalive_sites returns up to thirty sites when no limit was given', async () => {
        mockListOrgSites.mockResolvedValue(
            Array.from({ length: 5 }, (_, i) => ({ name: `site-${i}`, lastModified: '2026-01-01' })),
        );
        const s = server();

        const res = await s.call('list_dalive_sites', { org: 'acme' });

        expect(res.limit).toBe(30);
        expect(res.sites).toHaveLength(5);
    });
});

describe('an error that is not an org mismatch', () => {
    it('is rethrown by list_dalive_sites rather than relabelled', async () => {
        // Reporting a network failure as an org mismatch sends the agent to
        // switch orgs, which cannot fix it.
        mockListOrgSites.mockRejectedValue(new Error('ECONNRESET'));
        const s = server();

        await expect(s.call('list_dalive_sites', { org: 'acme' })).rejects.toThrow('ECONNRESET');
    });

    it('is rethrown by cleanup_dalive_site rather than relabelled', async () => {
        mockDeleteAllSiteContent.mockRejectedValue(new Error('ECONNRESET'));
        const s = server();

        await expect(
            s.call('cleanup_dalive_site', {
                org: 'acme',
                site: 'demo',
                confirm: true,
                confirmName: 'acme/demo',
            }),
        ).rejects.toThrow('ECONNRESET');
    });
});

describe('the DA.live token provider', () => {
    it('hands the operations a provider that reads the current IMS token', async () => {
        // Built once and captured by two long-lived operation objects, so it has
        // to READ the token each time rather than close over one.
        const s = server();

        await s.call('list_dalive_sites', { org: 'acme' });

        const provider = (DaLiveOrgOperations as unknown as jest.Mock).mock.calls[0][0];
        await expect(provider.getAccessToken()).resolves.toBe('ims-token');
    });

    it('hands off to Adobe auth when the authentication service is unavailable', async () => {
        // The whole builder is wrapped: a diagnostic tool must not become the
        // failure it was called to explain.
        mockInspectToken.mockRejectedValue(new Error('no auth service'));
        const s = server();

        expect(await s.call('list_dalive_sites', { org: 'acme' })).toMatchObject({
            needsAuth: 'adobe',
        });
    });

    it('hands back null — not undefined — when the token has no value', async () => {
        mockInspectToken.mockResolvedValue({ valid: true, expiresIn: 60 });
        const s = server();

        await s.call('list_dalive_sites', { org: 'acme' });

        const provider = (DaLiveOrgOperations as unknown as jest.Mock).mock.calls[0][0];
        await expect(provider.getAccessToken()).resolves.toBeNull();
    });
});

describe('the declarations each tool registers under', () => {
    it('registers exactly the five cloud-resource tools', () => {
        expect(server().names()).toEqual([
            'list_github_repos',
            'create_github_repo',
            'delete_github_repo',
            'list_dalive_sites',
            'cleanup_dalive_site',
        ]);
    });

    it.each([
        ['list_github_repos', ['github'], true, false],
        ['create_github_repo', ['github'], false, false],
        ['delete_github_repo', ['github'], false, true],
        ['list_dalive_sites', ['adobe'], true, false],
        ['cleanup_dalive_site', ['adobe'], false, true],
    ] as const)('%s declares its provider and both hints', (tool, needsAuth, readOnly, destructive) => {
        // readOnlyHint gates the dry run; destructiveHint is what makes the
        // client ask before an irreversible call.
        const def = server().definition(tool);

        expect(def.needsAuth).toEqual(needsAuth);
        expect(def.annotations).toEqual({
            readOnlyHint: readOnly,
            destructiveHint: destructive,
        });
        expect(def.description).toEqual(expect.any(String));
    });
});

describe('the input schemas the tools declare', () => {
    it.each(['list_github_repos', 'list_dalive_sites'] as const)(
        '%s rejects a negative offset',
        (tool) => {
            expect(parseWithSchema(server(), tool, { org: 'acme', offset: -1 }).success).toBe(false);
        },
    );

    it.each(['list_github_repos', 'list_dalive_sites'] as const)('%s rejects a zero limit', (tool) => {
        expect(parseWithSchema(server(), tool, { org: 'acme', limit: 0 }).success).toBe(false);
    });

    it.each(['list_github_repos', 'list_dalive_sites'] as const)(
        '%s rejects a limit above one hundred',
        (tool) => {
            expect(parseWithSchema(server(), tool, { org: 'acme', limit: 101 }).success).toBe(false);
        },
    );

    it.each(['list_github_repos', 'list_dalive_sites'] as const)(
        '%s accepts a page inside those bounds',
        (tool) => {
            expect(
                parseWithSchema(server(), tool, { org: 'acme', offset: 0, limit: 100 }).success,
            ).toBe(true);
        },
    );

    it('create_github_repo requires the three names and leaves the rest optional', () => {
        const s = server();

        expect(parseWithSchema(s, 'create_github_repo', {}).success).toBe(false);
        expect(
            parseWithSchema(s, 'create_github_repo', {
                templateOwner: 'adobe',
                templateRepo: 'boilerplate',
                name: 'my-site',
            }).success,
        ).toBe(true);
    });

    it('delete_github_repo requires owner and repo and leaves the guards optional', () => {
        const s = server();

        expect(parseWithSchema(s, 'delete_github_repo', { owner: 'acme' }).success).toBe(false);
        expect(
            parseWithSchema(s, 'delete_github_repo', { owner: 'acme', repo: 'site' }).success,
        ).toBe(true);
    });

    it('cleanup_dalive_site requires org and site', () => {
        const s = server();

        expect(parseWithSchema(s, 'cleanup_dalive_site', { org: 'acme' }).success).toBe(false);
        expect(
            parseWithSchema(s, 'cleanup_dalive_site', { org: 'acme', site: 'demo' }).success,
        ).toBe(true);
    });
});
