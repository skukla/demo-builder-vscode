#!/bin/bash

# Update imports in test files

set -e

echo "=== Updating Test File Imports ==="

# Update moved hook tests
for test_file in tests/webview-ui/shared/hooks/*.test.ts; do
  echo "Processing: $test_file"

  # Backup
  cp "$test_file" "$test_file.bak"

  # Update imports from @/core/ui to @/webview-ui/shared
  sed -i '' "s|from '@/core/ui/hooks|from '@/webview-ui/shared/hooks|g" "$test_file"
  sed -i '' 's|from "@/core/ui/hooks|from "@/webview-ui/shared/hooks|g' "$test_file"
  sed -i '' "s|from '@/core/ui/components|from '@/webview-ui/shared/components|g" "$test_file"
  sed -i '' 's|from "@/core/ui/components|from "@/webview-ui/shared/components"|g' "$test_file"

  echo "  ✓ Updated"
done

# Update LoadingDisplay test
test_file="tests/webview-ui/shared/components/feedback/LoadingDisplay.test.tsx"
if [ -f "$test_file" ]; then
  echo "Processing: $test_file"

  cp "$test_file" "$test_file.bak"

  sed -i '' "s|from '@/core/ui/components/LoadingDisplay'|from '@/webview-ui/shared/components/feedback/LoadingDisplay'|g" "$test_file"
  sed -i '' 's|from "@/core/ui/components/LoadingDisplay"|from "@/webview-ui/shared/components/feedback/LoadingDisplay"|g' "$test_file"

  echo "  ✓ Updated"
fi

# Update feature test files
for test_file in tests/features/components/ui/steps/*.test.tsx; do
  if grep -q "@/core/ui" "$test_file" 2>/dev/null; then
    echo "Processing: $test_file"

    cp "$test_file" "$test_file.bak"

    # Update component imports
    sed -i '' "s|from '@/core/ui/components/FormField'|from '@/webview-ui/shared/components/forms/FormField'|g" "$test_file"
    sed -i '' 's|from "@/core/ui/components/FormField"|from "@/webview-ui/shared/components/forms/FormField"|g' "$test_file"
    sed -i '' "s|from '@/core/ui/components|from '@/webview-ui/shared/components|g" "$test_file"
    sed -i '' 's|from "@/core/ui/components|from "@/webview-ui/shared/components"|g' "$test_file"

    echo "  ✓ Updated"
  fi
done

echo ""
echo "=== Verification ==="

# Count remaining @/core/ui imports in tests
remaining=$(grep -r "from ['\"]@/core/ui" tests/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo "Remaining @/core/ui imports in tests/: $remaining"

if [ "$remaining" -eq 0 ]; then
  echo "✓ All test imports updated successfully"

  # Remove backup files
  find tests/ -name "*.bak" -delete

  exit 0
else
  echo "⚠️  Some imports remain - manual review needed"
  echo "Run: grep -r \"from.*@/core/ui\" tests/"
  exit 1
fi
