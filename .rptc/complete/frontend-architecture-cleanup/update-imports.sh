#!/bin/bash

# Update imports from @/core/ui/components/* to @/webview-ui/shared/components/*
# Handles all component import patterns

set -e

echo "=== Updating Source File Imports ==="

# Function to update imports in a file
update_file_imports() {
  local file="$1"
  echo "Processing: $file"

  # Backup file
  cp "$file" "$file.bak"

  # Update component imports - map to new function-based directories
  # FormField → forms/
  sed -i '' "s|from '@/core/ui/components/FormField'|from '@/webview-ui/shared/components/forms/FormField'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/FormField"|from "@/webview-ui/shared/components/forms/FormField"|g' "$file"

  # LoadingDisplay, StatusCard → feedback/
  sed -i '' "s|from '@/core/ui/components/LoadingDisplay'|from '@/webview-ui/shared/components/feedback/LoadingDisplay'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/LoadingDisplay"|from "@/webview-ui/shared/components/feedback/LoadingDisplay"|g' "$file"
  sed -i '' "s|from '@/core/ui/components/StatusCard'|from '@/webview-ui/shared/components/feedback/StatusCard'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/StatusCard"|from "@/webview-ui/shared/components/feedback/StatusCard"|g' "$file"

  # Modal, FadeTransition, NumberedInstructions → ui/
  sed -i '' "s|from '@/core/ui/components/Modal'|from '@/webview-ui/shared/components/ui/Modal'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/Modal"|from "@/webview-ui/shared/components/ui/Modal"|g' "$file"
  sed -i '' "s|from '@/core/ui/components/FadeTransition'|from '@/webview-ui/shared/components/ui/FadeTransition'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/FadeTransition"|from "@/webview-ui/shared/components/ui/FadeTransition"|g' "$file"
  sed -i '' "s|from '@/core/ui/components/NumberedInstructions'|from '@/webview-ui/shared/components/ui/NumberedInstructions'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/NumberedInstructions"|from "@/webview-ui/shared/components/ui/NumberedInstructions"|g' "$file"

  # TwoColumnLayout, GridLayout → layout/
  sed -i '' "s|from '@/core/ui/components/TwoColumnLayout'|from '@/webview-ui/shared/components/layout/TwoColumnLayout'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/TwoColumnLayout"|from "@/webview-ui/shared/components/layout/TwoColumnLayout"|g' "$file"
  sed -i '' "s|from '@/core/ui/components/GridLayout'|from '@/webview-ui/shared/components/layout/GridLayout'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/GridLayout"|from "@/webview-ui/shared/components/layout/GridLayout"|g' "$file"

  # Generic component barrel import
  sed -i '' "s|from '@/core/ui/components'|from '@/webview-ui/shared/components'|g" "$file"
  sed -i '' 's|from "@/core/ui/components"|from "@/webview-ui/shared/components"|g' "$file"

  # Hook imports
  sed -i '' "s|from '@/core/ui/hooks|from '@/webview-ui/shared/hooks|g" "$file"
  sed -i '' 's|from "@/core/ui/hooks|from "@/webview-ui/shared/hooks|g' "$file"

  # Styles imports
  sed -i '' "s|from '@/core/ui/styles|from '@/webview-ui/shared/styles|g" "$file"
  sed -i '' 's|from "@/core/ui/styles|from "@/webview-ui/shared/styles|g' "$file"

  # Types imports
  sed -i '' "s|from '@/core/ui/types|from '@/webview-ui/shared/types|g" "$file"
  sed -i '' 's|from "@/core/ui/types|from "@/webview-ui/shared/types"|g' "$file"

  # Utils imports
  sed -i '' "s|from '@/core/ui/utils|from '@/webview-ui/shared/utils|g" "$file"
  sed -i '' 's|from "@/core/ui/utils|from "@/webview-ui/shared/utils"|g' "$file"

  # vscode-api import
  sed -i '' "s|from '@/core/ui/vscode-api'|from '@/webview-ui/shared/vscode-api'|g" "$file"
  sed -i '' 's|from "@/core/ui/vscode-api"|from "@/webview-ui/shared/vscode-api"|g' "$file"

  # Verify changes made
  if ! diff -q "$file" "$file.bak" >/dev/null 2>&1; then
    echo "  ✓ Updated"
  else
    echo "  - No changes needed"
  fi
}

# Update all source files with @/core/ui imports
while IFS= read -r file; do
  update_file_imports "$file"
done < <(grep -r "from ['\"]@/core/ui" src/features --include="*.ts" --include="*.tsx" -l 2>/dev/null || true)

echo ""
echo "=== Verification ==="

# Count remaining @/core/ui imports in source files
remaining=$(grep -r "from ['\"]@/core/ui" src/features --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo "Remaining @/core/ui imports in src/features: $remaining"

if [ "$remaining" -eq 0 ]; then
  echo "✓ All source imports updated successfully"

  # Remove backup files
  find src/features -name "*.bak" -delete

  exit 0
else
  echo "⚠️  Some imports remain - manual review needed"
  echo "Run: grep -r \"from.*@/core/ui\" src/features"
  exit 1
fi
