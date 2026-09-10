/**
 * create_project's front door: the argument guards that run before any package
 * is loaded, and the schema `tools/list` hands the agent.
 *
 * `create_project` clones repos, installs dependencies and — for EDS — creates a
 * real GitHub repo and DA.live content. Every refusal here is a cloud operation
 * that did NOT happen, so each one is asserted with the creation call proven
 * absent. Mocks are owned by `createProjectTool.testUtils.ts`.
 */

import { z } from 'zod';

import {
    EDS,
    HEADLESS,
    defaultStorefrontSetup,
    executeProjectCreation,
    getSelectablePackages,
    getStorefrontForStack,
    storefrontSetup,
    toolServer,
    type McpToolSchema,
} from './createProjectTool.testUtils';

/** The zod SHAPE the tool declares, as a parseable object schema. */
function schemaOf(def: McpToolSchema): z.ZodObject<z.ZodRawShape> {
    const input = def.inputSchema ?? {};
    return input instanceof z.ZodObject ? input : z.object(input as z.ZodRawShape);
}

describe('create_project — argument guards', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        defaultStorefrontSetup();
    });

    it('refuses a call with no arguments at all', async () => {
        const res = await toolServer().call(undefined);

        expect(res.error).toMatch(/projectName, package, and stack are all required/);
        expect(getSelectablePackages).not.toHaveBeenCalled();
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    // One test per field: a guard that only fires when ALL THREE are missing
    // passes a combined test and lets two of the three through in production.
    it.each([['projectName'], ['package'], ['stack']])(
        'refuses a call missing %s',
        async (field) => {
            const res = await toolServer().call({ ...HEADLESS, [field]: undefined });

            expect(res.error).toMatch(/projectName, package, and stack are all required/);
            expect(executeProjectCreation).not.toHaveBeenCalled();
        },
    );

    it('treats a whitespace-only project name as missing', async () => {
        const res = await toolServer().call({ ...HEADLESS, projectName: '   ' });

        expect(res.error).toMatch(/all required/);
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('trims a padded project name rather than creating a padded directory', async () => {
        const res = await toolServer().call({ ...HEADLESS, projectName: '  my-proj  ' });

        expect(res).toMatchObject({ created: true, name: 'my-proj' });
    });

    it('requires confirm:true', async () => {
        const res = await toolServer().call({ ...HEADLESS, confirm: false });

        expect(res.error).toMatch(/requires confirm:true/);
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('requires confirm to be present at all', async () => {
        const res = await toolServer().call({ ...HEADLESS, confirm: undefined });

        expect(res.error).toMatch(/requires confirm:true/);
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('rejects an unknown package and names the ones that exist', async () => {
        const res = await toolServer().call({ ...HEADLESS, package: 'not-a-package' });

        expect(res.error).toMatch(/Unknown package: not-a-package/);
        expect(res.validPackages).toEqual(['citisignal']);
        expect(getStorefrontForStack).not.toHaveBeenCalled();
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('rejects an invalid (package, stack) pair with the valid stacks', async () => {
        (getStorefrontForStack as jest.Mock).mockResolvedValueOnce(undefined);

        const res = await toolServer().call({ ...HEADLESS, stack: 'headless-accs' });

        expect(res.error).toMatch(/no "headless-accs" storefront/);
        expect(res.validStacksForPackage).toEqual(['headless-paas', 'eds-paas']);
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it.each([['repoName'], ['daLiveOrg'], ['daLiveSite']])(
        'refuses an EDS creation missing %s',
        async (field) => {
            const res = await toolServer().call({ ...EDS, [field]: undefined });

            expect(res.error).toMatch(/repoName, daLiveOrg, and daLiveSite/);
            expect(storefrontSetup).not.toHaveBeenCalled();
            expect(executeProjectCreation).not.toHaveBeenCalled();
        },
    );
});

describe('create_project — registered schema', () => {
    beforeEach(() => jest.clearAllMocks());

    const def = () => toolServer().definitionOf();

    // EDS creation makes a real GitHub repo and real DA.live content, so both
    // sign-ins are prerequisites; dropping either is the sign-in an agent would
    // then fail to offer.
    it('declares GitHub and DA.live as its prerequisites', () => {
        expect(def().needsAuth).toEqual(['github', 'dalive']);
    });

    // readOnlyHint:false is what the dry run gates on — it is the difference
    // between "describe this call" and "make the repo".
    it('is annotated as a write, and not as destructive', () => {
        expect(def().annotations).toEqual({ readOnlyHint: false, destructiveHint: false });
    });

    it('carries a title and a description', () => {
        expect(def().title?.length ?? 0).toBeGreaterThan(0);
        expect(def().description.length).toBeGreaterThan(0);
    });

    it('accepts the three required ids, the four EDS options, and confirm', () => {
        const schema = schemaOf(def());

        expect(Object.keys(schema.shape).sort()).toEqual([
            'accsEndpoint',
            'confirm',
            'daLiveOrg',
            'daLiveSite',
            'package',
            'projectName',
            'repoName',
            'stack',
        ]);
        expect(schema.parse({ projectName: 'p', package: 'k', stack: 's' })).toEqual({
            projectName: 'p',
            package: 'k',
            stack: 's',
        });
        // The EDS fields are optional at the schema level and enforced by the
        // handler, which is the only place that knows the stack is an EDS one.
        expect(schema.safeParse({ projectName: 'p', package: 'k' }).success).toBe(false);
        expect(schema.safeParse({ projectName: 1, package: 'k', stack: 's' }).success).toBe(false);
        expect(
            schema.safeParse({ projectName: 'p', package: 'k', stack: 's', confirm: 'yes' }).success,
        ).toBe(false);
    });

    it('describes every field it takes', () => {
        for (const field of Object.values(schemaOf(def()).shape)) {
            expect((field.description ?? '').length).toBeGreaterThan(0);
        }
    });
});
