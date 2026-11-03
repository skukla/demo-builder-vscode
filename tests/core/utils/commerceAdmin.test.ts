/**
 * Which Commerce Admin a project opens: its own choice, else the setting, else the Unified Shell.
 * The Unified Shell's address needs the organization's short name, so with none it is the classic one.
 */

import * as vscode from 'vscode';
import { openInDefaultBrowser, openInIncognito, openPrivateBrowser } from '@/core/utils/browserUtils';
import { openCommerceAdmin, resolveAdminExperience, resolveAdminPanelUrl } from '@/core/utils/commerceAdmin';
import type { Project } from '@/types/base';
import { createMockProject } from '../../helpers/projectFake';

jest.mock('@/core/utils/browserUtils', () => ({
    openInDefaultBrowser: jest.fn().mockResolvedValue(undefined),
    openInIncognito: jest.fn().mockResolvedValue(true),
    openPrivateBrowser: jest.fn().mockResolvedValue(true),
}));

const UNIFIED = 'https://experience.adobe.com/#/@acme/in:tenant123/commerce/cloud-service/admin';
const CLASSIC = 'https://na1-sandbox.admin.commerce.adobe.com/tenant123/admin/admin/dashboard/';

const project = (choice?: Project['commerceAdminExperience']): Project => createMockProject({
    componentConfigs: { headless: { ACCS_GRAPHQL_ENDPOINT: 'https://na1-sandbox.api.commerce.adobe.com/tenant123/graphql' } },
    ...(choice ? { commerceAdminExperience: choice } : {}),
});

function settings(values: { adminExperience?: string; IMSOrgId?: string }): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockImplementation(() => ({
        get: (key: 'adminExperience' | 'IMSOrgId') => values[key],
    }));
}

describe('resolveAdminExperience', () => {
    it('is the Unified Shell when nothing has chosen', () => {
        settings({});
        expect(resolveAdminExperience(project())).toBe('unified-shell');
    });

    it('follows the setting, and the project over the setting', () => {
        settings({ adminExperience: 'classic' });
        expect(resolveAdminExperience(project())).toBe('classic');
        expect(resolveAdminExperience(project('unified-shell'))).toBe('unified-shell');
    });

    it('treats a value it does not know as the default', () => {
        settings({ adminExperience: 'garbage' });
        expect(resolveAdminExperience(project())).toBe('unified-shell');
    });
});

describe('resolveAdminPanelUrl', () => {
    it('opens the Unified Shell by default', () => {
        settings({ IMSOrgId: 'acme' });
        expect(resolveAdminPanelUrl(project())).toBe(UNIFIED);
    });

    it('opens the classic Admin when that is the choice', () => {
        settings({ IMSOrgId: 'acme' });
        expect(resolveAdminPanelUrl(project('classic'))).toBe(CLASSIC);
    });

    it.each([undefined, '', '  '])('opens the classic Admin with no organization to address (%p)', (IMSOrgId) => {
        settings({ IMSOrgId });
        expect(resolveAdminPanelUrl(project())).toBe(CLASSIC);
    });
});

describe('openCommerceAdmin', () => {
    beforeEach(() => jest.clearAllMocks());

    it('opens the Unified Shell in the SC\'s own browser', async () => {
        settings({ IMSOrgId: 'acme' });

        await expect(openCommerceAdmin(project())).resolves.toEqual({ outcome: 'opened' });

        expect(openInDefaultBrowser).toHaveBeenCalledWith(UNIFIED);
        expect(openInIncognito).not.toHaveBeenCalled();
    });

    it('opens Classic UI in a private window', async () => {
        settings({ IMSOrgId: 'acme' });

        await openCommerceAdmin(project('classic'));

        expect(openInIncognito).toHaveBeenCalledWith(CLASSIC);
        expect(openInDefaultBrowser).not.toHaveBeenCalled();
    });

    it('shows the notification for Classic UI when asked', async () => {
        settings({ IMSOrgId: 'acme' });

        await openCommerceAdmin(project('classic'), { notify: true });

        expect(openPrivateBrowser).toHaveBeenCalledWith(CLASSIC);
    });
});
