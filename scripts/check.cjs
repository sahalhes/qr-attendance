const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
for (const file of fs.readdirSync('apps-script')) {
  const source = fs.readFileSync(path.join('apps-script',file), 'utf8');
  if (file.endsWith('.gs')) new vm.Script(source, {filename:file});
  if (file.endsWith('.html')) for (const match of source.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1], {filename:file});
  if (file.endsWith('.json')) JSON.parse(source);
}
console.log('Apps Script, HTML scripts and manifest syntax passed.');
