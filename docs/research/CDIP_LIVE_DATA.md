# CDIP / NDBC Live Wave Data — Santa Cruz "Today's Ocean" Mode

Research notes for driving a real-time Santa Cruz surf-break simulation from live buoy and
nearshore-model data. All endpoints below were probed live on **2026-08-09** (UTC); sample values
are from that session.

## 1. Stations near Monterey Bay / Santa Cruz

Distances are great-circle from Pleasure Point (36.9497 N, 121.9646 W).

| ID | Name | Type | Location | Depth | Dist. from Pleasure Pt | Status |
|----|------|------|----------|-------|------------------------|--------|
| CDIP **156** / NDBC 46236 | Monterey Canyon Outer, CA | Datawell directional Waverider | 36.7555 N, 121.9548 W | 133 m | ~22 km S | **Active** (30-min updates) |
| NDBC **46042** | Monterey (NOAA 3-m discus) | Met + spectral wave | 36.785 N, 122.396 W | ~1,600 m | ~42 km SW | **Active** (hourly spectra) |
| CDIP **157** / NDBC 46239 | Point Sur, CA | Directional Waverider | 36.3351 N, 122.1177 W | deep | ~70 km S | **Active** |
| CDIP **158** / NDBC 46240 | Cabrillo Point Nearshore, CA | Directional Waverider | 36.626 N, 121.907 W | 17.8 m | ~36 km S | **Decommissioned 2026-05-07** (historical archive only) |
| CDIP **185** | Monterey Bay West, CA | Directional Waverider | outer bay | deep | — | **Decommissioned 2023-01** (buoy recovered) |
| CDIP **222** / NDBC 46259 | Santa Lucia Escarpment, CA | Directional Waverider | 34.7637 N, 121.5036 W | deep | ~245 km S | Active (regional swell context only) |

Practical upshot: there is **no live buoy off Santa Cruz itself** anymore (158 was the nearshore
Monterey buoy and it is gone as of May 2026). The best live *observed* source is CDIP 156; the best
*at-the-break* source is the MOP model (§4), which is transformed to the 10–15 m contour ~150 m off
Pleasure Point.

Sources: https://cdip.ucsd.edu/m/stn_table/ · https://cdip.ucsd.edu/m/products/?stn=158p1 ·
https://cdip.ucsd.edu/m/products/?stn=185p1 · https://www.ndbc.noaa.gov/station_page.php?station=46042

## 2. Programmatic access

### CDIP THREDDS / OPeNDAP (primary, CORS-enabled)

Realtime files hold the **latest ~3 days** per station, updated **every 30 minutes**.
Pattern: `https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/realtime/<stn>p1_rt.nc` with suffixes:

- `.dds` — structure (get array length N; **newest record is index N-1**, oldest is 0)
- `.das` — metadata (lat/lon, `wmo_id`, `time_coverage_end`)
- `.ascii?var[start:stride:stop]` — subset as plain text
- `https://thredds.cdip.ucsd.edu/thredds/fileServer/cdip/realtime/156p1_rt.nc` — whole file (~765 KB)

Example (verified):

```
GET https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/realtime/156p1_rt.nc.ascii?waveTime[138:1:139],waveHs[138:1:139],waveTp[138:1:139],waveDp[138:1:139]

Dataset { ... } cdip/realtime/156p1_rt.nc;
---------------------------------------------
waveTime[2]
1786280400, 1786282200        # epoch seconds UTC, 30-min cadence
waveHs[2]
0.82, 0.74                    # significant height, m
waveTp[2]
8.7, 8.7                      # peak period, s
waveDp[2]
298.8, 297.6                  # peak direction, deg true (from)
```

**CORS: `access-control-allow-origin: *` is present on thredds.cdip.ucsd.edu** (verified with an
Origin-header probe) — a browser app can fetch these URLs directly, no proxy needed.

### Legacy CGI (simple text, good for quick polls)

`https://cdip.ucsd.edu/data_access/justdar.cdip?156+sp` → plain-text spectral report
("Station Name: MONTEREY CANYON OUTER, CA … Hs(m) …"). Undocumented-but-stable; treat as fallback.

### NDBC realtime2 text feeds (46042 etc.)

- `https://www.ndbc.noaa.gov/data/realtime2/46042.txt` — standard met/wave table, newest row first
  (`WVHT DPD APD MWD`, ~10-min met, wave rows hourly-ish; `MM` = missing)
- `46042.spec` — swell/wind-sea split summary
- `46042.data_spec` — raw spectral energy density per frequency bin: `spec (freq)` pairs, hourly
- `46042.swdir` / `.swdir2` / `.swr1` / `.swr2` — alpha1, alpha2, r1, r2 directional parameters per bin

**No CORS header on ndbc.noaa.gov** — browser fetches will fail; use a server-side proxy or restrict
NDBC to the TouchDesigner path. Docs: https://www.ndbc.noaa.gov/faq/measdes.shtml

## 3. Spectral data available

CDIP realtime buoy files (e.g. 156) carry, per 30-min record:

- Bulk: `waveHs`, `waveTp`, `waveTa`, `waveTz`, `waveDp`, `wavePeakPSD`, `wavePeakSpread`, SST
- **Full spectrum: `waveEnergyDensity[time][waveFrequency=100]`** (m²/Hz, 100 bins)
- **First-5 directional moments per bin: `waveMeanDirection`, `waveA1Value`, `waveB1Value`,
  `waveA2Value`, `waveB2Value`, `waveCheckFactor`** — reconstruct the full frequency × direction
  spectrum with a MEM estimator (CDIP's own products do exactly this)

So yes: frequency-direction spectra are fully recoverable from the live feed. One spectrum fetch is
`waveEnergyDensity[139:1:139][0:1:99]` plus the four moment arrays — a few KB of ASCII.

## 4. MOP nearshore model (the actual "surf at Pleasure Point" source)

CDIP's MOP v1.1 publishes **predicted nearshore spectra every ~100 m alongshore** on the 10–15 m
depth contour, per county. Santa Cruz County = labels **SC001–SC328** (south-to-north). Nearest
transects to Pleasure Point (from `http://cdip.ucsd.edu/MOP_v1.1/CA_v1.1_transect_definitions.txt`):

- **SC116** — 36.94873 N, 121.96333 W, −15 m, shore normal 200°-ish (closest, ~150 m offshore)
- SC114/SC115 (36.94983 N, 121.96111 W) and SC117 (36.94633 N, 121.96892 W) bracket the point

THREDDS endpoints (all verified live, same OPeNDAP grammar and CORS as §2):

```
https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/model/MOP_alongshore/SC116_nowcast.nc    # hourly, buoy-forced, ~16 months rolling
https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/model/MOP_alongshore/SC116_forecast.nc   # hourly, 80 records (~3.3 days), WW3-forced
https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/model/MOP_alongshore/SC116_hindcast.nc   # long archive
```

Each has `waveHs/Tp/Ta/Dp/Dm`, radiation stresses `waveSxy/waveSxx`, and the spectral block:
`waveEnergyDensity[time][waveFrequency]` + `waveA1/B1/A2/B2Value` (20 bins nowcast/hindcast,
28 bins forecast). Sample from `SC116_nowcast.nc.ascii?waveHs[11893:1:11893]` on 2026-08-09:
Hs 0.65 m, Tp 15.4 s, Dp 189° — a long-period S swell wrapped to the break. Note the nowcast time
dimension grows hourly, so always read N from `.dds` first. Docs:
https://cdip.ucsd.edu/m/documents/models.html · https://cdip.ucsd.edu/MOP_v1.1/

## 5. Licensing / attribution

- **CDIP:** freely available for public use "provided that they are not altered in any way."
  Requested acknowledgment (short form): *"data from CDIP, Scripps Institution of Oceanography"* —
  full form credits the Integrative Oceanography Division, SIO, sponsored by the U.S. Army Corps of
  Engineers and California Dept. of Parks and Recreation. DOI: https://doi.org/10.18437/C7WC72.
  Source: https://cdip.ucsd.edu/m/documents/data_access.html
- **NDBC:** U.S. Government (NOAA) data, public domain; courtesy credit "NOAA/NDBC" is standard.

An on-screen or about-page credit line satisfies both; an art installation is squarely within
intended public use.

## 6. Recommended ingestion

**Web app (browser, no backend needed for CDIP):**
1. Poll every 10 min (data cadence is 30 min buoy / 60 min MOP; be polite).
2. `fetch(".dds")` → regex `waveTime = (\d+)` for N; then `fetch(".ascii?…[N-1:1:N-1]…")` for bulk
   params and the spectrum + a1/b1/a2/b2 rows. Parse the trivial `name[k]\nv1, v2, …` ASCII format.
3. Primary: `SC116_nowcast.nc` (spectrum at the break). Secondary flavor/verification: `156p1_rt.nc`
   (observed offshore spectrum, 100 bins). NDBC 46042 only via your own proxy (no CORS) — optional.
4. Cache last-good response in localStorage; the THREDDS server occasionally times out (observed
   ~60 s stalls on catalog pages), so use an AbortController with ~15 s timeout and stale-while-error.

**TouchDesigner:**
- Web Client DAT → the same `.ascii` URLs (they're plain text), Timer CHOP at 600 s driving the
  request. Parse in a Script DAT (split on blank line, then commas) into a Table DAT / Script CHOP.
- For full spectra, either parse the `.ascii` grid rows, or fetch
  `…/fileServer/cdip/model/MOP_alongshore/SC116_forecast.nc` and read it with `netCDF4`/`xarray`
  in a Script OP (forecast file is small; **do not** bulk-download the hindcast).
- NDBC realtime2 works fine here (no browser, no CORS issue) as a redundancy source.

**Mapping suggestion:** drive the swell field from MOP SC116's 2-D reconstructed spectrum
(MEM over a1,b1,a2,b2), scale foam/energy from Hs², set dominant wavelength from Tp via linear
dispersion at 15 m depth, and let 156's observed spectrum modulate "texture" chop.
