/**
 * Tests for getDefaultNamespace — the default-selection resolver for the
 * wizard's namespace picker.
 */

jest.mock('vscode', () => {
    const config: Record<string, string> = {};
    return {
        workspace: {
            getConfiguration: jest.fn((section: string) => ({
                get: jest.fn((key: string, defaultValue: string) => {
                    return config[`${section}.${key}`] ?? defaultValue;
                }),
            })),
            // Test-only seam to set config values
            __setConfig: (section: string, key: string, value: string) => {
                config[`${section}.${key}`] = value;
            },
            __clearConfig: () => {
                Object.keys(config).forEach(k => delete config[k]);
            },
        },
    };
});

import * as vscode from 'vscode';
import { getDefaultNamespace } from '@/features/eds/handlers/edsNamespaceResolver';

describe('getDefaultNamespace', () => {
    beforeEach(() => {
        (vscode.workspace as any).__clearConfig();
    });

    it('falls back to personal GitHub user when no setting is configured', () => {
        // Most-common case: SC hasnt set a team default, picker should
        // pre-select their personal account.
        const result = getDefaultNamespace('leahrayard', ['adobe', 'hlxsites']);
        expect(result).toBe('leahrayard');
    });

    it('returns the setting value when set and the user is a member of that org', () => {
        // Team-standardized case: admin set demoBuilder.eds.githubOrg to a
        // team org and the SC is a member. Picker pre-selects the team org.
        (vscode.workspace as any).__setConfig('demoBuilder.eds', 'githubOrg', 'demo-system-stores');
        const result = getDefaultNamespace('leahrayard', ['adobe', 'demo-system-stores', 'hlxsites']);
        expect(result).toBe('demo-system-stores');
    });

    it('falls back to personal user when setting points at an org the user is not a member of', () => {
        // Stale-setting case: setting was set before the SC was added to
        // the team org (or after they were removed). The picker should
        // still work; the SC just sees their personal as the default.
        (vscode.workspace as any).__setConfig('demoBuilder.eds', 'githubOrg', 'demo-system-stores');
        const result = getDefaultNamespace('leahrayard', ['adobe', 'hlxsites']);
        expect(result).toBe('leahrayard');
    });

    it('trims whitespace in the setting before matching', () => {
        // Defensive against a user pasting a value with leading/trailing spaces.
        (vscode.workspace as any).__setConfig('demoBuilder.eds', 'githubOrg', '  demo-system-stores  ');
        const result = getDefaultNamespace('leahrayard', ['demo-system-stores']);
        expect(result).toBe('demo-system-stores');
    });

    it('falls back to personal user when availableOrgs is empty', () => {
        // First-time DA.live SC scenario: not yet a member of any team
        // GitHub org. Picker should default to their personal account.
        const result = getDefaultNamespace('leahrayard', []);
        expect(result).toBe('leahrayard');
    });
});
