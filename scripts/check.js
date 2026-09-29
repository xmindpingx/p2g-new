// places2go — static checks (run with `npm run check`)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
//   1. Every .js file parses (Babel, JSX).
//   2. Every relative import resolves to a file that exports the requested names.
//   3. Every `colors.xxx` reference exists in the theme.
//   4. Every DEFAULT_APP_SETTINGS key has a label, a group and a role.
// Exits non-zero on any failure.

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', '.expo', 'server', 'scripts']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.jsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const asts = new Map();
let failures = 0;
const fail = (msg) => { failures += 1; console.log('  ✗', msg); };

// 1. parse
for (const f of files) {
  try {
    asts.set(f, parser.parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }));
  } catch (e) {
    fail(`${path.relative(ROOT, f)}: ${e.message}`);
  }
}
console.log(`Parsed ${files.length} files.`);

// 2. imports/exports
function exportsOf(ast) {
  const names = new Set();
  let hasDefault = false;
  for (const node of ast.program.body) {
    if (node.type === 'ExportDefaultDeclaration') hasDefault = true;
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        const d = node.declaration;
        if (d.id) names.add(d.id.name);
        if (d.declarations) for (const v of d.declarations) if (v.id.name) names.add(v.id.name);
      }
      for (const s of node.specifiers || []) names.add(s.exported.name || s.exported.value);
    }
    if (node.type === 'ExportAllDeclaration') names.add('*');
  }
  return { names, hasDefault };
}

const resolveRel = (from, spec) => {
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};

for (const [f, ast] of asts) {
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const spec = node.source.value;
    if (!spec.startsWith('.')) continue;
    const target = resolveRel(f, spec);
    if (!target) { fail(`${path.relative(ROOT, f)} imports missing file ${spec}`); continue; }
    const targetAst = asts.get(target);
    if (!targetAst) continue;
    const ex = exportsOf(targetAst);
    for (const s of node.specifiers) {
      if (s.type === 'ImportDefaultSpecifier' && !ex.hasDefault) fail(`${path.relative(ROOT, f)}: ${spec} has no default export`);
      if (s.type === 'ImportSpecifier') {
        const name = s.imported.name || s.imported.value;
        if (!ex.names.has(name) && !ex.names.has('*')) fail(`${path.relative(ROOT, f)}: ${spec} does not export "${name}"`);
      }
    }
  }
}
console.log('Checked relative imports.');

// 3. theme tokens
const themeSrc = fs.readFileSync(path.join(ROOT, 'src/theme/index.js'), 'utf8');
const colorsBlock = themeSrc.slice(themeSrc.indexOf('export const colors = {'), themeSrc.indexOf('// ── Colour-coded map pins'));
const colorKeys = new Set([...colorsBlock.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map((m) => m[1]));
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bcolors\.([a-zA-Z]+)/g)) {
    if (!colorKeys.has(m[1])) fail(`${path.relative(ROOT, f)} uses colors.${m[1]} (not in theme)`);
  }
}
console.log(`Checked colors.* references (${colorKeys.size} tokens).`);

// 4. settings coverage
const modSrc = fs.readFileSync(path.join(ROOT, 'src/constants/moderation.js'), 'utf8');
const block = (name, open = '{', close = '\n};') => {
  const start = modSrc.indexOf(`export const ${name}`);
  return modSrc.slice(start, modSrc.indexOf(close, start));
};
const defaults = block('DEFAULT_APP_SETTINGS');
const keys = [...defaults.matchAll(/^\s{2}([a-zA-Z0-9]+):/gm)].map((m) => m[1]);
const labels = block('APP_SETTING_LABELS');
const groups = block('SETTING_GROUP_MAP');
const adminSet = modSrc.slice(modSrc.indexOf('export const ADMIN_ONLY_SETTINGS'), modSrc.indexOf(']);', modSrc.indexOf('export const ADMIN_ONLY_SETTINGS')));
const modSet   = modSrc.slice(modSrc.indexOf('export const MOD_ALLOWED_SETTINGS'), modSrc.indexOf(']);', modSrc.indexOf('export const MOD_ALLOWED_SETTINGS')));
for (const k of keys) {
  if (!new RegExp(`^\\s{2}${k}:`, 'm').test(labels)) fail(`setting ${k} has no label`);
  if (!new RegExp(`^\\s{2}${k}:`, 'm').test(groups)) fail(`setting ${k} has no group`);
  if (!adminSet.includes(`'${k}'`) && !modSet.includes(`'${k}'`)) fail(`setting ${k} has no role`);
}
console.log(`Checked ${keys.length} settings keys.`);

if (failures) { console.log(`\n${failures} problem(s).`); process.exit(1); }
console.log('\nAll checks passed.');
