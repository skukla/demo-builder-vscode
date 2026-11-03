/**
 * What a refused sign-in says. A missing product profile is the account's access, which an org
 * administrator fixes, so it must not send the SC to the address setting.
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderDataInstallerFailure } from '@/features/data-installer/ui/dataInstallerFailure';
import { ErrorCode } from '@/types/errorCodes';

const refused = (message: string) => ({ message, code: ErrorCode.AUTH_FORBIDDEN });

describe('renderDataInstallerFailure, a refused sign-in', () => {
    it('names the missing product profile, and who can add it', () => {
        const message = "The Data Installer didn't accept your Adobe sign-in. find-datapacks: 401 Unauthorized — { \"error\": \"request is invalid: [ERR1201] Missing required product profiles: '1176292542' for workspace 'Stage' and app 'x'\" }";

        render(renderDataInstallerFailure(refused(message), jest.fn(), { onOpenSettings: jest.fn() }));

        expect(screen.getByText('Data Installer Access Required')).toBeInTheDocument();
        expect(screen.getByText(/product profile \(1176292542\).*Admin Console/)).toBeInTheDocument();
        expect(screen.queryByText(/address in settings/)).not.toBeInTheDocument();
        expect(screen.queryByText('Open Settings')).not.toBeInTheDocument();
    });

    it('CONTROL: any other refusal still points at the address', () => {
        render(renderDataInstallerFailure(refused('find-datapacks: 401 Unauthorized'), jest.fn(), { onOpenSettings: jest.fn() }));

        expect(screen.getByText(/address in settings/)).toBeInTheDocument();
    });
});
