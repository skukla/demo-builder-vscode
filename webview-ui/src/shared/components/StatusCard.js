"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusCard = void 0;
const react_1 = __importDefault(require("react"));
const StatusDot_1 = require("@/design-system/atoms/StatusDot");
/**
 * Molecular Component: StatusCard
 *
 * Displays a status indicator with text. Used in Dashboard for showing
 * demo status, mesh status, etc.
 *
 * @example
 * ```tsx
 * <StatusCard
 *   label="Demo Status"
 *   status="Running"
 *   color="green"
 * />
 * ```
 */
exports.StatusCard = react_1.default.memo(({ status, color, label, size = 'M', className }) => {
    // Map color to StatusDot variant
    const getVariant = () => {
        switch (color) {
            case 'green':
                return 'success';
            case 'red':
                return 'error';
            case 'yellow':
                return 'warning';
            case 'blue':
                return 'info';
            case 'gray':
            default:
                return 'neutral';
        }
    };
    // Map size to pixel value
    const getSizeInPixels = () => {
        switch (size) {
            case 'S':
                return 6;
            case 'M':
                return 8;
            case 'L':
                return 10;
            default:
                return 8;
        }
    };
    return (react_1.default.createElement("div", { style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }, className: className },
        react_1.default.createElement(StatusDot_1.StatusDot, { variant: getVariant(), size: getSizeInPixels() }),
        react_1.default.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
            label && (react_1.default.createElement("span", { style: {
                    fontSize: '12px',
                    color: 'var(--spectrum-global-color-gray-600)',
                    fontWeight: 500
                } }, label)),
            react_1.default.createElement("span", { style: {
                    fontSize: '14px',
                    color: 'var(--spectrum-global-color-gray-800)',
                    fontWeight: label ? 400 : 500
                } }, status))));
});
//# sourceMappingURL=StatusCard.js.map