"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FormField = void 0;
const react_1 = __importStar(require("react"));
const react_spectrum_1 = require("@adobe/react-spectrum");
/**
 * Molecular Component: FormField
 *
 * Reusable form input component supporting multiple field types (text, password,
 * url, select, number). Used in ConfigureScreen for configuration settings.
 *
 * @example
 * ```tsx
 * <FormField
 *   fieldKey="ADOBE_COMMERCE_URL"
 *   label="Commerce URL"
 *   type="url"
 *   value={url}
 *   onChange={setUrl}
 *   required
 *   error="Invalid URL"
 *   showError={touched}
 * />
 * ```
 */
exports.FormField = react_1.default.memo(({ fieldKey, label, type, value, onChange, placeholder, description, required = false, error, showError = false, options, selectableDefaultProps }) => {
    const handleChange = (0, react_1.useCallback)((val) => {
        onChange(val);
    }, [onChange]);
    // Common wrapper for scroll margin
    const wrapperStyle = {
        scrollMarginTop: '24px'
    };
    switch (type) {
        case 'text':
        case 'url':
        case 'number':
            return (react_1.default.createElement("div", { key: fieldKey, id: `field-${fieldKey}`, style: wrapperStyle },
                react_1.default.createElement(react_spectrum_1.TextField, { label: label, value: String(value), onChange: handleChange, placeholder: placeholder, description: description, isRequired: required, validationState: showError ? 'invalid' : undefined, errorMessage: showError ? error : undefined, width: "100%", marginBottom: "size-200", ...(selectableDefaultProps || {}) })));
        case 'password':
            return (react_1.default.createElement("div", { key: fieldKey, id: `field-${fieldKey}`, style: wrapperStyle },
                react_1.default.createElement(react_spectrum_1.TextField, { label: label, type: "password", value: value, onChange: handleChange, placeholder: placeholder, description: description, isRequired: required, validationState: showError ? 'invalid' : undefined, errorMessage: showError ? error : undefined, width: "100%", marginBottom: "size-200", ...(selectableDefaultProps || {}) })));
        case 'select':
            return (react_1.default.createElement("div", { key: fieldKey, id: `field-${fieldKey}`, style: wrapperStyle },
                react_1.default.createElement(react_spectrum_1.Picker, { label: label, selectedKey: value, onSelectionChange: (key) => handleChange(String(key || '')), width: "100%", isRequired: required, marginBottom: "size-200" }, options?.map(option => (react_1.default.createElement(react_spectrum_1.Item, { key: option.value }, option.label))) || [])));
        default:
            return null;
    }
});
exports.FormField.displayName = 'FormField';
//# sourceMappingURL=FormField.js.map