/**
 * "Clear Demo Data" (datapack-engine step 10; datapack-simplification step 06): make the project's
 * websites clean for the next customer. No picker: the window lists what clearing every website the
 * project uses would do, one line per data type, as `check-demo-data` answers it; the red button
 * hands that list's token to the screen, which runs the clearing in its progress window. Nothing is
 * cleared until that button, and the opening sentence says it is permanent.
 *
 * The interim window of step 06's C2a: C2b rebuilds it to J1 (the type table, Review Records with
 * Removed and Kept tabs, Retry then Fix with AI). Until then it shows the rows as a `FactList`, the
 * check's warning (another project uses these websites, P6-Q2) and problem (a type too slow to
 * answer, with Retry; Clear waits) as problem lines where the list lands, and that the project's
 * datapack is left for its uninstall (until C3 makes that removal part of the clearing).
 *
 * Built from the house pieces: `ui/Modal` in a `DialogContainer` (as `AssignErpProductsModal` and
 * `LoadDatapackFileModal`), `LeadText` for its lead, `FactList` for the list, and the Modal's own
 * wait while the check reads. If the check could not be read at all, that is the dialog's title.
 * This is the only human door to the clearing: no reset offers it (owner, 2026-11-12).
 *
 * @module features/data-installer/ui/components/ClearDemoDataModal
 */

import { DialogContainer, Text } from '@adobe/react-spectrum';
import React from 'react';
import { clearLabel, clearLead, datapackLeft } from '../clearDemoDataWords';
import { useDemoDataCheck } from '../hooks/useDemoDataCheck';
import { Fact, FactList } from '@/core/ui/components/ui/FactList';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { Modal } from '@/core/ui/components/ui/Modal';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { ClearCheck } from '@/types/demoDataWipe';

/** Every string the modal shows that is not the extension's own. */
export const CLEAR_COPY = {
    title: 'Clear Demo Data',
    nothing: 'Nothing to clear on these websites.',
    readFailed: "Couldn't Read the Demo Data",
};

export interface ClearDemoDataModalProps {
    onClose: () => void;
    /** Clear what the list with this token showed, on these websites; the screen runs it in its progress window. */
    onClear: (token: string, websites: string[]) => void;
}

/** What qualifies the list, where the list lands: a problem note, small and in its colour. */
function ProblemLine({ children }: { children: React.ReactNode }) {
    return <p className="dialog-problem text-notice">{children}</p>;
}

function CheckView({ check }: { check: ClearCheck }) {
    return (
        <div className="clear-demo-body">
            <LeadText>{clearLead(check)}</LeadText>
            {check.datapack ? <Text>{datapackLeft(check.datapack.name)}</Text> : null}
            {check.warning ? <ProblemLine>{check.warning}</ProblemLine> : null}
            {check.problem ? <ProblemLine>{check.problem}</ProblemLine> : null}
            {check.rows.length === 0 ? (
                <Text>{CLEAR_COPY.nothing}</Text>
            ) : (
                <FactList>
                    {check.rows.map((row) => (
                        <Fact key={row.type} label={row.label}>
                            {row.happens}
                        </Fact>
                    ))}
                </FactList>
            )}
        </div>
    );
}

/** The buttons: Retry while a type was too slow (Clear waits with it), else Clear with its count. */
function actionsOf(check: ClearCheck | null, clear: () => void, retry: () => void) {
    if (check?.problem) return [{ label: 'Retry', variant: 'primary' as const, onPress: retry }];
    const total = check?.total ?? 0;
    return [{ label: total > 0 ? clearLabel(total) : 'Clear', variant: 'negative' as const, onPress: clear, isDisabled: total === 0 }];
}

/** The open modal: mounted per opening, so each asks afresh. */
function ClearForm({ onClose, onClear }: ClearDemoDataModalProps) {
    const check = useDemoDataCheck();
    const { answer } = check;
    const clear = (): void => {
        if (answer && answer.total > 0 && !answer.problem) onClear(answer.token, answer.websites.map((w) => w.code));
    };
    const failed = check.failure !== null;
    return (
        <Modal
            title={failed ? CLEAR_COPY.readFailed : CLEAR_COPY.title}
            status={failed ? 'error' : undefined}
            size={failed ? 'S' : 'L'}
            fitContent
            waiting={check.loading ? WAIT_STAGES.readingDemoData : false}
            onClose={onClose}
            actionButtons={failed ? [] : actionsOf(answer, clear, check.retry)}
        >
            {failed ? <LeadText>{check.failure?.message ?? ''}</LeadText> : null}
            {answer ? <CheckView check={answer} /> : null}
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
