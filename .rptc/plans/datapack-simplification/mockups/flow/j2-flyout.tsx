/**
 * PROPOSED stand-in for the Datapacks screen behind J2's window: the cards and the flyout. Installed
 * is the blue check and blue border and nothing else; the screen has no chosen state, and clicking a
 * card opens its flyout, where the actions live (Phase 5; owner, 2026-11-11, J2-1: the card's own
 * Install button was the prototype's invention and is gone). The flyout follows the approved Phase 7
 * mockup (name, the save's date, Data, then the action bar pinned under the body), drawn with the
 * house `Drawer` and its sections, with Restore My Luma in place of the mockup's "Install Again" on
 * the datapack the demo uses (Phase 5) and Install on one it does not.
 */

import { ActionButton, Badge, Button, Tooltip, TooltipTrigger } from '@adobe/react-spectrum';
import Close from '@spectrum-icons/workflow/Close';
import React from 'react';
import { PACKS, type DemoUses, type Pack, type PackName } from './scenarioInstall';
import { dataTypeLabel } from '@/features/data-installer/ui/dataTypeLabel';
import { Drawer } from '@/core/ui/components/ui/Drawer';
import { Fact, FactList } from '@/core/ui/components/ui/FactList';
import { SelectionCheck } from '@/core/ui/components/ui/SelectionCheck';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { useActivateOnKey } from '@/core/ui/hooks/useActivateOnKey';
import { cn } from '@/core/ui/utils/classNames';
import '@/core/ui/styles/drawer.css';

const stopPropagation = (e: React.SyntheticEvent): void => e.stopPropagation();

/**
 * The amber dot beside the date (J4), saying on hover and focus what the latest save holds: the
 * product card's `NewerMark` (DatapackCard.tsx), which it does not export, drawn the same way. Its
 * press stays inside it, as the product's version row's does, so it never opens the flyout.
 */
function NewerMark({ said }: { said: string }): React.ReactElement {
    return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- containment only, as DatapackCard's version row
        <span onClick={stopPropagation} onKeyDown={stopPropagation}>
            <TooltipTrigger delay={300}>
                <ActionButton isQuiet aria-label={said} UNSAFE_className="datapack-card-newer">
                    <StatusDot variant="warning" />
                </ActionButton>
                <Tooltip>{said}</Tooltip>
            </TooltipTrigger>
        </span>
    );
}

interface CardProps {
    pack: Pack;
    installed: boolean;
    newer?: string;
    /** A status line under the name, as an integration card's (J6: a failed install); absent, none. */
    status?: React.ReactNode;
    /** The card's tag on the date's line (J8: Mine, Demo Builder); absent, none. */
    tag?: string;
    onOpen: () => void;
}

/** One card: art, name with the blue check when the demo uses it, the save's date, and the amber dot (J4). */
function Card({ pack, installed, newer, status, tag, onOpen }: CardProps): React.ReactElement {
    const onKeyDown = useActivateOnKey(onOpen);
    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={pack.name}
            className={cn('datapack-card', installed && 'is-selected')}
            data-datapack={pack.name}
            onClick={onOpen}
            onKeyDown={onKeyDown}
        >
            <div className="datapack-card-art">
                <span className="datapack-card-tile">{pack.name.charAt(0)}</span>
            </div>
            <div className="datapack-card-body">
                <div className="datapack-card-title-row">
                    <span className="datapack-card-name">{pack.name}</span>
                    {installed ? <SelectionCheck /> : null}
                </div>
                {status ? <div className="integration-card-statusline">{status}</div> : null}
                <div className="datapack-card-version-row">
                    <span className={cn('datapack-card-version', newer && 'datapack-card-version--newer')}>
                        {pack.saved}
                        {newer ? <NewerMark said={newer} /> : null}
                    </span>
                    {tag ? (
                        <span className="datapack-card-tags">
                            <Badge variant="neutral" UNSAFE_className="datapack-card-tag">{tag}</Badge>
                        </span>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export interface DatapackCardsProps {
    demo: DemoUses;
    onOpen: (pack: PackName) => void;
    /** The datapacks a J3 step says exist (J3-2: none of the SC's yet); absent, every one. */
    packs?: readonly PackName[];
    /** The amber dot's hover on the card of the datapack the demo uses (J4); absent, no dot. */
    newer?: string;
    /** A card's status line, by datapack (J6); absent, none. */
    statuses?: Partial<Record<PackName, React.ReactNode>>;
    /** A card's tag, by datapack (J8); absent, none. */
    tags?: Partial<Record<PackName, string>>;
}

/** The cards: every datapack, or the ones a J3 step says exist. */
export function DatapackCards({ demo, onOpen, packs, newer, statuses, tags }: DatapackCardsProps): React.ReactElement {
    return (
        <div className="datapack-grid j2-cards">
            {Object.values(PACKS).filter((pack) => !packs || packs.includes(pack.name)).map((pack) => (
                <Card
                    key={pack.name}
                    pack={pack}
                    installed={pack.name === demo}
                    {...(newer && pack.name === demo ? { newer } : {})}
                    {...(statuses?.[pack.name] ? { status: statuses[pack.name] } : {})}
                    {...(tags?.[pack.name] ? { tag: tags[pack.name] } : {})}
                    onOpen={() => onOpen(pack.name)}
                />
            ))}
        </div>
    );
}

/**
 * The action bar. Install works in J2; More works on the demo's datapack in J3 (Undo Last Save);
 * Restore My Luma works in J4. Saving
 * is not here: it lives in the header only (Phase 7b: "The flyout's Save goes"). The rest are inert and
 * say where they are built, in the prototype's own style so the note never reads as the product.
 */
interface ActionsProps {
    pack: PackName;
    installed: boolean;
    /** Another datapack is installed: the main button reads Switch to <pack> (owner, 2026-11-12). */
    switching?: boolean;
    onInstall?: () => void;
    onRestore?: () => void;
    more?: React.ReactNode;
}

function Actions({ pack, installed, switching, onInstall, onRestore, more }: ActionsProps): React.ReactElement {
    const later = installed && !onRestore ? `Restore ${pack} is built in J4` : '';
    const moreNote = more ? 'More\'s other items are built in J8' : 'More is built in J8';
    return (
        <>
            <div className="proto-note">{`Prototype: ${[later, moreNote].filter(Boolean).join(', ')}.`}</div>
            <div className="db-drawer-actions">
                {installed ? (
                    <Button variant="accent" isDisabled={!onRestore} onPress={onRestore}>{`Restore ${pack}`}</Button>
                ) : (
                    <Button variant="accent" isDisabled={!onInstall} onPress={onInstall}>{switching ? `Switch to ${pack}` : 'Install'}</Button>
                )}
                {more ?? <Button variant="secondary" isDisabled>More ▾</Button>}
            </div>
        </>
    );
}

export interface DatapackFlyoutProps {
    /** The datapack whose card was clicked; none when the flyout is closed. */
    pack: PackName | null;
    demo: DemoUses;
    onClose: () => void;
    /** Install on a datapack the demo does not use (J2); absent, Install is inert (J3). */
    onInstall?: (pack: PackName) => void;
    /** The More menu for the datapack the demo uses (J3); absent, More is inert. */
    more?: React.ReactNode;
    /** Restore on the datapack the demo uses (J4); absent, Restore is inert. */
    onRestore?: () => void;
    /** The health line under the title, as an integration flyout's (J6); absent, none. */
    status?: React.ReactNode;
    /** The whole action bar, in place of Install or Restore and More (J6, J8); absent, the bar above. */
    actions?: React.ReactNode;
}

/** The name and the save's date, and under them the health line when there is one (J6). */
function FlyoutTitle({ pack, status }: { pack: Pack; status?: React.ReactNode }): React.ReactElement {
    const title = (
        <div className="datapack-panel-title">
            <span className="datapack-card-name">{pack.name}</span>
            <span className="datapack-panel-version">{pack.saved}</span>
        </div>
    );
    if (!status) return title;
    return (
        <div className="integration-panel-heading">
            {title}
            {status}
        </div>
    );
}

export function DatapackFlyout({ pack, demo, onClose, onInstall, more, onRestore, status, actions }: DatapackFlyoutProps): React.ReactElement {
    const shown = pack ? PACKS[pack] : null;
    return (
        <Drawer isOpen={shown !== null} onClose={onClose} ariaLabel={`${pack ?? 'Datapack'} details`}>
            {shown ? (
                <>
                    <div className={status ? 'db-drawer-head integration-panel-head' : 'db-drawer-head'}>
                        <FlyoutTitle pack={shown} status={status} />
                        <ActionButton isQuiet aria-label="Close details" onPress={onClose}>
                            <Close size="S" />
                        </ActionButton>
                    </div>
                    <div className="db-drawer-body">
                        <FactList>
                            <Fact label="Data">{shown.types.map((t) => dataTypeLabel(t.code)).join(', ')}</Fact>
                        </FactList>
                    </div>
                    {actions ?? <Actions pack={shown.name} installed={shown.name === demo} switching={demo !== 'none' && shown.name !== demo} {...(onInstall ? { onInstall: () => onInstall(shown.name) } : {})} {...(shown.name === demo && more ? { more } : {})} {...(shown.name === demo && onRestore ? { onRestore } : {})} />}
                </>
            ) : null}
        </Drawer>
    );
}
