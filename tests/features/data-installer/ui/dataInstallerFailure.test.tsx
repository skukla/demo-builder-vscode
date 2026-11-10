/**
 * What a failure says, and whether it offers settings. A refused sign-in points at the Data Installer's
 * address, unless the surface speaks for the one list (`unreachableTitle`): that failure is the datapack
 * store's, so advice about the Data Installer would send the SC to the wrong setting.
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderDataInstallerFailure } from '@/features/data-installer/ui/dataInstallerFailure';
import { ErrorCode } from '@/types/errorCodes';

const refused = (message: string) => ({ message, code: ErrorCode.AUTH_FORBIDDEN });
const unconfigured = (message: string) => ({ message, code: ErrorCode.INVALID_OPERATION });
const TITLE = "Datapacks Aren't Available";

describe('renderDataInstallerFailure, a surface about the Data Installer', () => {
    it('points a refused sign-in at the address', () => {
        render(renderDataInstallerFailure(refused('find-datapacks: 401 Unauthorized'), jest.fn(), { onOpenSettings: jest.fn() }));

        expect(screen.getByText('Data Installer Sign-In Failed')).toBeInTheDocument();
        expect(screen.getByText(/address in settings/)).toBeInTheDocument();
        expect(screen.getByText('Open Settings')).toBeInTheDocument();
    });

    it('says a missing address is set in Settings, with no raw setting key', () => {
        render(renderDataInstallerFailure(unconfigured('No address.'), jest.fn(), { onOpenSettings: jest.fn() }));

        expect(screen.getByText('Data Installer Not Set Up')).toBeInTheDocument();
        expect(screen.getByText("Set the Data Installer's address in Settings.")).toBeInTheDocument();
    });
});

describe('renderDataInstallerFailure, the one list', () => {
    it.each([
        ['a refused sign-in', refused('The store refused the sign-in.')],
        ['an unusable address', unconfigured('The store has no usable address.')],
        ['anything else', { message: 'The store is down.', code: ErrorCode.UNKNOWN }],
    ])('titles %s as datapacks being unavailable, with its own message and no Data Installer advice', (_name, failure) => {
        render(renderDataInstallerFailure(failure, jest.fn(), { unreachableTitle: TITLE }));

        expect(screen.getByText(TITLE)).toBeInTheDocument();
        expect(screen.getByText(failure.message)).toBeInTheDocument();
        expect(screen.queryByText(/Data Installer/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('still offers the sign-in, the one failure an SC can fix from here', () => {
        render(renderDataInstallerFailure({ message: 'Sign in.', code: ErrorCode.AUTH_REQUIRED }, jest.fn(), { unreachableTitle: TITLE }));

        expect(screen.getByRole('button', { name: 'Sign In with Adobe' })).toBeInTheDocument();
    });
});
