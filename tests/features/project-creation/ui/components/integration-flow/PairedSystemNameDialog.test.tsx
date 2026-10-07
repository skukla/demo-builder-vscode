/**
 * PairedSystemNameDialog — the wizard's Settings for the ERP integration: its ERP's
 * name, before the project is created.
 *
 * The real Modal over the shared Spectrum mock. Asserted: the field opens on the
 * current name, Save hands back the name by the add's rule ("ERP" added), and an
 * unchanged or blank name cannot be saved.
 */

import '@testing-library/jest-dom';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import {
    PairedSystemNameDialog,
    type PairedSystemNameTarget,
} from '@/features/project-creation/ui/components/integration-flow/PairedSystemNameDialog';
import { NAME_IS_FIXED } from '@/features/project-creation/ui/components/integration-flow/stages/CatalogStage';

const TARGET: PairedSystemNameTarget = {
    id: 'erp-integration',
    integrationName: 'ERP Integration',
    systemName: 'Acme ERP',
    systemWord: 'ERP',
};

function renderDialog(target: PairedSystemNameTarget | null = TARGET) {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <PairedSystemNameDialog target={target} onClose={onClose} onSave={onSave} />
        </Provider>,
    );
    return { onSave, onClose };
}

const field = () => screen.getByLabelText(/^ERP name/);
const save = () => screen.getByRole('button', { name: /^save$/i });

describe('PairedSystemNameDialog', () => {
    it('opens on the ERP\'s current name, under the integration\'s title', () => {
        renderDialog();
        expect(screen.getByText('ERP Integration settings')).toBeInTheDocument();
        expect(field()).toHaveValue('Acme ERP');
        expect(screen.getByText(NAME_IS_FIXED)).toBeInTheDocument();
    });

    it('saves the typed name by the add\'s rule, then closes', () => {
        const { onSave, onClose } = renderDialog();
        fireEvent.change(field(), { target: { value: 'Justrite' } });
        fireEvent.click(save());
        expect(onSave).toHaveBeenCalledWith('erp-integration', 'Justrite ERP');
        expect(onClose).toHaveBeenCalled();
    });

    it('will not save an unchanged name', () => {
        const { onSave } = renderDialog();
        fireEvent.change(field(), { target: { value: 'Acme erp' } });
        fireEvent.click(save());
        expect(onSave).not.toHaveBeenCalled();
    });

    it('will not save a blank name, and says why', () => {
        const { onSave } = renderDialog();
        fireEvent.change(field(), { target: { value: '  ' } });
        fireEvent.click(save());
        expect(onSave).not.toHaveBeenCalled();
        expect(screen.getByText(/Name the ERP/)).toBeInTheDocument();
    });

    it('renders nothing while closed', () => {
        renderDialog(null);
        expect(screen.queryByLabelText(/^ERP name/)).not.toBeInTheDocument();
    });
});
