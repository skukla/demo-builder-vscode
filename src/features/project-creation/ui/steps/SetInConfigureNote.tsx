/**
 * Edit's one quiet line saying a setting is changed in project configuration, with a
 * link that hands over to Configure.
 *
 * Edit leaves the Commerce settings to Configure and keeps their steps out of its
 * strip (editLocks.ts). This line is said once, under the backend cards, in place
 * of the info boxes that stood on each of those steps (owner, 2026-10-17).
 * The extension closes Edit and opens the dashboard with Configure on top, asking
 * first when this Edit has changes that leaving would throw away.
 *
 * @module features/project-creation/ui/steps/SetInConfigureNote
 */

import { Link } from '@adobe/react-spectrum';
import React from 'react';
import { PROJECT_CONFIGURATION_LINK } from './editLocks';
import { vscode } from '@/core/ui/utils/vscode-api';
import { editChangesOf } from '@/features/project-creation/ui/wizard/editChanges';
import type { WizardState } from '@/types/webview';

interface SetInConfigureNoteProps {
    /** The sentence up to the link: "... are changed in". */
    text: string;
    /** The wizard state, to tell whether leaving would throw changes away. */
    state: WizardState;
    testId: string;
}

/** Leave Edit for Configure; the extension asks first when Edit has changes. */
function openConfigure(state: WizardState): void {
    const discardsEdits = (editChangesOf(state)?.length ?? 0) > 0;
    vscode.postMessage('open-configure', { discardsEdits });
}

export function SetInConfigureNote({ text, state, testId }: SetInConfigureNoteProps): React.ReactElement {
    return (
        <p className="set-in-configure-note" data-testid={testId}>
            {text}{' '}
            <Link isQuiet onPress={() => openConfigure(state)}>
                {PROJECT_CONFIGURATION_LINK}
            </Link>
            .
        </p>
    );
}
