/**
 * create_project on an added demo: by its id from list_demo_packages, or from
 * a link (probed and added first). The row rides into the wizard state and the
 * storefront-setup payload exactly as the wizard sends it, and the derived
 * package joins the catalog the creation reads.
 */

jest.mock('@/features/project-creation/services/addedDemoSettings', () => ({
    readAddedDemos: jest.fn(() => []),
}));
jest.mock('@/features/ai/server/addedDemoTools', () => ({
    readDemoRow: jest.fn(),
}));
jest.mock('@/features/eds/handlers/addSharedDemoHandler', () => ({
    handleAddSharedDemo: jest.fn(),
}));

import { readDemoRow } from '@/features/ai/server/addedDemoTools';
import { handleAddSharedDemo } from '@/features/eds/handlers/addSharedDemoHandler';
import { readAddedDemos } from '@/features/project-creation/services/addedDemoSettings';
import { makeAddedDemo } from '../../../helpers/demoPackageFixtures';
import {
    EDS,
    buildProjectConfig,
    capturedWizardState,
    defaultStorefrontSetup,
    executeProjectCreation,
    getStorefrontForStack,
    storefrontSetup,
    toolServer,
} from './createProjectTool.testUtils';

const mockRead = readAddedDemos as jest.Mock;
const mockRow = readDemoRow as jest.Mock;
const mockAdd = handleAddSharedDemo as jest.Mock;

const JEN = makeAddedDemo({
    source: { owner: 'jen', repo: 'isle5-demo', branch: 'demo' },
    contentSource: { org: 'jen', site: 'isle5-content', indexPath: '/full-index.json' },
});
const BOB = makeAddedDemo({ name: 'Bob', source: { owner: 'bob', repo: 'next-shop' }, storefrontKind: 'headless' });

beforeEach(() => {
    jest.clearAllMocks();
    defaultStorefrontSetup();
    mockRead.mockReturnValue([JEN, BOB]);
});

describe('create_project — an added demo by id', () => {
    it("builds on the row: the derived package, its repository as the template on the row's branch, and the row in both payloads", async () => {
        const res = await toolServer().call({ ...EDS, package: 'added:jen/isle5-demo' });

        expect(res.created).toBe(true);
        expect(getStorefrontForStack).not.toHaveBeenCalled();
        const payload = storefrontSetup.mock.calls[0][1];
        expect(payload).toMatchObject({
            selectedPackage: 'added:jen/isle5-demo',
            selectedStack: 'eds-paas',
            demo: JEN,
            edsConfig: { templateOwner: 'jen', templateRepo: 'isle5-demo', contentSource: { org: 'jen', site: 'isle5-content', indexPath: '/full-index.json' } },
        });
        expect(capturedWizardState()).toMatchObject({ selectedPackage: 'added:jen/isle5-demo', demo: JEN });
        const catalog = (buildProjectConfig as jest.Mock).mock.calls[0][2] as Array<{ id: string }>;
        expect(catalog.map((p) => p.id)).toEqual(['citisignal', 'added:jen/isle5-demo']);
        expect(executeProjectCreation).toHaveBeenCalled();
    });

    it("leaves a zip card's record behind: neither payload's row carries it", async () => {
        mockRead.mockReturnValue([{ ...JEN, createdFromZip: true }, BOB]);

        await toolServer().call({ ...EDS, package: 'added:jen/isle5-demo' });

        expect(storefrontSetup.mock.calls[0][1].demo).toStrictEqual(JEN);
        expect(capturedWizardState()?.demo).toStrictEqual(JEN);
    });

    it('takes a headless demo down the headless path with the row', async () => {
        const res = await toolServer().call({ projectName: 'p', package: 'added:bob/next-shop', stack: 'headless-paas', confirm: true });

        expect(res.created).toBe(true);
        expect(storefrontSetup).not.toHaveBeenCalled();
        expect(capturedWizardState()).toMatchObject({ selectedPackage: 'added:bob/next-shop', demo: BOB });
    });

    it('refuses a stack of the other kind, naming the stacks the demo has', async () => {
        const res = await toolServer().call({ ...EDS, package: 'added:bob/next-shop' });

        expect(res.error).toBe('"Bob" is a headless demo and has no "eds-paas" storefront.');
        expect(res.validStacksForPackage).toContain('headless-paas');
        expect(res.validStacksForPackage).not.toContain('eds-paas');
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('refuses an id nobody remembers, listing the shipped and the added ids', async () => {
        const res = await toolServer().call({ ...EDS, package: 'added:nobody/x' });

        expect(res.error).toBe('Unknown added demo: added:nobody/x');
        expect(res.validPackages).toEqual(['citisignal', 'added:jen/isle5-demo', 'added:bob/next-shop']);
    });

    it('lists the added ids beside the shipped ones for an unknown shipped id too', async () => {
        const res = await toolServer().call({ ...EDS, package: 'nope' });
        expect(res.validPackages).toEqual(['citisignal', 'added:jen/isle5-demo', 'added:bob/next-shop']);
    });
});

describe('create_project — from a link', () => {
    it('reads the link, adds the demo, then builds on the remembered row, which reads from the link', async () => {
        mockRow.mockResolvedValue({ demo: JEN, read: { fullName: 'jen/isle5-demo' }, warnings: [] });
        mockAdd.mockResolvedValue({ success: true, result: { demo: JEN } });

        const { package: _omitted, ...rest } = EDS;
        const res = await toolServer().call({ ...rest, link: 'https://main--isle5-demo--jen.aem.live' });

        expect(mockRow).toHaveBeenCalledWith(expect.anything(), { link: 'https://main--isle5-demo--jen.aem.live' });
        expect(mockAdd).toHaveBeenCalledWith(expect.anything(), { demo: JEN });
        expect(res.created).toBe(true);
        expect(storefrontSetup.mock.calls[0][1]).toMatchObject({
            selectedPackage: 'added:jen/isle5-demo',
            demo: JEN,
            edsConfig: { templateOwner: 'jen', templateRepo: 'isle5-demo' },
        });
    });

    it('passes the probe refusal through and creates nothing', async () => {
        mockRow.mockResolvedValue({ error: { error: 'This repository is not a storefront we can build on.' } });
        const { package: _omitted, ...rest } = EDS;

        const res = await toolServer().call({ ...rest, link: 'https://github.com/jen/notes' });

        expect(res).toEqual({ error: 'This repository is not a storefront we can build on.' });
        expect(mockAdd).not.toHaveBeenCalled();
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('still requires a package or a link', async () => {
        const { package: _omitted, ...rest } = EDS;
        const res = await toolServer().call(rest);
        expect(res.error).toMatch(/package \(or link\)/);
    });
});
