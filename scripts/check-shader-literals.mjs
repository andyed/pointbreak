// Backticks inside a GLSL template literal silently terminate the string and
// turn the rest of the shader into JavaScript. It has bitten this repo twice
// (model-glsl.js, shaders.js), each time as a runtime SyntaxError naming a
// GLSL identifier, which reads as a shader problem and is not one.
// Rule: inside `export const X = ` ... ` `, no backticks. Comments included.
import { readFileSync } from 'node:fs';

const RESERVED = new Set(['flat', 'smooth', 'noperspective', 'sample', 'patch',
  'layout', 'precise', 'shared', 'buffer', 'coherent', 'volatile', 'restrict',
  'readonly', 'writeonly', 'centroid', 'invariant', 'subroutine', 'common',
  'partition', 'active', 'filter', 'resource', 'input', 'output']);

const files = ['web/js/model-glsl.js', 'web-three/js/shaders.js', 'web/js/shaders.js'];
let bad = 0;
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  let inLit = false;
  lines.forEach((line, i) => {
    const ticks = (line.match(/`/g) || []).length;
    if (!inLit) {
      if (/=\s*`\s*$/.test(line)) { inLit = true; return; }
      return;                                   // outside: backticks are fine
    }
    if (/^`;\s*$/.test(line)) { inLit = false; return; }
    if (ticks > 0) {
      console.error(`${f}:${i + 1}: backtick inside a GLSL template literal\n    ${line.trim()}`);
      bad++;
    }
    // GLSL ES 3.00 reserved words used as identifiers. `flat` cost a round
    // trip: it compiles as raw GLSL1 in web/ and fails only under the three.js
    // #version 300 es prefix, so one vehicle stays green while the other dies.
    const decl = line.match(/\b(?:float|int|uint|bool|[iub]?vec[234]|mat[234])\s+(\w+)/);
    if (decl && RESERVED.has(decl[1])) {
      console.error(`${f}:${i + 1}: "${decl[1]}" is a GLSL ES 3.00 reserved word\n    ${line.trim()}`);
      bad++;
    }
  });
}
if (bad) { console.error(`\n${bad} backtick(s) inside GLSL literals — these break the build.`); process.exit(1); }
console.log('shader literals clean');
