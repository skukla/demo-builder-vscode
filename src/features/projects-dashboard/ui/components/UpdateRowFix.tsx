/**
 * The button on an update that did not apply, once the run has ended (owner, 2026-11-19): fixed in
 * place, as the Prerequisites step puts Install beside a missing tool, in the same compact button.
 * Retry runs that update again in the window; once retrying has not helped it is Fix with AI (the
 * Data Installer's rule, `failedButtonLabel`), which opens the SC's AI on it; then Check Again, as
 * Prerequisites' Recheck, asks whether it is still waiting.
 *
 * @module features/projects-dashboard/ui/components/UpdateRowFix
 */

import { Button } from '@adobe/react-spectrum';
import React from 'react';
import type { RowFix, RowFixControls } from '../hooks/useUpdatesModal';
import { FIX_WITH_AI, failedButtonLabel } from '@/core/utils/fixWithAi';

const CHECK_AGAIN = 'Check Again';
const NO_FIX: RowFix = { retries: 0, withAi: false, checking: false };

/** What the row says in place of why it failed, while the SC's AI has it. */
export const AI_HAS_IT = 'Your AI assistant is working on it.';

/** The row's fix so far. */
export function fixOf(controls: RowFixControls, id: string): RowFix {
    return controls.fixes[id] ?? NO_FIX;
}

/** The one button: Retry, Fix with AI, or Check Again. */
export function UpdateRowFix({
    id,
    controls,
}: {
    id: string;
    controls: RowFixControls;
}): React.ReactElement {
    const fix = fixOf(controls, id);
    const label = fix.withAi ? CHECK_AGAIN : failedButtonLabel(fix.retries);
    const onPress = (): void => {
        if (fix.withAi) controls.checkAgain(id);
        else if (label === FIX_WITH_AI) controls.fixWithAi(id);
        else controls.retry(id);
    };
    return (
        <Button
            variant="secondary"
            onPress={onPress}
            isPending={fix.checking}
            UNSAFE_className="btn-compact min-w-100"
        >
            {label}
        </Button>
    );
}
