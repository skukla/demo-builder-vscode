# Step 2: Create TemplateGallery Component

## Objective
Create the main gallery component that integrates SearchHeader, tag filtering, and view mode switching. Provides the full template browsing experience.

## Test Specifications

### TemplateGallery Tests
```typescript
describe('TemplateGallery', () => {
    describe('search functionality', () => {
        it('should filter templates by name');
        it('should filter templates by description');
        it('should show all templates when search is empty');
        it('should show "no results" message when no matches');
    });

    describe('tag filtering', () => {
        it('should show tag filter chips from all template tags');
        it('should filter templates when tag is selected');
        it('should support multiple tag selection');
        it('should clear tag filter when chip is deselected');
    });

    describe('view mode', () => {
        it('should render cards view by default');
        it('should switch to rows view when toggle clicked');
        it('should persist view mode preference');
    });

    describe('selection', () => {
        it('should highlight selected template');
        it('should call onSelect when template is clicked');
        it('should work in both card and row views');
    });
});
```

## Implementation Details

### TemplateGallery Component
```typescript
interface TemplateGalleryProps {
    templates: DemoTemplate[];
    selectedTemplateId?: string;
    onSelect: (templateId: string) => void;
}
```

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ [Search input...        ] [Grid] [List] │
├─────────────────────────────────────────────────────┤
│ Tags: [headless] [nextjs] [storefront] [commerce]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐             │
│  │ Card 1  │  │ Card 2  │  │ Card 3  │             │
│  └─────────┘  └─────────┘  └─────────┘             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Features:**
- SearchHeader integration for search + view toggle
- Tag chips extracted from all template tags (deduplicated)
- Responsive grid using CSS Grid
- Empty state when no matches
- Smooth transitions between views

### Tag Extraction Logic
```typescript
const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    templates.forEach(t => t.tags?.forEach(tag => tagSet.add(tag)));
    return Array.from(tagSet).sort();
}, [templates]);
```

### Filter Logic
```typescript
const filteredTemplates = useMemo(() => {
    return templates.filter(template => {
        // Search filter
        const matchesSearch = !searchQuery ||
            template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            template.description.toLowerCase().includes(searchQuery.toLowerCase());

        // Tag filter
        const matchesTags = selectedTags.length === 0 ||
            selectedTags.some(tag => template.tags?.includes(tag));

        return matchesSearch && matchesTags;
    });
}, [templates, searchQuery, selectedTags]);
```

## File Locations
- `src/features/project-creation/ui/components/TemplateGallery.tsx`
- `tests/features/project-creation/ui/components/TemplateGallery.test.tsx`

## Acceptance Criteria
- [ ] Search filters templates correctly
- [ ] Tag chips render and filter correctly
- [ ] View mode toggle works
- [ ] Empty state displays when no matches
- [ ] All tests pass with 85%+ coverage
