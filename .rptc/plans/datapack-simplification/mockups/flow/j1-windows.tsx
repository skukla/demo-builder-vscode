/**
 * J1 prototype: the two Clear windows as the plan settles them (overview.md, Phase 6 item 3),
 * each showing what happens to every type of data before anything is cleared.
 *
 *   J1.9  Both windows decide on a summary: one line per data type. The records are an optional
 *         spot check one click away, as a second step: types on the left, the chosen type's records
 *         on the right (the Save From Store layout), and Back to the summary. Owner, 2026-11-11,
 *         J1-3: combine the summary with an optional spot check.
 *   Clear Demo Data: one project, no picker. Waits while it reads, then opens on the summary.
 *   Clear Commerce Instance: choose websites (each names the projects using it), then the summary,
 *   the warning and the "I understand" box.
 *
 * J1.1–J1.3 (Clear with a store picker, three sizings) failed and J1.4–J1.5 were built on the
 * same store picker the plan removes; their verdicts stay in prototype-feedback.md.
 *
 * The prototype pill measures the window every 50ms: whether its height ever changed once it was
 * on screen, the empty room above the buttons, and whether anything scrolls.
 */

import { Checkbox, DialogContainer } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import type { CommerceState, DemoUses, DryRunAnswer, RunEnding } from './scenarioInstall';
import type { RestoreCommerce, SaveVariant } from './scenarioSave';
import type { UninstallEnding } from './scenarioUninstall';
import { INSTANCE_WEBSITES, PROJECT_CLEAR, instanceCheck, namesLine, type ClearCheck, type TypeSpread } from './scenarioClear';
import { RecordsStep, TypeTable, reviewButton } from './TypeSummary';
import type { RetryEnding } from './scenarioFailed';
import type { J8View } from './j8-flyout';
import { ClearRunWindow } from './ClearRunWindow';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { SectionLabel } from '@/core/ui/components/ui/SectionLabel';
import { StepsWindow } from '@/core/ui/components/ui/StepsDialog';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { SelectAllRow } from '@/core/ui/components/selection/SelectAllRow';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import '@/core/ui/styles/reset.css';
import '@/core/ui/styles/tokens.css';
import '@/core/ui/styles/index.css';
import '@/core/ui/styles/vscode-theme.css';
import '@/core/ui/styles/utilities.css';
import '@/core/ui/styles/interaction.css';
import '@/features/data-installer/ui/styles/datapack.css';
import '@/core/ui/styles/modal.css';
import '@/core/ui/styles/step-scaffold.css';
import '@/core/ui/styles/shared-ui.css';
import '@/core/ui/styles/inline-controls.css';
import '@/core/ui/styles/menu-trigger.css';
import '@/core/ui/styles/checkbox-row.css';
import '@/core/ui/styles/work-row.css';
import '@/core/ui/styles/fact-list.css';
import '@/core/ui/styles/modal-text.css';
import '@/features/data-installer/ui/styles/data-installer.css';

declare global {
    interface Window {
        __J1__: {
            spread: () => TypeSpread;
            readMs: () => number;
            checkMs: () => number;
            /** How long each step of a run takes on screen (panel: Run pace). */
            paceMs: () => number;
            /** J2's panel selects. */
            demo: () => DemoUses;
            commerce: () => CommerceState;
            ending: () => RunEnding;
            dryRun: () => DryRunAnswer;
            /** J3-1's panel select: Save Changes, or Save As New on your datapack or someone else's. */
            saveVariant: () => SaveVariant;
            /** J4's panel select: Commerce has changes against the last save, or matches it. */
            restore: () => RestoreCommerce;
            /** J5's panel select: how the uninstall run ends. */
            uninstallEnds: () => UninstallEnding;
            /** J6's panel select: how a retry of the failed install ends. */
            retryEnds: () => RetryEnding;
            /** J8's panel select: a project's Datapacks or the Datapack Library. */
            j8Screen: () => J8View;
            trace: (box: HTMLElement | null, label: string) => void;
            /** Drop the measurement in progress and the windows seen, before the self-check opens a step. */
            reset: () => void;
        };
    }
}

const NONE: ReadonlySet<string> = new Set();
const digits = (n: number): string => n.toLocaleString('en-US');

function useTrace(label: string) {
    useEffect(() => {
        window.__J1__.trace(document.querySelector<HTMLElement>('.modal-dialog'), label);
    });
}


/** The project's check, read once when the window opens. */
function useProjectCheck(): ClearCheck | null {
    const [check, setCheck] = useState<ClearCheck | null>(null);
    useEffect(() => {
        const t = setTimeout(() => setCheck(PROJECT_CLEAR), window.__J1__.readMs());
        return () => clearTimeout(t);
    }, []);
    return check;
}

/** J1.6: Clear Demo Data for one project. No picker: it clears every website the project uses. */
export function ProjectClearWindow({ onClose, records: startAt, run: startRun = false }: { onClose: () => void; records?: string; run?: boolean }) {
    const check = useProjectCheck();
    const [records, setRecords] = useState<string | undefined>(startAt);
    const [running, setRunning] = useState(startRun);
    useTrace(records ? 'Clear Demo Data: records' : 'Clear Demo Data: summary');
    const where = namesLine(PROJECT_CLEAR.websites);
    const title = `Clear ${PROJECT_CLEAR.project} Demo Data?`;
    const open = (): void => setRecords(check?.rows[0]?.type);
    if (running) return <ClearRunWindow project={PROJECT_CLEAR.project} onClose={onClose} />;
    if (check && records) {
        return (
            <DialogContainer onDismiss={onClose}>
                <RecordsStep title={title} rows={check.rows} first={records} onBack={() => setRecords(undefined)} onClose={onClose} />
            </DialogContainer>
        );
    }
    return (
        <DialogContainer onDismiss={onClose}>
            <StepsWindow
                key="summary"
                title={title}
                ready={check !== null}
                waiting={check ? false : WAIT_STAGES.readingDemoData}
                onClose={onClose}
                closeLabel="Cancel"
                startButtons={check ? [reviewButton(open)] : []}
                actionButtons={[{ label: `Clear ${digits(check?.total ?? 0)} Items`, variant: 'negative', onPress: () => setRunning(true), isDisabled: !check }]}
            >
                {check && (
                    <div className="clear-demo-body">
                        <LeadText>{`Clears ${where}, the website this demo uses. Anything another demo uses is kept.`}</LeadText>
                        <TypeTable rows={check.rows} />
                    </div>
                )}
            </StepsWindow>
        </DialogContainer>
    );
}

/** The websites, ticked or not, each naming the projects on this computer that use it. */
function WebsiteList({ ticks, onChange }: { ticks: ReadonlySet<string>; onChange: (t: ReadonlySet<string>) => void }) {
    const all = ticks.size === INSTANCE_WEBSITES.length;
    const toggle = (code: string): void => {
        const next = new Set(ticks);
        if (next.has(code)) next.delete(code);
        else next.add(code);
        onChange(next);
    };
    return (
        <div>
            <SectionLabel>Websites</SectionLabel>
            <SelectAllRow all={all} some={ticks.size > 0} onToggle={() => onChange(all ? NONE : new Set(INSTANCE_WEBSITES.map((w) => w.code)))} />
            {INSTANCE_WEBSITES.map((site) => (
                <CheckboxRow key={site.code} label={site.name} detail={`Used by ${namesLine(site.projects)}`} isSelected={ticks.has(site.code)} onChange={() => toggle(site.code)} />
            ))}
        </div>
    );
}

/** Next's check: runs when pressed, the spinner on the button until it is back. */
function useInstanceCheck(ticks: ReadonlySet<string>, asked: boolean): ClearCheck | null {
    const [check, setCheck] = useState<ClearCheck | null>(null);
    useEffect(() => {
        if (!asked) {
            setCheck(null);
            return undefined;
        }
        const t = setTimeout(() => setCheck(instanceCheck(ticks)), window.__J1__.checkMs());
        return () => clearTimeout(t);
    }, [ticks, asked]);
    return check;
}

/** J1.7: Clear Commerce Instance. Choose websites, then review per type and confirm. */
export function InstanceClearWindow({ onClose, preset = false, records: startAt }: { onClose: () => void; preset?: boolean; records?: string }) {
    const [ticks, setTicks] = useState<ReadonlySet<string>>(() => (preset ? new Set(INSTANCE_WEBSITES.map((w) => w.code)) : NONE));
    const [asked, setAsked] = useState(preset);
    const [understood, setUnderstood] = useState(false);
    const [records, setRecords] = useState<string | undefined>(startAt);
    const check = useInstanceCheck(ticks, asked);
    useTrace(`Clear Commerce Instance: ${!check ? 'websites' : records ? 'records' : 'summary'}`);
    const chosen = INSTANCE_WEBSITES.filter((w) => ticks.has(w.code));
    const projects = chosen.reduce((n, w) => n + w.projects.length, 0);
    const sites = chosen.length === 1 ? '1 Website' : `${chosen.length} Websites`;
    const back = (): void => {
        setAsked(false);
        setUnderstood(false);
    };
    const open = (): void => setRecords(check?.rows[0]?.type);
    if (check && records) {
        return (
            <DialogContainer onDismiss={onClose}>
                <RecordsStep title={`Clear ${sites}?`} rows={check.rows} first={records} onBack={() => setRecords(undefined)} onClose={onClose} />
            </DialogContainer>
        );
    }

    return (
        <DialogContainer onDismiss={onClose}>
            {!check ? (
                <StepsWindow
                    key="choose"
                    title="Clear Commerce Instance"
                    onClose={onClose}
                    actionButtons={[{ label: 'Next', variant: 'accent', isDisabled: ticks.size === 0, isPending: asked, onPress: () => setAsked(true) }]}
                >
                    <div className="clear-demo-body">
                        <LeadText>Select the websites to clear. Everything on them is removed, whichever project put it there.</LeadText>
                        <WebsiteList ticks={ticks} onChange={setTicks} />
                    </div>
                </StepsWindow>
            ) : (
                <StepsWindow
                    key="review"
                    title={`Clear ${sites}?`}
                    onClose={onClose}
                    closeLabel="Cancel"
                    startButtons={[{ label: 'Back', variant: 'secondary', onPress: back }, reviewButton(open)]}
                    actionButtons={[{ label: `Clear ${sites}`, variant: 'negative', onPress: onClose, isDisabled: !understood }]}
                >
                    <div className="clear-demo-body">
                        <LeadText>{`Clears everything on ${namesLine(chosen.map((w) => w.name))}, whichever project put it there.`}</LeadText>
                        <TypeTable rows={check.rows} />
                        <InlineNotice title={`${projects} projects lose their demo data. This can't be undone.`} />
                        <Checkbox isSelected={understood} onChange={setUnderstood}>
                            I understand every project on these websites loses its data
                        </Checkbox>
                    </div>
                </StepsWindow>
            )}
        </DialogContainer>
    );
}
