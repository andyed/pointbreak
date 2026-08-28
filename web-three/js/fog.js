// Marine-layer burn-off envelope (2026-08-27).
//
// A time envelope on the fog dial, not a new fog: dawn starts socked in and
// the layer thins on an e-fold of SIM time (rate independence is a house
// rule — #speed=4 burns off four times faster, #speed=0 holds the morning).
// Banks are keyed to k*(1-k), which is zero at both ends and peaks at the
// half-burnt moment: the dawn sheet is uniform, breaks into drifting banks as
// it thins, and the banks themselves then clear. That arc is the whole point
// of the mode — a static "fog slider at 4.5" is the `foggy` day's job.
//
// Pure module on purpose: main.js applies it in the frame sync; tests import
// it directly (main.js pulls in three and cannot load under node --test).

export const BURNOFF_START = 4.5;   // dawn density multiplier — socked in
export const BURNOFF_TAU_S = 240;   // e-fold of sim seconds; mostly clear by ~10 min
export const BURNOFF_BANK  = 0.6;   // bank modulation depth at the half-burnt moment

// (baseFog, baseBank) is what the reader (or a condition day) dialled; the
// envelope only ever ADDS fog on top of it, so a base thicker than the dawn
// value is left alone rather than thinned by its own sunrise.
export function burnoffFog(baseFog, baseBank, simS) {
  const fog = Number.isFinite(baseFog) ? baseFog : 1;
  const bank = Number.isFinite(baseBank) ? baseBank : 0;
  const t = Number.isFinite(simS) ? Math.max(simS, 0) : 0;
  const k = Math.exp(-t / BURNOFF_TAU_S);   // 1 at dawn, -> 0 as it burns
  return {
    fog: Math.max(fog, fog + (BURNOFF_START - fog) * k),
    bank: Math.max(bank, BURNOFF_BANK * 4 * k * (1 - k)),
  };
}
