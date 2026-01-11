/**
 * Mock for @adobe/react-spectrum
 *
 * Lightweight stubs to avoid loading the full Spectrum library (~6MB)
 * in Jest tests. This prevents memory exhaustion in parallel test runs.
 */
import React from 'react';

// List of Spectrum-specific props that shouldn't be passed to DOM elements
const SPECTRUM_PROPS = [
    'UNSAFE_className', 'UNSAFE_style', 'isQuiet', 'shouldFlip', 'menuWidth',
    'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'wrap', 'direction',
    'justifyContent', 'alignContent', 'alignItems', 'gap', 'columnGap', 'rowGap',
    'flexGrow', 'flexShrink', 'flexBasis', 'flex', 'order', 'gridArea',
    'gridColumn', 'gridColumnEnd', 'gridColumnStart', 'gridRow', 'gridRowEnd',
    'gridRowStart', 'justifySelf', 'alignSelf', 'isHidden', 'colorVersion',
    'marginTop', 'marginBottom', 'marginStart', 'marginEnd', 'marginX', 'marginY',
    'paddingTop', 'paddingBottom', 'paddingStart', 'paddingEnd', 'paddingX', 'paddingY',
    'position', 'zIndex', 'top', 'bottom', 'left', 'right', 'start', 'end',
    'width', 'height', 'isEmphasized', 'staticColor', 'validationState',
    'necessityIndicator', 'labelPosition', 'labelAlign', 'isIndeterminate',
    'showValueLabel', 'formatOptions', 'variant', 'size', 'density', 'orientation',
    'selectionMode', 'disallowEmptySelection', 'overflowMode', 'isOpen', 'defaultOpen',
    // Additional props that should not be passed to DOM
    'selectedKeys', 'defaultSelectedKeys', 'onSelectionChange', 'errorMessage',
    'description', 'items', 'renderEmptyState', 'loadingState', 'onLoadMore',
    'textValue', 'autoFocus', 'isKeyboardDismissDisabled', 'isDismissable',
    'isLoading', 'isReadOnly', 'inputMode', 'inputValue', 'onInputChange'
];

// Helper to filter out Spectrum-specific props
const filterSpectrumProps = (props: Record<string, any>): Record<string, any> => {
    const filtered: Record<string, any> = {};
    for (const [key, value] of Object.entries(props)) {
        if (!SPECTRUM_PROPS.includes(key)) {
            filtered[key] = value;
        }
    }
    return filtered;
};

// Provider mock - renders a container to allow className/style tests
export const Provider: React.FC<{ children: React.ReactNode; theme?: any; colorScheme?: string; UNSAFE_className?: string }> = ({
    children,
    colorScheme,
    UNSAFE_className
}) => (
    <div data-testid="spectrum-provider" className={`spectrum ${UNSAFE_className || ''}`} data-color-scheme={colorScheme}>
        {children}
    </div>
);

// Theme export
export const defaultTheme = {};

// Helper to convert Spectrum dimension props to inline styles
const getDimensionStyle = (props: Record<string, any>): React.CSSProperties => {
    const style: React.CSSProperties = {};
    if (props.height) style.height = props.height;
    if (props.width) style.width = props.width;
    if (props.minHeight) style.minHeight = props.minHeight;
    if (props.maxHeight) style.maxHeight = props.maxHeight;
    if (props.minWidth) style.minWidth = props.minWidth;
    if (props.maxWidth) style.maxWidth = props.maxWidth;
    return style;
};

// Basic components that render their children
export const View: React.FC<any> = ({ children, UNSAFE_className, ...props }) => (
    <div data-testid="spectrum-view" className={UNSAFE_className} style={getDimensionStyle(props)} {...filterSpectrumProps(props)}>{children}</div>
);

// Helper to convert Spectrum flex layout props to inline styles
const getFlexStyle = (props: Record<string, any>): React.CSSProperties => {
    const style: React.CSSProperties = { display: 'flex' };
    if (props.justifyContent) style.justifyContent = props.justifyContent;
    if (props.alignItems) style.alignItems = props.alignItems;
    if (props.alignContent) style.alignContent = props.alignContent;
    if (props.direction) style.flexDirection = props.direction === 'column' ? 'column' : 'row';
    if (props.wrap) style.flexWrap = props.wrap === true ? 'wrap' : props.wrap;
    if (props.gap) style.gap = props.gap;
    return { ...style, ...getDimensionStyle(props) };
};

export const Flex: React.FC<any> = ({ children, UNSAFE_className, ...props }) => (
    <div data-testid="spectrum-flex" className={UNSAFE_className} style={getFlexStyle(props)} {...filterSpectrumProps(props)}>{children}</div>
);

export const Text: React.FC<any> = ({ children, slot, UNSAFE_className, ...props }) => (
    <span data-testid="spectrum-text" data-slot={slot} className={UNSAFE_className} {...filterSpectrumProps(props)}>{children}</span>
);

// Helper to extract original key from React's prefixed key format
// React.Children.toArray adds '.$' or similar prefixes to keys
const getOriginalKey = (reactKey: string | null | undefined): string => {
    if (!reactKey) return '';
    // React prefixes keys with '.$' - extract original key
    if (reactKey.startsWith('.$')) return reactKey.slice(2);
    if (reactKey.startsWith('.')) return reactKey.slice(1);
    return reactKey;
};

// Picker mock with button UI (like Spectrum's dropdown button)
export const Picker: React.FC<any> = ({
    children,
    selectedKey,
    onSelectionChange,
    placeholder,
    label,
    'aria-label': ariaLabel,
    UNSAFE_className,
    ...props
}) => {
    const items = React.Children.toArray(children);
    // Find the selected item's label - compare using cleaned keys
    const selectedItem = items.find((child: any) =>
        getOriginalKey(child.key) === selectedKey
    ) as React.ReactElement | undefined;
    const selectedLabel = selectedItem?.props?.textValue || selectedItem?.props?.children || placeholder || '';

    return (
        <div data-testid="spectrum-picker-wrapper" className={UNSAFE_className}>
            {label && <label data-testid="spectrum-picker-label">{label}</label>}
            {/* Button UI like Spectrum Picker */}
            <button
                type="button"
                data-testid="spectrum-picker"
                aria-label={ariaLabel || label}
                aria-haspopup="listbox"
                {...filterSpectrumProps(props)}
            >
                {selectedLabel}
            </button>
            {/* Hidden select for actual functionality */}
            <select
                data-testid="spectrum-picker-select"
                value={selectedKey || ''}
                onChange={(e) => onSelectionChange?.(e.target.value)}
                style={{ display: 'none' }}
            >
                {placeholder && <option value="">{placeholder}</option>}
                {items.map((child: any) => {
                    const originalKey = getOriginalKey(child.key);
                    return (
                        <option key={originalKey} value={originalKey}>
                            {child.props?.textValue || child.props?.children}
                        </option>
                    );
                })}
            </select>
        </div>
    );
};

// Item mock for Picker
export const Item: React.FC<any> = ({ children, textValue, ...props }) => (
    <>{children}</>
);

// Checkbox mock
export const Checkbox: React.FC<any> = ({
    children,
    isSelected,
    isDisabled,
    onChange,
    ...props
}) => (
    <label data-testid="spectrum-checkbox" {...filterSpectrumProps(props)}>
        <input
            type="checkbox"
            checked={isSelected || false}
            disabled={isDisabled}
            onChange={(e) => onChange?.(e.target.checked)}
        />
        {children}
    </label>
);

// Button mock - handles both onPress (Spectrum) and onClick (DOM)
// Uses forwardRef to support buttonRef.current.focus()
export const Button = React.forwardRef<HTMLButtonElement, any>(({ children, onPress, onClick, isDisabled, ...props }, ref) => (
    <button
        ref={ref}
        data-testid="spectrum-button"
        tabIndex={0}
        onClick={(e) => {
            onClick?.(e);
            onPress?.(e);
        }}
        disabled={isDisabled}
        {...filterSpectrumProps(props)}
    >
        {children}
    </button>
));

// ActionButton mock - handles both onPress (Spectrum) and onClick (DOM)
export const ActionButton: React.FC<any> = ({ children, onPress, onClick, isDisabled, ...props }) => (
    <button
        data-testid="spectrum-action-button"
        tabIndex={0}
        onClick={(e) => {
            onClick?.(e);
            onPress?.(e);
        }}
        disabled={isDisabled}
        {...filterSpectrumProps(props)}
    >
        {children}
    </button>
);

// TextField mock
export const TextField: React.FC<any> = ({
    label,
    value,
    onChange,
    isDisabled,
    isRequired,
    description,
    errorMessage,
    placeholder,
    ...props
}) => (
    <label data-testid="spectrum-textfield">
        {label}
        <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
            disabled={isDisabled}
            required={isRequired}
            placeholder={placeholder}
            {...filterSpectrumProps(props)}
        />
        {description && <span data-testid="spectrum-textfield-description">{description}</span>}
        {errorMessage && <span data-testid="spectrum-textfield-error">{errorMessage}</span>}
    </label>
);

// TextArea mock
export const TextArea: React.FC<any> = ({
    label,
    value,
    onChange,
    isDisabled,
    ...props
}) => (
    <label data-testid="spectrum-textarea">
        {label}
        <textarea
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
            disabled={isDisabled}
            {...filterSpectrumProps(props)}
        />
    </label>
);

// ProgressBar mock
export const ProgressBar: React.FC<any> = ({ label, value, ...props }) => (
    <div data-testid="spectrum-progressbar" role="progressbar" aria-valuenow={value} {...filterSpectrumProps(props)}>
        {label}
    </div>
);

// Heading mock
export const Heading: React.FC<any> = ({ children, level = 2, UNSAFE_className, ...props }) => {
    const Tag = `h${level}` as keyof JSX.IntrinsicElements;
    return <Tag data-testid="spectrum-heading" className={UNSAFE_className} {...filterSpectrumProps(props)}>{children}</Tag>;
};

// Content mock
export const Content: React.FC<any> = ({ children, ...props }) => (
    <div data-testid="spectrum-content" {...filterSpectrumProps(props)}>{children}</div>
);

// Divider mock
export const Divider: React.FC<any> = (props) => (
    <hr data-testid="spectrum-divider" {...filterSpectrumProps(props)} />
);

// StatusLight mock
export const StatusLight: React.FC<any> = ({ children, variant, ...props }) => (
    <span data-testid="spectrum-statuslight" data-variant={variant} {...filterSpectrumProps(props)}>{children}</span>
);

// Well mock
export const Well: React.FC<any> = ({ children, ...props }) => (
    <div data-testid="spectrum-well" {...filterSpectrumProps(props)}>{children}</div>
);

// IllustratedMessage mock
export const IllustratedMessage: React.FC<any> = ({ children, ...props }) => (
    <div data-testid="spectrum-illustrated-message" {...filterSpectrumProps(props)}>{children}</div>
);

// Link mock
export const Link: React.FC<any> = ({ children, onPress, ...props }) => (
    <a data-testid="spectrum-link" onClick={onPress} {...filterSpectrumProps(props)}>{children}</a>
);

// SearchField mock
export const SearchField: React.FC<any> = ({ value, onChange, ...props }) => (
    <input
        data-testid="spectrum-searchfield"
        type="search"
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        {...filterSpectrumProps(props)}
    />
);

// Grid mock
export const Grid: React.FC<any> = ({ children, ...props }) => (
    <div data-testid="spectrum-grid" style={{ display: 'grid' }} {...filterSpectrumProps(props)}>{children}</div>
);

// Form mock
export const Form: React.FC<any> = ({ children, onSubmit, ...props }) => (
    <form
        data-testid="spectrum-form"
        onSubmit={(e) => {
            e.preventDefault();
            onSubmit?.(e);
        }}
        {...filterSpectrumProps(props)}
    >
        {children}
    </form>
);

// DialogTrigger mock - handles both simple children and render function pattern
// In tests, always renders both trigger and dialog so tests can verify content
// NOTE: React.Children.toArray doesn't include function children, so we iterate manually
export const DialogTrigger: React.FC<any> = ({ children, isOpen: controlledIsOpen, onOpenChange, type = 'modal' }) => {
    // Create a close handler for render function pattern
    const handleClose = () => {
        onOpenChange?.(false);
    };

    // Notify onOpenChange when trigger is clicked
    const handleOpen = () => {
        onOpenChange?.(true);
    };

    // Manually iterate children to find trigger and dialog
    // React.Children.toArray skips functions, so we need to iterate the raw children array
    const childrenArray = Array.isArray(children) ? children : [children];
    let trigger: React.ReactNode = null;
    let dialogOrFunc: React.ReactNode | ((close: () => void) => React.ReactNode) = null;

    childrenArray.forEach((child, index) => {
        if (index === 0) {
            trigger = child;
        } else if (typeof child === 'function' || React.isValidElement(child)) {
            dialogOrFunc = child;
        }
    });

    // Clone trigger to add onClick handler for callbacks
    const triggerWithHandler = React.isValidElement(trigger)
        ? React.cloneElement(trigger as React.ReactElement<any>, {
            onClick: (e: React.MouseEvent) => {
                handleOpen();
                const originalOnClick = (trigger as React.ReactElement<any>).props?.onClick;
                originalOnClick?.(e);
                const originalOnPress = (trigger as React.ReactElement<any>).props?.onPress;
                originalOnPress?.(e);
            }
        })
        : trigger;

    // Handle render function pattern: {(close) => <Dialog>...</Dialog>}
    const dialog = typeof dialogOrFunc === 'function'
        ? (dialogOrFunc as (close: () => void) => React.ReactNode)(handleClose)
        : dialogOrFunc;

    // Always render both trigger and dialog in tests
    // Tests verify content accessibility, not open/close behavior
    return (
        <>
            {triggerWithHandler}
            {dialog}
        </>
    );
};

// Dialog mock
export const Dialog: React.FC<any> = ({ children, ...props }) => (
    <div data-testid="spectrum-dialog" role="dialog" {...filterSpectrumProps(props)}>{children}</div>
);

// AlertDialog mock
export const AlertDialog: React.FC<any> = ({ children, title, ...props }) => (
    <div data-testid="spectrum-alertdialog" role="alertdialog" {...filterSpectrumProps(props)}>
        <h2>{title}</h2>
        {children}
    </div>
);

// Tooltip mock
export const Tooltip: React.FC<any> = ({ children }) => <>{children}</>;
export const TooltipTrigger: React.FC<any> = ({ children }) => <>{children}</>;

// Section mock (for Picker)
export const Section: React.FC<any> = ({ children, title, ...props }) => (
    <optgroup label={title} {...filterSpectrumProps(props)}>{children}</optgroup>
);

// Header mock
export const Header: React.FC<any> = ({ children, ...props }) => (
    <header data-testid="spectrum-header" {...filterSpectrumProps(props)}>{children}</header>
);

// Footer mock
export const Footer: React.FC<any> = ({ children, ...props }) => (
    <footer data-testid="spectrum-footer" {...filterSpectrumProps(props)}>{children}</footer>
);

// ButtonGroup mock
export const ButtonGroup: React.FC<any> = ({ children, ...props }) => (
    <div data-testid="spectrum-buttongroup" {...filterSpectrumProps(props)}>{children}</div>
);

// NumberField mock
export const NumberField: React.FC<any> = ({
    label,
    value,
    onChange,
    ...props
}) => (
    <label data-testid="spectrum-numberfield">
        {label}
        <input
            type="number"
            value={value || 0}
            onChange={(e) => onChange?.(Number(e.target.value))}
            {...filterSpectrumProps(props)}
        />
    </label>
);

// Switch mock
export const Switch: React.FC<any> = ({
    children,
    isSelected,
    onChange,
    ...props
}) => (
    <label data-testid="spectrum-switch" {...filterSpectrumProps(props)}>
        <input
            type="checkbox"
            checked={isSelected || false}
            onChange={(e) => onChange?.(e.target.checked)}
        />
        {children}
    </label>
);

// Radio and RadioGroup mocks
export const RadioGroup: React.FC<any> = ({ children, value, onChange, ...props }) => (
    <div data-testid="spectrum-radiogroup" role="radiogroup" {...filterSpectrumProps(props)}>
        {React.Children.map(children, (child: any) =>
            React.cloneElement(child, { selectedValue: value, onSelect: onChange })
        )}
    </div>
);

export const Radio: React.FC<any> = ({ children, value, selectedValue, onSelect, ...props }) => (
    <label data-testid="spectrum-radio" {...filterSpectrumProps(props)}>
        <input
            type="radio"
            value={value}
            checked={value === selectedValue}
            onChange={() => onSelect?.(value)}
        />
        {children}
    </label>
);

// ProgressCircle mock - critical for LoadingDisplay component
// Note: Don't render text content as it can conflict with actual loading messages
// Handles both className and UNSAFE_className (Spectrum uses UNSAFE_className)
export const ProgressCircle: React.FC<any> = ({ size, 'aria-label': ariaLabel, className, UNSAFE_className, ...props }) => (
    <div
        data-testid="spectrum-progresscircle"
        role="progressbar"
        aria-label={ariaLabel}
        data-size={size}
        className={UNSAFE_className || className}
        {...filterSpectrumProps(props)}
    />
);

// Avatar mock
export const Avatar: React.FC<any> = ({ src, alt, ...props }) => (
    <img data-testid="spectrum-avatar" src={src} alt={alt} {...filterSpectrumProps(props)} />
);

// ListView mock - supports static Item children, render function, and items prop
// Spectrum ListView actually uses role="grid" (not listbox)
export const ListView: React.FC<any> = ({
    children,
    items,
    onSelectionChange,
    selectedKeys,
    defaultSelectedKeys,
    selectionMode,
    'aria-label': ariaLabel,
    UNSAFE_className,
    ...props
}) => {
    // Priority: children (React elements) > render function > items prop
    // In SearchableList, children are Item elements from filteredItems.map(itemRenderer)
    const hasChildElements = React.Children.count(children) > 0;
    const renderItem = typeof children === 'function' ? children : null;

    // Render the list content
    let content: React.ReactNode;
    if (hasChildElements && !renderItem) {
        // Children are pre-rendered Item elements - render them directly
        content = React.Children.map(children, (child: any, index) => {
            if (!React.isValidElement(child)) return child;
            const key = child.key || (items?.[index] as any)?.id || index;
            return (
                <li
                    key={key}
                    role="gridcell"
                    data-key={key}
                    onClick={() => onSelectionChange?.(new Set([key]))}
                >
                    {child}
                </li>
            );
        });
    } else if (renderItem && items) {
        // Render function pattern
        content = items.map((item: any) => {
            const key = item.id || item.key;
            return (
                <li
                    key={key}
                    role="gridcell"
                    data-key={key}
                    onClick={() => onSelectionChange?.(new Set([key]))}
                >
                    {renderItem(item)}
                </li>
            );
        });
    } else if (items) {
        // Items only - render basic item info
        content = items.map((item: any) => {
            const key = item.id || item.key;
            return (
                <li
                    key={key}
                    role="gridcell"
                    data-key={key}
                    onClick={() => onSelectionChange?.(new Set([key]))}
                >
                    {item.title || item.name || item.label || String(key)}
                </li>
            );
        });
    }

    return (
        <ul
            data-testid="spectrum-listview"
            role="grid"
            aria-label={ariaLabel}
            className={UNSAFE_className}
            {...filterSpectrumProps(props)}
        >
            {content}
        </ul>
    );
};

// Menu components
export const MenuTrigger: React.FC<any> = ({ children }) => <>{children}</>;

export const Menu: React.FC<any> = ({ children, items, onAction, ...props }) => {
    // Handle render function pattern: children is (item) => <Item>...</Item>
    // with items prop providing the data
    const isRenderFunction = typeof children === 'function';

    let content: React.ReactNode;
    if (isRenderFunction && items) {
        // Render function pattern - call the render function for each item
        content = items.map((item: any) => {
            const key = item.key || item.id;
            // Extract label from item for accessible name
            const itemText = item.label || item.name || item.textValue || key;
            return (
                <li
                    key={key}
                    role="menuitem"
                    onClick={() => onAction?.(key)}
                    tabIndex={0}
                >
                    {itemText}
                </li>
            );
        });
    } else {
        // Static children pattern - children are Item elements
        content = React.Children.map(children, (child: any) => {
            const key = getOriginalKey(child.key);
            // Get the text content for the menu item name
            const itemText = child.props?.textValue || child.props?.children;
            return (
                <li
                    key={key}
                    role="menuitem"
                    onClick={() => onAction?.(key)}
                    tabIndex={0}
                >
                    {itemText}
                </li>
            );
        });
    }

    return (
        <ul data-testid="spectrum-menu" role="menu" {...filterSpectrumProps(props)}>
            {content}
        </ul>
    );
};

// DialogContainer mock
export const DialogContainer: React.FC<any> = ({ children, onDismiss, ...props }) => (
    <div data-testid="spectrum-dialog-container" {...filterSpectrumProps(props)}>
        {children}
    </div>
);
