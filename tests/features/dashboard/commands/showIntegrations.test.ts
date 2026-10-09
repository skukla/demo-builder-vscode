/**
 * ShowIntegrationsCommand — the page it opens.
 *
 * The first suite for this command (PL-69, 2026-10-09): its page HTML moved to
 * BundledPanelCommand, so what is left to pin here is what the command itself
 * names — the integrations bundle, the "Integrations" title, and no local-media
 * base URI (it never had one).
 */

import { ShowIntegrationsCommand } from '@/features/dashboard/commands/showIntegrations';
import type { StateManager } from '@/types/state';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';

type Internals = {
    panel: ReturnType<typeof createMockWebviewPanel> | undefined;
    getWebviewContent(): Promise<string>;
};

it('opens the integrations bundle, titled Integrations, with no local-media base URI', async () => {
    const command = new ShowIntegrationsCommand(
        createMockExtensionContext(),
        createMockStateManager() as unknown as StateManager,
        createMockLogger(),
    ) as unknown as Internals;
    const panel = createMockWebviewPanel();
    command.panel = panel;

    const html = await command.getWebviewContent();

    expect(html).toContain('integrations-bundle.js');
    expect(html).toContain('<title>Integrations</title>');
    expect(panel.webview.asWebviewUri).toHaveBeenCalledTimes(1);
});
