/**
 * A box as tall as its content, with a floor the caller can name and a say in where short content
 * sits. It used to ease each change of height; a dialog's size no longer animates at all (owner,
 * 2026-11-02, `useDialogViewChange`).
 *
 * @module core/ui/components/layout/SteadyHeight
 */

import { Flex } from '@adobe/react-spectrum';
import React from 'react';

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

export function SteadyHeight({ children, minHeight = 0, align = 'center' }: SteadyHeightProps): React.ReactElement {
    return (
        // `width="100%"` is not decoration: Spectrum's Flex constrains width at 450px
        // (root CLAUDE.md).
        <Flex direction="column" justifyContent={align} minHeight={minHeight || undefined} width="100%">
            <div>{children}</div>
        </Flex>
    );
}
