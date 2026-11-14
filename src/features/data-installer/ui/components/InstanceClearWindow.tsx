/**
 * Clear Commerce Instance (datapack-simplification step 06, C4), as J1 walked it
 * (`mockups/flow/j1-windows.tsx`, J1-4 and J1-5, owner 2026-11-11: "All approved."):
 *
 * 1. The websites, wide: each a `CheckboxRow` under Select All, naming the local projects using it
 *    ("Used by A and B", two names then "and N more"); a website none uses names none (P6-Q7). Cancel,
 *    and Next, off until a website is ticked.
 * 2. The summary for those websites (the type table and Review Records, as Clear Demo Data's), the
 *    warning (property 1: "This can't be undone", and what can: each project's datapack, its changes
 *    saved first, installed again from the library), and "I understand", which the red button waits
 *    for. Back returns to the websites still ticked.
 *
 * When a project on those websites has a datapack with changes, the red button runs into the batch
 * save question first (P6-Q4, owner 2026-11-13: "We have a saved data pack flow already"): core
 * `SaveFirstWindow` over `BatchSaveTable`, a row per such datapack with an editable name, the naming
 * rules `saveAsName.ts`'s, as the projects screens' Reset and Delete ask it. The answers go with the
 * clearing, by project path; nothing is cleared until a button says so.
 *
 * Opened by whatever hosts it (the header's Clear menu is C5): the host runs the clearing in its
 * progress window (`useClearDemoData`'s `clearInstance`).
 *
 * @module features/data-installer/ui/components/InstanceClearWindow
 */

import { Checkbox, DialogContainer, Text } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { saveFirstLabel, withoutSavingLabel } from '../../datapackWords';
import {
    type ChangesByPath,
    type PackRow,
    type SaveNames,
    type SaveQuestion,
    changesOf,
    nameProblems,
    namesOf,
} from '../../saveAsName';
import {
    CLEAR_INSTANCE,
    INSTANCE_PICK_LEAD,
    INSTANCE_UNDERSTOOD,
    instanceClearLabel,
    instanceLead,
    instanceTitle,
    instanceWarning,
    namesLine,
} from '../clearDemoDataWords';
import { renderDataInstallerFailure } from '../dataInstallerFailure';
import { type InstanceClear, useInstanceClear } from '../hooks/useInstanceClear';
import { useClearFixes } from '../hooks/useProjectClear';
import { JobSummaryWindow } from './job/JobSummaryWindow';
import { CLEAR_COPY, fixButton, recordsWindow } from './ProjectClearWindow';
import { BatchSaveTable } from '@/core/ui/components/feedback/BatchSaveTable';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { SaveFirstWindow } from '@/core/ui/components/feedback/SaveFirstWindow';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { SelectAllRow } from '@/core/ui/components/selection/SelectAllRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { SectionLabel } from '@/core/ui/components/ui/SectionLabel';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { ClearCheck } from '@/types/demoDataWipe';

export interface InstanceClearWindowProps {
    onClose: () => void;
    /**
     * Clear what the instance list with this token showed, on these websites (by code), with the
     * save question's answers by project path (none when nothing was asked). Resolves `true` when
     * the host refused for an answer about a project's changes: the window asks its question.
     */
    onClear: (token: string, websites: string[], changes: ChangesByPath) => Promise<boolean> | void;
}

const NO_NAMES: SaveNames = {};

/**
 * The save question's rows: each datapack with changes, the SC's own too unless the setting saves it
 * unasked, and each whose changes could not be read (a name given up front, so a change found at run
 * time never sends the SC round again with nothing to answer).
 */
function saveRowsOf(check: ClearCheck): PackRow[] {
    const part = check.instance;
    if (!part) return [];
    return part.projects.filter((p) => {
        const changes = p.datapack?.changes;
        return changes === 'unchecked' || changes === 'asks' || (changes === 'saves' && !part.alwaysSave);
    });
}

/** The question as it stands: its rows, each row's name, and why a name is refused. */
function questionOf(check: ClearCheck, typed: SaveNames): SaveQuestion {
    const rows = saveRowsOf(check);
    const ownNames = check.instance?.ownNames ?? [];
    const names = namesOf(rows, ownNames, typed);
    return { rows, names, problems: nameProblems(rows, names, ownNames) };
}

/** Step 1: the websites, ticked or not, each naming the projects using it. */
function WebsitesWindow({
    clear,
    onClose,
}: {
    clear: InstanceClear;
    onClose: () => void;
}): React.ReactElement {
    const sites = clear.choices?.websites ?? [];
    const ticked = sites.filter((w) => clear.ticks.has(w.code)).length;
    return (
        <StepsWindow
            title={CLEAR_INSTANCE}
            wide
            ready={clear.choices !== null}
            waiting={clear.choices ? false : WAIT_STAGES.readingWhatToSelect}
            closeLabel="Cancel"
            actionButtons={[
                {
                    label: 'Next',
                    variant: 'accent',
                    isDisabled: ticked === 0,
                    isPending: clear.asked,
                    onPress: clear.next,
                },
            ]}
            onClose={onClose}
        >
            <div className="clear-demo-body">
                <LeadText>{INSTANCE_PICK_LEAD}</LeadText>
                <div>
                    <SectionLabel>Websites</SectionLabel>
                    <SelectAllRow
                        all={sites.length > 0 && ticked === sites.length}
                        some={ticked > 0}
                        onToggle={clear.toggleAll}
                    />
                    {sites.map((site) => (
                        <CheckboxRow
                            key={site.code}
                            label={site.name || site.code}
                            {...(site.projects.length > 0
                                ? { detail: `Used by ${namesLine(site.projects)}` }
                                : {})}
                            isSelected={clear.ticks.has(site.code)}
                            onChange={() => clear.toggle(site.code)}
                        />
                    ))}
                </div>
            </div>
        </StepsWindow>
    );
}

/** The press: the save question when a datapack's changes need one, else the clearing; again when the host asks. */
function useInstancePress(check: ClearCheck | null, onClear: InstanceClearWindowProps['onClear'], onStale: () => void) {
    const [asking, setAsking] = useState(false);
    const [sending, setSending] = useState(false);
    const [typed, setTyped] = useState<SaveNames>(NO_NAMES);
    const question = check ? questionOf(check, typed) : undefined;
    const go = (changes: ChangesByPath): void => {
        if (!check) return;
        setAsking(false);
        const sent = onClear(
            check.token,
            check.websites.map((w) => w.code),
            changes,
        );
        if (!sent) return;
        setSending(true);
        void sent.then((needsAnswer) => {
            setSending(false);
            // Something changed since the list was made: read it again (a new token, fresh rows) before asking.
            if (needsAnswer) onStale();
        });
    };
    const press = (): void => ((question?.rows.length ?? 0) > 0 ? setAsking(true) : go({}));
    const answer = (saves: boolean): void =>
        go(question ? changesOf(question.rows, question.names, saves ? 'save' : 'drop') : {});
    const name = (path: string, value: string): void =>
        setTyped((was) => ({ ...was, [path]: value }));
    return { asking, sending, question, press, answer, name, close: () => setAsking(false) };
}

/** Step 2's notices under the table: the warning, then "I understand". */
function Warning({
    check,
    understood,
    onUnderstood,
}: {
    check: ClearCheck;
    understood: boolean;
    onUnderstood: (on: boolean) => void;
}) {
    const projects = check.instance?.projects ?? [];
    const losing = projects.filter((p) => p.kept === undefined);
    const kept = projects.flatMap((p) => [p.kept, p.note].filter((line): line is string => line !== undefined));
    return (
        <>
            <InlineNotice title={instanceWarning(losing.length)} />
            {kept.map((sentence) => (
                <Text key={sentence}>{sentence}</Text>
            ))}
            <Checkbox isSelected={understood} onChange={onUnderstood}>
                {INSTANCE_UNDERSTOOD}
            </Checkbox>
        </>
    );
}

/** The open windows: mounted per opening, so each asks afresh. */
function InstanceSteps({ onClose, onClear }: InstanceClearWindowProps): React.ReactElement {
    const clear = useInstanceClear();
    const fixes = useClearFixes();
    // Ticked for one list: a list read again (Retry, or a change the clearing found) asks again.
    const [understoodFor, setUnderstoodFor] = useState<string | null>(null);
    const [reviewing, setReviewing] = useState(false);
    const { check } = clear;
    const understood = check !== null && understoodFor === check.token;
    const setUnderstood = (on: boolean): void => setUnderstoodFor(on && check ? check.token : null);
    const pressing = useInstancePress(check, onClear, clear.recheck);
    if (clear.failure) {
        return (
            <StepsWindow title={CLEAR_INSTANCE} onClose={onClose}>
                {renderDataInstallerFailure(clear.failure, clear.retry, {
                    unreachableTitle: CLEAR_COPY.unreachable,
                })}
            </StepsWindow>
        );
    }
    if (!check) return <WebsitesWindow clear={clear} onClose={onClose} />;
    const title = instanceTitle(check.websites.length);
    if (reviewing) return recordsWindow(check, title, () => setReviewing(false), onClose);
    if (pressing.asking && pressing.question) {
        return (
            <SaveFirstWindow
                withoutSavingLabel={withoutSavingLabel('Clear')}
                saveLabel={saveFirstLabel('Clear', false)}
                saveDisabled={Object.keys(pressing.question.problems).length > 0}
                onAnswer={pressing.answer}
                onClose={pressing.close}
            >
                <BatchSaveTable question={pressing.question} onName={pressing.name} />
            </SaveFirstWindow>
        );
    }
    const back = (): void => {
        setUnderstoodFor(null);
        clear.back();
    };
    const fix = fixButton(check, { ...fixes, retry: clear.retry, retries: clear.retries });
    const slow = Object.values(check.unread ?? {}).includes('slow');
    const problem = check.problem ?? fixes.adminProblem;
    return (
        <JobSummaryWindow
            title={title}
            lead={instanceLead(check.websites.map((w) => w.name || w.code))}
            rows={check.rows}
            {...(problem ? { problem } : {})}
            holdProblemRoom
            ready
            waiting={false}
            onBack={back}
            {...(check.rows.length > 0 ? { onReview: () => setReviewing(true) } : {})}
            actionButtons={[
                ...(fix ? [fix] : []),
                {
                    label: instanceClearLabel(check.websites.length),
                    variant: 'negative',
                    onPress: pressing.press,
                    isDisabled: !understood || slow || pressing.sending,
                },
            ]}
            onClose={onClose}
        >
            <Warning check={check} understood={understood} onUnderstood={setUnderstood} />
        </JobSummaryWindow>
    );
}

/**
 * Host the windows while open.
 *
 * @param props - the close and clear callbacks
 */
export function InstanceClearWindow(props: InstanceClearWindowProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={props.onClose}>
            <InstanceSteps {...props} />
        </DialogContainer>
    );
}
