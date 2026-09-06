/**
 * Shared setup for the ManageApisModal suites.
 *
 * THIS FILE OWNS THE MOCK AND THE SUT IMPORT. Specs import the modal and these
 * helpers from HERE, never from '@/features/...': jest.mock hoists above the
 * imports of the module it appears in, NOT across modules, so a spec importing
 * the modal directly could load it before the WebviewClient mock registered.
 *
 * Split out when the fetch-lifecycle suite arrived: everything below was about
 * to be a second copy, and the fixtures are load-bearing rather than dead —
 * `ORG_APIS` is the shape every assertion reads, and `flush` is the settle
 * contract the whole surface depends on.
 */

import '../../../../helpers/webviewClientMock';
import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// Below the mock on purpose — see the docstring.
import { ManageApisModal } from '@/features/dashboard/ui/components/ManageApisModal';

/** The mocked webview client, as the suites drive it. */
function getClient() {
    return jest.requireMock('@/core/ui/utils/WebviewClient').webviewClient;
}

/** The org list as `listConsoleApis` reports it: `managed` = covered by the reconcile union. */
const ORG_APIS = [
    { code: 'GraphQLServiceSDK', name: 'API Mesh', managed: true },
    { code: 'AssetsSDK', name: 'AEM Assets', managed: false },
    { code: 'FireflySDK', name: 'Firefly Services', managed: false },
];

/** Flush the microtask queue inside act so request promises settle into state. */
async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

type ModalProps = Partial<React.ComponentProps<typeof ManageApisModal>>;

/** The modal in its Provider — the element form, for `rerender`. */
function modal(props: ModalProps = {}): React.ReactElement {
    return (
        <Provider theme={defaultTheme}>
            <ManageApisModal
                isOpen
                componentName="erp-sync"
                onClose={() => undefined}
                {...props}
            />
        </Provider>
    );
}

function renderModal(props: ModalProps = {}) {
    const onClose = jest.fn();
    return { onClose, ...render(modal({ onClose, ...props })) };
}

/** The checkbox input rendered for a given API display name (shared-mock shape). */
function checkboxFor(name: string): HTMLInputElement {
    const label = screen.getByText(name).closest('label');
    if (!label) throw new Error(`No checkbox label found for "${name}"`);
    return label.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

/** The modal's footer Apply action (Modal renders div[role=button] actions). */
function applyButton(): HTMLElement {
    return screen.getByRole('button', { name: /^apply/i });
}

export { ManageApisModal, ORG_APIS, applyButton, checkboxFor, flush, getClient, modal, renderModal };
