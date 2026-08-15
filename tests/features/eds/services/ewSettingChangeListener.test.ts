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
import type { StateManager } from '@/core/state';
import type { Project } from '@/types';

jest.mock('vscode');

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
    /** per-project authoring override (undefined = follows global default) */
    override?: 'da-live-classic' | 'experience-workspace';
}

function makeProject(spec: ProjectSpec): Project {
    if (!spec.eds) {
        return {
            name: spec.name,
            path: `/p/${spec.name}`,
            componentInstances: {},
        } as unknown as Project;
    }
    return {
        name: spec.name,
        path: `/p/${spec.name}`,
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                metadata: {
                    daLiveOrg: 'org',
                    daLiveSite: 'site',
                    githubRepo: 'owner/repo',
                    ...(spec.override ? { authoringExperience: spec.override } : {}),
                },
            },
        },
    } as unknown as Project;
}

function buildStateManager(specs: ProjectSpec[]): StateManager {
    const projects = specs.map(makeProject);
    return {
        getAllProjects: jest
            .fn()
            .mockResolvedValue(projects.map((p) => ({ name: p.name, path: p.path }))),
        loadProjectFromPath: jest
            .fn()
            .mockImplementation((path: string) =>
                Promise.resolve(projects.find((p) => p.path === path) ?? null)
            ),
    } as unknown as StateManager;
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

        mockContext = { secrets: {} } as unknown as vscode.ExtensionContext;
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function register(stateManager: StateManager) {
        return registerEwSettingChangeListener({
            context: mockContext,
            stateManager,
            logger: mockLogger,
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

    it('dispose() removes the subscription', () => {
        const disposable = register(buildStateManager([]));
        disposable.dispose();
        expect(subscriptionDispose).toHaveBeenCalledTimes(1);
    });
});
