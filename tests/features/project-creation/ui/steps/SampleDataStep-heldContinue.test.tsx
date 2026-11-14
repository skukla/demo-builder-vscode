/**
 * SampleDataStep — why Continue is held, said where it is held (owner, 2026-11-14).
 *
 * A chosen datapack with no website and store view for the backend holds Continue, because the
 * build would skip its install (`datapackGate.ts`). The step stays open so the SC can change or
 * remove the pick, and the reason sits on the step as one notice line, the way the Integrations
 * area says why its Continue is held (AB-78).
 */

import { screen, fireEvent } from '@testing-library/react';

import { renderStep, resetDataInstallerMocks } from './SampleDataStep.testUtils';
import type { WizardState } from '@/types/webview';

beforeEach(resetDataInstallerMocks);

const PAAS = 'adobe-commerce-paas';
const PACK = { name: 'bodea', version: 'main', store: 'library' as const };
const VIEW_ONLY: WizardState['componentConfigs'] = {
    [PAAS]: { ADOBE_COMMERCE_STORE_VIEW_CODE: 'default' },
};
const BOTH: WizardState['componentConfigs'] = {
    [PAAS]: { ADOBE_COMMERCE_WEBSITE_CODE: 'base', ADOBE_COMMERCE_STORE_VIEW_CODE: 'default' },
};

describe('SampleDataStep — a held Continue', () => {
    it('says why Continue is held when the chosen datapack has no website and store view', async () => {
        renderStep({ selectedBackend: PAAS, datapack: PACK, componentConfigs: VIEW_ONLY });

        await screen.findAllByTestId('datapack-card');
        expect(screen.getByTestId('datapack-held')).toHaveTextContent(
            'Choose a website and store view first'
        );
    });

    it('points to Configure in Edit', async () => {
        renderStep({
            wizardMode: 'edit',
            selectedBackend: PAAS,
            datapack: PACK,
            componentConfigs: VIEW_ONLY,
        });

        await screen.findAllByTestId('datapack-card');
        expect(screen.getByTestId('datapack-held')).toHaveTextContent(
            'Set the website and store view in Configure first.'
        );
    });

    it('still lets the SC remove the pick while Continue is held', async () => {
        const { updateState } = renderStep({
            selectedBackend: PAAS,
            datapack: PACK,
            componentConfigs: VIEW_ONLY,
        });

        fireEvent.click(await screen.findByRole('radio', { name: /none/i }));
        expect(updateState).toHaveBeenCalledWith({ datapack: undefined });
    });

    it('says nothing when both codes are set', async () => {
        renderStep({ selectedBackend: PAAS, datapack: PACK, componentConfigs: BOTH });

        await screen.findAllByTestId('datapack-card');
        expect(screen.queryByTestId('datapack-held')).not.toBeInTheDocument();
    });

    it('says nothing with no datapack chosen', async () => {
        renderStep({ selectedBackend: PAAS, componentConfigs: VIEW_ONLY });

        await screen.findAllByTestId('datapack-card');
        expect(screen.queryByTestId('datapack-held')).not.toBeInTheDocument();
    });
});
