/**
 * "Clear demo data" (datapack-engine step 10, owner 2026-10-30): make a demo's part of the store
 * clean for the next customer. The SC ticks the STORES that are the demo's (`StorePickList`), and
 * the modal lists what clearing them would do, read-only, as `check-demo-data` answers it; the red
 * button hands the stores and the list's token to the screen, which runs the clearing in its
 * progress window. Nothing is cleared until that button, and the list says it cannot be undone.
 *
 * Built from the house pieces: `ui/Modal` in a `DialogContainer` (as `AssignErpProductsModal` and
 * `LoadDatapackFileModal`), `LeadText` and `SectionLabel` for its text, `FactList` for the list
 * (one labelled line a kind, as the setup guide lists its facts), `InlineNotice` for a store another
 * project claims, `StatusDisplay` for a check that failed and `LoadingDisplay` while the choices are
 * read. The VS Code reset modal (`edsResetOtherData.ts`) asks the same question for the project's
 * own store; it is a native dialog, so it has no list and no ticks.
 *
 * @module features/data-installer/ui/components/ClearDemoDataModal
 */

import { DialogContainer, Text } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { choicesOfTicks, clearLabel, previewLines } from '../clearDemoDataWords';
import { useDemoDataCheck } from '../hooks/useDemoDataCheck';
import { StorePickList } from './StorePickList';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { Fact, FactList } from '@/core/ui/components/ui/FactList';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { Modal } from '@/core/ui/components/ui/Modal';
import { SectionLabel } from '@/core/ui/components/ui/SectionLabel';
import { Spinner } from '@/core/ui/components/ui/Spinner';
import type { DemoDataCheck, WipeStoreChoice } from '@/types/demoDataWipe';

/** Every string the modal shows that is not the extension's own. */
export const CLEAR_COPY = {
    title: 'Clear demo data',
    lead: "Choose the stores that are this demo's. Clearing removes what they hold that Demo Builder didn't install, and closes their orders.",
    stores: 'Stores',
    list: 'What clearing does',
    pick: 'Tick a store to see what clearing it would do.',
    checking: 'Checking the stores',
    nothing: 'These stores hold nothing Demo Builder did not install.',
    claimed: 'A chosen store is another project\'s',
    undo: "This can't be undone.",
    readFailed: "Couldn't read the stores",
};

export interface ClearDemoDataModalProps {
    onClose: () => void;
    /** Clear these stores as listed; the screen runs it in its progress window. */
    onClear: (stores: WipeStoreChoice[], token: string) => void;
}

/** Ticks before the SC chooses any. Module-level: a stable reference for the check's effect. */
const NONE: ReadonlySet<string> = new Set();

function PreviewView({ answer, loading, hasTicks }: { answer: DemoDataCheck | null; loading: boolean; hasTicks: boolean }) {
    if (loading && hasTicks) {
        return (
            <div className="clear-demo-checking">
                <Spinner size="S" aria-label={CLEAR_COPY.checking} />
                <Text>{CLEAR_COPY.checking}</Text>
            </div>
        );
    }
    if (!answer) return <Text>{CLEAR_COPY.pick}</Text>;
    if (answer.refused) return <InlineNotice title={CLEAR_COPY.claimed}>{answer.refused}</InlineNotice>;
    const preview = answer.preview;
    if (!preview) return null;
    if (preview.total === 0) return <Text>{CLEAR_COPY.nothing}</Text>;
    return (
        <>
            <FactList>
                {previewLines(preview).map((line, index) => (
                    <Fact key={`${line.label}-${index}`} label={line.label}>
                        {line.value}
                    </Fact>
                ))}
            </FactList>
            <Text UNSAFE_className="clear-demo-never">{preview.never} {CLEAR_COPY.undo}</Text>
        </>
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
            title={CLEAR_COPY.title}
            size="L"
            fitContent
            onClose={onClose}
            actionButtons={failed ? [] : [{ label: total > 0 ? clearLabel(total) : 'Clear', variant: 'negative', onPress: clear, isDisabled: total === 0 }]}
        >
            {failed && <StatusDisplay variant="error" title={CLEAR_COPY.readFailed} message={check.failure?.message ?? ''} />}
            {!failed && !check.ready && <LoadingDisplay size="M" message={CLEAR_COPY.checking} />}
            {check.ready && (
                <div className="clear-demo-body">
                    <LeadText>{CLEAR_COPY.lead}</LeadText>
                    <SectionLabel>{CLEAR_COPY.stores}</SectionLabel>
                    <StorePickList choices={check.choices} ticks={ticks} onChange={setTicks} />
                    <SectionLabel>{CLEAR_COPY.list}</SectionLabel>
                    {check.failure ? (
                        <StatusDisplay variant="error" title={CLEAR_COPY.readFailed} message={check.failure.message} />
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
