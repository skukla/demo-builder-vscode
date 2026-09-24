/**
 * CommerceScopeList — a Commerce website, store and store view as sub-labelled
 * lines: a muted label, then the value, aligned down a column.
 *
 * The API Mesh flyout's "Commerce scope" row. Styles are `.integration-panel-scope*`
 * in integration-cards.css, which every bundle rendering this must import.
 *
 * @module core/ui/components/integrations/CommerceScopeList
 */

import React from 'react';
import type { CommerceScopePart } from './integrationCardModel.types';
import { cn } from '@/core/ui/utils/classNames';

/**
 * Render the parts, one line each, in the order given.
 *
 * @param props.parts - the levels that carry a code
 * @returns the lines, to sit inside a row's value cell
 */
export function CommerceScopeList({ parts }: { parts: CommerceScopePart[] }): React.ReactElement {
    return (
        <>
            {parts.map(({ label, code, name }) => (
                <span key={label} className="integration-panel-scope">
                    <span className="integration-panel-scope-key">{label}</span>
                    {/* Name first, code parenthesised and muted: the name is what the
                        user picked, the code is what is in the `.env` and what they
                        would grep for. With no name the code stands ALONE — not
                        "(unknown)", not an empty bracket. That is the correct
                        rendering wherever no name was captured, and it must not look
                        broken. */}
                    <span className="integration-panel-scope-value">
                        {name && <>{name} </>}
                        <span
                            className={cn(
                                'integration-panel-scope-code',
                                name && 'integration-panel-scope-code--aside',
                            )}
                        >
                            {name ? `(${code})` : code}
                        </span>
                    </span>
                </span>
            ))}
        </>
    );
}
