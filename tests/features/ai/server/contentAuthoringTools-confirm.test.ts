/**
 * write_page and publish_page ask first (CLAUDE.md property 5; owner 2026-10-04:
 * "Yes, write_page should ask").
 *
 * Both change a live site. publish_page puts a page on the public CDN; write_page
 * overwrites the DA.live source the live site is built from, and with publish:true
 * publishes it too. So both refuse without `confirm:true`, and the refusal names
 * the storefront and the page so the agent can put the question to the SC in
 * those words. The sign-in pre-flight runs first, then the gate, then the write.
 */

import {
    AGENT_ALERT_COPY,
} from '@/features/ai/server/agentAlertCopy';
import {
    DaLiveOpsDouble,
    HelixDouble,
    register,
    setupContentAuthoring,
} from './contentAuthoringTools.testUtils';

let daOps: DaLiveOpsDouble;
let helix: HelixDouble;

beforeEach(() => {
    jest.clearAllMocks();
    ({ daOps, helix } = setupContentAuthoring());
});

describe('write_page asks first', () => {
    it('refuses a plain write without confirm:true, naming the site and the page, and writes nothing', async () => {
        const res = await register().call<Record<string, unknown>>('write_page', {
            path: '/about',
            content: '<p>x</p>',
        });

        expect(res).toEqual({
            error: expect.stringMatching(/confirm:true/),
            site: 'skukla/bodea',
            path: '/about',
            publish: false,
        });
        expect(res.error).toMatch(/\/about/);
        expect(res.error).toMatch(/skukla\/bodea/);
        expect(res.error).not.toMatch(/publishes it/);
        expect(daOps.createSource).not.toHaveBeenCalled();
        expect(helix.previewAndPublishPage).not.toHaveBeenCalled();
    });

    it('says it publishes when publish:true, and publishes nothing', async () => {
        const res = await register().call<Record<string, unknown>>('write_page', {
            path: '/about',
            content: '<p>x</p>',
            publish: true,
        });

        expect(res).toMatchObject({ site: 'skukla/bodea', path: '/about', publish: true });
        expect(res.error).toMatch(/publishes it to the live site/);
        expect(daOps.createSource).not.toHaveBeenCalled();
        expect(helix.previewAndPublishPage).not.toHaveBeenCalled();
    });

    it('treats a confirm that is not literally true as no confirm', async () => {
        await register().call('write_page', { path: '/about', content: 'x', confirm: 'true' });

        expect(daOps.createSource).not.toHaveBeenCalled();
    });

    it('writes once confirmed', async () => {
        const res = await register().call('write_page', {
            path: '/about',
            content: '<p>x</p>',
            confirm: true,
        });

        expect(daOps.createSource).toHaveBeenCalledWith('skukla', 'bodea', 'about.html', '<p>x</p>', {
            overwrite: true,
        });
        expect(res).toMatchObject({ written: true, published: false });
    });
});

describe('publish_page asks first', () => {
    it('refuses without confirm:true, naming the site and the page, and publishes nothing', async () => {
        const res = await register().call<Record<string, unknown>>('publish_page', {
            path: '/products/shoes',
        });

        expect(res).toEqual({
            error: expect.stringMatching(/confirm:true/),
            site: 'skukla/bodea',
            path: '/products/shoes',
        });
        expect(res.error).toMatch(/\/products\/shoes/);
        expect(res.error).toMatch(/skukla\/bodea/);
        expect(helix.previewAndPublishPage).not.toHaveBeenCalled();
    });

    it('publishes once confirmed', async () => {
        await register().call('publish_page', { path: '/about', confirm: true });

        expect(helix.previewAndPublishPage).toHaveBeenCalledWith('skukla', 'bodea', '/about');
    });
});

describe('the consent dialog for each', () => {
    it.each(['write_page', 'publish_page', 'delete_page'])('%s raises it and names the page', (tool) => {
        expect(AGENT_ALERT_COPY[tool]?.target).toContain('path');
        expect(AGENT_ALERT_COPY[tool]?.sessionGrant).toBe(false);
    });

    it('write_page shows whether it publishes, because a write and a publish are different decisions', () => {
        expect(AGENT_ALERT_COPY.write_page.target).toEqual(['path', 'publish']);
    });
});
