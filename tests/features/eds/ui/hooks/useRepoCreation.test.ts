/**
 * useRepoCreation — the name the SC types, the error it earns, and the
 * create-repository request.
 *
 * Driven through the hook rather than the picker, so every decision the hook
 * makes is pinned where it lives: which request it sends and with what, the
 * exact patch it writes back (the new repository first in the list, selected,
 * names locked together), and what each failure shape leaves in the creation
 * state. The picker's own suite (RepoSelectionInline-createRepo) drives the
 * same flow through the real form.
 */

import { mockRequest } from '../../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';
import {
    useRepoCreation,
    type UseRepoCreationOptions,
} from '@/features/eds/ui/hooks/useRepoCreation';
import { getRepositoryNameError } from '@/core/validation/normalizers';
import type { EDSConfig, GitHubRepoItem, WizardState } from '@/types/webview';

const NOW = new Date('2026-10-09T08:00:00.000Z');

const CREATED = {
    owner: 'testuser',
    name: 'my-store',
    url: 'https://github.com/testuser/my-store',
    fullName: 'testuser/my-store',
};

const OLDER: GitHubRepoItem = {
    id: 'testuser/older-store',
    name: 'older-store',
    fullName: 'testuser/older-store',
    htmlUrl: 'https://github.com/testuser/older-store',
};

function edsConfigWith(overrides: Partial<EDSConfig> = {}): EDSConfig {
    return {
        accsHost: '',
        storeViewCode: '',
        customerGroup: '',
        repoName: 'my-store',
        daLiveOrg: '',
        daLiveSite: 'my-store',
        repoMode: 'new',
        templateOwner: 'adobe',
        templateRepo: 'aem-boilerplate',
        ...overrides,
    };
}

function stateWith(edsConfig: EDSConfig, extra: Partial<WizardState> = {}): WizardState {
    return {
        currentStep: 'build-your-project',
        projectName: 'test-project',
        adobeAuth: { isAuthenticated: true, isChecking: false },
        componentConfigs: {},
        edsConfig,
        ...extra,
    };
}

function setup(overrides: Partial<UseRepoCreationOptions> = {}) {
    const updateState = jest.fn();
    const updateEdsConfig = jest.fn();
    const options: UseRepoCreationOptions = {
        state: stateWith(edsConfigWith()),
        updateState,
        updateEdsConfig,
        repoName: 'my-store',
        hasCreatedRepo: false,
        ...overrides,
    };
    const hook = renderHook((props: UseRepoCreationOptions) => useRepoCreation(props), {
        initialProps: options,
    });
    return { ...hook, options, updateState, updateEdsConfig };
}

describe('useRepoCreation — starting state', () => {
    it('starts idle with no error and the stored name in the field', () => {
        const { result } = setup();

        expect(result.current.repoCreationState).toStrictEqual({ isCreating: false, isCreated: false });
        expect(result.current.repoNameError).toBeUndefined();
        expect(result.current.repoNameInput).toBe('my-store');
    });

    it('starts created when edsConfig already records a created repository', () => {
        const { result } = setup({ hasCreatedRepo: true });

        expect(result.current.repoCreationState).toStrictEqual({ isCreating: false, isCreated: true });
    });
});

describe('useRepoCreation — the name field', () => {
    it('stores the GitHub name derived from what was typed, and locks the site name to it', () => {
        const { result, updateEdsConfig } = setup();

        act(() => result.current.handleRepoNameChange('Kukla Just Rite'));

        expect(updateEdsConfig).toHaveBeenCalledWith({
            repoName: 'kukla-just-rite',
            daLiveSite: 'kukla-just-rite',
        });
        expect(result.current.repoNameError).toBeUndefined();
    });

    it('keeps the typed text in the field while it still derives the stored name', () => {
        const { result, rerender, options } = setup();

        act(() => result.current.handleRepoNameChange('Kukla Just Rite'));
        rerender({ ...options, repoName: 'kukla-just-rite' });

        expect(result.current.repoNameInput).toBe('Kukla Just Rite');
    });

    it('shows the stored name once it no longer comes from what was typed', () => {
        const { result, rerender, options } = setup();

        act(() => result.current.handleRepoNameChange('Kukla Just Rite'));
        rerender({ ...options, repoName: 'set-elsewhere' });

        expect(result.current.repoNameInput).toBe('set-elsewhere');
    });

    it('checks the derived name, not the typed text', () => {
        // '---' derives an empty GitHub name, so the error is about THAT name.
        const { result, updateEdsConfig } = setup();

        act(() => result.current.handleRepoNameChange('---'));

        expect(updateEdsConfig).toHaveBeenCalledWith({ repoName: '', daLiveSite: '' });
        expect(result.current.repoNameError).toBe('Repository name is required');
    });

    it('checks the stored name on blur', () => {
        const { result } = setup({ repoName: '' });

        act(() => result.current.handleRepoNameBlur());

        expect(result.current.repoNameError).toBe(getRepositoryNameError(''));
        expect(result.current.repoNameError).toBeDefined();
    });

    it('clears the error on blur once the stored name is valid', () => {
        const { result, rerender, options } = setup({ repoName: '' });
        act(() => result.current.handleRepoNameBlur());

        rerender({ ...options, repoName: 'my-store' });
        act(() => result.current.handleRepoNameBlur());

        expect(result.current.repoNameError).toBeUndefined();
    });
});

describe('useRepoCreation — the create request', () => {
    beforeEach(() => {
        mockRequest.mockReset();
        jest.setSystemTime(NOW);
    });

    it('asks the extension to create the repo from the stack template, publicly', async () => {
        mockRequest.mockResolvedValue({ success: true, data: CREATED });
        const { result } = setup();

        await act(() => result.current.handleCreateRepository());

        expect(mockRequest).toHaveBeenCalledWith('create-github-repo', {
            repoName: 'my-store',
            templateOwner: 'adobe',
            templateRepo: 'aem-boilerplate',
            isPrivate: false,
        });
    });

    it('says the source is an added demo when it is one', async () => {
        mockRequest.mockResolvedValue({ success: true, data: CREATED });
        const { result } = setup({ state: stateWith(edsConfigWith(), { demo: makeAddedDemo() }) });

        await act(() => result.current.handleCreateRepository());

        expect(mockRequest).toHaveBeenCalledWith('create-github-repo', {
            repoName: 'my-store',
            templateOwner: 'adobe',
            templateRepo: 'aem-boilerplate',
            isPrivate: false,
            fromAddedDemo: true,
        });
    });

    it('selects the new repository, first in the list, with every name locked to it', async () => {
        mockRequest.mockResolvedValue({ success: true, data: CREATED });
        const stale: GitHubRepoItem = { ...OLDER, id: CREATED.fullName, name: 'stale-copy' };
        const config = edsConfigWith();
        const { result, updateState } = setup({
            state: stateWith(config, { githubReposCache: [OLDER, stale] }),
        });

        await act(() => result.current.handleCreateRepository());

        const created: GitHubRepoItem = {
            id: 'testuser/my-store',
            name: 'my-store',
            owner: 'testuser',
            fullName: 'testuser/my-store',
            description: null,
            isPrivate: false,
            htmlUrl: 'https://github.com/testuser/my-store',
            defaultBranch: 'main',
            updatedAt: NOW.toISOString(),
        };
        expect(updateState).toHaveBeenCalledTimes(1);
        expect(updateState).toHaveBeenCalledWith({
            githubReposCache: [created, OLDER],
            edsConfig: {
                ...config,
                createdRepo: CREATED,
                repoMode: 'existing',
                selectedRepo: created,
                existingRepo: 'testuser/my-store',
                repoName: 'my-store',
                daLiveSite: 'my-store',
                resetToTemplate: false,
            },
        });
        expect(result.current.repoCreationState).toStrictEqual({ isCreating: false, isCreated: true });
        expect(result.current.repoNameError).toBeUndefined();
    });

    it('starts the list fresh when none was cached', async () => {
        mockRequest.mockResolvedValue({ success: true, data: CREATED });
        const { result, updateState } = setup();

        await act(() => result.current.handleCreateRepository());

        expect(updateState.mock.calls[0][0].githubReposCache.map((r: GitHubRepoItem) => r.id))
            .toStrictEqual(['testuser/my-store']);
    });

    it('is creating while the request is out', async () => {
        let answer!: (v: unknown) => void;
        mockRequest.mockReturnValue(new Promise((res) => { answer = res; }));
        const { result } = setup();

        let pending!: Promise<void>;
        act(() => { pending = result.current.handleCreateRepository(); });

        expect(result.current.repoCreationState).toStrictEqual({ isCreating: true, isCreated: false });
        await act(async () => {
            answer({ success: true, data: CREATED });
            await pending;
        });
        expect(result.current.repoCreationState).toStrictEqual({ isCreating: false, isCreated: true });
    });

    it('refuses without a template owner, and says why', async () => {
        const { result, updateState } = setup({
            state: stateWith(edsConfigWith({ templateOwner: undefined })),
        });

        await act(() => result.current.handleCreateRepository());

        expect(mockRequest).not.toHaveBeenCalled();
        expect(updateState).not.toHaveBeenCalled();
        expect(result.current.repoCreationState).toStrictEqual({
            isCreating: false,
            isCreated: false,
            error: 'Template configuration not available. Please check your stack settings.',
        });
    });

    it('refuses, rather than throwing, when there is no EDS configuration at all', async () => {
        const { result } = setup({
            state: {
                currentStep: 'build-your-project',
                projectName: 'test-project',
                adobeAuth: { isAuthenticated: true, isChecking: false },
                componentConfigs: {},
            },
        });

        await act(() => result.current.handleCreateRepository());

        expect(mockRequest).not.toHaveBeenCalled();
        expect(result.current.repoCreationState.error).toBe(
            'Template configuration not available. Please check your stack settings.',
        );
    });

    it('refuses without a template repository', async () => {
        const { result } = setup({ state: stateWith(edsConfigWith({ templateRepo: undefined })) });

        await act(() => result.current.handleCreateRepository());

        expect(mockRequest).not.toHaveBeenCalled();
        expect(result.current.repoCreationState.error).toBe(
            'Template configuration not available. Please check your stack settings.',
        );
    });

    it.each([
        ['no name', ''],
        ['a name GitHub would reject', '-'],
    ])('refuses %s and marks the field', async (_label, repoName) => {
        const { result } = setup({ repoName });

        await act(() => result.current.handleCreateRepository());

        expect(mockRequest).not.toHaveBeenCalled();
        expect(result.current.repoNameError).toBe(getRepositoryNameError(repoName));
        expect(result.current.repoCreationState).toStrictEqual({ isCreating: false, isCreated: false });
    });

    it('clears an earlier name error when the request goes out', async () => {
        mockRequest.mockResolvedValue({ success: true, data: CREATED });
        const { result, rerender, options } = setup({ repoName: '' });
        await act(() => result.current.handleCreateRepository());
        expect(result.current.repoNameError).toBeDefined();

        rerender({ ...options, repoName: 'my-store' });
        await act(() => result.current.handleCreateRepository());

        expect(result.current.repoNameError).toBeUndefined();
    });
});

describe('useRepoCreation — when creation fails', () => {
    beforeEach(() => {
        mockRequest.mockReset();
        // The hook reports the failure to the webview console; the gate fails a
        // suite that lets one through, and the console line is not what is under
        // test here — the error the USER sees is.
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.mocked(console.error).mockRestore();
    });

    it.each([
        ['the reason the extension gave', { success: false, error: 'Name already taken' }, 'Name already taken'],
        ['a generic reason when it gave none', { success: false }, 'Failed to create repository'],
        ['a success carrying no repository as a failure', { success: true, error: 'nothing came back' }, 'nothing came back'],
    ])('keeps %s', async (_label, answer, message) => {
        mockRequest.mockResolvedValue(answer);
        const { result, updateState } = setup();

        await act(() => result.current.handleCreateRepository());

        expect(updateState).not.toHaveBeenCalled();
        expect(result.current.repoCreationState).toStrictEqual({
            isCreating: false,
            isCreated: false,
            error: message,
        });
    });

    it('keeps the message of a thrown transport error', async () => {
        mockRequest.mockRejectedValue(new Error('webview disconnected'));
        const { result } = setup();

        await act(() => result.current.handleCreateRepository());

        expect(result.current.repoCreationState).toStrictEqual({
            isCreating: false,
            isCreated: false,
            error: 'webview disconnected',
        });
    });
});

describe('useRepoCreation — resetCreation', () => {
    it('forgets a created repository', () => {
        const { result } = setup({ hasCreatedRepo: true });

        act(() => result.current.resetCreation());

        expect(result.current.repoCreationState).toStrictEqual({ isCreating: false, isCreated: false });
    });

    it('forgets a failed attempt', async () => {
        const { result } = setup({ state: stateWith(edsConfigWith({ templateRepo: undefined })) });
        await act(() => result.current.handleCreateRepository());

        act(() => result.current.resetCreation());

        expect(result.current.repoCreationState).toStrictEqual({ isCreating: false, isCreated: false });
    });
});

describe('useRepoCreation — what the callbacks see after the inputs move', () => {
    beforeEach(() => {
        mockRequest.mockReset();
        mockRequest.mockResolvedValue({ success: true, data: CREATED });
    });

    it('creates the repository the field currently names', async () => {
        const { result, rerender, options } = setup({ repoName: 'first-name' });

        rerender({ ...options, repoName: 'my-store' });
        await act(() => result.current.handleCreateRepository());

        expect(mockRequest.mock.calls[0][1].repoName).toBe('my-store');
    });

    it('uses the current template, cache, demo and updater', async () => {
        const { result, rerender, options, updateState: firstUpdateState } = setup();
        const updateState = jest.fn();

        rerender({
            ...options,
            updateState,
            state: stateWith(edsConfigWith({ templateRepo: 'newer-template' }), {
                githubReposCache: [OLDER],
                demo: makeAddedDemo(),
            }),
        });
        await act(() => result.current.handleCreateRepository());

        expect(mockRequest.mock.calls[0][1]).toStrictEqual({
            repoName: 'my-store',
            templateOwner: 'adobe',
            templateRepo: 'newer-template',
            isPrivate: false,
            fromAddedDemo: true,
        });
        expect(firstUpdateState).not.toHaveBeenCalled();
        expect(updateState.mock.calls[0][0].githubReposCache.map((r: GitHubRepoItem) => r.id))
            .toStrictEqual(['testuser/my-store', 'testuser/older-store']);
        expect(updateState.mock.calls[0][0].edsConfig.templateRepo).toBe('newer-template');
    });

    it('patches through the current edsConfig updater', () => {
        const { result, rerender, options, updateEdsConfig: first } = setup();
        const updateEdsConfig = jest.fn();

        rerender({ ...options, updateEdsConfig });
        act(() => result.current.handleRepoNameChange('next'));

        expect(first).not.toHaveBeenCalled();
        expect(updateEdsConfig).toHaveBeenCalledWith({ repoName: 'next', daLiveSite: 'next' });
    });
});
