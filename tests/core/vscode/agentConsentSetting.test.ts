import * as vscode from 'vscode';
import { agentConsentRequired } from '@/core/vscode/agentConsentSetting';

const getConfig = vscode.workspace.getConfiguration as jest.Mock;

function settingIs(value: unknown): jest.Mock {
    const get = jest.fn((_key: string, fallback: unknown) => (value === undefined ? fallback : value));
    getConfig.mockReturnValue({ get });
    return get;
}

/** demoBuilder.ai.requireAgentConsent, read live: on unless the SC turned it off. */
describe('agentConsentRequired', () => {
    it('reads the setting under demoBuilder, defaulting to on', () => {
        const get = settingIs(undefined);

        expect(agentConsentRequired()).toBe(true);
        expect(getConfig).toHaveBeenCalledWith('demoBuilder');
        expect(get).toHaveBeenCalledWith('ai.requireAgentConsent', true);
    });

    it('is off only when the SC turned it off', () => {
        settingIs(false);
        expect(agentConsentRequired()).toBe(false);

        settingIs(true);
        expect(agentConsentRequired()).toBe(true);
    });
});
