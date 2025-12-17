/**
 * TemplateGallery Component
 *
 * Template gallery with search and view toggles, matching ProjectsDashboard.
 */

import { Text } from '@adobe/react-spectrum';
import React, { useState, useMemo } from 'react';
import { DemoTemplate } from '@/types/templates';
import { TemplateCard } from './TemplateCard';
import { TemplateRow } from './TemplateRow';
import { SearchHeader, type ViewMode } from '@/core/ui/components/navigation/SearchHeader';

export interface TemplateGalleryProps {
    templates: DemoTemplate[];
    selectedTemplateId?: string;
    onSelect: (templateId: string) => void;
    /** Initial view mode from extension settings */
    initialViewMode?: ViewMode;
}

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({
    templates,
    selectedTemplateId,
    onSelect,
    initialViewMode = 'cards',
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

    const filteredTemplates = useMemo(() => {
        if (!searchQuery.trim()) return templates;
        const query = searchQuery.toLowerCase();
        return templates.filter(t =>
            t.name.toLowerCase().includes(query) ||
            t.description.toLowerCase().includes(query)
        );
    }, [templates, searchQuery]);

    if (templates.length === 0) {
        return (
            <Text UNSAFE_className="text-gray-600">
                No templates available
            </Text>
        );
    }

    return (
        <div>
            <SearchHeader
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                searchPlaceholder="Filter templates..."
                searchThreshold={0}
                totalCount={templates.length}
                filteredCount={filteredTemplates.length}
                itemNoun="template"
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                hasLoadedOnce={true}
                alwaysShowCount={true}
            />

            {viewMode === 'cards' && (
                <div className="projects-grid">
                    {filteredTemplates.map(template => (
                        <TemplateCard
                            key={template.id}
                            template={template}
                            isSelected={selectedTemplateId === template.id}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}

            {viewMode === 'rows' && (
                <div className="projects-row-list">
                    {filteredTemplates.map(template => (
                        <TemplateRow
                            key={template.id}
                            template={template}
                            isSelected={selectedTemplateId === template.id}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}

            {searchQuery && filteredTemplates.length === 0 && (
                <Text UNSAFE_className="text-gray-500 py-4">
                    No templates match "{searchQuery}"
                </Text>
            )}
        </div>
    );
};
