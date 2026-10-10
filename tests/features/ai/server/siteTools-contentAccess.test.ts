/**
 * Group 6's site tools — the content pair, `get_content_access` and `set_content_reader`.
 *
 * Who may read a storefront's authored content on DA.live, and the write that changes
 * it. Moved out of `siteTools.test.ts` on 2026-10-10, unchanged, when that suite neared
 * the 750-line CI limit; the shared harness, mocks and fixtures stay in
 * `siteTools.testUtils.ts`.
 *
 * The write changes what another person can see, so every refusal here is asserted by
 * the service that was NOT called, not only by the error that came back.
 */

import {
    buildHarness,
    harness,
    harnessWithNoProject,
    headlessProject,
    extensionContext,
    logger,
    project,
    resetSiteToolsMocks,
    mockListContentReaders,
    mockAddContentReader,
    mockRemoveContentReader,
} from './siteTools.testUtils';

beforeEach(() => {
    resetSiteToolsMocks();
});

// The content pair (EDS-22) mirrors the site-access pair: refuse before doing
// anything without confirm, route on `read`, pass the verified result through.
describe('get_content_access', () => {
    it("lists the readers of the project's DA.live site", async () => {
        const out = await harness().call('get_content_access');

        expect(mockListContentReaders).toHaveBeenCalledWith(
            { org: 'someone', site: 'demo' },
            extensionContext,
            logger,
        );
        expect(out).toMatchObject({ status: 'ok', readers: [{ email: 'owner@example.test', actions: 'write' }] });
    });

    it('refuses a project that records no DA.live site, naming the tool', async () => {
        const out = await buildHarness({ ...project, componentInstances: {} }).call('get_content_access');
        expect(String(out.error)).toContain('get_content_access needs a DA.live site');
        expect(mockListContentReaders).not.toHaveBeenCalled();
    });

    it('refuses a headless project', async () => {
        const out = await buildHarness(headlessProject).call('get_content_access');
        expect(String(out.error)).toContain('applies only to EDS storefront projects');
    });

    it('refuses with no current project, before asking DA.live anything', async () => {
        const out = await harnessWithNoProject().call('get_content_access');

        expect(out).toStrictEqual({ error: 'No current project is open' });
        expect(mockListContentReaders).not.toHaveBeenCalled();
    });
});

describe('set_content_reader', () => {
    it('refuses without confirm:true and changes nothing', async () => {
        const out = await harness().call('set_content_reader', { email: 'someone@example.test', read: true });

        expect(String(out.error)).toMatch(/confirm:true/);
        expect(mockAddContentReader).not.toHaveBeenCalled();
        expect(mockRemoveContentReader).not.toHaveBeenCalled();
    });

    it('lets the address read when read is true', async () => {
        await harness().call('set_content_reader', { email: 'someone@example.test', read: true, confirm: true });

        expect(mockAddContentReader).toHaveBeenCalledWith(
            { org: 'someone', site: 'demo' },
            'someone@example.test',
            extensionContext,
            logger,
        );
        expect(mockRemoveContentReader).not.toHaveBeenCalled();
    });

    it('stops the address when read is false', async () => {
        await harness().call('set_content_reader', { email: 'someone@example.test', read: false, confirm: true });

        expect(mockRemoveContentReader).toHaveBeenCalledWith(
            { org: 'someone', site: 'demo' },
            'someone@example.test',
            extensionContext,
            logger,
        );
        expect(mockAddContentReader).not.toHaveBeenCalled();
    });

    it('passes the mutation result through, verified flag and all', async () => {
        mockAddContentReader.mockResolvedValue({
            status: 'ok',
            org: 'someone',
            site: 'demo',
            readers: [{ email: 'someone@example.test', actions: 'read' }],
            verified: false,
        });

        const out = await harness().call('set_content_reader', { email: 'someone@example.test', read: true, confirm: true });

        expect(out).toEqual({
            status: 'ok',
            org: 'someone',
            site: 'demo',
            readers: [{ email: 'someone@example.test', actions: 'read' }],
            verified: false,
        });
    });

    it('refuses with no current project', async () => {
        const out = await harnessWithNoProject().call('set_content_reader', { email: 'x@example.test', read: true, confirm: true });
        expect(out.error).toBe('No current project is open');
    });

    it('refuses a call that carries no arguments at all', async () => {
        // A client may invoke a tool with no argument object. The confirm gate has
        // to answer that as a refusal, not die reading `confirm` off nothing.
        const out = await harness().callBare('set_content_reader');

        expect(String(out.error)).toMatch(/confirm:true/);
        expect(mockAddContentReader).not.toHaveBeenCalled();
        expect(mockRemoveContentReader).not.toHaveBeenCalled();
    });

    it('refuses a headless project and changes nothing', async () => {
        const out = await buildHarness(headlessProject).call('set_content_reader', {
            email: 'someone@example.test',
            read: true,
            confirm: true,
        });

        expect(out).toStrictEqual({
            error: 'set_content_reader applies only to EDS storefront projects',
        });
        expect(mockAddContentReader).not.toHaveBeenCalled();
    });

    it('refuses a project that records no DA.live site and changes nothing', async () => {
        const out = await buildHarness({ ...project, componentInstances: {} }).call('set_content_reader', {
            email: 'someone@example.test',
            read: false,
            confirm: true,
        });

        expect(out).toStrictEqual({
            error: 'set_content_reader needs a DA.live site, and this project records none',
        });
        expect(mockRemoveContentReader).not.toHaveBeenCalled();
    });
});
