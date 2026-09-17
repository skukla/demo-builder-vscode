/**
 * The integrations surface's count line names the kinds once a system is on
 * screen ("1 integration · 1 system"), because the ERP is a card of its own
 * (linked cards plan). The mesh keeps counting as an integration, as it always
 * has here.
 *
 * Mocks and helpers live in `IntegrationsScreen.testUtils.tsx`.
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    DEPLOYED,
    IntegrationsScreen,
    captureHandlers,
    resetIntegrationsScreenMocks,
    settleStatus,
} from './IntegrationsScreen.testUtils';
import type { AppBuilderComponentState } from '@/types/base';

const SYSTEM: AppBuilderComponentState = { ...DEPLOYED, kind: 'system' };

beforeEach(() => {
    resetIntegrationsScreenMocks();
});

/** Render, then settle the status the screen waits on before it lists anything. */
function renderSettled(appBuilderComponents: Record<string, AppBuilderComponentState>): void {
    const handlers = captureHandlers();
    render(<IntegrationsScreen hasAdobeContext appBuilderComponents={appBuilderComponents} />);
    settleStatus(handlers);
}

const countText = () => screen.getByTestId('count-text').textContent;

describe('IntegrationsScreen — the count line', () => {
    it('names both kinds, each with its own number', () => {
        renderSettled({ 'erp-integration': { ...DEPLOYED }, 'demo-erp': SYSTEM });

        expect(countText()).toBe('1 integration · 1 system');
    });

    it('counts integrations alone when the project has no system', () => {
        renderSettled({ a: { ...DEPLOYED }, b: { ...DEPLOYED } });

        expect(countText()).toBe('2 integrations');
    });

    it('says none at all for an empty project', () => {
        renderSettled({});

        expect(countText()).toBe('0 integrations');
    });
});
