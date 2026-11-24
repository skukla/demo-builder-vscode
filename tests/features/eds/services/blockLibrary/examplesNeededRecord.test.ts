/**
 * examplesNeededRecord: the blocks whose DA.live example page is still a placeholder, kept on
 * the storefront instance's metadata (EDS-71 step 4c). The dashboard's Draft Examples dot
 * counts them; a promote takes one off.
 */

import { COMPONENT_IDS } from '@/core/constants';
import {
    dropBlockNeedingExample,
    readBlocksNeedingExamples,
    readBlocksNeedingExamplesRecord,
    writeBlocksNeedingExamples,
} from '@/features/eds/services/blockLibrary/examplesNeededRecord';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';

function storefrontProject(metadata: Record<string, unknown> = {}): Project {
    return createMockProject({
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata,
            },
        },
    });
}

const metadataOf = (project: Project) =>
    project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;

describe('examplesNeededRecord', () => {
    it('keeps what the build found and reads it back, other metadata untouched', () => {
        const project = storefrontProject({ githubRepo: 'o/r' });

        writeBlocksNeedingExamples(project, ['carousel', 'tabs']);

        expect(readBlocksNeedingExamples(project)).toStrictEqual(['carousel', 'tabs']);
        expect(metadataOf(project)?.githubRepo).toBe('o/r');
    });

    // Review F3: "every block has an example" is a record of none, not the absence of a record.
    it('keeps an empty record when every block has an example, told apart from no record', () => {
        const project = storefrontProject({ blocksNeedingExamples: ['tabs'] });

        writeBlocksNeedingExamples(project, []);

        expect(readBlocksNeedingExamplesRecord(project)).toStrictEqual([]);
        expect(readBlocksNeedingExamplesRecord(storefrontProject())).toBeUndefined();
    });

    // Review F1: metadata and section-metadata have no folder an example could be written for.
    it('never records or counts the core content blocks', () => {
        const project = storefrontProject();

        writeBlocksNeedingExamples(project, ['metadata', 'tabs', 'section-metadata']);

        expect(metadataOf(project)?.blocksNeedingExamples).toStrictEqual(['tabs']);
        expect(readBlocksNeedingExamples(storefrontProject({ blocksNeedingExamples: ['metadata', 'tabs'] })))
            .toStrictEqual(['tabs']);
    });

    it('leaves the record as it was when the build could not say', () => {
        const project = storefrontProject({ blocksNeedingExamples: ['tabs'] });

        writeBlocksNeedingExamples(project, undefined);

        expect(readBlocksNeedingExamples(project)).toStrictEqual(['tabs']);
    });

    it('reads nothing from a project made before the record, or a malformed one', () => {
        expect(readBlocksNeedingExamples(storefrontProject())).toStrictEqual([]);
        expect(readBlocksNeedingExamples(storefrontProject({ blocksNeedingExamples: 'tabs' })))
            .toStrictEqual([]);
        expect(readBlocksNeedingExamples(storefrontProject({ blocksNeedingExamples: ['ok', 3, 'Bad Id'] })))
            .toStrictEqual(['ok']);
    });

    it('leaves a project with no storefront alone', () => {
        const project = createMockProject({ componentInstances: {} });

        writeBlocksNeedingExamples(project, ['tabs']);

        expect(project.componentInstances).toStrictEqual({});
    });

    describe('dropBlockNeedingExample', () => {
        it('takes a promoted block off and says the record changed', () => {
            const project = storefrontProject({ blocksNeedingExamples: ['carousel', 'tabs'] });

            expect(dropBlockNeedingExample(project, 'carousel')).toBe(true);
            expect(readBlocksNeedingExamples(project)).toStrictEqual(['tabs']);
        });

        it('leaves an empty record with the last block, and changes nothing for a block not on it', () => {
            const project = storefrontProject({ blocksNeedingExamples: ['tabs'] });

            expect(dropBlockNeedingExample(project, 'hero')).toBe(false);
            expect(dropBlockNeedingExample(project, 'tabs')).toBe(true);
            expect(metadataOf(project)?.blocksNeedingExamples).toStrictEqual([]);
        });
    });
});
