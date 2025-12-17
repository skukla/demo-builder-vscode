# Step 1: Create TemplateCard and TemplateRow Components

## Objective
Create enhanced template display components that support both card (grid) and row (list) view modes with proper selection state, icons, tags, and featured badges.

## Test Specifications

### TemplateCard Tests
```typescript
describe('TemplateCard', () => {
    it('should render template name and description');
    it('should display icon when provided');
    it('should show featured badge when template.featured is true');
    it('should render tags as chips');
    it('should apply selected styling when isSelected is true');
    it('should call onSelect with template id when clicked');
    it('should be keyboard accessible (Enter/Space to select)');
});
```

### TemplateRow Tests
```typescript
describe('TemplateRow', () => {
    it('should render template name and description in row format');
    it('should display icon on the left');
    it('should show tags inline');
    it('should apply selected styling when isSelected is true');
    it('should call onSelect with template id when clicked');
});
```

## Implementation Details

### TemplateCard Component
```typescript
interface TemplateCardProps {
    template: DemoTemplate;
    isSelected: boolean;
    onSelect: (templateId: string) => void;
}
```

**Features:**
- Card layout with padding and border
- Icon display (top or left)
- Name as heading
- Description text (2-3 lines max)
- Tags as small chips/badges
- Featured badge (optional star or "Featured" label)
- Selected state: blue border, subtle background

### TemplateRow Component
```typescript
interface TemplateRowProps {
    template: DemoTemplate;
    isSelected: boolean;
    onSelect: (templateId: string) => void;
}
```

**Features:**
- Horizontal layout
- Icon → Name → Description → Tags
- Full-width clickable area
- Selected state: background highlight

## File Locations
- `src/features/project-creation/ui/components/TemplateCard.tsx`
- `src/features/project-creation/ui/components/TemplateRow.tsx`
- `tests/features/project-creation/ui/components/TemplateCard.test.tsx`
- `tests/features/project-creation/ui/components/TemplateRow.test.tsx`

## Acceptance Criteria
- [ ] TemplateCard renders all template data correctly
- [ ] TemplateRow renders all template data correctly
- [ ] Selection state is visually distinct
- [ ] Keyboard navigation works (Tab, Enter/Space)
- [ ] All tests pass
