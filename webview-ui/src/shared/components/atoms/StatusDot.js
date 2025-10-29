"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusDot = void 0;
const react_1 = __importDefault(require("react"));
/**
 * Atomic Component: StatusDot
 *
 * A colored dot indicator for showing status.
 * Commonly used in status displays, lists, and badges.
 *
 * @example
 * ```tsx
 * <StatusDot variant="success" />
 * <StatusDot variant="error" size={10} />
 * ```
 */
const StatusDot = ({ variant, size = 8, className }) => {
    const getColor = () => {
        switch (variant) {
            case 'success':
                return '#10b981'; // green-500
            case 'error':
                return '#ef4444'; // red-500
            case 'warning':
                return '#f59e0b'; // amber-500
            case 'info':
                return '#3b82f6'; // blue-500
            case 'neutral':
                return '#6b7280'; // gray-500
            default:
                return '#6b7280';
        }
    };
    return (react_1.default.createElement("span", { className: className, style: {
            display: 'inline-block',
            width: size,
            height: size,
            borderRadius: '50%',
            backgroundColor: getColor(),
            flexShrink: 0
        }, role: "presentation" }));
};
exports.StatusDot = StatusDot;
//# sourceMappingURL=StatusDot.js.map