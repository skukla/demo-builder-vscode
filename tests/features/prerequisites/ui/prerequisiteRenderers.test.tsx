import React from 'react';
import { render } from '@testing-library/react';
import { renderPrerequisiteMessage, shouldShowPluginDetails } from '@/features/prerequisites/ui/steps/hooks/prerequisiteRenderers';
import type { PrerequisiteCheck } from '@/types/webview';

/**
 * Prerequisites UI - Renderer Tests
 *
 * Regression tests for prerequisite message rendering,
 * especially edge cases around empty nodeVersionStatus arrays.
 */

// Minimal check factory for testing
function makeCheck(overrides: Partial<PrerequisiteCheck> = {}): PrerequisiteCheck {
    return {
        name: 'Adobe I/O CLI',
        description: 'CLI for Adobe services',
        status: 'success',
        ...overrides,
    };
}

describe('renderPrerequisiteMessage', () => {
    it('should render version items when nodeVersionStatus has entries', () => {
        const check = makeCheck({
            nodeVersionStatus: [
                { version: 'Node 20', component: '@adobe/aio-cli', installed: true },
            ],
        });

        const result = render(<>{renderPrerequisiteMessage(check)}</>);
        expect(result.container.textContent).toContain('Node 20');
        expect(result.container.textContent).toContain('@adobe/aio-cli');
    });

    it('should not render blank content when nodeVersionStatus is empty array', () => {
        // Regression: empty [] is truthy, was rendering empty <View> (blank line)
        const check = makeCheck({
            nodeVersionStatus: [],
            plugins: [{ id: 'api-mesh', name: 'API Mesh Plugin', installed: true }],
        });

        const result = renderPrerequisiteMessage(check);
        expect(result).toBeNull();
    });

    it('should not render blank content when nodeVersionStatus is undefined', () => {
        const check = makeCheck({
            nodeVersionStatus: undefined,
            plugins: [{ id: 'api-mesh', name: 'API Mesh Plugin', installed: true }],
        });

        const result = renderPrerequisiteMessage(check);
        expect(result).toBeNull();
    });

    it('should show message for error status without plugins', () => {
        const check = makeCheck({
            status: 'error',
            message: 'Not installed',
            nodeVersionStatus: undefined,
        });

        const result = render(<>{renderPrerequisiteMessage(check)}</>);
        expect(result.container.textContent).toContain('Not installed');
    });
});

describe('shouldShowPluginDetails', () => {
    it('should show plugins when nodeVersionStatus is empty array', () => {
        // Empty array means no version info, but plugins should still show
        expect(shouldShowPluginDetails('success', [])).toBe(true);
    });

    it('should show plugins when nodeVersionStatus is undefined', () => {
        expect(shouldShowPluginDetails('success', undefined)).toBe(true);
    });

    it('should show plugins when all versions are installed', () => {
        const versions = [{ version: 'Node 20', component: 'mesh', installed: true }];
        expect(shouldShowPluginDetails('success', versions)).toBe(true);
    });

    it('should hide plugins when any version is not installed', () => {
        const versions = [
            { version: 'Node 20', component: 'mesh', installed: true },
            { version: 'Node 24', component: 'headless', installed: false },
        ];
        expect(shouldShowPluginDetails('success', versions)).toBe(false);
    });

    it('should hide plugins for pending status', () => {
        expect(shouldShowPluginDetails('pending', undefined)).toBe(false);
    });
});
