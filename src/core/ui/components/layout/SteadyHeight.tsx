/**
 * A box that never gets shorter than the tallest thing it has held.
 *
 * A modal that walks through states resizes at every step unless something stops
 * it. The Data Installer's import modal was three different heights in one run —
 * the form, then the spinner, then "Dry run passed" — and the whole dialog jumped
 * twice while the SC watched it work (owner, 2026-09-20: "this is bad UX").
 *
 * `CenteredFeedbackContainer` reserves a height you name, which is the right answer
 * when you know the number. Here nobody does: the import form is as tall as the pack
 * has data types, so a fixed reserve is dead space for a small pack and still jumps
 * for a large one. This measures instead — the first state sets the floor, a taller
 * state raises it, and nothing ever lowers it.
 *
 * It only grows, deliberately. A box tracking its content exactly would shrink back
 * the moment a shorter state arrived, which is the jump this exists to remove.
 *
 * @module core/ui/components/layout/SteadyHeight
 */

import { Flex } from '@adobe/react-spectrum';
import React, { useLayoutEffect, useRef, useState } from 'react';

export interface SteadyHeightProps {
    children: React.ReactNode;
    /** A floor to start from, for a first state known to be short. */
    minHeight?: number;
}

/*
 * There is deliberately NO `className` prop. A `className={className}` pass-through
 * is a class this repo's cross-bundle check cannot read, and it counts once per
 * bundle rendering the component — three, here, which pushed a shrink-only ratchet
 * past its ceiling. The caller keeps its own class on its own element inside, where
 * the check reads it as a literal (ADR-017 §6).
 */

/** Hold the height of the tallest state this box has shown. */
export function SteadyHeight({ children, minHeight = 0 }: SteadyHeightProps): React.ReactElement {
    const content = useRef<HTMLDivElement>(null);
    const [tallest, setTallest] = useState(minHeight);

    // After every render, with no dependency list: what changes is the CONTENT, and
    // a parent re-rendering with different children is exactly the case to measure.
    // `scrollHeight` of the INNER box reads what the content needs; measuring the
    // outer one would read the floor already applied and never grow again.
    //
    // The lint rule's infinite-update warning does not apply: this only ever raises
    // the floor towards a content height that does not move, so the render it causes
    // measures the same number and stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => {
        const needed = content.current?.scrollHeight ?? 0;
        if (needed > tallest) {
            setTallest(needed);
        }
    });

    // Spectrum's own layout props rather than a style attribute: the inline-style
    // ledger is empty on purpose and a measured number is not worth re-opening it,
    // and a class for two declarations would need a sheet every bundle rendering
    // this imports (ADR-017 §6). `justifyContent` centres a short state in the
    // reserved box instead of pinning it to the top with dead space under it — what
    // the progress modal's own fixed-height body does.
    return (
        // `width="100%"` is not decoration: Spectrum's Flex constrains width at 450px
        // (root CLAUDE.md), and the import form this wraps is three columns wide.
        <Flex
            direction="column"
            justifyContent="center"
            minHeight={tallest || undefined}
            width="100%"
        >
            <div ref={content}>{children}</div>
        </Flex>
    );
}
