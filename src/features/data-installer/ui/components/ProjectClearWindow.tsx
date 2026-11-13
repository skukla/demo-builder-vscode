/**
 * "Clear <Project> Demo Data?" (datapack-engine step 10; datapack-simplification step 06, C2b), as
 * J1 walked it (`mockups/flow/j1-windows.tsx`): no picker; the lead names every website the project
 * uses, the summary is the type table (`JobSummaryWindow`, the install's), and Review Records opens
 * the spot check with Removed and Kept tabs (`RecordsWindow`). The red "Clear N Items" (rule 20)
 * hands the shown list's token to the screen, which runs the clearing in its progress window;
 * nothing is cleared until it is pressed.
 *
 * The check's warning (another local project uses these websites, P6-Q2) and the project's datapack
 * line are house notices under the table, as J1's instance window places its warning. A type the
 * check could not read reads "Couldn't be read" on its row and is split by kind (P6-Q3, reuse only):
 * slow is the problem line with Retry, then Fix with AI (`failedButtonLabel`), and Clear waits;
 * refused is Open Commerce Admin and strange is Fix with AI, and Clear runs for the rest. The
 * window holds room for the problem line from the start, so it never grows (rule 14). The check
 * failing as a whole is the Datapacks failure treatment, titled by Commerce.
 *
 * This is the only human door to the clearing: no reset offers it (owner, 2026-11-12).
 *
 * @module features/data-installer/ui/components/ProjectClearWindow
 */

import { DialogContainer, Text } from '@adobe/react-spectrum';
import React from 'react';
import { FIX_WITH_AI, FIX_WITH_AI_HINT } from '../../datapackWords';
import {
    CLEAR_DEMO_DATA,
    clearLabel,
    clearLead,
    clearTitle,
    datapackLeft,
} from '../clearDemoDataWords';
import { renderDataInstallerFailure } from '../dataInstallerFailure';
import { type ProjectClear, useProjectClear } from '../hooks/useProjectClear';
import { JobSummaryWindow } from './job/JobSummaryWindow';
import { RecordsWindow } from './job/RecordsWindow';
import { failedButtonLabel } from './packMenu';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import type { ActionButton } from '@/core/ui/components/ui/Modal';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import type { TreeListNode } from '@/core/ui/components/ui/TreeList';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { ClearCheck } from '@/types/demoDataWipe';

/** The words the window shows that are not the extension's own. */
export const CLEAR_COPY = {
    nothing: 'Nothing to clear on these websites.',
    unreachable: "Couldn't Reach Commerce",
    openAdmin: 'Open Commerce Admin',
};

export interface ProjectClearWindowProps {
    onClose: () => void;
    /** Clear what the list with this token showed, on these websites; the screen runs it in its progress window. */
    onClear: (token: string, websites: string[]) => void;
}

const kindsOf = (check: ClearCheck): Set<string> => new Set(Object.values(check.unread ?? {}));

/** The one fix a type not read asks for, beside Clear (rule 16): the slow kind first, since Clear waits for it. */
function fixButton(check: ClearCheck, clear: ProjectClear): ActionButton | undefined {
    const kinds = kindsOf(check);
    const fix: ActionButton = {
        label: FIX_WITH_AI,
        variant: 'secondary',
        onPress: clear.fixWithAi,
        hint: FIX_WITH_AI_HINT,
    };
    if (kinds.has('slow'))
        return failedButtonLabel(clear.retries) === FIX_WITH_AI
            ? fix
            : { label: 'Retry', variant: 'secondary', onPress: clear.retry };
    if (kinds.has('refused'))
        return { label: CLEAR_COPY.openAdmin, variant: 'secondary', onPress: clear.openAdmin };
    return kinds.has('strange') ? fix : undefined;
}

/** The buttons beside Cancel: the fix, then the red Clear, held while a type was too slow. */
function actionsOf(
    check: ClearCheck | null,
    clear: ProjectClear,
    onClear: ProjectClearWindowProps['onClear'],
): ActionButton[] {
    if (!check) return [];
    const go = (): void =>
        onClear(
            check.token,
            check.websites.map((w) => w.code),
        );
    const held = check.total === 0 || kindsOf(check).has('slow');
    const fix = fixButton(check, clear);
    return [
        ...(fix ? [fix] : []),
        { label: clearLabel(check.total), variant: 'negative', onPress: go, isDisabled: held },
    ];
}

/** The notices under the table: nothing to clear, the shared website, the datapack left. */
function Notices({ check }: { check: ClearCheck }): React.ReactElement {
    return (
        <>
            {check.rows.length === 0 ? <Text>{CLEAR_COPY.nothing}</Text> : null}
            {check.warning ? <InlineNotice title={check.warning} /> : null}
            {check.datapack ? (
                <InlineNotice tone="info" title={datapackLeft(check.datapack.name)} />
            ) : null}
        </>
    );
}

/** Review Records over the check's own lists: removed, kept, the categories' tree, the types not read. */
function recordsWindow(
    check: ClearCheck,
    clear: ProjectClear,
    onClose: () => void,
): React.ReactElement {
    const removed: Record<string, string[]> = {};
    const kept: Record<string, string[]> = {};
    const trees: Record<string, TreeListNode[]> = {};
    for (const [type, records] of Object.entries(check.records)) {
        removed[type] = records.removed;
        kept[type] = records.kept;
        if (records.tree) trees[type] = records.tree;
    }
    return (
        <RecordsWindow
            title={clearTitle(check.project)}
            rows={check.rows}
            records={removed}
            kept={kept}
            trees={trees}
            unread={new Set(Object.keys(check.unread ?? {}))}
            reading={false}
            onBack={clear.back}
            onClose={onClose}
        />
    );
}

/** The open window: mounted per opening, so each asks afresh. */
function ClearSteps({ onClose, onClear }: ProjectClearWindowProps): React.ReactElement {
    const clear = useProjectClear();
    const { answer: check, failure } = clear;
    if (failure) {
        return (
            <StepsWindow title={CLEAR_DEMO_DATA} onClose={onClose}>
                {renderDataInstallerFailure(failure, clear.retry, {
                    unreachableTitle: CLEAR_COPY.unreachable,
                })}
            </StepsWindow>
        );
    }
    if (check && clear.reviewing) return recordsWindow(check, clear, onClose);
    const problem = check?.problem ?? clear.adminProblem;
    return (
        <JobSummaryWindow
            title={check ? clearTitle(check.project) : CLEAR_DEMO_DATA}
            {...(check ? { lead: clearLead(check) } : {})}
            rows={check?.rows ?? []}
            {...(problem ? { problem } : {})}
            holdProblemRoom
            ready={check !== null}
            waiting={check ? false : WAIT_STAGES.readingDemoData}
            {...(check && check.rows.length > 0 ? { onReview: clear.review } : {})}
            actionButtons={actionsOf(check, clear, onClear)}
            onClose={onClose}
        >
            {check ? <Notices check={check} /> : null}
        </JobSummaryWindow>
    );
}

/**
 * Host the window while it is open.
 *
 * @param props - the close and clear callbacks
 */
export function ProjectClearWindow(props: ProjectClearWindowProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={props.onClose}>
            <ClearSteps {...props} />
        </DialogContainer>
    );
}
