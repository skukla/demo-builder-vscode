/**
 * The bound system's flyout section, rendered against the REAL Spectrum components.
 *
 * Every other suite on this surface mocks `@adobe/react-spectrum`, and that is why a
 * crash reached a live window: `<Link isQuiet>Open {name}</Link>` passes TWO children,
 * Spectrum's Link without an `href` calls `React.Children.only`, and the throw took the
 * whole integrations surface down to a blank panel (2026-09-16). A mocked Link accepts
 * anything, so the suites stayed green.
 *
 * This file therefore mocks NOTHING from Spectrum. It is small on purpose: its job is to
 * prove the section mounts for real, not to re-test the section's logic.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { SystemSection } from '@/features/dashboard/ui/components/integrations/SystemSection';
import type { IntegrationCardModel } from '@/core/ui/components/integrations/integrationCardModel.types';

/** An integration card carrying its bound system, as the ERP pair produces. */
const MODEL = {
    id: 'erp-integration',
    name: 'ERP integration',
    status: 'deployed',
    system: {
        name: 'Nordwind',
        status: 'deployed',
        statusLabel: 'Deployed',
        dotVariant: 'positive',
        url: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/admin',
        lastDeployed: '2026-09-16',
    },
} as unknown as IntegrationCardModel;

describe('SystemSection against real Spectrum', () => {
    it('mounts, and the screen link is one child', () => {
        render(<SystemSection model={MODEL} onAction={jest.fn()} />);

        expect(screen.getByText('Open Nordwind')).toBeInTheDocument();
    });

    it('mounts for a system with no screen URL', () => {
        const noUrl = { ...MODEL, system: { ...MODEL.system, url: undefined } } as IntegrationCardModel;

        render(<SystemSection model={noUrl} onAction={jest.fn()} />);

        expect(screen.getByText('Nordwind')).toBeInTheDocument();
    });
});
