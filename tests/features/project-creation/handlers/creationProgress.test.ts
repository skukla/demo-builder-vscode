/**
 * Project creation's progress: the steps it will report, known from the selections
 * before it starts, and what the wizard's creation screen and an agent are told for
 * each (progress vocabulary slice 4, owner 2026-10-16).
 *
 * The wizard shows line 1 the step, with "(n of N)" from the list; line 2 what it is
 * doing now; line 3 the step's expectation and the run's clock (from `startedAt`).
 */

jest.mock('@/core/utils/agentPhaseChannel', () => ({
    reportPhase: jest.fn(),
}));

import { reportPhase } from '@/core/utils/agentPhaseChannel';
import { OPERATION_STAGES as S } from '@/core/utils/operationStages';
import {
    creationReporter,
    creationSteps,
} from '@/features/project-creation/handlers/creationProgress';
import type { CreationProgressPayload } from '@/types/webviewPayloads';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import { createMockProject } from '../../../helpers/projectFake';

const STARTED_AT = 1_760_000_000_000;

function edsConfig(overrides: Partial<ProjectCreationConfig> = {}): ProjectCreationConfig {
    return {
        projectName: 'demo',
        selectedStack: 'eds-accs',
        components: { frontend: 'eds-storefront', dependencies: [] },
        edsConfig: { preflightComplete: true } as ProjectCreationConfig['edsConfig'],
        ...overrides,
    };
}

describe('creationSteps', () => {
    it('lists an EDS storefront with a datapack in the order creation runs', () => {
        const steps = creationSteps(edsConfig({ datapack: { name: 'Citisignal', version: '1.0.0' } }));

        expect(steps).toStrictEqual([
            S.settingUpProject.label,
            S.loadingComponents.label,
            S.downloadingComponents.label,
            S.installingComponents.label,
            S.writingConfigFiles.label,
            S.publishingSettings.label,
            S.installingDatapack.label,
            S.warmingProductPages.label,
            S.addingCatalogMenu.label,
            S.finishingProject.label,
        ]);
    });

    it('adds the mesh and the integrations when they were picked, and no storefront steps off EDS', () => {
        const steps = creationSteps({
            projectName: 'demo',
            selectedStack: 'headless-paas',
            components: { frontend: 'headless', dependencies: ['headless-commerce-mesh'] },
            selectedAppBuilderComponents: ['erp-integration'],
        });

        expect(steps).toStrictEqual([
            S.settingUpProject.label,
            S.loadingComponents.label,
            S.downloadingComponents.label,
            S.installingComponents.label,
            S.deployingMesh.label,
            S.deployingIntegrations.label,
            S.writingConfigFiles.label,
            S.finishingProject.label,
        ]);
    });

    it("leaves out the settings publish when the storefront setup did not finish", () => {
        const steps = creationSteps(edsConfig({ edsConfig: undefined }));

        expect(steps).not.toContain(S.publishingSettings.label);
    });

    it("swaps the components in on an Edit, and installs the datapack the project already had", () => {
        const existing = createMockProject({ datapack: { name: 'Citisignal', version: '1.0.0' } });

        const steps = creationSteps(edsConfig({ editProjectPath: '/projects/demo' }), existing);

        expect(steps.slice(3, 5)).toStrictEqual([S.installingComponents.label, S.applyingChanges.label]);
        expect(steps).toContain(S.installingDatapack.label);
    });
});

describe('creationReporter', () => {
    const sent = (send: jest.Mock): CreationProgressPayload[] =>
        send.mock.calls.map(([, payload]) => payload as CreationProgressPayload);

    beforeEach(() => jest.clearAllMocks());

    it("numbers a step from the run's list, with the run's start for the clock", () => {
        const send = jest.fn();
        const progress = creationReporter(send, STARTED_AT);
        progress.numberFrom(creationSteps(edsConfig()));

        progress.report(S.downloadingComponents.label, 25, 'Cloning repositories');

        expect(send).toHaveBeenCalledWith('creationProgress', {
            currentOperation: S.downloadingComponents.label,
            progress: 25,
            message: 'Cloning repositories',
            logs: [],
            position: { index: 3, total: 9 },
            startedAt: STARTED_AT,
        });
        expect(reportPhase).toHaveBeenCalledWith('Downloading components (3 of 9) — Cloning repositories');
    });

    it('shows a step it has no number for as it is, with no position', () => {
        const send = jest.fn();
        const progress = creationReporter(send, STARTED_AT);
        progress.numberFrom(creationSteps(edsConfig()));

        progress.report(S.preparingProject.label, 5, 'Removing existing project data');

        expect(sent(send)[0].position).toBeUndefined();
        expect(reportPhase).toHaveBeenCalledWith('Preparing the project — Removing existing project data');
    });

    it('numbers nothing until the run knows its steps', () => {
        const send = jest.fn();

        creationReporter(send, STARTED_AT).report(S.settingUpProject.label, 10, 'Its folders');

        expect(sent(send)[0].position).toBeUndefined();
    });

    // An Edit that resets the storefront shows Reset's own steps and Reset's count.
    it('keeps a position the caller passes', () => {
        const send = jest.fn();
        const progress = creationReporter(send, STARTED_AT);
        progress.numberFrom(creationSteps(edsConfig()));

        progress.report(S.copyingContent.label, 80, '40 of 103 files', { index: 4, total: 11 });

        expect(sent(send)[0].position).toEqual({ index: 4, total: 11 });
        expect(reportPhase).toHaveBeenCalledWith('Copying the content (4 of 11) — 40 of 103 files');
    });

    it('says the step once: a line that repeats its name keeps only what follows', () => {
        const send = jest.fn();

        creationReporter(send, STARTED_AT).report(
            S.copyingContent.label,
            95,
            'Copying the content: 40 of 103 files',
        );

        expect(sent(send)[0].message).toBe('40 of 103 files');
    });

    it("fills line 2 with the step's detail when the work names nothing", () => {
        const send = jest.fn();

        creationReporter(send, STARTED_AT).report(S.writingConfigFiles.label, 85);

        expect(sent(send)[0].message).toBe(S.writingConfigFiles.detail);
        expect(reportPhase).toHaveBeenCalledWith(`${S.writingConfigFiles.label} — ${S.writingConfigFiles.detail}`);
    });
});
