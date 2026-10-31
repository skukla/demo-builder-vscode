/**
 * The one Admin step a pack can leave (datapack-engine step 12), as the side panel shows it
 * (owner, 2026-10-30): one quiet line, "1 step left in the Admin", with Show step, which opens
 * the setup guide's own step in a dialog (path, value to copy, reason; Open the Admin and Check
 * in its footer). A done step is a quiet check-marked line with no box.
 *
 * Driven through the real request hook with only `webviewClient` faked, so the handler's
 * envelope travels the path the panel reads. The first test is the live sequence from
 * 2026-10-30 (DI-5): read without a note, press Check, the answer carries one, and it shows
 * without closing the panel.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press, settle } from '../../../../helpers/reactSettle';

// Below the mocks on purpose: they hoist above these imports.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { rootStepItem } from '@/features/data-installer/services/demoBuilderEngine/packRootCheck';
import type { PackRootStep } from '@/features/data-installer/services/demoBuilderEngine/packRootStep';
import type { DatapackSetupStep } from '@/features/data-installer/types';
import { CHECK_NO_ANSWER, usePackSetupStep } from '@/features/data-installer/ui/hooks/usePackSetupStep';
import type { DatapackId } from '@/types/datapack';
import type { HandlerResponse } from '@/types/handlers';

const mockRequest = webviewClient.request as jest.Mock;
const ID: DatapackId = { name: 'zz-test-root-db12', version: 'v1' };
const STEP: PackRootStep = {
    state: 'open',
    storeCode: 'justrite_test_store',
    storeName: 'Justrite Test Store',
    rootId: 215,
    rootName: 'ZZ Root DB12',
    storeRootId: 119,
    sharedWith: 'the store justrite_store (website justrite)',
};
const NOTE = 'The store Justrite Test Store still uses the root category Justrite Catalog, not ZZ Root DB12.';
const DONE: PackRootStep = { ...STEP, state: 'done', note: "The store Justrite Test Store shows ZZ Root DB12's categories.", lastCheck: 'passed' };

/** The handler's envelope, as `setupStepAnswer` builds it. */
function answer(step: PackRootStep | null, pack: DatapackId = ID): HandlerResponse {
    const data: DatapackSetupStep = { datapackName: pack.name, version: pack.version, step: step ? rootStepItem(step) : null };
    return { success: true, data };
}

/** The read answers `read`; the Check answers `check` (a value, or a function that throws). */
function answering(read: HandlerResponse, check?: HandlerResponse | (() => never)): void {
    mockRequest.mockImplementation(async (type: string) => {
        if (type === 'check-datapack-setup-step') return typeof check === 'function' ? check() : check;
        return read;
    });
}

function Harness({ pack }: { pack?: DatapackId }): React.JSX.Element {
    const step = usePackSetupStep(pack);
    return (
        <>
            <div data-testid="panel">{step.line}</div>
            {step.dialog}
        </>
    );
}

/** Renders for ID unless `{ pack: undefined }` says no pack (a default parameter cannot). */
async function renderStep(over: { pack?: DatapackId } = { pack: ID }) {
    const view = render(<Harness pack={over.pack} />);
    await settle();
    return view;
}

const panel = () => screen.getByTestId('panel');
const dialog = () => screen.getByRole('dialog');
const banner = () => within(dialog()).getByTestId('setup-guide-step-status');

beforeEach(() => {
    mockRequest.mockReset();
});

it('shows what the Check found without closing the panel: read without a note, Check answers with one', async () => {
    answering(answer(STEP), answer({ ...STEP, note: NOTE, lastCheck: 'failed' }));
    await renderStep();
    await press(within(panel()).getByRole('button', { name: 'Show step' }));
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();

    await press(screen.getByRole('button', { name: 'Check' }));

    expect(await within(dialog()).findByText(NOTE)).toBeInTheDocument();
    expect(banner()).toHaveTextContent('Not set up');
    expect(mockRequest).toHaveBeenCalledWith('check-datapack-setup-step', { datapackName: ID.name, version: ID.version }, undefined);
});

it('shows nothing, and asks nothing, with no pack; nothing when the pack left no step', async () => {
    await renderStep({ pack: undefined });
    expect(mockRequest).not.toHaveBeenCalled();

    answering(answer(null));
    await renderStep();
    expect(mockRequest).toHaveBeenCalledWith('get-datapack-setup-step', { datapackName: ID.name, version: ID.version }, undefined);
    expect(screen.getAllByTestId('panel').every((node) => node.childElementCount === 0)).toBe(true);
});

it('puts one quiet line in the panel, and the step itself in the dialog Show step opens', async () => {
    answering(answer(STEP));
    await renderStep();

    expect(panel()).toHaveTextContent('1 step left in the Admin');
    expect(within(panel()).queryByText('Root Category: ZZ Root DB12')).not.toBeInTheDocument();
    expect(panel().querySelector('.inline-notice')).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await press(within(panel()).getByRole('button', { name: 'Show step' }));

    // The step's title IS the dialog's title, once: no "One step in the Admin" over a second heading.
    expect(within(dialog()).getAllByText("Show ZZ Root DB12's categories on the storefront")).toHaveLength(1);
    expect(within(dialog()).queryByText('One step in the Admin')).not.toBeInTheDocument();
    expect(within(dialog()).getByLabelText('Stores > All Stores > Justrite Test Store')).toBeInTheDocument();
    expect(within(dialog()).getByText('Root Category: ZZ Root DB12')).toBeInTheDocument();
    expect(within(dialog()).getByText(/shares its root category with another store/)).toBeInTheDocument();
    expect(banner()).toHaveTextContent('Not set up');
});

it("has Open the Admin and Check in the dialog's footer", async () => {
    answering(answer(STEP), answer(STEP));
    await renderStep();
    await press(within(panel()).getByRole('button', { name: 'Show step' }));

    await press(screen.getByRole('button', { name: 'Open the Admin' }));
    expect(mockRequest).toHaveBeenCalledWith('openAdminPanel', {});
    await press(screen.getByRole('button', { name: 'Check' }));
    expect(mockRequest).toHaveBeenCalledWith('check-datapack-setup-step', { datapackName: ID.name, version: ID.version }, undefined);
});

// The banner is the only thing a Check changes, so the waiting shows there: a spinner over the
// banner's hidden words, at the same size, and the button stops taking presses (owner, 2026-10-31).
it('shows the Check running in the banner, not on the button', async () => {
    let checked: (value: HandlerResponse) => void = () => undefined;
    mockRequest.mockImplementation((type: string) => {
        if (type === 'check-datapack-setup-step') return new Promise<HandlerResponse>((resolve) => { checked = resolve; });
        return Promise.resolve(answer(STEP));
    });
    await renderStep();
    await press(within(panel()).getByRole('button', { name: 'Show step' }));

    await press(screen.getByRole('button', { name: 'Check' }));
    const status = banner().parentElement as HTMLElement;
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(within(status).getByLabelText('Checking')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Check' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toHaveAttribute('aria-busy');

    await act(async () => checked(answer(STEP)));
    expect(banner().parentElement).not.toHaveAttribute('aria-busy');
    expect(within(dialog()).queryByLabelText('Checking')).not.toBeInTheDocument();
});

// The browser takes two or three seconds to start; until the extension answers, the button
// shows a spinner rather than nothing (owner, 2026-10-31).
it('shows Open the Admin as busy until the Admin has opened', async () => {
    let opened: (value: HandlerResponse) => void = () => undefined;
    mockRequest.mockImplementation((type: string) => {
        if (type === 'openAdminPanel') return new Promise<HandlerResponse>((resolve) => { opened = resolve; });
        return Promise.resolve(answer(STEP));
    });
    await renderStep();
    await press(within(panel()).getByRole('button', { name: 'Show step' }));

    await press(screen.getByRole('button', { name: 'Open the Admin' }));
    expect(screen.getByRole('button', { name: 'Open the Admin' })).toHaveAttribute('aria-busy', 'true');

    // The extension answers once Chrome's window is likely up (`openInIncognito` waits it out).
    await act(async () => opened({ success: true }));
    expect(screen.getByRole('button', { name: 'Open the Admin' })).not.toHaveAttribute('aria-busy');
});

it('a Check that finds it done shows the check mark in the dialog, offers no Check, and leaves a check-marked line in the panel', async () => {
    answering(answer(STEP), answer(DONE));
    await renderStep();
    await press(within(panel()).getByRole('button', { name: 'Show step' }));

    await press(screen.getByRole('button', { name: 'Check' }));

    expect(banner()).toHaveTextContent('Done');
    // What the Check found, as the panel says it, not the guide's "Already set up in the store."
    expect(banner()).toHaveTextContent("The store Justrite Test Store shows ZZ Root DB12's categories.");
    expect(banner()).not.toHaveTextContent('Already set up');
    expect(screen.queryByRole('button', { name: 'Check' })).not.toBeInTheDocument();
    expect(panel()).toHaveTextContent("The store Justrite Test Store shows ZZ Root DB12's categories.");
    expect(within(panel()).queryByRole('button', { name: 'Show step' })).not.toBeInTheDocument();
    expect(panel().querySelector('.inline-notice')).toBeNull();
});

it("says Couldn't check, with what it met, when the check could not read the store", async () => {
    const met = 'Could not read the stores: Commerce answered 503';
    answering(answer(STEP), answer({ ...STEP, note: met, lastCheck: 'unknown' }));
    await renderStep();
    await press(within(panel()).getByRole('button', { name: 'Show step' }));

    await press(screen.getByRole('button', { name: 'Check' }));

    expect(banner()).toHaveTextContent("Couldn't check");
    expect(banner()).toHaveTextContent(met);
});

it("says Couldn't check in plain words when no answer comes back, never the transport text", async () => {
    answering(answer(STEP), () => {
        throw new Error('Request timeout: check-datapack-setup-step');
    });
    await renderStep();
    await press(within(panel()).getByRole('button', { name: 'Show step' }));

    await press(screen.getByRole('button', { name: 'Check' }));

    expect(banner()).toHaveTextContent("Couldn't check");
    expect(banner()).toHaveTextContent(CHECK_NO_ANSWER);
    expect(screen.queryByText(/Request timeout/)).not.toBeInTheDocument();
});

it("says Couldn't check with the handler's own sentence when it refuses", async () => {
    const refusal = 'Project uses a different Adobe organization. Use "Switch IMS Org" to continue.';
    answering(answer(STEP), { success: false, error: refusal });
    await renderStep();
    await press(within(panel()).getByRole('button', { name: 'Show step' }));

    await press(screen.getByRole('button', { name: 'Check' }));

    expect(banner()).toHaveTextContent("Couldn't check");
    expect(banner()).toHaveTextContent(refusal);
});

it("never shows another pack's step: an answer for a different pack is not this one's", async () => {
    answering(answer(STEP, { name: 'other-pack', version: 'v9' }));
    await renderStep();

    expect(panel().childElementCount).toBe(0);
});
