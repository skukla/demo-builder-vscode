/**
 * "Clear <Project> Demo Data?" (datapack-engine step 10; datapack-simplification step 06, C2b), as
 * J1 walked it (`mockups/flow/j1-windows.tsx`): no picker; the lead names every website the project
 * uses, the summary is the type table (`JobSummaryWindow`, the install's), and Review Records opens
 * the spot check with Removed and Kept tabs (`RecordsWindow`). The red "Clear N Items" (rule 20)
 * hands the shown list's token to the screen, which runs the clearing in its progress window;
 * nothing is cleared until it is pressed.
 *
 * The check's warning (another local project uses these websites, P6-Q2) is a house notice under the
 * table, as J1's instance window places its warning. The project's datapack is not named here: the
 * list counts what it installed with the rest, since the clearing uninstalls it first (C3). Its
 * changes are read as Uninstall reads them (`useSwitchChanges`); with changes, the red Clear opens
 * "Save Your Changes First?" (core `SaveFirstWindow` over `SaveChangesBody`, verb "Clear") and the
 * answer goes with the clearing. Nothing is dropped without "Clear Without Saving". A type the
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
import React, { useMemo, useState } from 'react';
import { FIX_WITH_AI, FIX_WITH_AI_HINT, saveFirstLabel, withoutSavingLabel } from '../../datapackWords';
import { CLEAR_DEMO_DATA, clearLabel, clearLead, clearTitle } from '../clearDemoDataWords';
import { renderDataInstallerFailure } from '../dataInstallerFailure';
import { type ProjectClear, useProjectClear } from '../hooks/useProjectClear';
import { type RemovalAnswer, type SwitchChanges, useSwitchChanges } from '../hooks/useSwitchChanges';
import { JobSummaryWindow } from './job/JobSummaryWindow';
import { RecordsWindow } from './job/RecordsWindow';
import { SaveChangesBody } from './job/SaveChangesBody';
import { failedButtonLabel } from './packMenu';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { SaveFirstWindow } from '@/core/ui/components/feedback/SaveFirstWindow';
import type { ActionButton } from '@/core/ui/components/ui/Modal';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import type { TreeListNode } from '@/core/ui/components/ui/TreeList';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
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
    /**
     * Clear what the list with this token showed, on these websites; the screen runs it in its
     * progress window. `answer` is the save question's, when the datapack the clearing uninstalls
     * first was asked about; absent when the check names no datapack, or nothing had changed (the
     * host then reads the changes again). Resolves `true` when the host refused for an answer about
     * changes made since: the window asks its question (C3 review, 2026-11-13).
     */
    onClear: (token: string, websites: string[], answer?: RemovalAnswer) => Promise<boolean> | void;
    /** The SC's own datapacks' names, which a new one saved from the changes may not take. Must be stable. */
    ownNames?: readonly string[];
}

const NO_NAMES: readonly string[] = [];

/** The message asking for the one-time tip about the setting, as Uninstall sends it (webview only). */
const SAVE_QUESTION_ANSWERED = 'datapack-save-question-answered';

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

/** The buttons beside Cancel: the fix, then the red Clear, held while a type was too slow or the changes are read. */
function actionsOf(
    check: ClearCheck | null,
    clear: ProjectClear,
    changes: SwitchChanges,
    pressing: { press: () => void; sending: boolean },
): ActionButton[] {
    if (!check) return [];
    const go = pressing.press;
    const held = check.total === 0 || kindsOf(check).has('slow') || !changes.settled || pressing.sending;
    const fix = fixButton(check, clear);
    return [
        ...(fix ? [fix] : []),
        { label: clearLabel(check.total), variant: 'negative', onPress: go, isDisabled: held },
    ];
}

/** The notices under the table: nothing to clear, the shared website. */
function Notices({ check }: { check: ClearCheck }): React.ReactElement {
    return (
        <>
            {check.rows.length === 0 ? <Text>{CLEAR_COPY.nothing}</Text> : null}
            {check.warning ? <InlineNotice title={check.warning} /> : null}
        </>
    );
}

/** "Save Your Changes First?" in the verb Clear: the shared frame over the changes by type. */
function saveFirstWindow(
    changes: SwitchChanges,
    answer: (saves: boolean) => void,
    onClose: () => void,
): React.ReactElement {
    return (
        <SaveFirstWindow
            withoutSavingLabel={withoutSavingLabel('Clear')}
            saveLabel={saveFirstLabel('Clear', false)}
            saveDisabled={changes.saveAs?.problem !== undefined}
            onAnswer={answer}
            onClose={onClose}
        >
            <SaveChangesBody
                rows={changes.rows}
                readFailed={changes.readFailed}
                {...(changes.saveAs ? { saveAs: changes.saveAs } : {})}
            />
        </SaveFirstWindow>
    );
}

/**
 * The datapack the clearing uninstalls first, as Uninstall's changes read takes it, and the press:
 * the save question when its changes need one, else the clearing with the answer it needs.
 */
function useClearPress(check: ClearCheck | null, ownNames: readonly string[], onClear: ProjectClearWindowProps['onClear']) {
    const [asking, setAsking] = useState(false);
    const [sending, setSending] = useState(false);
    const datapack = check?.datapack;
    const from = useMemo(() => (datapack ? { datapack: datapack.pack, heldName: datapack.name } : null), [datapack]);
    const changes = useSwitchChanges(datapack !== undefined, from, ownNames);
    const go = (answer?: RemovalAnswer): void => {
        if (!check) return;
        const websites = check.websites.map((w) => w.code);
        const sent = answer ? onClear(check.token, websites, answer) : onClear(check.token, websites);
        setAsking(false);
        if (!sent) return;
        setSending(true);
        void sent.then((needsAnswer) => {
            setSending(false);
            if (!needsAnswer) return;
            changes.reread();
            setAsking(true);
        });
    };
    const press = (): void => {
        if (!datapack) return go();
        const next = changes.onSwitch();
        if (next === 'ask') setAsking(true);
        else go(next);
    };
    const answer = (saves: boolean): void => {
        webviewClient.postMessage(SAVE_QUESTION_ANSWERED);
        go(changes.answer(saves));
    };
    return { asking, sending, changes, press, answer };
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
function ClearSteps({ onClose, onClear, ownNames = NO_NAMES }: ProjectClearWindowProps): React.ReactElement {
    const clear = useProjectClear();
    const { answer: check, failure } = clear;
    const pressing = useClearPress(check, ownNames, onClear);
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
    if (pressing.asking) return saveFirstWindow(pressing.changes, pressing.answer, onClose);
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
            actionButtons={actionsOf(check, clear, pressing.changes, pressing)}
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
