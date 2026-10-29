/**
 * AddCard — "add another" as a dashed card at the END of a card grid (PL-62).
 *
 * Owner decision, 2026-09-21: on every grid where an SC adds to a set, adding is
 * a card in the grid, not a button in the header. Extracted from the Welcome
 * step's "Add a demo package" card (BrandGallery), which was the first one.
 *
 * The HOST passes its own card-shape class (`cardClassName`) so the card has its
 * neighbours' size, border and padding; this component adds only what makes it
 * an invitation — the dashed border, the "+", the centring (`add-card.css`).
 * A bundle rendering it must import `@/core/ui/styles/add-card.css` (ADR-017 §6;
 * `tests/sop/stylesheet-bundles.test.ts` fails the build if it does not).
 *
 * Rules every host follows (PL-62's open questions, answered in its log):
 *   - it is not an item: leave it out of counts, and hide it while a filter
 *     narrows the grid (a card that cannot match a search reads as a result);
 *   - it is the grid's LAST cell, so it renders inside the grid element.
 *
 * WITH A MENU (`menu`): where adding is a choice — Your Projects offers New, Copy
 * from existing and Import from file (owner, 2026-10-05) — the card opens the
 * host's Spectrum `Menu` instead of calling `onOpen`. The card is then a plain
 * box holding ONE menu button that fills it: Spectrum's `MenuTrigger` attaches
 * only to a Spectrum pressable, so the trigger is an `ActionButton`, stretched
 * across the card by `.add-card-trigger` (add-card.css).
 *
 * @module core/ui/components/ui/AddCard
 */

import { ActionButton, MenuTrigger } from '@adobe/react-spectrum';
import React from 'react';
import { useActivateOnKey } from '@/core/ui/hooks/useActivateOnKey';
import { cn } from '@/core/ui/utils/classNames';

interface AddCardBaseProps {
    /** What adding does, as a person reads it: "Add an integration". */
    name: string;
    /** Optional second line; also part of the accessible name. */
    description?: string;
    /** The host grid's card class, so the card is shaped like its neighbours. */
    cardClassName?: string;
    /** Dim with the other cards (e.g. once one is selected). */
    isDimmed?: boolean;
    /** Optional test id passthrough (on the card). */
    testId?: string;
}

/** Either the card opens the host's add flow, or it opens the host's menu of ways to add. */
export type AddCardProps = AddCardBaseProps &
    (
        | { /** Opens the host's add flow. */ onOpen: () => void; menu?: undefined }
        | { /** The host's Spectrum `Menu`: the ways to add. */ menu: React.ReactElement; onOpen?: undefined }
    );

function accessibleName(name: string, description: string | undefined): string {
    return description ? `${name}: ${description}` : name;
}

function CardWords({ name, description }: Pick<AddCardBaseProps, 'name' | 'description'>) {
    return (
        <>
            <span className="add-card-name">{name}</span>
            {description ? <span className="add-card-description">{description}</span> : null}
        </>
    );
}

/** The card whose whole face is one button opening the host's menu. */
function AddMenuCard({
    name,
    description,
    menu,
    cardClassName,
    isDimmed,
    testId,
}: AddCardBaseProps & { menu: React.ReactElement }): React.ReactElement {
    return (
        <div
            data-testid={testId}
            className={cn('add-card', 'add-card-menu', cardClassName, isDimmed && 'dimmed')}
        >
            <MenuTrigger>
                <ActionButton
                    isQuiet
                    aria-label={accessibleName(name, description)}
                    UNSAFE_className="add-card-trigger"
                >
                    <CardWords name={name} description={description} />
                </ActionButton>
                {menu}
            </MenuTrigger>
        </div>
    );
}

/** The dashed add card. */
export function AddCard(props: AddCardProps): React.ReactElement {
    if (props.menu) return <AddMenuCard {...props} menu={props.menu} />;
    return <AddButtonCard {...props} onOpen={props.onOpen} />;
}

function AddButtonCard({
    name,
    description,
    onOpen,
    cardClassName,
    isDimmed = false,
    testId,
}: AddCardBaseProps & { onOpen: () => void }): React.ReactElement {
    const handleKeyDown = useActivateOnKey(onOpen);
    return (
        <div
            role="button"
            tabIndex={0}
            data-testid={testId}
            onClick={onOpen}
            onKeyDown={handleKeyDown}
            className={cn('add-card', cardClassName, isDimmed && 'dimmed')}
            // Named by its words when it has one line; a label only joins two lines
            // into one sentence. An aria-label repeating the text would also make
            // the card answer every label query on its screen.
            aria-label={description ? accessibleName(name, description) : undefined}
        >
            <CardWords name={name} description={description} />
        </div>
    );
}
