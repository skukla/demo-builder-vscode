/**
 * "Clear demo data" (datapack-engine step 10, owner 2026-10-30): make a demo's part of the store
 * clean for the next customer. The SC ticks the STORES that are the demo's (`StorePickList`), and
 * the modal lists what clearing them would do, read-only, as `check-demo-data` answers it; the red
 * button hands the stores and the list's token to the screen, which runs the clearing in its
 * progress window. Nothing is cleared until that button, and the opening sentence says it is
 * permanent.
 *
 * Built from the house pieces: `ui/Modal` in a `DialogContainer` (as `AssignErpProductsModal` and
 * `LoadDatapackFileModal`), `LeadText` and `SectionLabel` for its text, `FactList` for the list
 * (one labelled line a kind, as the setup guide lists its facts), and the Modal's own wait while the
 * choices are read. Whatever a check could not do is a line where the list would land; if the
 * choices could not be read at all, that is the dialog's title. The VS Code reset modal (`edsResetOtherData.ts`) asks the same question for the project's
 * own store; it is a native dialog, so it has no list and no ticks.
 *
 * @module features/data-installer/ui/components/ClearDemoDataModal
 */

import { DialogContainer, Text } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { choicesOfTicks, clearLabel, previewLines } from '../clearDemoDataWords';
import { useDemoDataCheck } from '../hooks/useDemoDataCheck';
import { StorePickList } from './StorePickList';
import { Fact, FactList } from '@/core/ui/components/ui/FactList';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { Modal } from '@/core/ui/components/ui/Modal';
import { SectionLabel } from '@/core/ui/components/ui/SectionLabel';
import { Spinner } from '@/core/ui/components/ui/Spinner';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { DemoDataCheck, WipePreview, WipeStoreChoice } from '@/types/demoDataWipe';

/** Every string the modal shows that is not the extension's own. */
export const CLEAR_COPY = {
    title: 'Clear Demo Data',
    lead: "Choose the stores that are this demo's. Clearing permanently removes what only they use and Demo Builder didn't install, and closes their orders.",
    stores: 'Stores',
    pick: 'Select a store to preview what will be cleared.',
    checking: 'Reading demo data',
    nothing: 'These stores hold nothing Demo Builder did not install.',
    readFailed: "Couldn't Read the Stores",
};

export interface ClearDemoDataModalProps {
    onClose: () => void;
    /** Clear these stores as listed; the screen runs it in its progress window. */
    onClear: (stores: WipeStoreChoice[], token: string) => void;
}

/** Ticks before the SC chooses any. Module-level: a stable reference for the check's effect. */
const NONE: ReadonlySet<string> = new Set();

/** Orders an ERP integration leaves open still need saying, nothing else to clear or not: the SC acts on that line. */
const leavesErpOrders = (preview: WipePreview): boolean => preview.erp?.held !== undefined && preview.erp.orders.count > 0;

/** What stopped the list, where the list would land: a problem note, small and in its colour. */
function ProblemLine({ failed, children }: { failed?: boolean; children: React.ReactNode }) {
    return <p className={failed ? 'dialog-problem text-negative' : 'dialog-problem text-notice'}>{children}</p>;
}

function PreviewView({ answer, loading, hasTicks }: { answer: DemoDataCheck | null; loading: boolean; hasTicks: boolean }) {
    if (loading && hasTicks) {
        return (
            <div className="clear-demo-checking">
                <Spinner size="S" aria-label={CLEAR_COPY.checking} />
            </div>
        );
    }
    if (!answer) return <Text>{CLEAR_COPY.pick}</Text>;
    if (answer.refused) return <ProblemLine>{answer.refused}</ProblemLine>;
    const preview = answer.preview;
    if (!preview) return null;
    // What stays is still said when nothing goes: "holds nothing" would be false, and the SC should see why.
    if (preview.total === 0 && !leavesErpOrders(preview) && preview.left.length === 0) return <Text>{CLEAR_COPY.nothing}</Text>;
    // What is never touched (`preview.never`) is not drawn: the list says what goes and the lead says
    // orders are closed, so a footnote under it changed nothing the SC knows or does (review,
    // 2026-11-10). It stays in the answer for an agent's check_demo_data.
    return (
        <FactList>
            {previewLines(preview).map((line, index) => (
                <Fact key={`${line.label}-${index}`} label={line.label}>
                    {line.value}
                </Fact>
            ))}
        </FactList>
    );
}

/** The open modal: mounted per opening, so each starts with nothing ticked. */
function ClearForm({ onClose, onClear }: ClearDemoDataModalProps) {
    const [ticks, setTicks] = useState<ReadonlySet<string>>(NONE);
    const check = useDemoDataCheck(ticks);
    const preview = check.answer?.preview;
    const total = check.answer?.refused ? 0 : (preview?.total ?? 0);
    const clear = (): void => {
        if (preview && total > 0) onClear(choicesOfTicks(ticks), preview.token);
    };
    const failed = check.failure !== null && !check.ready;
    return (
        <Modal
            title={failed ? CLEAR_COPY.readFailed : CLEAR_COPY.title}
            status={failed ? 'error' : undefined}
            size={failed ? 'S' : 'L'}
            fitContent
            waiting={!failed && !check.ready ? WAIT_STAGES.readingDemoData : false}
            onClose={onClose}
            actionButtons={failed ? [] : [{ label: total > 0 ? clearLabel(total) : 'Clear', variant: 'negative', onPress: clear, isDisabled: total === 0 }]}
        >
            {failed && <LeadText>{check.failure?.message ?? ''}</LeadText>}
            {check.ready && (
                <div className="clear-demo-body">
                    <LeadText>{CLEAR_COPY.lead}</LeadText>
                    <div>
                        <SectionLabel>{CLEAR_COPY.stores}</SectionLabel>
                        <StorePickList choices={check.choices} ticks={ticks} onChange={setTicks} />
                    </div>
                    {check.failure ? (
                        <ProblemLine failed>{CLEAR_COPY.readFailed}: {check.failure.message}</ProblemLine>
                    ) : (
                        <PreviewView answer={check.answer} loading={check.loading} hasTicks={ticks.size > 0} />
                    )}
                </div>
            )}
        </Modal>
    );
}

/**
 * Host the modal while it is open.
 *
 * @param props - the close and clear callbacks
 */
export function ClearDemoDataModal(props: ClearDemoDataModalProps): React.ReactElement {
    return (
        <DialogContainer onDismiss={props.onClose}>
            <ClearForm {...props} />
        </DialogContainer>
    );
}
