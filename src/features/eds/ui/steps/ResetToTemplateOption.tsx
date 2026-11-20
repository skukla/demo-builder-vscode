/**
 * ResetToTemplateOption
 *
 * The "Reset to Template (Replaces All Content)" tick above the repository
 * list, with the house banner (`InlineNotice`) beneath it. What it shows is
 * decided by `describeResetOption`; this only draws that decision.
 *
 * The banner replaced a line of small orange text (owner, 2026-11-20): the same
 * warning every other screen draws, and readable.
 *
 * @module features/eds/ui/steps/ResetToTemplateOption
 */

import { Checkbox, Flex } from '@adobe/react-spectrum';
import React from 'react';
import { describeResetOption, type RepoReadinessState } from './repoSelectionInline.helpers';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';

/**
 * ResetToTemplateOption - reset control, presented by what the repo contains.
 *
 * Consent is asked only where something could be destroyed. An empty repo is
 * reset automatically and told, not asked; a populated non-storefront requires
 * the reset because setup cannot otherwise succeed; a real storefront gets the
 * original prompt and warning.
 */
export function ResetToTemplateOption({
    resetToTemplate,
    onResetToTemplateChange,
    disabled = false,
    readiness,
    unusable = false,
    templateName,
}: {
    resetToTemplate: boolean;
    onResetToTemplateChange: (isSelected: boolean) => void;
    /** Disabled until a repository is selected; always rendered so the row never reflows. */
    disabled?: boolean;
    /** Undefined while the readiness check is in flight. */
    readiness?: RepoReadinessState;
    /**
     * The repo cannot be used for a reason a reset would NOT fix — today, a
     * non-`main` default branch. Silences this control so the notice above it
     * is the only thing asking for attention.
     */
    unusable?: boolean;
    /** What the reset goes back to, when it is an added demo ("Reset to Isle5 by Robin"). */
    templateName?: string;
}): React.ReactElement {
    const { checked, locked, tone, title, detail } = describeResetOption(
        readiness,
        resetToTemplate,
        disabled,
        unusable,
    );

    return (
        <Flex direction="column" gap="size-50" UNSAFE_className="reset-to-template-top">
            <Checkbox isSelected={checked} isDisabled={locked} onChange={onResetToTemplateChange}>
                {`Reset to ${templateName ?? 'Template'} (Replaces All Content)`}
            </Checkbox>

            {/* Slides open under the tick and closes when there is nothing to say. */}
            <div className={tone === 'none' ? 'reset-warning-hidden' : 'reset-warning-visible'}>
                {tone === 'none' ? null : (
                    <InlineNotice title={title} tone={tone === 'info' ? 'info' : 'warning'}>
                        {detail}
                    </InlineNotice>
                )}
            </div>
        </Flex>
    );
}
