"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GridLayout = void 0;
const react_1 = __importDefault(require("react"));
/**
 * Template Component: GridLayout
 *
 * Provides a responsive grid layout for dashboard tiles, cards, etc.
 * Used in Welcome and Dashboard screens.
 *
 * @example
 * ```tsx
 * <GridLayout columns={3} gap="16px">
 *   <TileCard />
 *   <TileCard />
 *   <TileCard />
 * </GridLayout>
 * ```
 */
const GridLayout = ({ children, columns = 2, gap = '24px', maxWidth, padding, className }) => {
    return (react_1.default.createElement("div", { style: {
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap,
            maxWidth,
            padding,
            width: '100%'
        }, className: className }, children));
};
exports.GridLayout = GridLayout;
//# sourceMappingURL=GridLayout.js.map