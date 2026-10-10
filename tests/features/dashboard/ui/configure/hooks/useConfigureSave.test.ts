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
        componentConfigs: { headless: { ADOBE_COMMERCE_URL: 'https://example.com' } },
        componentSecretFlags: NO_SECRETS,
        touchedFields: new Set<string>(),
        isEds: false,
        authoringExperience: 'experience-workspace',
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

    it('sends every value and no rename when the title is unchanged', async () => {
        const { result } = render();

        await act(() => result.current.handleSave());

        expect(mockRequest).toHaveBeenCalledWith('save-configuration', {
            componentConfigs: { headless: { ADOBE_COMMERCE_URL: 'https://example.com' } },
            newProjectName: undefined,
        });
    });

    it('sends the trimmed title when it changed, even by capitalisation alone', async () => {
        const { result } = render({ projectName: '  bodea demo  ' });

        await act(() => result.current.handleSave());

        expect(mockRequest.mock.calls[0][1]).toMatchObject({ newProjectName: 'bodea demo' });
    });

    it('sends the authoring experience only for an EDS project', async () => {
        const eds = render({ isEds: true });
        await act(() => eds.result.current.handleSave());

        expect(mockRequest.mock.calls[0][1]).toMatchObject({
            authoringExperience: 'experience-workspace',
        });
    });

    it('drops the blank placeholder of a stored secret the user never touched', async () => {
        const { result } = render({
            componentConfigs: { backend: { ADMIN_PASSWORD: '', ADMIN_USER: 'admin' } },
            componentSecretFlags: { backend: { ADMIN_PASSWORD: true } },
        });

        await act(() => result.current.handleSave());

        expect(mockRequest.mock.calls[0][1].componentConfigs).toStrictEqual({
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
