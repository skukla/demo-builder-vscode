"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Modal = Modal;
const react_1 = __importDefault(require("react"));
const react_spectrum_1 = require("@adobe/react-spectrum");
function Modal({ title, size = 'M', actionButtons = [], onClose, children }) {
    // Map custom sizes to Dialog-compatible sizes
    const dialogSize = size === 'fullscreen' || size === 'fullscreenTakeover' ? 'L' : size;
    return (react_1.default.createElement(react_spectrum_1.Dialog, { size: dialogSize },
        react_1.default.createElement(react_spectrum_1.Heading, null, title),
        react_1.default.createElement(react_spectrum_1.Divider, null),
        react_1.default.createElement(react_spectrum_1.Content, null, children),
        react_1.default.createElement(react_spectrum_1.ButtonGroup, null,
            actionButtons.map((button, index) => (react_1.default.createElement(react_spectrum_1.Button, { key: index, variant: button.variant, onPress: button.onPress }, button.label))),
            react_1.default.createElement(react_spectrum_1.Button, { variant: "secondary", onPress: onClose }, "Close"))));
}
//# sourceMappingURL=Modal.js.map