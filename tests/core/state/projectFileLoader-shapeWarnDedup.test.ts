/**
 * Manifest shape warnings deduplicate per (file, issue) per session.
 *
 * A project is loaded ~6 times during activation alone, and the warn loop
 * used to re-print every issue on every load — one drifted field on one
 * manifest produced an 18-line wall (seen live 2026-08-23 with `is_active`),
 * which buries the defect it exists to surface. Same loader instance, same
 * bad manifest, N loads → ONE warning.
 */

import * as fs from 'fs/promises';
import { ProjectFileLoader } from '@/core/state/projectFileLoader';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../helpers/loggerFake';

jest.mock('fs/promises');

const mockedFs = fs as jest.Mocked<typeof fs>;

function makeLogger(): Logger {
    return createMockLogger() as unknown as Logger;
}

function primeFsWithManifest(manifest: Record<string, unknown>): void {
    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue(JSON.stringify(manifest));
    mockedFs.readdir.mockRejectedValue(new Error('no components dir'));
    mockedFs.writeFile.mockResolvedValue(undefined);
}

const shapeWarns = (logger: Logger) =>
    (logger.warn as jest.Mock).mock.calls.filter(([msg]) =>
        String(msg).includes('manifest shape')
    );

describe('ProjectFileLoader — shape-warning dedup', () => {
    beforeEach(() => jest.clearAllMocks());

    it('warns once for the same issue across repeated loads of the same manifest', async () => {
        primeFsWithManifest({ name: 42 }); // wrong-typed known field
        const logger = makeLogger();
        const loader = new ProjectFileLoader(logger);

        await loader.loadProject('/tmp/demo', () => []);
        await loader.loadProject('/tmp/demo', () => []);
        await loader.loadProject('/tmp/demo', () => []);

        expect(shapeWarns(logger)).toHaveLength(1);
    });

    it('still warns separately for a different manifest with the same issue', async () => {
        const logger = makeLogger();
        const loader = new ProjectFileLoader(logger);

        primeFsWithManifest({ name: 42 });
        await loader.loadProject('/tmp/demo-a', () => []);
        await loader.loadProject('/tmp/demo-b', () => []);

        expect(shapeWarns(logger)).toHaveLength(2);
    });
});
