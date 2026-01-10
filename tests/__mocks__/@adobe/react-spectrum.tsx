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
    'selectionMode', 'disallowEmptySelection', 'overflowMode', 'isOpen', 'defaultOpen'
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

// Provider mock - just passes children through
export const Provider: React.FC<{ children: React.ReactNode; theme?: any }> = ({ children }) => (
    <>{children}</>
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
export const View: React.FC<any> = ({ children, ...props }) => (
    <div data-testid="spectrum-view" style={getDimensionStyle(props)} {...filterSpectrumProps(props)}>{children}</div>
);

export const Flex: React.FC<any> = ({ children, UNSAFE_className, ...props }) => (
    <div data-testid="spectrum-flex" className={UNSAFE_className} style={{ display: 'flex', ...getDimensionStyle(props) }} {...filterSpectrumProps(props)}>{children}</div>
);

export const Text: React.FC<any> = ({ children, slot, ...props }) => (
    <span data-testid="spectrum-text" data-slot={slot} {...filterSpectrumProps(props)}>{children}</span>
);

// Picker mock with proper aria attributes
export const Picker: React.FC<any> = ({
    children,
    selectedKey,
    onSelectionChange,
    placeholder,
    'aria-label': ariaLabel,
    ...props
}) => {
    const items = React.Children.toArray(children);
    return (
        <select
            data-testid="spectrum-picker"
            value={selectedKey || ''}
            onChange={(e) => onSelectionChange?.(e.target.value)}
            aria-label={ariaLabel}
            {...filterSpectrumProps(props)}
        >
            {placeholder && <option value="">{placeholder}</option>}
            {items.map((child: any) => (
                <option key={child.key} value={child.key}>
                    {child.props?.textValue || child.props?.children}
                </option>
            ))}
        </select>
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

// Button mock
export const Button: React.FC<any> = ({ children, onPress, isDisabled, ...props }) => (
    <button
        data-testid="spectrum-button"
        onClick={onPress}
        disabled={isDisabled}
        {...filterSpectrumProps(props)}
    >
        {children}
    </button>
);

// ActionButton mock
export const ActionButton: React.FC<any> = ({ children, onPress, isDisabled, ...props }) => (
    <button
        data-testid="spectrum-action-button"
        onClick={onPress}
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
            description={description}
            {...filterSpectrumProps(props)}
        />
        {description && <span data-testid="spectrum-textfield-description">{description}</span>}
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
export const Heading: React.FC<any> = ({ children, level = 2, ...props }) => {
    const Tag = `h${level}` as keyof JSX.IntrinsicElements;
    return <Tag data-testid="spectrum-heading" {...filterSpectrumProps(props)}>{children}</Tag>;
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

// DialogTrigger mock - handles both simple children and render function pattern
export const DialogTrigger: React.FC<any> = ({ children }) => {
    // Extract children array - first child is trigger, second is dialog (or function)
    const childArray = React.Children.toArray(children);
    const trigger = childArray[0];
    const dialogOrFunc = childArray[1];

    // Handle render function pattern: {(close) => <Dialog>...</Dialog>}
    const dialog = typeof dialogOrFunc === 'function'
        ? (dialogOrFunc as (close: () => void) => React.ReactNode)(() => {})
        : dialogOrFunc;

    return <>{trigger}{dialog}</>;
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
export const ProgressCircle: React.FC<any> = ({ size, 'aria-label': ariaLabel, className, ...props }) => (
    <div
        data-testid="spectrum-progresscircle"
        role="progressbar"
        aria-label={ariaLabel}
        data-size={size}
        className={className}
        {...filterSpectrumProps(props)}
    />
);

// Avatar mock
export const Avatar: React.FC<any> = ({ src, alt, ...props }) => (
    <img data-testid="spectrum-avatar" src={src} alt={alt} {...filterSpectrumProps(props)} />
);

// ListView mock
export const ListView: React.FC<any> = ({ children, items, onSelectionChange, ...props }) => (
    <ul data-testid="spectrum-listview" role="listbox" {...filterSpectrumProps(props)}>
        {items ? items.map((item: any) => (
            <li key={item.id || item.key} role="option" onClick={() => onSelectionChange?.(new Set([item.id || item.key]))}>
                {typeof props.children === 'function' ? props.children(item) : item.name}
            </li>
        )) : children}
    </ul>
);

// Menu components
export const MenuTrigger: React.FC<any> = ({ children }) => <>{children}</>;

export const Menu: React.FC<any> = ({ children, onAction, ...props }) => (
    <ul data-testid="spectrum-menu" role="menu" {...filterSpectrumProps(props)}>
        {React.Children.map(children, (child: any) =>
            React.cloneElement(child, { onAction })
        )}
    </ul>
);

// DialogContainer mock
export const DialogContainer: React.FC<any> = ({ children, onDismiss, ...props }) => (
    <div data-testid="spectrum-dialog-container" {...filterSpectrumProps(props)}>
        {children}
    </div>
);
