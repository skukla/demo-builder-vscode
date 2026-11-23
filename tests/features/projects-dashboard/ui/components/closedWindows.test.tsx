/**
 * Closed, the batch window and the Updates window open no dialog at all (step-07 Win1 regression,
 * found by the visual baseline 2026-11-14): Spectrum's DialogContainer is open whenever its child is
 * an element, even one that renders nothing, and an open container draws a full-screen underlay.
 * Both windows are always mounted on the projects list (the batch window on the project dashboard
 * too), so a container left holding an element dimmed the whole page at rest.
 *
 * Read from `document.body`, not the render container: the real underlay is portalled.
 */

// FIRST: the shared webview client double; its jest.mock must register before the hook binds.
import '../../../../helpers/webviewClientMock';
import { render } from '@testing-library/react';
import React from 'react';
import { ProjectsBatchModal } from '@/features/projects-dashboard/ui/components/ProjectsBatchModal';
import { UpdatesModal } from '@/features/projects-dashboard/ui/components/UpdatesModal';
import { useProjectsBatch } from '@/features/projects-dashboard/ui/hooks/useProjectsBatch';
import type { UpdatesModalControls } from '@/features/projects-dashboard/ui/hooks/useUpdatesModal';

const underlay = (): Element | null => document.body.querySelector('[data-testid="spectrum-underlay"]');
const dialog = (): Element | null => document.body.querySelector('[role="dialog"]');

/** The batch window as the projects list mounts it: the real hook, nothing started. */
function AtRest(): React.ReactElement {
    const controls = useProjectsBatch(jest.fn());
    return <ProjectsBatchModal controls={controls} />;
}

const CLOSED_UPDATES: UpdatesModalControls = {
    view: { phase: 'closed' },
    ticked: new Set(),
    toggle: jest.fn(),
    toggleGroup: jest.fn(),
    apply: jest.fn(),
    close: jest.fn(),
    statuses: {},
    progress: null,
    answer: jest.fn(),
    onTyped: jest.fn(),
    remaining: 0,
    back: jest.fn(),
    rechecking: false,
    rowFix: { fixes: {}, retry: jest.fn(), fixWithAi: jest.fn(), checkAgain: jest.fn() },
};

describe('closed windows open no dialog', () => {
    it('the batch window, closed, draws no dialog and no underlay', () => {
        render(<AtRest />);

        expect(document.body.querySelector('[data-testid="spectrum-dialog-container"]')).not.toBeNull();
        expect(dialog()).toBeNull();
        expect(underlay()).toBeNull();
    });

    it('the Updates window, closed, draws no dialog and no underlay', () => {
        render(<UpdatesModal controls={CLOSED_UPDATES} />);

        expect(document.body.querySelector('[data-testid="spectrum-dialog-container"]')).not.toBeNull();
        expect(dialog()).toBeNull();
        expect(underlay()).toBeNull();
    });

    it('CONTROL: an open Updates list draws the underlay', () => {
        render(<UpdatesModal controls={{ ...CLOSED_UPDATES, view: { phase: 'list', rows: [] } }} />);

        expect(underlay()).not.toBeNull();
    });
});
