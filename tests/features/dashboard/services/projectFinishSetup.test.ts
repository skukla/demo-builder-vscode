/**
 * projectFinishSetup — a project's Finish Setup steps read from where they live (PL-101): the
 * project's record and its datapack's install record. The dashboard's status pushes call it on
 * every refresh, so a record it cannot read must cost the root step, not the status.
 *
 * Real: the install record on disk (a temp project folder). Faked: a RecordFiles that throws, for
 * the one case a real disk cannot be made to produce on demand.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { projectFinishSetup } from '@/features/dashboard/services/projectFinishSetup';
import {
    nodeRecordFiles,
    openInstallRecord,
    type RecordFiles,
} from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { PackRootStep } from '@/features/data-installer/services/demoBuilderEngine/packRootStep';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';

const PACK = { name: 'frescopa', version: 'main' };
const ROOT: PackRootStep = {
    state: 'open',
    storeCode: 'main_store',
    storeName: 'Main Store',
    rootId: 300,
    rootName: 'Frescopa',
    storeRootId: 2,
    sharedWith: 'Luma Store',
};

let projectDir: string;

beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-finish-setup-'));
});

afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
});

function project(overrides: Partial<Project> = {}): Project {
    return createMockProject({ path: projectDir, datapack: PACK, ...overrides });
}

describe('projectFinishSetup', () => {
    it("lists the code step from the project's record and the root step from the install record", async () => {
        const recorder = await openInstallRecord(nodeRecordFiles, projectDir, PACK, () => 'now');
        await recorder.setRootStep(ROOT);

        const steps = await projectFinishSetup(
            project({ finishSetup: { 'republish-code': { files: ['scripts/a.js'] } } }),
            createMockLogger(),
        );

        expect(steps.map((step) => step.id)).toStrictEqual(['republish-code', 'pack-root-category']);
    });

    it('lists no root step for a project whose datapack left none', async () => {
        expect(await projectFinishSetup(project(), createMockLogger())).toStrictEqual([]);
    });

    it('keeps the code step when the install record cannot be read', async () => {
        const broken: RecordFiles = {
            ...nodeRecordFiles,
            read: async () => {
                throw new Error('EACCES');
            },
        };

        const steps = await projectFinishSetup(
            project({ finishSetup: { 'republish-code': { files: ['scripts/a.js'] } } }),
            createMockLogger(),
            broken,
        );

        expect(steps.map((step) => step.id)).toStrictEqual(['republish-code']);
    });
});
