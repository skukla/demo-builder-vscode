/**
 * J9's Restore, as decisions.md "Where 'back' goes" (owner, 2026-11-14, confirmed) settles it: one
 * action, Restore <pack>, whose window says where Commerce goes back to. Replaces J4-3.
 *
 *   the check (J4-2: Install's check window and wait, under the button's own words)
 *   → Luma (Demo Builder's): "Restore Luma?", one line, "Commerce goes back to Luma as it ships."
 *   → My Luma, nothing unsaved: "Restore My Luma?", one line naming the original (only point there is)
 *   → My Luma, unsaved edits: "Restore My Luma?" with the house RadioGroup, Last Saved and Original
 *       → Original: "Save Your Changes First?" (J2-3's window; Restore Without Saving, Cancel, Save and Restore)
 *       → Last Saved: straight to the run (saving first would leave nothing to restore)
 *   → the run (J4's: Uninstall, Install, Verify; Save Your Changes first when saving) → the small result
 *
 * Restore is the standard blue (rule 20). The question's content is known before it opens, so it
 * opens at its final size and never grows (rules 12 to 14).
 */

import { DialogContainer, Radio, RadioGroup } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { useTraceLast } from './j2-parts';
import { SaveFirstWindow, useRunTick } from './j2-windows';
import { RunWindow } from './j3-windows';
import { CheckWindow, restoreRun } from './j4-windows';
import { LUMA_PACK, PACKS, type PackName } from './scenarioInstall';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { Modal } from '@/core/ui/components/ui/Modal';
import { ResultDialog } from '@/core/ui/components/ui/ResultDialog';

/** Where Restore takes Commerce on the SC's own datapack. */
type Point = 'last' | 'original';

type Phase = 'check' | 'question' | 'save-first' | 'run' | 'restored';

/**
 * The SC's own datapack's two points. Last Saved is the card's date (`PACKS`), so the two places
 * agree; the original's date is the prototype's.
 */
const LAST_SAVED = PACKS['My Luma'].saved.replace(/^Saved /u, '');
const ORIGINAL = 'Nov 3, 2:40 PM';

/** The one line, when there is one point only. Luma's is the decision's; My Luma's is PROPOSED. */
function oneLine(pack: PackName): string {
    if (pack === LUMA_PACK) return `Commerce goes back to ${pack} as it ships.`;
    return `Commerce goes back to ${pack}'s original from ${ORIGINAL}.`;
}

interface QuestionProps {
    pack: PackName;
    /** The SC has unsaved edits on their own datapack: Last Saved is a point too. */
    choose: boolean;
    point: Point;
    onPoint: (point: Point) => void;
    onRestore: () => void;
    onClose: () => void;
}

/** "Restore <pack>?": the choice when there are two points, else the one line. Small, as J4-3's. */
function RestoreQuestion({ pack, choose, point, onPoint, onRestore, onClose }: QuestionProps): React.ReactElement {
    return (
        <Modal
            title={`Restore ${pack}?`}
            status="warning"
            size="S"
            fitContent
            onClose={onClose}
            closeLabel="Cancel"
            actionButtons={[{ label: 'Restore', variant: 'accent', onPress: onRestore }]}
        >
            {choose ? (
                <RadioGroup aria-label={`Restore ${pack} to`} value={point} onChange={(v) => onPoint(v === 'original' ? 'original' : 'last')}>
                    <Radio value="last">{`Last Saved, ${LAST_SAVED}`}</Radio>
                    <Radio value="original">{`Original, ${ORIGINAL}`}</Radio>
                </RadioGroup>
            ) : (
                <LeadText sentences>{oneLine(pack)}</LeadText>
            )}
        </Modal>
    );
}

/** The job's state: the phase, the point chosen, whether it saves first, the run's clock. */
function useRestoreJob(pack: PackName, choose: boolean, onSettled: () => void) {
    const [phase, setPhase] = useState<Phase>('check');
    const [point, setPoint] = useState<Point>('last');
    const [saves, setSaves] = useState(false);
    const [started, setStarted] = useState({ id: 0, at: Date.now() });
    const run = restoreRun(pack, saves);
    const tick = useRunTick(phase === 'run', run.last, started.id);
    const ended = phase === 'run' && tick >= run.last;
    useTraceLast(`Restore: ${phase}`);
    const start = (saving: boolean): void => {
        setSaves(saving);
        setStarted((s) => ({ id: s.id + 1, at: Date.now() }));
        setPhase('run');
    };
    // Original over unsaved edits asks to save first; anything else runs.
    const restore = (): void => (choose && point === 'original' ? setPhase('save-first') : start(false));
    useEffect(() => {
        if (phase !== 'check') return undefined;
        const t = setTimeout(() => setPhase('question'), window.__J1__.checkMs());
        return () => clearTimeout(t);
    }, [phase]);
    useEffect(() => {
        if (!ended) return;
        onSettled();
        setPhase('restored');
    }, [ended]); // eslint-disable-line react-hooks/exhaustive-deps
    return { phase, point, setPoint, run, tick, startedAt: started.at, restore, start };
}

export interface J9RestoreWindowProps {
    pack: PackName;
    /** Unsaved edits on the SC's own datapack: the window offers Last Saved and Original. */
    choose: boolean;
    onClose: () => void;
    /** The restore ran. */
    onSettled: () => void;
}

export function J9RestoreWindow({ pack, choose, onClose, onSettled }: J9RestoreWindowProps): React.ReactElement {
    const r = useRestoreJob(pack, choose, onSettled);
    if (r.phase === 'restored') return <ResultDialog isOpen title={r.run.done} status="success" onClose={onClose} />;
    let shown: React.ReactElement;
    if (r.phase === 'run') shown = <RunWindow run={r.run} tick={r.tick} startedAt={r.startedAt} onClose={onClose} />;
    else if (r.phase === 'save-first') shown = <SaveFirstWindow verb="Restore" onRun={r.start} onClose={onClose} />;
    else if (r.phase === 'question') shown = <RestoreQuestion pack={pack} choose={choose} point={r.point} onPoint={r.setPoint} onRestore={r.restore} onClose={onClose} />;
    else shown = <CheckWindow pack={pack} onClose={onClose} />;
    return <DialogContainer onDismiss={onClose}>{shown}</DialogContainer>;
}
