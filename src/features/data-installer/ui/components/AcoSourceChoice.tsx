/**
 * Where an ACO pack is made from, in "Create datapack" (owner, 2026-10-31, PL-60 P1): this
 * project's Commerce instance (G5's ACO export, built) or a public website (slice A). Drawn by
 * `CreateDatapackModal` under its pack-type choice once ACO is chosen; the state is the modal's.
 *
 * The URL is the house `FormField` (type `url`), so it looks and reads like every other field.
 *
 * @module features/data-installer/ui/components/AcoSourceChoice
 */

import { Radio, RadioGroup } from '@adobe/react-spectrum';
import React from 'react';
import { FormField } from '@/core/ui/components/forms/FormField';

/** The two sources an ACO pack can be made from here. */
export type AcoSource = 'instance' | 'website';

export interface AcoSourceChoiceProps {
    source: AcoSource;
    onSourceChange: (source: AcoSource) => void;
    url: string;
    onUrlChange: (url: string) => void;
    /** Why the website could not be opened, in the handler's words. */
    error?: string;
}

const WEBSITE_HELP =
    "Opens this project's AI to read the products on that page and save them as an ACO pack in " +
    'your datapack library. Prices, SKUs or currencies the page does not state are marked for you to review.';

export function AcoSourceChoice({ source, onSourceChange, url, onUrlChange, error }: AcoSourceChoiceProps): React.JSX.Element {
    return (
        <>
            <RadioGroup
                label="Made from"
                value={source}
                onChange={(value) => onSourceChange(value === 'website' ? 'website' : 'instance')}
            >
                <Radio value="instance">From this Commerce instance</Radio>
                <Radio value="website">From a website</Radio>
            </RadioGroup>
            {source === 'website' && (
                <FormField
                    fieldKey="aco-website-url"
                    label="Product listing page"
                    type="url"
                    value={url}
                    onChange={onUrlChange}
                    placeholder="https://"
                    description={WEBSITE_HELP}
                    required
                    {...(error ? { error, showError: true } : {})}
                />
            )}
        </>
    );
}
