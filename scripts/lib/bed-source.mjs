// Bathymetry-source switch for the headless model (Node only).
//
// bed.js, params.js, main.js and incident-direction.js all import the two
// generated modules by relative specifier:
//
//   .../data/model/pp_geo_profiles.js
//   .../data/model/pp_depth_patches.js
//
// build_geo_profiles.py / build_depth_patches.py --bathy <grid> write siblings
// named pp_geo_profiles.<tag>.js / pp_depth_patches.<tag>.js. This module
// installs a `node:module` resolve hook that rewrites those two specifiers to
// the tagged siblings, so every consumer — shipped code included — reads the
// alternate bed without a single import being edited, and the default (no tag)
// path is untouched: no hook is registered at all.
//
// Same mechanism the instrument already uses for the bare `three` specifier.
// Register BEFORE the first `await import(...)` of anything that reaches bed.js.
//
//   node scripts/measure_break_activation.mjs --bed=cudem19 ...
//   POINTBREAK_BED=cudem19 node scripts/measure_break_activation.mjs ...
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const BED_MODULES = ['pp_geo_profiles', 'pp_depth_patches'];
const RE = new RegExp(`(/data/model/)(${BED_MODULES.join('|')})\\.js$`);

// Pure: the specifier rewrite, exported so a test can pin it.
export function redirectSpecifier(specifier, tag) {
  if (!tag) return specifier;
  return specifier.replace(RE, (_, dir, name) => `${dir}${name}.${tag}.js`);
}

// `--bed=TAG` on argv wins over POINTBREAK_BED in the environment; '' / 'shipped'
// / 'default' mean the shipped modules.
export function bedSourceTag(argv = process.argv, env = process.env) {
  const flag = argv.find((a) => a.startsWith('--bed='));
  const raw = flag ? flag.slice('--bed='.length) : (env.POINTBREAK_BED || '');
  return ['', 'shipped', 'default', 'ncei13'].includes(raw) ? '' : raw;
}

// Install the hook. Verifies both tagged modules exist next to the shipped
// ones so a typo fails here with a message rather than as a resolve error
// three imports deep. Returns the tag ('' when nothing was installed).
export function registerBedSource(tag) {
  if (!tag) return '';
  const modelDir = new URL('../../data/model/', import.meta.url);
  for (const name of BED_MODULES) {
    const p = fileURLToPath(new URL(`${name}.${tag}.js`, modelDir));
    if (!existsSync(p)) {
      throw new Error(`bed source "${tag}": missing ${p} — run `
        + `python3 data/model/build_geo_profiles.py --bathy pp_bathy_${tag}.json and `
        + `python3 data/model/build_depth_patches.py --bathy pp_bathy_${tag}.json first`);
    }
  }
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const next = redirectSpecifier(specifier, tag);
      return nextResolve(next, context);
    },
  });
  return tag;
}
