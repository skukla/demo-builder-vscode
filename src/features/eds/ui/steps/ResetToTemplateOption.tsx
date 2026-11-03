/**
 * ResetToTemplateOption
 *
 * The "Reset to Template (Replaces All Content)" tick above the repository
 * list, with the one-line notice beneath it. What it shows is decided by
 * `describeResetOption`; this only draws that decision.
 *
 * @module features/eds/ui/steps/ResetToTemplateOption
 */

import { Checkbox, Flex, Text, View } from '@adobe/react-spectrum';
import React from 'react';
import { describeResetOption, type RepoReadinessState } from './repoSelectionInline.helpers';
import { StatusIcon } from '@/core/ui/components/feedback/StatusIcon';

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
    /** What the reset goes back to, when it is an added demo ("Reset to Isle5 by Jen"). */
    templateName?: string;
}): React.ReactElement {
    const { checked, locked, tone, message } = describeResetOption(
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

            <View marginStart="size-300" UNSAFE_className="reset-warning-container">
                <Flex
                    alignItems="center"
                    gap="size-100"
                    UNSAFE_className={
                        tone === 'none' ? 'reset-warning-hidden' : 'reset-warning-visible'
                    }
                >
                    <span className="flex-shrink-0">
                        <StatusIcon status={tone === 'info' ? 'info' : 'warning'} />
                    </span>
                    <Text
                        UNSAFE_className={
                            tone === 'info' ? 'text-xs text-informative' : 'text-xs text-notice'
                        }
                    >
                        {message}
                    </Text>
                </Flex>
            </View>
        </Flex>
    );
}
