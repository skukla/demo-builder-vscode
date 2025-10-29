"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NumberedInstructions = NumberedInstructions;
const react_1 = __importDefault(require("react"));
const react_spectrum_1 = require("@adobe/react-spectrum");
// Helper function to render text with code highlighting for quoted content
const renderInstructionText = (text) => {
    // Split by single quotes to find code snippets
    const parts = text.split(/('.*?')/g);
    return (react_1.default.createElement(react_1.default.Fragment, null, parts.map((part, i) => {
        // If the part starts and ends with single quotes, it's code
        if (part.startsWith("'") && part.endsWith("'")) {
            // Remove the quotes and wrap in styled code element
            return (react_1.default.createElement("code", { key: i, style: {
                    fontFamily: 'var(--spectrum-alias-body-text-font-family, monospace)',
                    fontSize: '0.9em',
                    backgroundColor: '#1a1a1a',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    color: 'var(--spectrum-global-color-blue-700)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap'
                } }, part.slice(1, -1)));
        }
        return react_1.default.createElement("span", { key: i }, part);
    })));
};
function NumberedInstructions({ description, instructions }) {
    return (react_1.default.createElement(react_spectrum_1.Flex, { direction: "column", gap: "size-200" },
        description && react_1.default.createElement(react_spectrum_1.Text, null, description),
        instructions.map((instruction, index) => (react_1.default.createElement(react_spectrum_1.Flex, { key: index, direction: "row", gap: "size-150", UNSAFE_style: {
                padding: '16px',
                backgroundColor: 'var(--spectrum-global-color-gray-100)',
                borderRadius: '6px'
            } },
            react_1.default.createElement("div", { className: "number-badge" }, index + 1),
            react_1.default.createElement(react_spectrum_1.Flex, { direction: "column", gap: "size-75", flex: 1 },
                react_1.default.createElement(react_spectrum_1.Text, { UNSAFE_className: "font-semibold", UNSAFE_style: { fontSize: '15px' } }, instruction.step),
                react_1.default.createElement(react_spectrum_1.Text, { UNSAFE_className: "text-sm text-gray-600", UNSAFE_style: { lineHeight: '2.0' } }, renderInstructionText(instruction.details))))))));
}
//# sourceMappingURL=NumberedInstructions.js.map