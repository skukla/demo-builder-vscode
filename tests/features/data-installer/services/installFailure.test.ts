/**
 * The failed install's rules (step-04 S7): recorded when a creation install does not end in
 * success, cleared by a later success of that datapack or by the project naming another or none,
 * bumped by a later failure of it. P4-Q11: a run that ends partly installed counts as failed, with
 * the run's reason.
 */

import {
    creationFailureReason,
    dropStaleFailure,
    installFailedOf,
    recordCreationInstall,
    recordInstallEnd,
    recordLaterInstall,
} from '@/features/data-installer/services/installFailure';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import {
    DATAPACK_INSTALL_FAILURE,
    FAILED_PACK,
} from '../../../helpers/datapackInstallFailureFixtures';

const AT = new Date('2026-11-12T11:00:00.000Z');
const PACK = { name: FAILED_PACK.name, version: FAILED_PACK.version };

function failedProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        path: '/p/acme',
        datapack: FAILED_PACK,
        datapackInstallFailure: { ...DATAPACK_INSTALL_FAILURE },
        ...overrides,
    });
}

describe('creationFailureReason: which creation runs failed, and why', () => {
    it('is nothing for a run that succeeded', () => {
        expect(
            creationFailureReason({ ran: true, outcome: 'success', perType: {} })
        ).toBeUndefined();
    });

    // Skipped is not failed: nothing was written, and a Retry would skip again.
    it('is nothing for a skipped run', () => {
        expect(
            creationFailureReason({ ran: false, skipped: true, reason: 'No website.' })
        ).toBeUndefined();
    });

    it("is the run's reason for a partly installed run (P4-Q11)", () => {
        expect(
            creationFailureReason({
                ran: true,
                outcome: 'partial',
                perType: {},
                reason: 'Products refused.',
            })
        ).toBe('Products refused.');
    });

    it('says the install did not finish when a partly installed run gave no reason', () => {
        expect(creationFailureReason({ ran: true, outcome: 'partial', perType: {} })).toBe(
            'The install did not finish.'
        );
    });

    it('is the reason a run that never started gave, or says it did not start', () => {
        expect(creationFailureReason({ ran: false, reason: 'Service down.' })).toBe(
            'Service down.'
        );
        expect(creationFailureReason({ ran: false })).toBe('The install did not start.');
    });
});

describe('recordCreationInstall', () => {
    it('records a failed creation install against the pack, with no retries yet', () => {
        const project = createMockProject({ datapack: FAILED_PACK });

        expect(recordCreationInstall(project, PACK, 'Products refused.', AT)).toBe(true);

        expect(project.datapackInstallFailure).toStrictEqual({
            ...PACK,
            reason: 'Products refused.',
            at: AT.toISOString(),
            retries: 0,
        });
    });

    // An Edit that installs the same pack again after a failure: one more try that did not help.
    it('bumps the retries of a record already naming the pack', () => {
        const project = failedProject();

        recordCreationInstall(project, PACK, 'Again.', AT);

        expect(project.datapackInstallFailure).toStrictEqual({
            ...PACK,
            reason: 'Again.',
            at: AT.toISOString(),
            retries: 1,
        });
    });

    it('clears the record when the install succeeds', () => {
        const project = failedProject();

        expect(recordCreationInstall(project, PACK, undefined, AT)).toBe(true);

        expect(project.datapackInstallFailure).toBeUndefined();
    });

    // Creation may settle on another pack before installing (`settleArrivingPack`).
    it('drops a record about a pack the project no longer names, even on a success', () => {
        const project = failedProject({ datapack: { name: 'luma', version: '1.0.0' } });

        expect(recordCreationInstall(project, { name: 'luma', version: '1.0.0' }, undefined, AT)).toBe(true);
        expect(project.datapackInstallFailure).toBeUndefined();
    });

    it('changes nothing for a success with no record', () => {
        const project = createMockProject({ datapack: FAILED_PACK });

        expect(recordCreationInstall(project, PACK, undefined, AT)).toBe(false);
        expect(project.datapackInstallFailure).toBeUndefined();
    });
});

describe('recordLaterInstall: an install from the Datapacks screen or an agent', () => {
    it('clears the record when that datapack installs successfully', () => {
        const project = failedProject();

        expect(recordLaterInstall(project, PACK, undefined, AT)).toBe(true);
        expect(project.datapackInstallFailure).toBeUndefined();
    });

    it('bumps the retries when that datapack fails again, keeping the latest reason', () => {
        const project = failedProject();

        expect(recordLaterInstall(project, PACK, 'Still refused.', AT)).toBe(true);
        expect(project.datapackInstallFailure).toStrictEqual({
            ...PACK,
            reason: 'Still refused.',
            at: AT.toISOString(),
            retries: 1,
        });
    });

    // Only creation starts a record: a later failure of a pack never recorded is the job window's to show.
    it('starts no record for a failure nothing recorded before', () => {
        const project = createMockProject({ datapack: FAILED_PACK });

        expect(recordLaterInstall(project, PACK, 'Refused.', AT)).toBe(false);
        expect(project.datapackInstallFailure).toBeUndefined();
    });

    it('leaves a record about another version alone', () => {
        const project = failedProject();

        expect(
            recordLaterInstall(project, { name: 'bodea', version: '2.0.0' }, undefined, AT)
        ).toBe(false);
        expect(project.datapackInstallFailure).toStrictEqual(DATAPACK_INSTALL_FAILURE);
    });
});

describe('dropStaleFailure: the project naming another datapack, or none', () => {
    it('drops the record when the project names no datapack', () => {
        const project = failedProject({ datapack: undefined });

        expect(dropStaleFailure(project)).toBe(true);
        expect(project.datapackInstallFailure).toBeUndefined();
    });

    it('drops the record when the project names another datapack', () => {
        const project = failedProject({ datapack: { name: 'luma', version: '1.0.0' } });

        dropStaleFailure(project);

        expect(project.datapackInstallFailure).toBeUndefined();
    });

    it('keeps the record while the project names that datapack', () => {
        const project = failedProject();

        expect(dropStaleFailure(project)).toBe(false);
        expect(project.datapackInstallFailure).toStrictEqual(DATAPACK_INSTALL_FAILURE);
    });
});

describe('installFailedOf: the read', () => {
    it("gives the reason and retries when the record names the project's datapack", () => {
        expect(installFailedOf(failedProject())).toStrictEqual({
            reason: DATAPACK_INSTALL_FAILURE.reason,
            retries: 0,
        });
    });

    it('gives nothing for a record about another datapack', () => {
        expect(
            installFailedOf(failedProject({ datapack: { name: 'luma', version: '1.0.0' } }))
        ).toBeUndefined();
    });

    // Property 3: a project from before the field existed.
    it('gives nothing for a project with no record, or none at all', () => {
        expect(installFailedOf(createMockProject({ datapack: FAILED_PACK }))).toBeUndefined();
        expect(installFailedOf(undefined)).toBeUndefined();
    });
});

describe('recordInstallEnd: the writer behind the job watcher', () => {
    it('saves the open project with the record cleared after a success', async () => {
        const stateManager = createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(failedProject()),
        });

        await recordInstallEnd(stateManager, '/p/acme', PACK, undefined, AT);

        expect(stateManager.saveProject).toHaveBeenCalledTimes(1);
        const saved = stateManager.saveProject.mock.calls[0][0];
        expect(saved.datapack).toStrictEqual(FAILED_PACK);
        expect(saved.datapackInstallFailure).toBeUndefined();
    });

    it('saves the bumped record after a failure', async () => {
        const stateManager = createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(failedProject()),
        });

        await recordInstallEnd(stateManager, '/p/acme', PACK, 'Still refused.', AT);

        expect(stateManager.saveProject).toHaveBeenCalledWith(
            expect.objectContaining({
                datapackInstallFailure: {
                    ...PACK,
                    reason: 'Still refused.',
                    at: AT.toISOString(),
                    retries: 1,
                },
            })
        );
    });

    it('writes nothing when nothing changed', async () => {
        const stateManager = createMockStateManager({
            getCurrentProject: jest
                .fn()
                .mockResolvedValue(createMockProject({ path: '/p/acme', datapack: FAILED_PACK })),
        });

        await recordInstallEnd(stateManager, '/p/acme', PACK, undefined, AT);

        expect(stateManager.saveProject).not.toHaveBeenCalled();
    });

    // The SC may have opened another project while the install ran.
    it('writes nothing when the open project is not the one the install started from', async () => {
        const stateManager = createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(failedProject({ path: '/p/other' })),
        });

        await recordInstallEnd(stateManager, '/p/acme', PACK, undefined, AT);

        expect(stateManager.saveProject).not.toHaveBeenCalled();
    });
});
