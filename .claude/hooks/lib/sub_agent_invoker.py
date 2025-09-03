#!/usr/bin/env python3
"""
Sub-Agent Invoker for Claude Code Hooks
Manages invocation of sub-agents based on patterns and thresholds
"""

import re
from typing import Dict, Any, List, Optional
from pathlib import Path


class SubAgentInvoker:
    def __init__(self, config: Dict[str, Any]):
        """Initialize sub-agent invoker with configuration"""
        self.sub_agents = config.get("sub_agents", {})
        self.thresholds = config.get("thresholds", {})
        
    def check_invocation_needed(self, context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Check if any sub-agents should be invoked based on context
        Returns list of sub-agent invocation recommendations
        """
        recommendations = []
        
        # Check quality guardian
        if self._should_invoke_quality_guardian(context):
            recommendations.append({
                "agent": "quality-guardian",
                "reason": "Code complexity threshold reached",
                "priority": "high"
            })
        
        # Check docs sync
        if self._should_invoke_docs_sync(context):
            recommendations.append({
                "agent": "docs-sync",
                "reason": "Documentation update needed",
                "priority": "medium"
            })
        
        return recommendations
    
    def should_block_for_agent(self, agent_name: str, context: Dict[str, Any]) -> bool:
        """Check if execution should be blocked for sub-agent review"""
        agent_config = self.sub_agents.get(agent_name, {})
        
        if not agent_config.get("enabled", False):
            return False
        
        # Quality guardian blocking
        if agent_name == "quality-guardian":
            if agent_config.get("block_on_complexity", False):
                return self._detect_high_complexity(context)
        
        # Docs sync blocking
        elif agent_name == "docs-sync":
            if agent_config.get("block_on_major_changes", False):
                return self._detect_major_changes(context)
        
        return False
    
    def matches_auto_invoke_pattern(self, message: str, agent_name: str) -> bool:
        """Check if message matches auto-invoke patterns for agent"""
        agent_config = self.sub_agents.get(agent_name, {})
        patterns = agent_config.get("auto_invoke_patterns", [])
        
        message_lower = message.lower()
        for pattern in patterns:
            if pattern.lower() in message_lower:
                return True
        
        return False
    
    def create_invocation_message(self, agent_name: str, context: Dict[str, Any]) -> str:
        """Create message for sub-agent invocation"""
        agent_config = self.sub_agents.get(agent_name, {})
        
        if agent_name == "quality-guardian":
            return self._create_quality_guardian_message(context)
        elif agent_name == "docs-sync":
            return self._create_docs_sync_message(context)
        
        return f"Invoke {agent_name} sub-agent for review"
    
    def _should_invoke_quality_guardian(self, context: Dict[str, Any]) -> bool:
        """Check if quality guardian should be invoked"""
        guardian_config = self.sub_agents.get("quality-guardian", {})
        
        if not guardian_config.get("enabled", False):
            return False
        
        # Check trigger threshold
        modified_files = context.get("modified_files_count", 0)
        threshold = guardian_config.get("trigger_threshold", 5)
        
        if modified_files >= threshold:
            return True
        
        # Check for auto-invoke patterns in recent messages
        recent_message = context.get("last_user_message", "")
        if self.matches_auto_invoke_pattern(recent_message, "quality-guardian"):
            return True
        
        return False
    
    def _should_invoke_docs_sync(self, context: Dict[str, Any]) -> bool:
        """Check if docs sync should be invoked"""
        docs_config = self.sub_agents.get("docs-sync", {})
        
        if not docs_config.get("enabled", False):
            return False
        
        # Check commit threshold
        commits_since_update = context.get("commits_since_doc_update", 0)
        threshold = docs_config.get("auto_trigger_commits", 3)
        
        if commits_since_update >= threshold:
            return True
        
        # Check for CLAUDE.md modifications
        if docs_config.get("track_claude_md", True):
            modified_files = context.get("modified_files", [])
            for file in modified_files:
                if "CLAUDE.md" in file:
                    return True
        
        # Check doc update threshold
        modified_files = context.get("modified_files_count", 0)
        doc_threshold = self.thresholds.get("doc_update_files", 10)
        
        return modified_files >= doc_threshold
    
    def _detect_high_complexity(self, context: Dict[str, Any]) -> bool:
        """Detect if recent changes introduce high complexity"""
        # Check for multiple nested conditions
        recent_code = context.get("recent_code_changes", "")
        
        # Count nesting levels
        nesting_indicators = [
            r'if.*:\s*if',  # Nested if statements
            r'for.*:\s*for',  # Nested loops
            r'while.*:\s*while',  # Nested while loops
            r'\{[^}]*\{[^}]*\{',  # Triple nested braces
        ]
        
        for pattern in nesting_indicators:
            if re.search(pattern, recent_code):
                return True
        
        # Check line count in single function
        function_lines = self._count_function_lines(recent_code)
        if function_lines > 50:
            return True
        
        # Check cyclomatic complexity indicators
        decision_points = len(re.findall(r'\b(if|elif|while|for|except|case)\b', recent_code))
        if decision_points > 10:
            return True
        
        return False
    
    def _detect_major_changes(self, context: Dict[str, Any]) -> bool:
        """Detect if changes are major enough to require doc updates"""
        # Check number of files changed
        modified_files = context.get("modified_files_count", 0)
        if modified_files > 10:
            return True
        
        # Check for structural changes
        modified_files_list = context.get("modified_files", [])
        structural_files = [
            "package.json",
            "tsconfig.json",
            "webpack.config.js",
            ".eslintrc",
            "Cargo.toml",
            "go.mod",
            "requirements.txt",
            "pom.xml"
        ]
        
        for file in modified_files_list:
            if any(struct_file in file for struct_file in structural_files):
                return True
        
        # Check for new directories
        new_directories = context.get("new_directories", [])
        if new_directories:
            return True
        
        return False
    
    def _create_quality_guardian_message(self, context: Dict[str, Any]) -> str:
        """Create message for quality guardian invocation"""
        modified_count = context.get("modified_files_count", 0)
        
        return f"""🛡️ Quality Guardian Review Needed

Modified files: {modified_count}
Complexity indicators detected.

The quality-guardian sub-agent should review recent changes for:
1. Overengineering and unnecessary complexity
2. Code duplication
3. Performance issues
4. Best practice violations

Invoke with: Use the Task tool with subagent_type="quality-guardian"
"""
    
    def _create_docs_sync_message(self, context: Dict[str, Any]) -> str:
        """Create message for docs sync invocation"""
        commits = context.get("commits_since_doc_update", 0)
        modified = context.get("modified_files_count", 0)
        
        return f"""📚 Documentation Sync Needed

Commits since last doc update: {commits}
Modified files: {modified}

The docs-sync sub-agent should:
1. Update CLAUDE.md files with recent changes
2. Sync technical documentation
3. Update component descriptions
4. Review and update troubleshooting guides

Invoke with: Use the Task tool with subagent_type="docs-sync"
"""
    
    def _count_function_lines(self, code: str) -> int:
        """Count maximum lines in a single function"""
        # Simple heuristic - find function definitions and count lines
        lines = code.split('\n')
        max_lines = 0
        current_function_lines = 0
        in_function = False
        indent_level = 0
        
        for line in lines:
            stripped = line.lstrip()
            
            # Detect function start
            if re.match(r'(def |function |func |fn |const \w+ = \()', stripped):
                in_function = True
                current_function_lines = 1
                indent_level = len(line) - len(stripped)
            elif in_function:
                current_indent = len(line) - len(stripped) if stripped else indent_level
                
                # Function ended if we're back to same or lower indent
                if stripped and current_indent <= indent_level and not line.strip().startswith((')', '}')):
                    max_lines = max(max_lines, current_function_lines)
                    in_function = False
                    current_function_lines = 0
                else:
                    current_function_lines += 1
        
        # Check last function
        if in_function:
            max_lines = max(max_lines, current_function_lines)
        
        return max_lines