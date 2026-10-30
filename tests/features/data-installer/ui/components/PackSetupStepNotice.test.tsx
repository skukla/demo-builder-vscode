/**
 * The Admin step an installed pack left, in its flyout (datapack-engine step 12): drawn as the setup
 * guide draws a step, with Open the Admin and Check; the Check's answer replaces what was read, so a
 * passing check shows the step done with no reinstall. Nothing shows when the pack left no step.
 */

type Request = { load: jest.Mock; loading: boolean; value: unknown; failure: { message: string } | null; settled: boolean };
const mockRequests: Record<string, Request> = {};
const request = (): Request => ({ load: jest.fn(), loading: false, value: null, failure: null, settled: false });
jest.mock('@/features/data-installer/ui/hooks/useDataInstallerRequest', () => ({
    useDataInstallerRequest: (type: string) => mockRequests[type],
}));
const mockPost = jest.fn();
jest.mock('@/core/ui/utils/WebviewClient', () => ({ webviewClient: { postMessage: (...args: unknown[]) => mockPost(...args) } }));

// Below the mocks on purpose: they hoist above these imports.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { rootStepItem } from '@/features/data-installer/services/demoBuilderEngine/packRootCheck';
import type { PackRootStep } from '@/features/data-installer/services/demoBuilderEngine/packRootStep';
import type { DatapackSetupStep } from '@/features/data-installer/types';
import { PackSetupStepNotice } from '@/features/data-installer/ui/components/PackSetupStepNotice';

const ID = { name: 'frescopa', version: 'main' };
const STEP: PackRootStep = {
    state: 'open',
    storeCode: 'justrite_test_store',
    storeName: 'JustRite Test Store',
    rootId: 300,
    rootName: 'Frescopa',
    storeRootId: 119,
    sharedWith: 'the store justrite_store (website justrite)',
};
const answer = (step: PackRootStep | null): DatapackSetupStep => ({ datapackName: ID.name, version: ID.version, step: step ? rootStepItem(step) : null });

beforeEach(() => {
    jest.clearAllMocks();
    mockRequests['get-datapack-setup-step'] = request();
    mockRequests['check-datapack-setup-step'] = request();
});

it('reads the step for the pack and shows nothing when it left none', () => {
    mockRequests['get-datapack-setup-step'].value = answer(null);

    const { container } = render(<PackSetupStepNotice id={ID} />);

    expect(mockRequests['get-datapack-setup-step'].load).toHaveBeenCalledWith({ datapackName: 'frescopa', version: 'main' });
    expect(container).toBeEmptyDOMElement();
});

it("shows an open step as the setup guide does: where, the value to copy, then; and its two buttons", () => {
    mockRequests['get-datapack-setup-step'].value = answer(STEP);

    render(<PackSetupStepNotice id={ID} />);

    expect(screen.getByText("Show Frescopa's categories on the storefront")).toBeInTheDocument();
    expect(screen.getByLabelText('Stores > All Stores > JustRite Test Store')).toBeInTheDocument();
    expect(screen.getByText('Root Category: Frescopa')).toBeInTheDocument();
    expect(screen.getByText('Save Store.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open the Admin' }));
    expect(mockPost).toHaveBeenCalledWith('openAdminPanel', {});
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(mockRequests['check-datapack-setup-step'].load).toHaveBeenCalledWith({ datapackName: 'frescopa', version: 'main' });
});

it("shows the Check's answer over what was read: done, with what it found", () => {
    mockRequests['get-datapack-setup-step'].value = answer(STEP);
    mockRequests['check-datapack-setup-step'].value = answer({ ...STEP, state: 'done', note: "The store JustRite Test Store shows Frescopa's categories." });

    render(<PackSetupStepNotice id={ID} />);

    expect(screen.getByText("The store JustRite Test Store shows Frescopa's categories.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check' })).not.toBeInTheDocument();
});

it('says what a check that is not done found, under the step', () => {
    const note = 'The store JustRite Test Store still shows the root category Justrite (id 119), not Frescopa (id 300).';
    mockRequests['get-datapack-setup-step'].value = answer(STEP);
    mockRequests['check-datapack-setup-step'].value = answer({ ...STEP, note });

    render(<PackSetupStepNotice id={ID} />);

    expect(screen.getByText(note)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument();
});
