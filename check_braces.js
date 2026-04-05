const fs = require('fs');
const content = fs.readFileSync('app/(tabs)/task/[id].tsx', 'utf8');
let openBraces = 0;
let closeBraces = 0;
let openParens = 0;
let closeParens = 0;
for (let char of content) {
  if (char === '{') openBraces++;
  if (char === '}') closeBraces++;
  if (char === '(') openParens++;
  if (char === ')') closeParens++;
}
console.log('Open braces:', openBraces, 'Close braces:', closeBraces, 'Open parens:', openParens, 'Close parens:', closeParens, 'Balance:', (openBraces - closeBraces), (openParens - closeParens));
