/**
 * registerEwSettingChangeListener — republish affected EDS projects when an
 * EW-URL-affecting daLive setting changes.
 *
 * Covers: ignore unrelated settings; per-setting affected predicate
 * (ewCanvasBranch → EW-only; authoringExperience → no-override only);
 * zero-affected → no prompt; confirm → flips each; cancel → no writes; notify;
 * debounce coalescing. vscode config events + StateManager + the shared flip are
 * mocked; fake timers drive the debounce.
 */

import { registerEwSettingChangeListener } from '@/features/eds/services/ewSettingChangeListener';
import * as vscode from 'vscode';
import { COMPONENT_IDS } from '@/core/constants';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';
import type { Project } from '@/types/base';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockProject } from '../../../helpers/projectFake';


const mockApplyAuthoringExperienceFlip = jest.fn().mockResolvedValue({
    editorPath: 'ok',
    quickEdit: 'ok',
    configRegen: 'ok',
});
jest.mock('@/features/eds/services/authoringExperienceFlip', () => ({
    applyAuthoringExperienceFlip: (...args: unknown[]) => mockApplyAuthoringExperienceFlip(...args),
}));

// resolveProjectAuthoringExperience mirrors the real precedence enough for the
// predicate: return the EDS metadata value if present, else the (test-driven)
// global default.
let globalDefault = 'da-live-classic';
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    resolveProjectAuthoringExperience: (project: Project | undefined) => {
        const meta = project?.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata
            ?.authoringExperience as string | undefined;
        return meta === 'da-live-classic' || meta === 'experience-workspace' ? meta : globalDefault;
    },
}));

// isEdsProject: EDS when the EDS_STOREFRONT component instance exists.
jest.mock('@/types/typeGuards', () => ({
    isEdsProject: (project: Project | undefined) =>
        !!project?.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT],
}));

interface ProjectSpec {
    name: string;
    eds?: boolean;
    /**
     * Per-project authoring override (undefined = follows global default).
     * `universal-editor` is deliberately allowed: it is a value the metadata can
     * carry that this module does NOT recognise as an override.
     */
    override?: 'da-live-classic' | 'experience-workspace' | 'universal-editor';
}

function makeProject(spec: ProjectSpec): Project {
    if (!spec.eds) {
        return createMockProject({
            name: spec.name,
            path: `/p/${spec.name}`,
            componentInstances: {},
        });
    }
    return createMockProject({
        name: spec.name,
        path: `/p/${spec.name}`,
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                status: 'ready',
                metadata: {
                    daLiveOrg: 'org',
                    daLiveSite: 'site',
                    githubRepo: 'owner/repo',
                    ...(spec.override ? { authoringExperience: spec.override } : {}),
                },
            },
        },
    });
}

function buildStateManager(specs: ProjectSpec[]): StateManager {
    const projects = specs.map(makeProject);
    return createMockStateManager({
        getAllProjects: jest
            .fn()
            .mockResolvedValue(projects.map((p) => ({ name: p.name, path: p.path }))),
        loadProjectFromPath: jest
            .fn()
            .mockImplementation((path: string) =>
                Promise.resolve(projects.find((p) => p.path === path) ?? null)
            ),
    });
}

describe('registerEwSettingChangeListener', () => {
    let capturedListener: ((e: vscode.ConfigurationChangeEvent) => void) | undefined;
    let mockContext: vscode.ExtensionContext;
    let mockLogger: Logger;
    const subscriptionDispose = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        globalDefault = 'da-live-classic';
        capturedListener = undefined;

        (
            vscode.workspace as unknown as {
                onDidChangeConfiguration: jest.Mock;
            }
        ).onDidChangeConfiguration = jest.fn((listener) => {
            capturedListener = listener;
            return { dispose: subscriptionDispose };
        });

        mockContext = createMockExtensionContext();
        mockLogger = createMockLogger() as unknown as Logger;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function register(stateManager: StateManager) {
        return registerEwSettingChangeListener({
            context: mockContext,
            stateManager,
            logger: mockLogger,
            // Passed straight through to the flip, which this suite mocks — so
            // nothing here ever calls a method on it.
            githubTokenService: {} as GitHubTokenService,
        });
    }

    /** Fire a config-change event affecting the given setting keys. */
    function fireChange(...affected: string[]): void {
        capturedListener?.({
            affectsConfiguration: (section: string) => affected.includes(section),
        } as vscode.ConfigurationChangeEvent);
    }

    /** Advance past the debounce and flush the async handler's promise chain. */
    async function flushDebounce(): Promise<void> {
        // advanceTimersByTimeAsync runs the debounce timer AND drains the
        // microtask/promise chain the handler awaits (getAllProjects →
        // loadProjectFromPath loop → prompt → flips → notify).
        await jest.advanceTimersByTimeAsync(300);
    }

    it('ignores settings changes that do not affect the two EW settings', async () => {
        register(buildStateManager([{ name: 'ew', eds: true }]));
        fireChange('demoBuilder.byom.overlayUrl', 'editor.fontSize');
        await flushDebounce();

        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(mockApplyAuthoringExperienceFlip).not.toHaveBeenCalled();
    });

    it('ewCanvasBranch change → affects only EW-resolved EDS projects', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Republish');
        const sm = buildStateManager([
            { name: 'ew-proj', eds: true, override: 'experience-workspace' },
            { name: 'classic-proj', eds: true, override: 'da-live-classic' },
            { name: 'non-eds', eds: false },
        ]);
        register(sm);

        fireChange('demoBuilder.daLive.ewCanvasBranch');
        await flushDebounce();

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            '1 project(s) affected by this Experience Workspace setting change — republish now?',
            'Republish',
            'Not now'
        );
        expect(mockApplyAuthoringExperienceFlip).toHaveBeenCalledTimes(1);
        const [flippedProject] = mockApplyAuthoringExperienceFlip.mock.calls[0];
        expect((flippedProject as Project).name).toBe('ew-proj');
    });

    it('authoringExperience change → affects only EDS projects with NO override', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Republish');
        const sm = buildStateManager([
            { name: 'no-override', eds: true },
            { name: 'has-override', eds: true, override: 'experience-workspace' },
            { name: 'non-eds', eds: false },
        ]);
        register(sm);

        fireChange('demoBuilder.daLive.authoringExperience');
        await flushDebounce();

        expect(mockApplyAuthoringExperienceFlip).toHaveBeenCalledTimes(1);
        const [flippedProject] = mockApplyAuthoringExperienceFlip.mock.calls[0];
        expect((flippedProject as Project).name).toBe('no-override');
    });

    it('zero affected → no prompt, no writes', async () => {
        const sm = buildStateManager([{ name: 'classic', eds: true, override: 'da-live-classic' }]);
        register(sm);

        // ewCanvasBranch only affects EW projects; this project is classic.
        fireChange('demoBuilder.daLive.ewCanvasBranch');
        await flushDebounce();

        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(mockApplyAuthoringExperienceFlip).not.toHaveBeenCalled();
    });

    it('prompt cancel ("Not now") → no writes', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Not now');
        const sm = buildStateManager([{ name: 'ew', eds: true, override: 'experience-workspace' }]);
        register(sm);

        fireChange('demoBuilder.daLive.ewCanvasBranch');
        await flushDebounce();

        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
        expect(mockApplyAuthoringExperienceFlip).not.toHaveBeenCalled();
    });

    it('prompt confirm → flips each affected project and notifies completion', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Republish');
        // Both follow the global default (no override) → both affected by an
        // authoringExperience change.
        const sm = buildStateManager([
            { name: 'a', eds: true },
            { name: 'b', eds: true },
        ]);
        register(sm);

        fireChange('demoBuilder.daLive.authoringExperience');
        await flushDebounce();

        expect(mockApplyAuthoringExperienceFlip).toHaveBeenCalledTimes(2);
        // Prompt + completion toast.
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2);
        expect(vscode.window.showInformationMessage).toHaveBeenLastCalledWith(
            'Re-applied Experience Workspace config to 2 of 2 projects'
        );
    });

    it('single affected project → completion toast names it', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Republish');
        const sm = buildStateManager([{ name: 'solo', eds: true }]);
        register(sm);

        fireChange('demoBuilder.daLive.authoringExperience');
        await flushDebounce();

        expect(vscode.window.showInformationMessage).toHaveBeenLastCalledWith(
            'Re-applied Experience Workspace config to solo'
        );
    });

    it('debounce coalesces rapid edits into a single handling pass', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Not now');
        const sm = buildStateManager([{ name: 'ew', eds: true, override: 'experience-workspace' }]);
        register(sm);

        // Three edits inside the debounce window → one getAllProjects pass.
        fireChange('demoBuilder.daLive.ewCanvasBranch');
        jest.advanceTimersByTime(100);
        fireChange('demoBuilder.daLive.ewCanvasBranch');
        jest.advanceTimersByTime(100);
        fireChange('demoBuilder.daLive.ewCanvasBranch');
        await flushDebounce();

        expect(sm.getAllProjects).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
    });

    // ======================================================================
    // The decisions nothing constrained until 2026-09-05: the early return,
    // the pending flags and their reset, what dispose actually cancels, and
    // the arguments handed to the two collaborators this listener drives.
    // ======================================================================

    it('does not even enumerate projects for an unrelated setting', async () => {
        // The early return is the whole cost control. Without it every keystroke
        // in any VS Code setting loads every project from disk — and the result
        // still looks correct, because nothing is affected either way.
        const sm = buildStateManager([{ name: 'ew', eds: true }]);
        register(sm);

        fireChange('demoBuilder.byom.overlayUrl');
        await flushDebounce();

        expect(sm.getAllProjects).not.toHaveBeenCalled();
    });

    it('a branch change alone does not drag in the no-override projects', async () => {
        // The two settings have DIFFERENT affected sets. A project that merely
        // follows the global default is untouched by a canvas-branch edit, and
        // republishing it would rewrite a live DA.live config nobody asked about.
        const sm = buildStateManager([{ name: 'follows-default', eds: true }]);
        register(sm);

        fireChange('demoBuilder.daLive.ewCanvasBranch');
        await flushDebounce();

        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(mockApplyAuthoringExperienceFlip).not.toHaveBeenCalled();
    });

    it('clears the experience flag once handled, so the next branch edit stays a branch edit', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Not now');
        // Follows the global default: affected by an experience change, NOT by a
        // branch change (it resolves to da-live-classic, not EW).
        const sm = buildStateManager([{ name: 'follows-default', eds: true }]);
        register(sm);

        fireChange('demoBuilder.daLive.authoringExperience');
        await flushDebounce();
        fireChange('demoBuilder.daLive.ewCanvasBranch');
        await flushDebounce();

        // Only the first pass had anything to ask about.
        expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
    });

    it('clears the branch flag once handled, so the next experience edit stays an experience edit', async () => {
        // Carries an EW override: affected by a branch change, NOT by an
        // experience change (its override means the global default does not
        // reach it).
        const sm = buildStateManager([
            { name: 'ew-override', eds: true, override: 'experience-workspace' },
        ]);
        register(sm);

        fireChange('demoBuilder.daLive.authoringExperience');
        await flushDebounce();
        fireChange('demoBuilder.daLive.authoringExperience');
        await flushDebounce();

        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('dispose() cancels a debounce that has not fired yet', async () => {
        // Deactivation mid-edit. A timer left running republishes storefronts
        // against a listener whose extension has already gone away.
        const sm = buildStateManager([{ name: 'follows-default', eds: true }]);
        const disposable = register(sm);

        fireChange('demoBuilder.daLive.authoringExperience');
        disposable.dispose();
        await flushDebounce();

        expect(sm.getAllProjects).not.toHaveBeenCalled();
        expect(mockApplyAuthoringExperienceFlip).not.toHaveBeenCalled();
    });

    it('reads each project without persisting it back', async () => {
        // persistAfterLoad: false is load-bearing — this is a BACKGROUND read
        // triggered by a settings edit, and persisting would rewrite the on-disk
        // current project out from under whatever the SC is doing. The empty
        // component factory matters for the same reason: a populated catalog
        // here would let the load reshape componentInstances.
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Not now');
        const sm = buildStateManager([{ name: 'solo', eds: true }]);
        register(sm);

        fireChange('demoBuilder.daLive.authoringExperience');
        await flushDebounce();

        expect(sm.loadProjectFromPath).toHaveBeenCalledWith('/p/solo', expect.any(Function), {
            persistAfterLoad: false,
        });
        const [, componentFactory] = (sm.loadProjectFromPath as jest.Mock).mock.calls[0];
        expect((componentFactory as () => unknown[])()).toEqual([]);
    });

    it('hands the flip the shared context, logger, token service and a save hook', async () => {
        // The flip needs the SHARED githubTokenService (a fresh one costs a
        // GitHub round trip) and a saveProject that reaches the real state
        // manager — an object literal missing either typechecks fine here and
        // fails only against the live flip.
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Republish');
        const githubTokenService = {} as GitHubTokenService;
        const sm = buildStateManager([{ name: 'solo', eds: true }]);
        registerEwSettingChangeListener({
            context: mockContext,
            stateManager: sm,
            logger: mockLogger,
            githubTokenService,
        });

        fireChange('demoBuilder.daLive.authoringExperience');
        await flushDebounce();

        expect(mockApplyAuthoringExperienceFlip).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'solo' }),
            'da-live-classic',
            expect.objectContaining({
                context: mockContext,
                logger: mockLogger,
                githubTokenService,
                saveProject: expect.any(Function),
            })
        );

        // The save hook must reach the state manager, not a stub.
        const [, , deps] = mockApplyAuthoringExperienceFlip.mock.calls[0];
        const project = makeProject({ name: 'solo', eds: true });
        await (deps as { saveProject: (p: Project) => Promise<void> }).saveProject(project);
        expect(sm.saveProject).toHaveBeenCalledWith(project);
    });

    it('treats an unrecognised metadata value as no override at all', async () => {
        // Only the two union members count. `resolveAuthoringExperience` lets
        // metadata win over the global default for exactly those, so anything
        // else means the project still follows the default — and therefore still
        // changes when the default changes.
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Republish');
        const sm = buildStateManager([
            { name: 'stale-value', eds: true, override: 'universal-editor' },
        ]);
        register(sm);

        fireChange('demoBuilder.daLive.authoringExperience');
        await flushDebounce();

        expect(mockApplyAuthoringExperienceFlip).toHaveBeenCalledTimes(1);
    });

    it('one project failing to republish does not stop the rest, and the count says so', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Republish');
        mockApplyAuthoringExperienceFlip
            .mockRejectedValueOnce(new Error('DA.live 403'))
            .mockResolvedValueOnce({ editorPath: 'ok', quickEdit: 'ok', configRegen: 'ok' });
        const sm = buildStateManager([
            { name: 'first', eds: true },
            { name: 'second', eds: true },
        ]);
        register(sm);

        fireChange('demoBuilder.daLive.authoringExperience');
        await flushDebounce();

        expect(mockApplyAuthoringExperienceFlip).toHaveBeenCalledTimes(2);
        expect(vscode.window.showInformationMessage).toHaveBeenLastCalledWith(
            'Re-applied Experience Workspace config to 1 of 2 projects'
        );
    });

    it('an enumeration failure stays silent rather than prompting about nothing', async () => {
        const sm = createMockStateManager({
            getAllProjects: jest.fn().mockRejectedValue(new Error('state dir unreadable')),
        });
        register(sm);

        fireChange('demoBuilder.daLive.authoringExperience');
        await flushDebounce();

        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(mockApplyAuthoringExperienceFlip).not.toHaveBeenCalled();
    });

    it('dispose() removes the subscription', () => {
        const disposable = register(buildStateManager([]));
        disposable.dispose();
        expect(subscriptionDispose).toHaveBeenCalledTimes(1);
    });
});
