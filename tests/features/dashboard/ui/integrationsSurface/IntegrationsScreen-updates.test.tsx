/**
 * The integrations surface asks which integrations have newer code, once per
 * visit (AB-13, step 5). The answer comes back as a components snapshot.
 *
 * Mocks and helpers live in `IntegrationsScreen.testUtils.tsx`.
 */

import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    DEPLOYED,
    IntegrationsScreen,
    captureHandlers,
    getClient,
    resetIntegrationsScreenMocks,
    settleStatus,
} from './IntegrationsScreen.testUtils';

beforeEach(() => {
    resetIntegrationsScreenMocks();
});

const checks = () =>
    getClient().postMessage.mock.calls.filter(([type]: [string]) => type === 'checkIntegrationUpdates');

describe('IntegrationsScreen — update check', () => {
    it('asks for the check when it opens', () => {
        render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);

        expect(checks()).toHaveLength(1);
    });

    it('asks once, not again on every status push', () => {
        const handlers = captureHandlers();
        const { rerender } = render(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED }} />);
        settleStatus(handlers);
        rerender(<IntegrationsScreen hasAdobeContext appBuilderComponents={{ a: DEPLOYED, b: DEPLOYED }} />);

        expect(checks()).toHaveLength(1);
    });
});
