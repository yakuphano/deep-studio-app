/**
 * Migrates: const styles = StyleSheet.create({ ... colors.xxx ... });
 * → function createStylesStyles(themeColors) { return StyleSheet.create({...}); }
 * + useThemeColors + useMemo in default export.
 */
import fs from 'fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/wrap-stylesheet-for-theme.mjs <file.tsx>');
  process.exit(1);
}

let s = fs.readFileSync(file, 'utf8');
if (s.includes('useThemeColors(')) {
  console.log('skip (already migrated):', file);
  process.exit(0);
}
if (!s.includes("@/theme/colors") && !s.includes('@/theme/colors')) {
  console.log('skip (no @/theme/colors):', file);
  process.exit(0);
}

const re = /\bconst\s+(\w+)\s*=\s*StyleSheet\.create\s*\(\s*\{/;
const m = s.match(re);
if (!m) {
  console.error('No const X = StyleSheet.create({ in', file);
  process.exit(1);
}
const styleVar = m[1];
const startBrace = m.index + m[0].length - 1;

let depth = 0;
let i = startBrace;
for (; i < s.length; i++) {
  const c = s[i];
  if (c === '{') depth++;
  else if (c === '}') {
    depth--;
    if (depth === 0) {
      i++;
      break;
    }
  }
}
if (depth !== 0) {
  console.error('Unbalanced braces', file);
  process.exit(1);
}
if (s.slice(i, i + 2) !== ');') {
  console.error('Expected ); after }}', file, JSON.stringify(s.slice(i, i + 8)));
  process.exit(1);
}
const sheetEnd = i + 2;

const inner = s.slice(startBrace + 1, i - 1);
const beforeSheet = s.slice(0, m.index).trimEnd();
const afterSheet = s.slice(sheetEnd).replace(/^\s*\n/, '\n');

const fnName =
  styleVar === 'styles'
    ? 'createStyles'
    : `create${styleVar[0].toUpperCase()}${styleVar.slice(1)}Styles`;
const styleBlock = `function ${fnName}(themeColors: AppColors) {
  return StyleSheet.create({${inner.replace(/\bcolors\./g, 'themeColors.')}});
}`;

// --- imports ---
let head = beforeSheet.replace(
  /import\s*\{[^}]*\bcolors\b[^}]*\}\s*from\s*['"]@\/theme\/colors['"]\s*;?\s*\n?/,
  "import type { AppColors } from '@/theme/palettes';\nimport { useThemeColors } from '@/contexts/ThemeContext';\n"
);
if (head === beforeSheet) {
  console.error('colors import replace failed', file);
  process.exit(1);
}

// useMemo in react import
if (/import React, \{/.test(head)) {
  if (!/\buseMemo\b/.test(head)) {
    head = head.replace(/import React, \{([^}]+)\}/, (_, innerIm) => {
      const parts = innerIm.split(',').map((x) => x.trim()).filter(Boolean);
      if (!parts.includes('useMemo')) parts.unshift('useMemo');
      return `import React, { ${parts.join(', ')} }`;
    });
  }
} else if (/import React from 'react'/.test(head)) {
  head = head.replace(/import React from 'react'/, "import React, { useMemo } from 'react'");
} else {
  head = "import React, { useMemo } from 'react';\n" + head;
}

// --- insert hooks after export default function ... () { ---
const exportMatch = head.match(/export default function \w+\s*\([^)]*\)\s*\{/);
if (!exportMatch) {
  console.error('No export default function', file);
  process.exit(1);
}
const ins = exportMatch.index + exportMatch[0].length;
const hookBlock = `\n  const themeColors = useThemeColors();\n  const ${styleVar} = useMemo(() => ${fnName}(themeColors), [themeColors]);\n`;
const newHead = head.slice(0, ins) + hookBlock + head.slice(ins);

const out = newHead + '\n\n' + styleBlock + afterSheet;
fs.writeFileSync(file, out);
console.log('ok', file);
