/**
 * prerequisiteRenderers — decision coverage (PL-22): the icon and progress helpers.
 *
 * Every branch of each pure helper, asserted on the markup it actually produces. The
 * Spectrum icon mock collapses all workflow icons to one element, so the thing that
 * distinguishes them here is the class each call site asks for — which is also the only
 * thing a reader of the screen can tell apart.
 */

import {
    getProgressValue,
    getStatusIcon,
    renderPluginStatusIcon,
    shouldShowPluginDetails,
} from '@/features/prerequisites/ui/steps/hooks/prerequisiteRenderers';
import type { PrerequisiteCheck, UnifiedProgress } from '@/types/webview';
import { html as markup } from './prerequisiteRenderers.testUtils';

function progress(over: Partial<UnifiedProgress['overall']>, command?: UnifiedProgress['command']): UnifiedProgress {
    return {
        overall: { percent: 10, currentStep: 1, totalSteps: 1, stepName: 'Installing', ...over },
        command,
    };
}

describe('getStatusIcon', () => {
    it('marks success with the green tick', () => {
        expect(markup(getStatusIcon('success'))).toContain('class="text-green-600"');
    });

    it('marks error with the red cross', () => {
        expect(markup(getStatusIcon('error'))).toContain('class="text-red-600"');
    });

    it('marks warning with the yellow alert', () => {
        expect(markup(getStatusIcon('warning'))).toContain('class="text-yellow-600"');
    });

    it('shows a spinner, not an icon, while a check is running', () => {
        const html = markup(getStatusIcon('checking'));
        expect(html).toContain('role="progressbar"');
        expect(html).not.toContain('text-');
    });

    it('shows an unstyled pending icon for a check that has not started', () => {
        const html = markup(getStatusIcon('pending'));
        expect(html).toContain('<svg');
        expect(html).not.toContain('class=');
        expect(html).not.toContain('role="progressbar"');
    });

    it('falls back to a bare placeholder for a status it does not know', () => {
        expect(markup(getStatusIcon('nonsense' as PrerequisiteCheck['status'])))
            .toBe('<div class="placeholder-icon"></div>');
    });

    it('gives every status its own icon', () => {
        const statuses: PrerequisiteCheck['status'][] = ['success', 'error', 'warning', 'checking', 'pending'];
        const rendered = statuses.map((s) => markup(getStatusIcon(s)));
        expect(new Set(rendered).size).toBe(statuses.length);
    });
});

describe('renderPluginStatusIcon', () => {
    it('shows pending while the check is running and the plugin verdict has not arrived', () => {
        const html = markup(renderPluginStatusIcon('checking', undefined));
        expect(html).not.toContain('class=');
        expect(html).toContain('data-size="XS"');
    });

    it('shows the green tick once a running check reports the plugin installed', () => {
        expect(markup(renderPluginStatusIcon('checking', true))).toContain('class="text-green-600"');
    });

    it('shows the red cross once a running check reports the plugin missing', () => {
        expect(markup(renderPluginStatusIcon('checking', false))).toContain('class="text-red-600"');
    });

    it('shows the red cross for an unknown verdict once the check is no longer running', () => {
        expect(markup(renderPluginStatusIcon('success', undefined))).toContain('class="text-red-600"');
    });

    it('shows the green tick for an installed plugin on a finished check', () => {
        expect(markup(renderPluginStatusIcon('success', true))).toContain('class="text-green-600"');
    });

    it('shows the red cross for a missing plugin on a failed check', () => {
        expect(markup(renderPluginStatusIcon('error', false))).toContain('class="text-red-600"');
    });
});

describe('getProgressValue', () => {
    it('reports overall progress whenever the operation has more than one step', () => {
        expect(getProgressValue(progress({ percent: 40, totalSteps: 3 }, {
            type: 'determinate', percent: 90, confidence: 'exact',
        }))).toBe(40);
    });

    it('reports the command’s own progress for a single-step determinate operation', () => {
        expect(getProgressValue(progress({ percent: 10, totalSteps: 1 }, {
            type: 'determinate', percent: 73, confidence: 'exact',
        }))).toBe(73);
    });

    it('reports a command percent of zero rather than falling back to overall', () => {
        expect(getProgressValue(progress({ percent: 10, totalSteps: 1 }, {
            type: 'determinate', percent: 0, confidence: 'exact',
        }))).toBe(0);
    });

    it('falls back to overall when a determinate command has no percent yet', () => {
        expect(getProgressValue(progress({ percent: 10, totalSteps: 1 }, {
            type: 'determinate', confidence: 'exact',
        }))).toBe(10);
    });

    it('falls back to overall for an indeterminate command, percent or no percent', () => {
        expect(getProgressValue(progress({ percent: 10, totalSteps: 1 }, {
            type: 'indeterminate', percent: 73, confidence: 'estimated',
        }))).toBe(10);
    });

    it('falls back to overall when there is no command at all', () => {
        expect(getProgressValue(progress({ percent: 10, totalSteps: 1 }))).toBe(10);
    });

    it('falls back to overall for a zero-step operation', () => {
        expect(getProgressValue(progress({ percent: 10, totalSteps: 0 }))).toBe(10);
    });
});

describe('shouldShowPluginDetails', () => {
    const installed = [{ version: 'Node 20', component: 'mesh', installed: true }];
    const mixed = [
        { version: 'Node 20', component: 'mesh', installed: true },
        { version: 'Node 22', component: 'headless', installed: false },
    ];

    it('shows plugin detail while a check is running', () => {
        expect(shouldShowPluginDetails('checking', undefined)).toBe(true);
    });

    it('shows plugin detail for a successful check', () => {
        expect(shouldShowPluginDetails('success', undefined)).toBe(true);
    });

    it('shows plugin detail for a failed check', () => {
        expect(shouldShowPluginDetails('error', undefined)).toBe(true);
    });

    it('hides plugin detail for a check that has not started', () => {
        expect(shouldShowPluginDetails('pending', undefined)).toBe(false);
    });

    it('hides plugin detail for a warning', () => {
        expect(shouldShowPluginDetails('warning', undefined)).toBe(false);
    });

    it('hides plugin detail for a warning even when every version has the tool', () => {
        expect(shouldShowPluginDetails('warning', installed)).toBe(false);
    });

    it('shows plugin detail when every listed Node version has the tool', () => {
        expect(shouldShowPluginDetails('success', installed)).toBe(true);
    });

    it('shows plugin detail when the version list is empty', () => {
        expect(shouldShowPluginDetails('success', [])).toBe(true);
    });

    it('hides plugin detail while any Node version is still missing the tool', () => {
        expect(shouldShowPluginDetails('success', mixed)).toBe(false);
    });

    it('hides plugin detail when no Node version has the tool', () => {
        expect(shouldShowPluginDetails('error', [
            { version: 'Node 20', component: '', installed: false },
        ])).toBe(false);
    });
});
