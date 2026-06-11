/**
 * ProjectFileLoader — flow/upstream round-trip (read side).
 *
 * Pairs with projectConfigWriter-atomicWrite.test.ts (write side): a content
 * (repoless satellite) project must survive save+reload as a content project.
 */

import * as fs from 'fs/promises';
import { ProjectFileLoader } from '@/core/state/projectFileLoader';

jest.mock('fs/promises');
jest.mock('vscode', () => ({ window: { terminals: [] } }), { virtual: true });

const mockFs = fs as jest.Mocked<typeof fs>;
const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function mockManifest(manifest: Record<string, unknown>): void {
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify(manifest) as unknown as Buffer);
    mockFs.readdir.mockResolvedValue([] as never); // no components on disk
}

describe('ProjectFileLoader — flow/upstream', () => {
    let loader: ProjectFileLoader;

    beforeEach(() => {
        jest.clearAllMocks();
        loader = new ProjectFileLoader(mockLogger as never);
    });

    it('loads flow + upstream for a content (satellite) project', async () => {
        mockManifest({
            name: 'satellite-project',
            flow: 'content',
            upstream: { owner: 'commerce-sc', repo: 'citisignal-upstream' },
        });

        const project = await loader.loadProject('/test/satellite', () => []);

        expect(project).not.toBeNull();
        expect(project!.flow).toBe('content');
        expect(project!.upstream).toEqual({ owner: 'commerce-sc', repo: 'citisignal-upstream' });
    });

    it('leaves flow + upstream undefined for a commerce/legacy manifest', async () => {
        mockManifest({ name: 'commerce-project' });

        const project = await loader.loadProject('/test/commerce', () => []);

        expect(project).not.toBeNull();
        expect(project!.flow).toBeUndefined();
        expect(project!.upstream).toBeUndefined();
    });

    it('loads contentSourceType + aemContentSource for an AEM-sourced satellite (Slice 2)', async () => {
        mockManifest({
            name: 'aem-satellite',
            flow: 'content',
            contentSourceType: 'aem-sites',
            aemContentSource: {
                authorUrl: 'https://author-p57319-e1619941.adobeaemcloud.com',
                contentPath: '/content/citisignal',
            },
        });

        const project = await loader.loadProject('/test/aem-satellite', () => []);

        expect(project).not.toBeNull();
        expect(project!.contentSourceType).toBe('aem-sites');
        expect(project!.aemContentSource).toEqual({
            authorUrl: 'https://author-p57319-e1619941.adobeaemcloud.com',
            contentPath: '/content/citisignal',
        });
    });

    it('leaves contentSourceType + aemContentSource undefined for a DA.live/legacy manifest', async () => {
        mockManifest({ name: 'da-live-project' });

        const project = await loader.loadProject('/test/da-live', () => []);

        expect(project).not.toBeNull();
        expect(project!.contentSourceType).toBeUndefined();
        expect(project!.aemContentSource).toBeUndefined();
    });
});
