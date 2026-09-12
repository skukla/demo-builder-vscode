/**
 * Preamble for the AddDemoModal suite: the host boundary is mocked, the
 * stages and the core Modal render real over the global Spectrum stubs. Owns
 * the SUT import (webview-test-authoring §3).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { settle } from '../../../../../helpers/reactSettle';
import '@testing-library/jest-dom';

export const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: { request: (...args: unknown[]) => mockRequest(...args) },
}));

// The SUT binds below the mocks on purpose (webview-test-authoring §3).
import { AddDemoModal, type AddDemoModalProps } from '@/features/project-creation/ui/components/add-demo/AddDemoModal';
import type { AddedDemo } from '@/types/projectFile';
import type { SharedDemoRead } from '@/types/webviewRequests';
import { makeAddedDemo, makeDemoPackage } from '../../../../../helpers/demoPackageFixtures';

export const STARTER = makeDemoPackage({ id: 'starter', name: 'Starter (B2B + B2C)' });
export const JEN: AddedDemo = makeAddedDemo();

export const READ: SharedDemoRead = {
    outcome: 'read',
    fullName: 'jen/isle5-demo',
    defaultBranch: 'main',
    isTemplate: false,
    kind: 'eds',
    contentSource: { org: 'jen', site: 'isle5-demo' },
    contentPublished: { indexFound: true, pageCount: 12 },
    storeCodes: { websiteCode: 'isle5', storeCode: 'isle5_store', storeViewCode: 'isle5_us' },
    b2b: 'on',
    b2bSource: 'config-json',
    overrides: [],
    warnings: [],
    viewer: { login: 'steve', ownsRepo: false },
};

export function renderModal(overrides: Partial<AddDemoModalProps> = {}) {
    const props: AddDemoModalProps = {
        isOpen: true,
        packages: [STARTER],
        addedDemos: [],
        onUseShipped: jest.fn(),
        onDemoAdded: jest.fn(),
        onPickRemembered: jest.fn(),
        onClose: jest.fn(),
        ...overrides,
    };
    const view = render(<AddDemoModal {...props} />);
    return { ...view, props };
}

export function resetModalMocks(): void {
    jest.clearAllMocks();
}

export function linkInput(): HTMLElement {
    return screen.getByPlaceholderText('https://github.com/name/demo');
}

export function typeLink(value: string): void {
    fireEvent.change(linkInput(), { target: { value } });
}

export function button(name: string | RegExp): HTMLElement {
    return screen.getByRole('button', { name });
}

export async function click(name: string | RegExp): Promise<void> {
    fireEvent.click(button(name));
    await settle();
}

/** Type a link and Continue, with the probe answering `answer`. */
export async function probeWith(answer: unknown): Promise<void> {
    mockRequest.mockResolvedValueOnce(answer);
    typeLink('https://github.com/jen/isle5-demo');
    await click('Continue');
}
