/**
 * What a failure says, and whether it offers settings. A failure whose message sends the SC to a
 * setting carries that setting's id and gets an Open Settings button that opens it (owner rule,
 * release test 1.4, 2026-11-16). The surface that speaks for the one list (`unreachableTitle`)
 * names datapacks, never the Data Installer: that failure is the datapack store's.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { renderDataInstallerFailure } from '@/features/data-installer/ui/dataInstallerFailure';
import { ErrorCode } from '@/types/errorCodes';
import { plain, plainFailure } from '@/features/data-installer/plainFailure';

jest.mock('@/core/ui/utils/WebviewClient', () => ({ webviewClient: { postMessage: jest.fn() } }));

const ADDRESS = 'demoBuilder.dataInstaller.apiBaseUrl';
const refused = (message: string, setting?: string) => ({ message: plainFailure(message), code: ErrorCode.AUTH_FORBIDDEN, ...(setting ? { setting } : {}) });
const unconfigured = (message: string, setting?: string) => ({ message: plainFailure(message), code: ErrorCode.INVALID_OPERATION, ...(setting ? { setting } : {}) });
const TITLE = "Datapacks Aren't Available";

describe('renderDataInstallerFailure, a surface about datapacks', () => {
    beforeEach(() => jest.clearAllMocks());

    it('shows a refused sign-in in its own words, with Open Settings opening the setting it names', () => {
        render(renderDataInstallerFailure(refused('Its address in Settings may be wrong.', ADDRESS), jest.fn()));

        expect(screen.getByText('Sign-In Not Accepted')).toBeInTheDocument();
        expect(screen.getByText('Its address in Settings may be wrong.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
        expect(webviewClient.postMessage).toHaveBeenCalledWith('open-setting', { setting: ADDRESS });
    });

    it('offers no Open Settings for a refusal that names no setting, and no Data Installer advice', () => {
        render(renderDataInstallerFailure(refused("The datapack library didn't accept your Adobe sign-in."), jest.fn()));

        expect(screen.queryByRole('button', { name: 'Open Settings' })).not.toBeInTheDocument();
        expect(screen.queryByText(/Data Installer/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('opens the missing setting from a not-set-up failure', () => {
        render(renderDataInstallerFailure(unconfigured('No Data Installer address is set. Set it in Settings.', ADDRESS), jest.fn()));

        expect(screen.getByText('Datapacks Not Set Up')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
        expect(webviewClient.postMessage).toHaveBeenCalledWith('open-setting', { setting: ADDRESS });
    });
});

describe('renderDataInstallerFailure, the one list', () => {
    it.each([
        ['a refused sign-in', refused('The store refused the sign-in.')],
        ['an unusable address', unconfigured('The store has no usable address.')],
        ['anything else', { message: plain('The store is down.'), code: ErrorCode.UNKNOWN }],
    ])('titles %s as datapacks being unavailable, with its own message and no Data Installer advice', (_name, failure) => {
        render(renderDataInstallerFailure(failure, jest.fn(), { unreachableTitle: TITLE }));

        expect(screen.getByText(TITLE)).toBeInTheDocument();
        expect(screen.getByText(failure.message)).toBeInTheDocument();
        expect(screen.queryByText(/Data Installer/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('still offers the sign-in, the one failure an SC can fix from here', () => {
        render(renderDataInstallerFailure({ message: plain('Sign in.'), code: ErrorCode.AUTH_REQUIRED }, jest.fn(), { unreachableTitle: TITLE }));

        expect(screen.getByRole('button', { name: 'Sign In with Adobe' })).toBeInTheDocument();
    });
});
