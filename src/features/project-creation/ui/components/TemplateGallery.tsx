/**
 * TemplateGallery Component
 *
 * Full-featured template gallery with search, tag filtering, and view mode toggle.
 * Provides the main template browsing experience in WelcomeStep.
 */

import { Flex, Text, SearchField, ActionButton, Tooltip, TooltipTrigger } from '@adobe/react-spectrum';
import ViewGrid from '@spectrum-icons/workflow/ViewGrid';
import ViewList from '@spectrum-icons/workflow/ViewList';
import React, { useState, useMemo, useCallback } from 'react';
import { DemoTemplate } from '@/types/templates';
import { TemplateCard } from './TemplateCard';
import { TemplateRow } from './TemplateRow';

type ViewMode = 'cards' | 'rows';

export interface TemplateGalleryProps {
    /** Available templates to display */
    templates: DemoTemplate[];
    /** Currently selected template ID */
    selectedTemplateId?: string;
    /** Callback when a template is selected */
    onSelect: (templateId: string) => void;
}

/**
 * TemplateGallery - Full template browsing experience
 *
 * Features:
 * - Search by name and description
 * - Tag-based filtering (multiple tags with OR logic)
 * - Grid/list view toggle
 * - Empty state for no matches
 */
export const TemplateGallery: React.FC<TemplateGalleryProps> = ({
    templates,
    selectedTemplateId,
    onSelect,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [viewMode, setViewMode] = useState<ViewMode>('cards');

    // Extract all unique tags from templates
    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        templates.forEach(t => t.tags?.forEach(tag => tagSet.add(tag)));
        return Array.from(tagSet).sort();
    }, [templates]);

    // Filter templates by search query and selected tags
    const filteredTemplates = useMemo(() => {
        return templates.filter(template => {
            // Search filter (name and description)
            const query = searchQuery.toLowerCase();
            const matchesSearch = !searchQuery ||
                template.name.toLowerCase().includes(query) ||
                template.description.toLowerCase().includes(query);

            // Tag filter (OR logic - matches if template has ANY selected tag)
            const matchesTags = selectedTags.length === 0 ||
                selectedTags.some(tag => template.tags?.includes(tag));

            return matchesSearch && matchesTags;
        });
    }, [templates, searchQuery, selectedTags]);

    // Toggle tag selection
    const toggleTag = useCallback((tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        );
    }, []);

    // Empty state
    if (templates.length === 0) {
        return (
            <Text UNSAFE_className="text-gray-600">
                No templates available
            </Text>
        );
    }

    const hasNoResults = filteredTemplates.length === 0 && (searchQuery || selectedTags.length > 0);

    return (
        <div className="template-gallery">
            {/* Search and View Toggle Bar */}
            <Flex gap="size-100" marginBottom="size-200" alignItems="end">
                <SearchField
                    placeholder="Search templates..."
                    value={searchQuery}
                    onChange={setSearchQuery}
                    width="100%"
                    isQuiet
                    aria-label="Search templates"
                    UNSAFE_className="flex-1"
                />
                <Flex gap="size-50">
                    <TooltipTrigger delay={300}>
                        <ActionButton
                            isQuiet
                            onPress={() => setViewMode('cards')}
                            aria-label="Card view"
                            aria-pressed={viewMode === 'cards'}
                            UNSAFE_className="cursor-pointer"
                            UNSAFE_style={{
                                backgroundColor: viewMode === 'cards' ? 'var(--spectrum-global-color-gray-200)' : undefined,
                                borderRadius: '4px',
                            }}
                        >
                            <ViewGrid />
                        </ActionButton>
                        <Tooltip>Card view</Tooltip>
                    </TooltipTrigger>
                    <TooltipTrigger delay={300}>
                        <ActionButton
                            isQuiet
                            onPress={() => setViewMode('rows')}
                            aria-label="List view"
                            aria-pressed={viewMode === 'rows'}
                            UNSAFE_className="cursor-pointer"
                            UNSAFE_style={{
                                backgroundColor: viewMode === 'rows' ? 'var(--spectrum-global-color-gray-200)' : undefined,
                                borderRadius: '4px',
                            }}
                        >
                            <ViewList />
                        </ActionButton>
                        <Tooltip>List view</Tooltip>
                    </TooltipTrigger>
                </Flex>
            </Flex>

            {/* Tag Filter Chips */}
            {allTags.length > 0 && (
                <Flex gap="size-100" wrap marginBottom="size-200">
                    {allTags.map(tag => (
                        <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTag(tag)}
                            className={`template-tag-filter ${selectedTags.includes(tag) ? 'template-tag-filter-selected' : ''}`}
                            aria-pressed={selectedTags.includes(tag)}
                        >
                            {tag}
                        </button>
                    ))}
                </Flex>
            )}

            {/* Templates Grid/List */}
            {hasNoResults ? (
                <Text UNSAFE_className="text-gray-600">
                    No templates match your search
                </Text>
            ) : (
                <div
                    data-testid="template-grid"
                    data-view-mode={viewMode}
                    className={viewMode === 'cards' ? 'template-card-grid' : 'template-row-list'}
                >
                    {filteredTemplates.map(template => (
                        viewMode === 'cards' ? (
                            <TemplateCard
                                key={template.id}
                                template={template}
                                isSelected={selectedTemplateId === template.id}
                                onSelect={onSelect}
                            />
                        ) : (
                            <TemplateRow
                                key={template.id}
                                template={template}
                                isSelected={selectedTemplateId === template.id}
                                onSelect={onSelect}
                            />
                        )
                    ))}
                </div>
            )}
        </div>
    );
};
