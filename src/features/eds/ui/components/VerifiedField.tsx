/**
 * VerifiedField
 *
 * Presentational component for text fields that require backend verification.
 * Shows verifying spinner and verified checkmark states.
 *
 * @example
 * <VerifiedField
 *   label="Organization"
 *   value={org}
 *   onChange={setOrg}
 *   onBlur={handleVerify}
 *   isVerifying={isVerifying}
 *   isVerified={isVerified}
 *   error={error}
 *   placeholder="your-org"
 *   description="Your DA.live organization name"
 * />
 */

import Alert from '@spectrum-icons/workflow/Alert';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React from 'react';
import { TextField, Flex, Text, ProgressCircle } from '@/core/ui/components/aria';

/** Props for VerifiedField component */
export interface VerifiedFieldProps {
    /** Field label */
    label: string;
    /** Current value */
    value: string;
    /** Called when value changes */
    onChange: (value: string) => void;
    /** Called when field loses focus */
    onBlur: () => void;
    /** Whether verification is in progress */
    isVerifying: boolean;
    /** Whether field is verified */
    isVerified: boolean;
    /** Error message to display */
    error?: string;
    /** Placeholder text */
    placeholder?: string;
    /** Description text below field */
    description?: string;
    /** Whether field is required */
    isRequired?: boolean;
    /** Full width - use style prop or className for width control */
    width?: string; // Note: Pass via style={{ width }} or use className="w-full"
}

/**
 * Check if verified indicator should be shown (SOP §10 extraction)
 *
 * Condition: isVerified && !isVerifying && !error
 * Shows checkmark only when verified, not currently verifying, and no error
 */
function shouldShowVerified(isVerified: boolean, isVerifying: boolean, error: string | undefined): boolean {
    return isVerified && !isVerifying && !error;
}

/**
 * VerifiedField Component
 *
 * TextField with verification status indicators.
 * Pure presentational component - no business logic.
 */
export function VerifiedField({
    label,
    value,
    onChange,
    onBlur,
    isVerifying,
    isVerified,
    error,
    placeholder,
    description,
    isRequired,
    width = '100%',
}: VerifiedFieldProps): React.ReactElement {
    // Determine validation state
    const getValidationState = (): 'invalid' | 'valid' | undefined => {
        if (error) return 'invalid';
        if (isVerified) return 'valid';
        return undefined;
    };

    return (
        <Flex direction="column" gap="size-100" style={width ? { width } : undefined}>
            <Flex alignItems="end" gap="size-200">
                <TextField
                    label={label}
                    value={value}
                    onChange={onChange}
                    onBlur={onBlur}
                    placeholder={placeholder}
                    description={description}
                    isRequired={isRequired}
                    className="w-full"
                    validationState={getValidationState()}
                />

                {isVerifying && (
                    <ProgressCircle
                        aria-label="Verifying"
                        isIndeterminate
                        size="S"
                    />
                )}

                {shouldShowVerified(isVerified, isVerifying, error) && (
                    <Flex alignItems="center" gap="size-100">
                        <CheckmarkCircle size="S" />
                        <Text className="text-green-600">
                            Verified
                        </Text>
                    </Flex>
                )}
            </Flex>

            {error && (
                <Flex alignItems="center" gap="size-100">
                    <Alert size="S" />
                    <Text className="text-red-600">
                        {error}
                    </Text>
                </Flex>
            )}

            <style>{`
                .text-green-500 { color: var(--spectrum-semantic-positive-color-icon); }
                .text-red-500 { color: var(--spectrum-semantic-negative-color-icon); }
            `}</style>
        </Flex>
    );
}
