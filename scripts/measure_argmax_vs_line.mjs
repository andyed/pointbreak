// 6b / Track 5 discriminator (promoted from scratchpad, 2026-08-14): where
// does the BRIGHTEST foam sit relative to the baked break line? Per column of
// a pinned-nadir frame, take the brightest pixel with L>=180 (sand sits
// ~130-150, foam above), map to world z (linear nadir map), and report its
// signed distance to zb(x) from a lineProbe dump (scripts/dump_lineprobe.mjs).
// Positive = shoreward of the line — the 6b failure direction, where the
// swash/aftermath field outshines the crest foam.
//
// CAVEAT (WEB_THREE_SPEC "6b separated"): an argmax detector is capturable by
// the swash field. This script is a DISCRIMINATOR for render-side foam changes
// (did the brightest pixel move toward the line), not an alpha instrument —
// never feed its offsets into a peel-angle summary.
//
// Inputs: <runDir> of frame_*.png from a pinned-nadir capture; <line.json>
// from scripts/dump_lineprobe.mjs at the SAME hash; <cx> <cz> <halfw> = the
// nadir camera's world center and half-width (halfheight derives from the
// frame aspect).
//
// Usage: node scripts/measure_argmax_vs_line.mjs <runDir> <line.json> <cx> <cz> <halfw>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

function decodePNG(buf) {
  let off = 8; let w = 0, h = 0; const idat = [];
  let colorType = 0;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const ch = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 0xff;
    }
    prev = cur;
  }
  return { w, h, ch, data: out };
}

const [dir, lineFile, cxA, czA, halfwA] = process.argv.slice(2);
if (!dir || !lineFile || !halfwA) {
  console.error('usage: node scripts/measure_argmax_vs_line.mjs <runDir> <line.json> <cx> <cz> <halfw>');
  process.exit(1);
}
const cx = parseFloat(cxA), cz = parseFloat(czA), halfw = parseFloat(halfwA);
const probe = JSON.parse(readFileSync(lineFile, 'utf8'));
const line = probe.line;
const zbAt = (x) => {
  if (x <= line[0].x) return line[0].z;
  if (x >= line[line.length - 1].x) return line[line.length - 1].z;
  for (let i = 1; i < line.length; i++) {
    if (line[i].x >= x) {
      const a = line[i - 1], b = line[i];
      return a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x);
    }
  }
  return line[line.length - 1].z;
};

const frames = readdirSync(dir).filter((f) => f.startsWith('frame_') && f.endsWith('.png')).sort();
if (!frames.length) { console.error(`no frame_*.png in ${dir}`); process.exit(1); }
const dists = [];
for (const f of frames) {
  const { w, h, ch, data } = decodePNG(readFileSync(join(dir, f)));
  const halfd = halfw * (h / w);
  for (let px = 0; px < w; px += 2) {
    let bestL = 180, bestY = -1;
    for (let py = 0; py < h; py++) {
      const o = (py * w + px) * ch;
      const L = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
      if (L > bestL) { bestL = L; bestY = py; }
    }
    if (bestY < 0) continue;
    const xw = cx - halfw + (px / w) * 2 * halfw;
    const zw = cz - halfd + (bestY / h) * 2 * halfd;
    dists.push(zw - zbAt(xw));
  }
}
if (!dists.length) { console.error('no columns cleared the L>=180 foam threshold'); process.exit(1); }
dists.sort((a, b) => a - b);
const med = dists[Math.floor(dists.length / 2)];
const mean = dists.reduce((q, v) => q + v, 0) / dists.length;
const within = dists.filter((d) => Math.abs(d) <= 20).length / dists.length;
console.log(JSON.stringify({
  cols: dists.length, medianM: +med.toFixed(1), meanM: +mean.toFixed(1),
  fracWithin20m: +within.toFixed(3),
  p10: +dists[Math.floor(dists.length * 0.1)].toFixed(1),
  p90: +dists[Math.floor(dists.length * 0.9)].toFixed(1),
}));
