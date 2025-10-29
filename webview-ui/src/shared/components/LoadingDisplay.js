"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoadingDisplay = void 0;
const react_1 = __importDefault(require("react"));
const react_spectrum_1 = require("@adobe/react-spectrum");
/**
 * Reusable loading display component that provides consistent loading states
 * across all webviews with support for main and sub-messages
 */
const LoadingDisplay = ({ size = 'L', message, subMessage, helperText, className }) => {
    // Center display for large size, left-align for smaller sizes
    const shouldCenter = size === 'L';
    // Text size and color classes based on progress circle size
    const textSizeMap = { L: 'text-lg', M: 'text-base', S: '' };
    const mainTextClass = `${textSizeMap[size]} font-medium`.trim();
    const subTextClass = 'text-sm text-gray-600';
    const helperTextClass = 'text-xs text-gray-500 italic';
    // Container props based on centering
    const containerProps = shouldCenter ? {
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%'
    } : {
        alignItems: 'center'
    };
    // For small size with no sub-message, use horizontal layout
    if (size === 'S' && !subMessage) {
        return (react_1.default.createElement(react_spectrum_1.Flex, { gap: "size-200", alignItems: "center", UNSAFE_className: className },
            react_1.default.createElement(react_spectrum_1.ProgressCircle, { size: size, isIndeterminate: true, "aria-label": message }),
            react_1.default.createElement(react_spectrum_1.Text, { UNSAFE_className: mainTextClass }, message)));
    }
    // For larger sizes or when sub-message exists, use vertical layout
    return (react_1.default.createElement("div", { role: "status", "aria-live": "polite", "aria-atomic": "true" },
        react_1.default.createElement(react_spectrum_1.Flex, { direction: "column", gap: "size-200", ...containerProps, UNSAFE_className: className },
            react_1.default.createElement(react_spectrum_1.ProgressCircle, { size: size, isIndeterminate: true, "aria-label": message }),
            react_1.default.createElement(react_spectrum_1.Flex, { direction: "column", gap: "size-50", alignItems: shouldCenter ? 'center' : 'start' },
                react_1.default.createElement(react_spectrum_1.Text, { UNSAFE_className: mainTextClass }, message),
                subMessage && (react_1.default.createElement(react_spectrum_1.Text, { UNSAFE_className: subTextClass }, subMessage)),
                helperText && (react_1.default.createElement(react_spectrum_1.Text, { UNSAFE_className: helperTextClass, marginTop: "size-100" }, helperText))))));
};
exports.LoadingDisplay = LoadingDisplay;
//# sourceMappingURL=LoadingDisplay.js.map