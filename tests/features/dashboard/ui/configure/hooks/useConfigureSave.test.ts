/**
 * useConfigureSave — Save, Close and the two busy flags.
 *
 * The one double is the canonical `webviewClient` wall: Save is a request to the
 * extension, and the payload it sends IS the behaviour, so the tests assert the
 * argument rather than an outcome a mock would invent.
 */

import {
    mockPostMessage,
    mockRequest,
    webviewClientHandlers,
} from '../../../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
// Below the wall on purpose: the mock above must register before the hook binds
// `webviewClient`.
import {
    useConfigureSave,
    type UseConfigureSaveProps,
} from '@/features/dashboard/ui/configure/hooks/useConfigureSave';
import { createMockProject } from '../../../../../helpers/projectFake';

const NO_SECRETS: Record<string, Record<string, boolean>> = {};

function props(overrides: Partial<UseConfigureSaveProps> = {}): UseConfigureSaveProps {
    return {
        project: createMockProject({ name: 'bodea-demo', title: 'Bodea Demo' }),
        projectName: 'Bodea Demo',
        configChanges: { headless: { ADOBE_COMMERCE_URL: 'https://example.com' } },
        componentSecretFlags: NO_SECRETS,
        touchedFields: new Set<string>(),
        isEds: false,
        authoringExperience: 'experience-workspace',
        initialAuthoringExperience: 'experience-workspace',
        ...overrides,
    };
}

function render(overrides: Partial<UseConfigureSaveProps> = {}) {
    const initial = props(overrides);
    return renderHook(() => useConfigureSave(initial));
}

describe('useConfigureSave', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRequest.mockReset();
        mockRequest.mockResolvedValue({ success: true });
    });

    it('starts idle', () => {
        const { result } = render();

        expect(result.current.isSaving).toBe(false);
        expect(result.current.isDeploying).toBe(false);
    });

    it('follows the deployment-status message the extension sends', () => {
        const { result } = render();

        act(() => webviewClientHandlers.get('deployment-status')?.({ isDeploying: true }));
        expect(result.current.isDeploying).toBe(true);

        act(() => webviewClientHandlers.get('deployment-status')?.({ isDeploying: false }));
        expect(result.current.isDeploying).toBe(false);
    });

    it('sends only what changed, and no rename when the title is unchanged', async () => {
        // PL-76: the whole loaded map used to ride here, so a window opened before
        // another change put the old values back.
        const { result } = render();

        await act(() => result.current.handleSave());

        expect(mockRequest).toHaveBeenCalledWith('save-configuration', {
            configChanges: { headless: { ADOBE_COMMERCE_URL: 'https://example.com' } },
            newProjectName: undefined,
        });
    });

    it('sends the trimmed title when it changed, even by capitalisation alone', async () => {
        const { result } = render({ projectName: '  bodea demo  ' });

        await act(() => result.current.handleSave());

        expect(mockRequest.mock.calls[0][1]).toMatchObject({ newProjectName: 'bodea demo' });
    });

    // The window stays open after Save. Compared with the name it OPENED with, a
    // rename and then a rename back looked like "no change" the second time, and
    // the project kept the first new name (owner, 2026-10-17).
    it('sends a rename back to the opening name after an earlier rename was saved', async () => {
        let current = props({ projectName: 'Renamed' });
        const { result, rerender } = renderHook(() => useConfigureSave(current));

        await act(() => result.current.handleSave());
        expect(mockRequest.mock.calls[0][1]).toMatchObject({ newProjectName: 'Renamed' });

        current = { ...current, projectName: 'Bodea Demo' };
        rerender();
        await act(() => result.current.handleSave());

        expect(mockRequest.mock.calls[1][1]).toMatchObject({ newProjectName: 'Bodea Demo' });
    });

    it('sends the authoring experience switched back after an earlier switch was saved', async () => {
        let current = props({ isEds: true, authoringExperience: 'da-live-classic' });
        const { result, rerender } = renderHook(() => useConfigureSave(current));

        await act(() => result.current.handleSave());
        current = { ...current, authoringExperience: 'experience-workspace' };
        rerender();
        await act(() => result.current.handleSave());

        expect(mockRequest.mock.calls[1][1]).toMatchObject({
            authoringExperience: 'experience-workspace',
        });
    });

    it('hands what it sent to onSaved once the save succeeds, and not when it fails', async () => {
        const onSaved = jest.fn();
        const ok = render({ onSaved });
        await act(() => ok.result.current.handleSave());
        expect(onSaved).toHaveBeenCalledWith({ headless: { ADOBE_COMMERCE_URL: 'https://example.com' } });

        onSaved.mockClear();
        mockRequest.mockResolvedValue({ success: false, error: 'disk full' });
        const failed = render({ onSaved });
        await act(() => failed.result.current.handleSave());
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('sends the authoring experience once the SC changed it, for an EDS project', async () => {
        const eds = render({ isEds: true, initialAuthoringExperience: 'da-live-classic' });
        await act(() => eds.result.current.handleSave());

        expect(mockRequest.mock.calls[0][1]).toMatchObject({
            authoringExperience: 'experience-workspace',
        });
    });

    it('sends no authoring experience the SC did not change', async () => {
        // It used to ride on every EDS save, so a window opened before a flip made
        // elsewhere flipped it back.
        const eds = render({ isEds: true });
        await act(() => eds.result.current.handleSave());

        expect(mockRequest.mock.calls[0][1]).not.toHaveProperty('authoringExperience');
    });

    it('never sends the authoring experience for a project that is not EDS', async () => {
        const { result } = render({ initialAuthoringExperience: 'da-live-classic' });
        await act(() => result.current.handleSave());

        expect(mockRequest.mock.calls[0][1]).not.toHaveProperty('authoringExperience');
    });

    it('sends the block libraries the SC changed, for an EDS project', async () => {
        const { result } = render({
            isEds: true,
            blockLibrarySelection: {
                selectedBlockLibraries: ['demo-builder-blocks'],
                customBlockLibraries: [],
            },
        });

        await act(() => result.current.handleSave());

        expect(mockRequest.mock.calls[0][1]).toMatchObject({
            selectedBlockLibraries: ['demo-builder-blocks'],
            customBlockLibraries: [],
        });
    });

    it('sends no block libraries when the SC never touched the picker', async () => {
        const { result } = render({ isEds: true });

        await act(() => result.current.handleSave());

        expect(mockRequest.mock.calls[0][1]).not.toHaveProperty('selectedBlockLibraries');
        expect(mockRequest.mock.calls[0][1]).not.toHaveProperty('customBlockLibraries');
    });

    it('never sends block libraries for a project that is not EDS', async () => {
        const { result } = render({
            blockLibrarySelection: {
                selectedBlockLibraries: ['demo-builder-blocks'],
                customBlockLibraries: [],
            },
        });

        await act(() => result.current.handleSave());

        expect(mockRequest.mock.calls[0][1]).not.toHaveProperty('selectedBlockLibraries');
    });

    it('drops the blank placeholder of a stored secret the user never touched', async () => {
        const { result } = render({
            configChanges: { backend: { ADMIN_PASSWORD: '', ADMIN_USER: 'admin' } },
            componentSecretFlags: { backend: { ADMIN_PASSWORD: true } },
        });

        await act(() => result.current.handleSave());

        expect(mockRequest.mock.calls[0][1].configChanges).toStrictEqual({
            backend: { ADMIN_USER: 'admin' },
        });
    });

    it('is saving while the request is in flight and idle after it settles', async () => {
        let settle: (value: { success: boolean }) => void = () => undefined;
        mockRequest.mockReturnValue(new Promise((resolve) => (settle = resolve)));
        const { result } = render();

        let pending: Promise<void> = Promise.resolve();
        act(() => {
            pending = result.current.handleSave();
        });
        expect(result.current.isSaving).toBe(true);

        await act(async () => {
            settle({ success: true });
            await pending;
        });
        expect(result.current.isSaving).toBe(false);
    });

    it('returns to idle when the extension answers that the save failed', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'disk full' });
        const { result } = render();

        await act(() => result.current.handleSave());

        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(result.current.isSaving).toBe(false);
    });

    it('returns to idle when the request fails', async () => {
        mockRequest.mockRejectedValue(new Error('offline'));
        const { result } = render();

        await act(() => result.current.handleSave());

        expect(result.current.isSaving).toBe(false);
    });

    it('asks the extension to close the panel on Close', () => {
        const { result } = render();

        act(() => result.current.handleCancel());

        expect(mockPostMessage).toHaveBeenCalledWith('cancel');
    });
});
