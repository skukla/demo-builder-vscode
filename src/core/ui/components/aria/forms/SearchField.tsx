/**
 * SearchField Component
 *
 * An accessible search input component built with React Aria for keyboard
 * and screen reader support. Features a decorative search icon, clear button,
 * and Escape key clearing. Uses CSS Modules for styling.
 *
 * @example
 * <SearchField
 *   value={query}
 *   onChange={setQuery}
 *   placeholder="Search projects..."
 *   aria-label="Search projects"
 * />
 */

import React, { forwardRef, CSSProperties } from 'react';
import {
    SearchField as AriaSearchField,
    Input,
    Button,
} from 'react-aria-components';
import styles from './SearchField.module.css';
import { cn } from '@/core/ui/utils/classNames';
import { translateSpectrumToken, DimensionValue } from '@/core/ui/utils/spectrumTokens';

export interface SearchFieldProps {
    /** Current search value */
    value?: string;
    /** Change handler */
    onChange?: (value: string) => void;
    /** Placeholder text */
    placeholder?: string;
    /** Quiet style (no border) */
    isQuiet?: boolean;
    /** Whether field is disabled */
    isDisabled?: boolean;
    /** Auto focus on mount */
    autoFocus?: boolean;
    /** Width - Spectrum token or CSS value */
    width?: DimensionValue | string;
    /** Accessible label (required when no visible label) */
    'aria-label'?: string;
    /** Additional CSS class */
    className?: string;
}

/**
 * SearchField - Accessible search input with clear button
 *
 * Replaces @adobe/react-spectrum SearchField component.
 * Provides:
 * - Search icon (decorative)
 * - Clear button (shown when has value)
 * - Escape key clears input
 * - Accessible search semantics
 */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
    function SearchField(
        {
            value,
            onChange,
            placeholder = 'Search...',
            isQuiet = false,
            isDisabled = false,
            autoFocus = false,
            width,
            'aria-label': ariaLabel,
            className,
        },
        ref,
    ) {
        const style: CSSProperties = {};
        if (width !== undefined) {
            // Handle both token strings and CSS values like "100%"
            const resolved = translateSpectrumToken(width as DimensionValue);
            style.width = resolved || width;
        }

        const hasValue = value && value.length > 0;

        return (
            <AriaSearchField
                className={cn(
                    styles.searchField,
                    isQuiet && styles.quiet,
                    className,
                )}
                isDisabled={isDisabled}
                value={value}
                onChange={onChange}
                autoFocus={autoFocus}
                aria-label={ariaLabel}
                style={Object.keys(style).length > 0 ? style : undefined}
            >
                {/* Search icon - decorative */}
                <span className={styles.searchIcon} aria-hidden="true">
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                    >
                        <path d="M11.5 6.5a5 5 0 1 0-1.707 3.793l3.707 3.707 1-1-3.707-3.707A5 5 0 0 0 11.5 6.5zm-5 4a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
                    </svg>
                </span>

                <Input
                    ref={ref}
                    className={styles.input}
                    placeholder={placeholder}
                />

                {/* Clear button - only shown when has value */}
                {hasValue && (
                    <Button className={styles.clearButton} aria-label="Clear search">
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="currentColor"
                        >
                            <path d="M6 4.586L9.293 1.293l1.414 1.414L7.414 6l3.293 3.293-1.414 1.414L6 7.414l-3.293 3.293-1.414-1.414L4.586 6 1.293 2.707l1.414-1.414L6 4.586z" />
                        </svg>
                    </Button>
                )}
            </AriaSearchField>
        );
    },
);

SearchField.displayName = 'SearchField';
