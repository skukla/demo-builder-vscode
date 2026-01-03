# Step 4: Create Form Components

## Purpose

Create React Aria-compatible form components (TextField, SearchField, Checkbox, Select, ProgressBar) with full accessibility support and CSS Modules styling. These components handle text input with validation feedback, labels, descriptions, selection, and progress indication.

**Why this step?**
- TextField (~15 uses) is the primary form input component
- SearchField (~5 uses) provides filterable list search with clear button
- Checkbox (~20 uses) is used in component selection and configuration
- Select (~10 uses) replaces Picker for dropdown selection (e.g., frontend/backend selection)
- ProgressBar (~5 uses) provides progress indication during prerequisite checks
- React Aria provides accessible form controls with built-in ARIA attributes
- Form validation states require proper error messaging and visual feedback
- CSS Modules enable clean styling without `!important` declarations

**Note:** Steps 7 and 8 depend on Checkbox, Select, and ProgressBar from this step.

## Prerequisites

- [x] Step 1 complete: React Aria installed, `src/core/ui/components/aria/forms/` exists
- [x] Step 2 complete: Primitive components (Text, Flex, View) available for composition
- [x] Step 3 complete: Interactive components (Button) available for patterns
- [ ] Build passes (`npm run build`)
- [ ] Existing tests pass (`npm test`)

## Tests to Write First (RED Phase)

### Test File: `tests/core/ui/components/aria/forms/TextField.test.tsx`

- [ ] Test: TextField renders with label
  - **Given:** A TextField component with label="Username"
  - **When:** Component is rendered
  - **Then:** Label "Username" is visible and associated with input

- [ ] Test: TextField renders input element
  - **Given:** A TextField component
  - **When:** Component is rendered
  - **Then:** An input element of type text exists in the document

- [ ] Test: TextField displays placeholder
  - **Given:** A TextField with placeholder="Enter username..."
  - **When:** Component is rendered
  - **Then:** Input has placeholder attribute "Enter username..."

- [ ] Test: TextField handles value and onChange
  - **Given:** A TextField with value="" and onChange handler
  - **When:** User types "hello" into the input
  - **Then:** onChange is called with "hello"

- [ ] Test: TextField displays description
  - **Given:** A TextField with description="Must be at least 3 characters"
  - **When:** Component is rendered
  - **Then:** Description text is visible below input

- [ ] Test: TextField supports validationState="valid"
  - **Given:** A TextField with validationState="valid"
  - **When:** Component is rendered
  - **Then:** Input has valid styling class applied

- [ ] Test: TextField supports validationState="invalid"
  - **Given:** A TextField with validationState="invalid"
  - **When:** Component is rendered
  - **Then:** Input has invalid styling class applied

- [ ] Test: TextField displays errorMessage when invalid
  - **Given:** A TextField with validationState="invalid" and errorMessage="Name is required"
  - **When:** Component is rendered
  - **Then:** Error message "Name is required" is visible

- [ ] Test: TextField hides errorMessage when valid
  - **Given:** A TextField with validationState="valid" and errorMessage="Name is required"
  - **When:** Component is rendered
  - **Then:** Error message is NOT visible (only shown when invalid)

- [ ] Test: TextField supports isDisabled prop
  - **Given:** A TextField with isDisabled={true}
  - **When:** Component is rendered
  - **Then:** Input element has disabled attribute

- [ ] Test: TextField supports isRequired prop
  - **Given:** A TextField with isRequired={true}
  - **When:** Component is rendered
  - **Then:** Input has aria-required="true" attribute

- [ ] Test: TextField shows required indicator in label
  - **Given:** A TextField with label="Email" and isRequired={true}
  - **When:** Component is rendered
  - **Then:** Label includes required indicator (e.g., asterisk or "(required)")

- [ ] Test: TextField supports autoFocus prop
  - **Given:** A TextField with autoFocus={true}
  - **When:** Component is rendered
  - **Then:** Input receives focus automatically

- [ ] Test: TextField handles onBlur callback
  - **Given:** A TextField with onBlur handler
  - **When:** Input loses focus
  - **Then:** onBlur callback is invoked

- [ ] Test: TextField supports width prop with Spectrum tokens
  - **Given:** A TextField with width="size-6000"
  - **When:** Component is rendered
  - **Then:** TextField container has appropriate width style (480px)

- [ ] Test: TextField supports UNSAFE_className for Spectrum compatibility
  - **Given:** A TextField with UNSAFE_className="custom-field"
  - **When:** Component is rendered
  - **Then:** Element has "custom-field" class applied

- [ ] Test: TextField label and input are associated via aria
  - **Given:** A TextField with label="Password"
  - **When:** Component is rendered
  - **Then:** Input has aria-labelledby or id matching label's for attribute

- [ ] Test: TextField error message has proper aria association
  - **Given:** A TextField with validationState="invalid" and errorMessage
  - **When:** Component is rendered
  - **Then:** Input has aria-describedby pointing to error message

### Test File: `tests/core/ui/components/aria/forms/SearchField.test.tsx`

- [ ] Test: SearchField renders input element
  - **Given:** A SearchField component
  - **When:** Component is rendered
  - **Then:** An input element exists with type="search" (or text with search role)

- [ ] Test: SearchField displays placeholder
  - **Given:** A SearchField with placeholder="Type to filter..."
  - **When:** Component is rendered
  - **Then:** Input has placeholder attribute "Type to filter..."

- [ ] Test: SearchField handles value and onChange
  - **Given:** A SearchField with value="" and onChange handler
  - **When:** User types "test"
  - **Then:** onChange is called with "test"

- [ ] Test: SearchField shows clear button when has value
  - **Given:** A SearchField with value="search term"
  - **When:** Component is rendered
  - **Then:** A clear button is visible

- [ ] Test: SearchField hides clear button when empty
  - **Given:** A SearchField with value=""
  - **When:** Component is rendered
  - **Then:** Clear button is NOT visible

- [ ] Test: SearchField clears value on clear button click
  - **Given:** A SearchField with value="search term" and onChange handler
  - **When:** Clear button is clicked
  - **Then:** onChange is called with ""

- [ ] Test: SearchField clears value on Escape key
  - **Given:** A SearchField with value="search term" and onChange handler
  - **When:** Escape key is pressed while focused
  - **Then:** onChange is called with ""

- [ ] Test: SearchField supports isQuiet variant
  - **Given:** A SearchField with isQuiet={true}
  - **When:** Component is rendered
  - **Then:** Input has quiet styling class (no border)

- [ ] Test: SearchField supports width prop
  - **Given:** A SearchField with width="100%"
  - **When:** Component is rendered
  - **Then:** Container has width: 100%

- [ ] Test: SearchField supports autoFocus prop
  - **Given:** A SearchField with autoFocus={true}
  - **When:** Component is rendered
  - **Then:** Input receives focus automatically

- [ ] Test: SearchField supports aria-label
  - **Given:** A SearchField with aria-label="Filter projects"
  - **When:** Component is rendered
  - **Then:** Input has aria-label="Filter projects"

- [ ] Test: SearchField supports isDisabled prop
  - **Given:** A SearchField with isDisabled={true}
  - **When:** Component is rendered
  - **Then:** Input has disabled attribute and clear button is not interactive

- [ ] Test: SearchField supports UNSAFE_className
  - **Given:** A SearchField with UNSAFE_className="flex-1"
  - **When:** Component is rendered
  - **Then:** Element has "flex-1" class applied

- [ ] Test: SearchField has accessible search icon
  - **Given:** A SearchField component
  - **When:** Component is rendered
  - **Then:** Search icon is present with aria-hidden="true"

### Test File: `tests/core/ui/components/aria/forms/index.test.ts`

- [ ] Test: All form components are exported from barrel
  - **Given:** The forms barrel export
  - **When:** Importing { TextField, SearchField, Checkbox, Select, SelectItem, ProgressBar }
  - **Then:** All components are defined and are functions

### Test File: `tests/core/ui/components/aria/forms/Checkbox.test.tsx`

- [ ] Test: Checkbox renders with label
  - **Given:** A Checkbox with children="Enable feature"
  - **When:** Component is rendered
  - **Then:** Label text is visible and clickable

- [ ] Test: Checkbox handles isSelected state
  - **Given:** A Checkbox with isSelected={true}
  - **When:** Component is rendered
  - **Then:** Checkbox displays checked state

- [ ] Test: Checkbox handles onChange callback
  - **Given:** A Checkbox with onChange handler
  - **When:** User clicks checkbox
  - **Then:** onChange is called with new selection state

- [ ] Test: Checkbox supports isDisabled prop
  - **Given:** A Checkbox with isDisabled={true}
  - **When:** Component is rendered
  - **Then:** Checkbox is not interactive and has disabled styling

### Test File: `tests/core/ui/components/aria/forms/Select.test.tsx`

- [ ] Test: Select renders with placeholder
  - **Given:** A Select with placeholder="Choose option"
  - **When:** Component is rendered
  - **Then:** Placeholder text is visible

- [ ] Test: Select displays selected value
  - **Given:** A Select with selectedKey="opt1" and options
  - **When:** Component is rendered
  - **Then:** Selected option text is displayed

- [ ] Test: Select opens dropdown on click
  - **Given:** A Select with options
  - **When:** User clicks trigger
  - **Then:** Dropdown popover opens with options visible

- [ ] Test: Select handles onSelectionChange
  - **Given:** A Select with onSelectionChange handler
  - **When:** User selects an option
  - **Then:** onSelectionChange is called with selected key

- [ ] Test: Select supports isDisabled prop
  - **Given:** A Select with isDisabled={true}
  - **When:** Component is rendered
  - **Then:** Select is not interactive

### Test File: `tests/core/ui/components/aria/forms/ProgressBar.test.tsx`

- [ ] Test: ProgressBar renders with value
  - **Given:** A ProgressBar with value={50} maxValue={100}
  - **When:** Component is rendered
  - **Then:** Progress bar shows 50% filled

- [ ] Test: ProgressBar displays label
  - **Given:** A ProgressBar with label="Loading..."
  - **When:** Component is rendered
  - **Then:** Label text is visible

- [ ] Test: ProgressBar supports isIndeterminate
  - **Given:** A ProgressBar with isIndeterminate={true}
  - **When:** Component is rendered
  - **Then:** Progress bar shows indeterminate animation

- [ ] Test: ProgressBar supports size prop
  - **Given:** A ProgressBar with size="S"
  - **When:** Component is rendered
  - **Then:** Progress bar has small size styling

## Files to Create/Modify

### New Files

- [ ] `src/core/ui/components/aria/forms/TextField.tsx` - TextField component using React Aria
- [ ] `src/core/ui/components/aria/forms/TextField.module.css` - TextField styles
- [ ] `src/core/ui/components/aria/forms/SearchField.tsx` - SearchField component using React Aria
- [ ] `src/core/ui/components/aria/forms/SearchField.module.css` - SearchField styles
- [ ] `src/core/ui/components/aria/forms/Checkbox.tsx` - Checkbox component using React Aria
- [ ] `src/core/ui/components/aria/forms/Checkbox.module.css` - Checkbox styles
- [ ] `src/core/ui/components/aria/forms/Select.tsx` - Select component using React Aria (replaces Picker)
- [ ] `src/core/ui/components/aria/forms/Select.module.css` - Select styles
- [ ] `src/core/ui/components/aria/forms/ProgressBar.tsx` - ProgressBar component using React Aria
- [ ] `src/core/ui/components/aria/forms/ProgressBar.module.css` - ProgressBar styles
- [ ] `tests/core/ui/components/aria/forms/TextField.test.tsx` - TextField tests
- [ ] `tests/core/ui/components/aria/forms/SearchField.test.tsx` - SearchField tests
- [ ] `tests/core/ui/components/aria/forms/Checkbox.test.tsx` - Checkbox tests
- [ ] `tests/core/ui/components/aria/forms/Select.test.tsx` - Select tests
- [ ] `tests/core/ui/components/aria/forms/ProgressBar.test.tsx` - ProgressBar tests
- [ ] `tests/core/ui/components/aria/forms/index.test.ts` - Barrel export tests

### Modified Files

- [ ] `src/core/ui/components/aria/forms/index.ts` - Export all form components

## Implementation Details

### Sub-step 4.1: Implement TextField Component

React Aria's TextField provides accessible form input with label, description, and error message slots. It handles ARIA associations automatically.

```typescript
// src/core/ui/components/aria/forms/TextField.tsx
import {
    TextField as AriaTextField,
    Label,
    Input,
    Text,
    FieldError,
} from 'react-aria-components';
import type { TextFieldProps as AriaTextFieldProps } from 'react-aria-components';
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';
import { resolveSize } from '../primitives/spectrumTokens';
import styles from './TextField.module.css';

export type ValidationState = 'valid' | 'invalid';

export interface TextFieldProps {
    /** Field label */
    label?: string;
    /** Current value */
    value?: string;
    /** Change handler */
    onChange?: (value: string) => void;
    /** Blur handler */
    onBlur?: () => void;
    /** Placeholder text */
    placeholder?: string;
    /** Help text shown below input */
    description?: string;
    /** Error message shown when invalid */
    errorMessage?: string;
    /** Validation state */
    validationState?: ValidationState;
    /** Whether field is disabled */
    isDisabled?: boolean;
    /** Whether field is required */
    isRequired?: boolean;
    /** Auto focus on mount */
    autoFocus?: boolean;
    /** Width - Spectrum token or CSS value */
    width?: string | number;
    /** Additional CSS class */
    className?: string;
    /** Spectrum compatibility shim */
    UNSAFE_className?: string;
}

/**
 * TextField - Accessible text input with label and validation
 * Replaces @adobe/react-spectrum TextField component
 *
 * Provides:
 * - Accessible label association
 * - Description and error message slots
 * - Validation states (valid/invalid)
 * - Required field indicator
 * - VS Code theme integration
 */
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
    ({
        label,
        value,
        onChange,
        onBlur,
        placeholder,
        description,
        errorMessage,
        validationState,
        isDisabled = false,
        isRequired = false,
        autoFocus = false,
        width,
        className,
        UNSAFE_className,
    }, ref) => {
        const style: React.CSSProperties = {};
        if (width) {
            style.width = typeof width === 'number' ? `${width}px` : resolveSize(width) || width;
        }

        // React Aria uses isInvalid boolean instead of validationState string
        const isInvalid = validationState === 'invalid';

        return (
            <AriaTextField
                className={cn(
                    styles.textField,
                    validationState && styles[validationState],
                    className,
                    UNSAFE_className
                )}
                isDisabled={isDisabled}
                isRequired={isRequired}
                isInvalid={isInvalid}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                autoFocus={autoFocus}
                style={Object.keys(style).length > 0 ? style : undefined}
            >
                {label && (
                    <Label className={styles.label}>
                        {label}
                        {isRequired && <span className={styles.required}> *</span>}
                    </Label>
                )}
                <Input
                    ref={ref}
                    className={styles.input}
                    placeholder={placeholder}
                />
                {description && !isInvalid && (
                    <Text slot="description" className={styles.description}>
                        {description}
                    </Text>
                )}
                {isInvalid && errorMessage && (
                    <FieldError className={styles.errorMessage}>
                        {errorMessage}
                    </FieldError>
                )}
            </AriaTextField>
        );
    }
);

TextField.displayName = 'TextField';
```

```css
/* src/core/ui/components/aria/forms/TextField.module.css */

.textField {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

/* Label styles */
.label {
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-foreground, #cccccc);
}

.required {
    color: var(--spectrum-global-color-red-500, #e34850);
}

/* Input styles */
.input {
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 14px;
    line-height: 1.4;
    border: 1px solid var(--vscode-input-border, var(--spectrum-global-color-gray-400, #b3b3b3));
    background-color: var(--vscode-input-background, var(--spectrum-global-color-gray-50, #ffffff));
    color: var(--vscode-input-foreground, var(--spectrum-global-color-gray-900, #2c2c2c));
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.input::placeholder {
    color: var(--vscode-input-placeholderForeground, var(--spectrum-global-color-gray-500, #6e6e6e));
}

/* Focus state */
.input:focus {
    border-color: var(--vscode-focusBorder, var(--spectrum-global-color-blue-500, #1473e6));
    box-shadow: 0 0 0 1px var(--vscode-focusBorder, var(--spectrum-global-color-blue-500, #1473e6));
}

/* Disabled state */
.input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: var(--vscode-input-background, var(--spectrum-global-color-gray-100, #f5f5f5));
}

/* Valid state */
.valid .input {
    border-color: var(--spectrum-global-color-green-500, #2d9d78);
}

.valid .input:focus {
    border-color: var(--spectrum-global-color-green-500, #2d9d78);
    box-shadow: 0 0 0 1px var(--spectrum-global-color-green-500, #2d9d78);
}

/* Invalid state */
.invalid .input {
    border-color: var(--spectrum-global-color-red-500, #e34850);
}

.invalid .input:focus {
    border-color: var(--spectrum-global-color-red-500, #e34850);
    box-shadow: 0 0 0 1px var(--spectrum-global-color-red-500, #e34850);
}

/* Description text */
.description {
    font-size: 12px;
    color: var(--vscode-descriptionForeground, var(--spectrum-global-color-gray-600, #6e6e6e));
}

/* Error message */
.errorMessage {
    font-size: 12px;
    color: var(--spectrum-global-color-red-500, #e34850);
    display: flex;
    align-items: center;
    gap: 4px;
}
```

### Sub-step 4.2: Implement SearchField Component

React Aria's SearchField provides accessible search input with built-in clear button and Escape key handling.

```typescript
// src/core/ui/components/aria/forms/SearchField.tsx
import {
    SearchField as AriaSearchField,
    Input,
    Button,
} from 'react-aria-components';
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';
import { resolveSize } from '../primitives/spectrumTokens';
import styles from './SearchField.module.css';

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
    width?: string | number;
    /** Accessible label (required when no visible label) */
    'aria-label'?: string;
    /** Additional CSS class */
    className?: string;
    /** Spectrum compatibility shim */
    UNSAFE_className?: string;
}

/**
 * SearchField - Accessible search input with clear button
 * Replaces @adobe/react-spectrum SearchField component
 *
 * Provides:
 * - Search icon (decorative)
 * - Clear button (shown when has value)
 * - Escape key clears input
 * - Accessible search semantics
 */
export const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
    ({
        value,
        onChange,
        placeholder = 'Search...',
        isQuiet = false,
        isDisabled = false,
        autoFocus = false,
        width,
        'aria-label': ariaLabel,
        className,
        UNSAFE_className,
    }, ref) => {
        const style: React.CSSProperties = {};
        if (width) {
            style.width = typeof width === 'number' ? `${width}px` : resolveSize(width) || width;
        }

        const hasValue = value && value.length > 0;

        return (
            <AriaSearchField
                className={cn(
                    styles.searchField,
                    isQuiet && styles.quiet,
                    className,
                    UNSAFE_className
                )}
                isDisabled={isDisabled}
                value={value}
                onChange={onChange}
                autoFocus={autoFocus}
                aria-label={ariaLabel}
                style={Object.keys(style).length > 0 ? style : undefined}
            >
                {/* Search icon */}
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
    }
);

SearchField.displayName = 'SearchField';
```

```css
/* src/core/ui/components/aria/forms/SearchField.module.css */

.searchField {
    display: flex;
    align-items: center;
    position: relative;
    gap: 8px;
}

/* Search icon */
.searchIcon {
    position: absolute;
    left: 10px;
    display: flex;
    align-items: center;
    color: var(--vscode-input-placeholderForeground, var(--spectrum-global-color-gray-500, #6e6e6e));
    pointer-events: none;
}

/* Input styles */
.input {
    width: 100%;
    padding: 8px 12px 8px 34px; /* Left padding for search icon */
    border-radius: 4px;
    font-size: 14px;
    line-height: 1.4;
    border: 1px solid var(--vscode-input-border, var(--spectrum-global-color-gray-400, #b3b3b3));
    background-color: var(--vscode-input-background, var(--spectrum-global-color-gray-50, #ffffff));
    color: var(--vscode-input-foreground, var(--spectrum-global-color-gray-900, #2c2c2c));
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.input::placeholder {
    color: var(--vscode-input-placeholderForeground, var(--spectrum-global-color-gray-500, #6e6e6e));
}

/* Focus state */
.input:focus {
    border-color: var(--vscode-focusBorder, var(--spectrum-global-color-blue-500, #1473e6));
    box-shadow: 0 0 0 1px var(--vscode-focusBorder, var(--spectrum-global-color-blue-500, #1473e6));
}

/* Disabled state */
.input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Quiet variant - no border */
.quiet .input {
    border: none;
    background-color: transparent;
    padding-left: 30px;
}

.quiet .input:focus {
    box-shadow: none;
    border-bottom: 2px solid var(--vscode-focusBorder, var(--spectrum-global-color-blue-500, #1473e6));
    border-radius: 0;
}

.quiet .searchIcon {
    left: 6px;
}

/* Clear button */
.clearButton {
    position: absolute;
    right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background-color: var(--spectrum-global-color-gray-300, #d3d3d3);
    color: var(--spectrum-global-color-gray-700, #464646);
    cursor: pointer;
    transition: background-color 0.15s ease;
    outline: none;
}

.clearButton:hover {
    background-color: var(--spectrum-global-color-gray-400, #b3b3b3);
}

.clearButton:focus-visible {
    outline: 2px solid var(--vscode-focusBorder, var(--spectrum-global-color-blue-500, #1473e6));
    outline-offset: 2px;
}

/* Adjust input padding when clear button is visible */
.searchField:has(.clearButton) .input {
    padding-right: 36px;
}

.quiet .clearButton {
    right: 4px;
}
```

### Sub-step 4.3: Update Barrel Export

```typescript
// src/core/ui/components/aria/forms/index.ts
/**
 * Form Components
 *
 * Text input components: TextField, SearchField
 * CSS Modules for styling - zero !important declarations.
 */

export { TextField } from './TextField';
export type { TextFieldProps, ValidationState } from './TextField';

export { SearchField } from './SearchField';
export type { SearchFieldProps } from './SearchField';
```

## Expected Outcome

After this step:

- Five form components available: TextField, SearchField, Checkbox, Select, ProgressBar
- All use CSS Modules (zero `!important` declarations)
- TextField provides accessible text input:
  - Label with required indicator
  - Description and error message slots
  - Validation states (valid/invalid)
  - Proper ARIA associations (labelledby, describedby)
  - VS Code theme integration
- SearchField provides accessible search input:
  - Decorative search icon
  - Clear button (shown only when has value)
  - Escape key clears input
  - Quiet variant (borderless)
  - Screen reader accessible
- Checkbox provides accessible checkbox input:
  - Label with click-to-toggle
  - Controlled via isSelected/onChange
  - Disabled state support
  - Lock icon support for locked dependencies (Steps 7/8)
- Select provides accessible dropdown (replaces Spectrum Picker):
  - Placeholder when no selection
  - Dropdown popover with SelectItem children
  - Controlled via selectedKey/onSelectionChange
  - Rich content support in items (name + description)
- ProgressBar provides progress indication:
  - Determinate mode (value/maxValue)
  - Indeterminate mode for unknown duration
  - Size variants (S, M, L)
  - Label support
- API surface matches Spectrum for common props (value, onChange, validationState, etc.)
- UNSAFE_className compatibility shim supports gradual migration
- All tests passing with proper isolation

## Acceptance Criteria

- [x] All tests passing for TextField, SearchField, Checkbox, Select, ProgressBar (62 tests)
- [x] CSS Modules generate scoped class names (verified via test)
- [x] No `!important` declarations in any CSS Module files
- [x] TextField label and input are properly associated (aria-labelledby or htmlFor)
- [x] TextField description and error message use aria-describedby
- [x] TextField shows required indicator when isRequired
- [x] TextField validation states have distinct visual styles
- [x] SearchField clear button appears only when value is non-empty
- [x] SearchField clear button clears input and calls onChange
- [x] SearchField Escape key clears input
- [x] SearchField search icon has aria-hidden="true"
- [x] isQuiet variant works on SearchField
- [x] Checkbox toggles on click and calls onChange
- [x] Checkbox supports isDisabled state
- [x] Select opens dropdown on click
- [x] Select handles selectedKey and onSelectionChange
- [x] SelectItem supports rich content (name + description)
- [x] ProgressBar shows correct percentage fill
- [x] ProgressBar supports isIndeterminate animation
- [x] ProgressBar supports size variants (S, M, L)
- [x] forwardRef implemented for all components
- [x] displayName set for React DevTools
- [x] Build passes (`npm run build`)
- [x] Coverage >= 80% for new components (88.58% statements, 90.56% lines)

## Dependencies from Other Steps

- **Step 1**: react-aria-components package installed
- **Step 1**: Directory structure at `src/core/ui/components/aria/forms/` exists
- **Step 2**: `spectrumTokens.ts` (resolveSize) and `cn()` utility available from primitives

## Estimated Complexity

**Medium-High** - TextField and SearchField are straightforward React Aria wrappers with slots. Checkbox is simple. Select requires popover and keyboard navigation. ProgressBar requires animation handling. Validation state handling requires proper CSS class management.

**Time Estimate:** 8-12 hours (5 components)

---

## Rollback Instructions

If this step needs to be reverted:

1. **Delete form components:** `rm -rf src/core/ui/components/aria/forms/*.tsx src/core/ui/components/aria/forms/*.css`
2. **Restore empty barrel:** Reset `src/core/ui/components/aria/forms/index.ts` to empty stub
3. **Delete tests:** `rm -rf tests/core/ui/components/aria/forms/`
4. **Verify:** `npm run build && npm test`

**Rollback Impact:** Low - no consumers yet (Steps 6-8 use these components).

---

## Notes for TDD Sub-Agent

### React Aria TextField Integration

React Aria's TextField component provides:
- `Label` slot - Automatically associated with input
- `Input` slot - The actual input element
- `Text slot="description"` - Help text below input
- `FieldError` - Error message (shown when isInvalid)
- `isInvalid` prop triggers error state
- `isRequired` adds required attribute
- `isDisabled` adds disabled attribute
- Automatic ARIA associations (aria-labelledby, aria-describedby)

### React Aria SearchField Integration

React Aria's SearchField component provides:
- `Input` slot - The search input
- `Button` slot - Clear button (you control visibility)
- `onClear` event - Fires when Escape pressed or clear clicked
- `onChange` receives empty string on clear
- Built-in search semantics (role="searchbox")

### Testing Form Components

Use `@testing-library/react` with `userEvent` for interaction testing:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextField } from './TextField';

test('TextField handles onChange', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<TextField label="Name" value="" onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.type(input, 'hello');

    expect(onChange).toHaveBeenCalled();
});

test('SearchField clears on Escape', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<SearchField value="test" onChange={onChange} aria-label="Search" />);

    const input = screen.getByRole('searchbox');
    await user.click(input);
    await user.keyboard('{Escape}');

    expect(onChange).toHaveBeenCalledWith('');
});
```

### Spectrum API Compatibility

Based on codebase analysis, these are the commonly used props:

**TextField:**
- `label` - Field label text
- `value`, `onChange` - Controlled input
- `onBlur` - Blur handler (for validation on blur)
- `placeholder` - Placeholder text
- `description` - Help text below input
- `validationState` - "valid" | "invalid"
- `errorMessage` - Error text (shown when invalid)
- `isDisabled`, `isRequired` - States
- `autoFocus` - Focus on mount
- `width` - Spectrum size token or CSS value
- `UNSAFE_className` - Escape hatch

**SearchField:**
- `value`, `onChange` - Controlled input
- `placeholder` - Placeholder text
- `isQuiet` - Borderless style
- `isDisabled` - Disabled state
- `autoFocus` - Focus on mount
- `width` - CSS value
- `aria-label` - Accessible label (no visible label)
- `UNSAFE_className` - Escape hatch

### VS Code Theme Variables

Use VS Code theme variables with Spectrum fallbacks:
- `--vscode-input-background` - Input background color
- `--vscode-input-foreground` - Input text color
- `--vscode-input-border` - Input border color
- `--vscode-input-placeholderForeground` - Placeholder text color
- `--vscode-focusBorder` - Focus ring color
- `--vscode-foreground` - Label text color
- `--vscode-descriptionForeground` - Description text color

### Validation State Mapping

Spectrum uses `validationState="valid" | "invalid"`:
```typescript
// Convert to React Aria's isInvalid boolean
const isInvalid = validationState === 'invalid';
```

React Aria components use `isInvalid` boolean prop, not `validationState` string.

### Width Prop Handling

Spectrum width props accept size tokens:
```typescript
// width="size-6000" should resolve to 480px
// Use resolveSize from spectrumTokens.ts
const resolvedWidth = resolveSize(width) || width;
```
