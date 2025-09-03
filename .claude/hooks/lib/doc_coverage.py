#!/usr/bin/env python3
"""
Documentation Coverage Analyzer
Tracks which code has documentation and identifies gaps
"""

import re
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from collections import defaultdict


class DocCoverageAnalyzer:
    """Analyzes documentation coverage for the codebase"""
    
    def __init__(self):
        self.project_root = Path.cwd()
        self.coverage_data = defaultdict(dict)
        self.doc_files = self._find_all_docs()
        
    def _find_all_docs(self) -> Dict[str, List[str]]:
        """Find all documentation files and map them to directories"""
        doc_map = defaultdict(list)
        
        # Find all CLAUDE.md files
        for claude_md in self.project_root.glob("**/CLAUDE.md"):
            if 'node_modules' not in str(claude_md) and '.git' not in str(claude_md):
                doc_map[str(claude_md.parent)].append(str(claude_md))
        
        # Find other documentation
        docs_dir = self.project_root / "docs"
        if docs_dir.exists():
            for doc_file in docs_dir.glob("**/*.md"):
                if 'node_modules' not in str(doc_file):
                    doc_map[str(docs_dir)].append(str(doc_file))
        
        return doc_map
    
    def analyze_file_coverage(self, file_path: str) -> Dict[str, Any]:
        """Analyze documentation coverage for a specific file"""
        coverage = {
            'file': file_path,
            'documented_items': [],
            'undocumented_items': [],
            'coverage_percentage': 0,
            'related_docs': [],
            'suggestions': []
        }
        
        # Find related documentation
        coverage['related_docs'] = self._find_related_docs(file_path)
        
        # Extract items from code
        code_items = self._extract_code_items(file_path)
        
        # Check what's documented
        documented = self._check_documented_items(code_items, coverage['related_docs'])
        
        # Calculate coverage
        coverage['documented_items'] = documented['documented']
        coverage['undocumented_items'] = documented['undocumented']
        
        total_items = len(coverage['documented_items']) + len(coverage['undocumented_items'])
        if total_items > 0:
            coverage['coverage_percentage'] = (len(coverage['documented_items']) / total_items) * 100
        
        # Generate suggestions
        coverage['suggestions'] = self._generate_coverage_suggestions(
            coverage['undocumented_items'],
            file_path
        )
        
        return coverage
    
    def _find_related_docs(self, file_path: str) -> List[str]:
        """Find documentation files related to a code file"""
        related = []
        file_path_obj = Path(file_path)
        
        # Check for CLAUDE.md in same and parent directories
        current = file_path_obj.parent
        while current >= self.project_root:
            claude_md = current / "CLAUDE.md"
            if claude_md.exists():
                related.append(str(claude_md))
                break
            current = current.parent
        
        # Check for specific documentation based on file location
        if "components" in str(file_path):
            ui_patterns = self.project_root / "docs/development/ui-patterns.md"
            if ui_patterns.exists():
                related.append(str(ui_patterns))
        
        if "utils" in str(file_path):
            systems_docs = self.project_root / "docs/systems"
            if systems_docs.exists():
                for doc in systems_docs.glob("*.md"):
                    related.append(str(doc))
        
        if "prerequisites" in str(file_path).lower():
            prereq_doc = self.project_root / "docs/systems/prerequisites-system.md"
            if prereq_doc.exists():
                related.append(str(prereq_doc))
        
        return related
    
    def _extract_code_items(self, file_path: str) -> Dict[str, List[str]]:
        """Extract documentable items from a code file"""
        items = {
            'functions': [],
            'classes': [],
            'interfaces': [],
            'types': [],
            'exports': [],
            'hooks': [],
            'components': []
        }
        
        try:
            with open(file_path, 'r') as f:
                content = f.read()
            
            # Extract functions
            func_pattern = r'(?:export\s+)?(?:async\s+)?function\s+(\w+)'
            items['functions'] = re.findall(func_pattern, content)
            
            # Extract arrow functions
            arrow_pattern = r'(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>'
            items['functions'].extend(re.findall(arrow_pattern, content))
            
            # Extract classes
            class_pattern = r'(?:export\s+)?(?:abstract\s+)?class\s+(\w+)'
            items['classes'] = re.findall(class_pattern, content)
            
            # Extract interfaces (TypeScript)
            interface_pattern = r'(?:export\s+)?interface\s+(\w+)'
            items['interfaces'] = re.findall(interface_pattern, content)
            
            # Extract type definitions (TypeScript)
            type_pattern = r'(?:export\s+)?type\s+(\w+)'
            items['types'] = re.findall(type_pattern, content)
            
            # Detect React components (functions starting with capital letter)
            for func in items['functions']:
                if func[0].isupper():
                    items['components'].append(func)
            
            # Detect React hooks (functions starting with 'use')
            for func in items['functions']:
                if func.startswith('use'):
                    items['hooks'].append(func)
            
            # Extract all exports
            export_pattern = r'export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)'
            items['exports'] = re.findall(export_pattern, content)
            
        except Exception:
            pass
        
        return items
    
    def _check_documented_items(self, code_items: Dict[str, List[str]], 
                                doc_files: List[str]) -> Dict[str, List[Dict]]:
        """Check which code items are documented"""
        documented = []
        undocumented = []
        
        # Combine all documentation content
        doc_content = ""
        for doc_file in doc_files:
            try:
                with open(doc_file, 'r') as f:
                    doc_content += f.read().lower() + "\n"
            except Exception:
                pass
        
        # Check each item type
        for item_type, items in code_items.items():
            for item_name in items:
                # Skip private items (starting with _)
                if item_name.startswith('_'):
                    continue
                
                # Check if item is mentioned in documentation
                # Look for various formats: `itemName`, itemName(), ### itemName, etc.
                patterns = [
                    f"`{item_name}`",
                    f"{item_name}()",
                    f"### {item_name}",
                    f"## {item_name}",
                    f"**{item_name}**",
                    f"{item_name} component",
                    f"{item_name} hook",
                    f"class {item_name}",
                    f"interface {item_name}",
                ]
                
                is_documented = False
                for pattern in patterns:
                    if pattern.lower() in doc_content:
                        is_documented = True
                        break
                
                item_info = {
                    'name': item_name,
                    'type': item_type
                }
                
                if is_documented:
                    documented.append(item_info)
                else:
                    undocumented.append(item_info)
        
        return {
            'documented': documented,
            'undocumented': undocumented
        }
    
    def _generate_coverage_suggestions(self, undocumented_items: List[Dict], 
                                      file_path: str) -> List[str]:
        """Generate suggestions for improving documentation coverage"""
        suggestions = []
        
        # Group by type
        by_type = defaultdict(list)
        for item in undocumented_items:
            by_type[item['type']].append(item['name'])
        
        # Generate suggestions
        if by_type['components']:
            suggestions.append(f"📦 Add documentation for {len(by_type['components'])} React component(s): {', '.join(by_type['components'][:3])}")
        
        if by_type['hooks']:
            suggestions.append(f"🪝 Document {len(by_type['hooks'])} React hook(s): {', '.join(by_type['hooks'][:3])}")
        
        if by_type['functions']:
            public_funcs = [f for f in by_type['functions'] if f not in by_type['components'] and f not in by_type['hooks']]
            if public_funcs:
                suggestions.append(f"📝 Document {len(public_funcs)} function(s): {', '.join(public_funcs[:3])}")
        
        if by_type['classes']:
            suggestions.append(f"🏗️ Add class documentation for: {', '.join(by_type['classes'][:3])}")
        
        if by_type['interfaces'] or by_type['types']:
            type_count = len(by_type['interfaces']) + len(by_type['types'])
            suggestions.append(f"📋 Document {type_count} type definition(s)")
        
        if by_type['exports']:
            suggestions.append(f"📤 Document {len(by_type['exports'])} exported item(s)")
        
        return suggestions
    
    def generate_coverage_report(self, directory: Optional[str] = None) -> Dict[str, Any]:
        """Generate a coverage report for a directory or entire project"""
        report = {
            'total_files': 0,
            'documented_files': 0,
            'partially_documented_files': 0,
            'undocumented_files': 0,
            'overall_coverage': 0,
            'by_directory': {},
            'suggestions': []
        }
        
        # Determine target directory
        target = Path(directory) if directory else self.project_root / "src"
        
        # Analyze all code files
        code_extensions = ['.ts', '.tsx', '.js', '.jsx', '.py']
        total_items = 0
        documented_items = 0
        
        for ext in code_extensions:
            for code_file in target.glob(f"**/*{ext}"):
                if 'node_modules' in str(code_file) or '.git' in str(code_file):
                    continue
                
                report['total_files'] += 1
                
                # Analyze file coverage
                coverage = self.analyze_file_coverage(str(code_file))
                
                # Update counts
                total_items += len(coverage['documented_items']) + len(coverage['undocumented_items'])
                documented_items += len(coverage['documented_items'])
                
                # Categorize file
                if coverage['coverage_percentage'] == 100:
                    report['documented_files'] += 1
                elif coverage['coverage_percentage'] > 0:
                    report['partially_documented_files'] += 1
                else:
                    report['undocumented_files'] += 1
                
                # Track by directory
                try:
                    dir_name = str(code_file.parent.relative_to(self.project_root))
                except ValueError:
                    # Handle symlinks or files outside project root
                    dir_name = str(code_file.parent.name)
                
                if dir_name not in report['by_directory']:
                    report['by_directory'][dir_name] = {
                        'files': 0,
                        'coverage': 0,
                        'undocumented_items': []
                    }
                
                report['by_directory'][dir_name]['files'] += 1
                report['by_directory'][dir_name]['coverage'] += coverage['coverage_percentage']
                report['by_directory'][dir_name]['undocumented_items'].extend(
                    coverage['undocumented_items']
                )
        
        # Calculate overall coverage
        if total_items > 0:
            report['overall_coverage'] = (documented_items / total_items) * 100
        
        # Calculate average coverage by directory
        for dir_data in report['by_directory'].values():
            if dir_data['files'] > 0:
                dir_data['coverage'] = dir_data['coverage'] / dir_data['files']
        
        # Generate top-level suggestions
        if report['undocumented_files'] > 0:
            report['suggestions'].append(
                f"📝 Create documentation for {report['undocumented_files']} completely undocumented files"
            )
        
        # Find directories with low coverage
        low_coverage_dirs = [
            dir_name for dir_name, data in report['by_directory'].items()
            if data['coverage'] < 50
        ]
        
        if low_coverage_dirs:
            report['suggestions'].append(
                f"📁 Focus on improving coverage in: {', '.join(low_coverage_dirs[:3])}"
            )
        
        return report