/**
 * A box as tall as its content, easing to each new height instead of jumping.
 *
 * A modal that walks through states resizes at every step. The import modal was three
 * different heights in one run (the form, then the spinner, then "Dry run passed") and
 * the whole dialog jumped twice while the SC watched (owner, 2026-09-20: "this is bad UX").
 *
 * It used to hold the tallest height it had shown and never shrink, which stopped the
 * jumps and left every short state floating in dead space: a one-line result in a
 * form-sized box. The dialog design rules (owner, 2026-10-31,
 * `docs/development/sop/dialog-design.md`) settled it the other way: the height fits the
 * content, and the change eases, growing or shrinking. The dialog is pinned near the top,
 * so a change moves only its bottom edge.
 *
 * @module core/ui/components/layout/SteadyHeight
 */

import { Flex } from '@adobe/react-spectrum';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { useGrowthAnimation } from './useGrowthAnimation';
import { cn } from '@/core/ui/utils/classNames';

export interface SteadyHeightProps {
    children: React.ReactNode;
    /** A floor, for a first state known to be short. */
    minHeight?: number;
    /**
     * Where content shorter than the floor sits. `center` (the default) suits a spinner;
     * `start` suits a form, which reads from the top.
     */
    align?: 'center' | 'start';
}

/*
 * There is deliberately NO `className` prop. A `className={className}` pass-through
 * is a class this repo's cross-bundle check cannot read, and it counts once per
 * bundle rendering the component — three, here, which pushed a shrink-only ratchet
 * past its ceiling. The caller keeps its own class on its own element inside, where
 * the check reads it as a literal (ADR-017 §6).
 */

/** Fit the content's height, easing each change. */
export function SteadyHeight({
    children,
    minHeight = 0,
    align = 'center',
}: SteadyHeightProps): React.ReactElement {
    const content = useRef<HTMLDivElement>(null);
    const [measured, setMeasured] = useState(0);
    const growth = useGrowthAnimation();

    // After every render, with no dependency list: what changes is the CONTENT, and
    // a parent re-rendering with different children is exactly the case to measure.
    // `scrollHeight` of the INNER box reads what the content needs whatever height the
    // outer one is held at while it eases.
    //
    // The lint rule's infinite-update warning does not apply: the render this causes
    // measures the same content height and stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => {
        const needed = content.current?.scrollHeight ?? 0;
        if (needed !== measured) {
            // Ease from the old height; the first measure has nothing to ease from.
            if (measured > 0) growth.grow(measured, needed);
            setMeasured(needed);
        }
    });

    // Spectrum's own layout props rather than a style attribute: the inline-style
    // ledger is empty on purpose and a measured number is not worth re-opening it.
    return (
        // `width="100%"` is not decoration: Spectrum's Flex constrains width at 450px
        // (root CLAUDE.md).
        <Flex
            direction="column"
            justifyContent={align}
            minHeight={minHeight || undefined}
            height={growth.height}
            width="100%"
            UNSAFE_className={cn('steady-height', growth.growing && 'is-growing')}
        >
            <div ref={content}>{children}</div>
        </Flex>
    );
}
