# Squint seat — ballot, jury 2 matrix

Lens: what survives at 1/8 scale + Gaussian r=2, upscaled to 400 px. Judged from the squint companions only
(`sheet_<rig>.png`, `<rig>_<arm>_<clock>_squint.png` in this directory). No physics, texture, or colour opinions.

## Which arms actually change the frame (mean |grey diff| vs default, squinted, 0-255)

| rig | arm | 52 | 54 | 56 | mean |
|---|---|---|---|---|---|
| sewers_close | bore | 5.36 | 0.81 | 0.26 | 2.15 |
| sewers_close | tubeclassic | 8.15 | 3.76 | 2.60 | 4.84 |
| sewers_close | sections | 9.53 | 6.81 | 1.95 | 6.10 |
| sewers_close | all | 12.16 | 6.97 | 2.19 | 7.11 |
| secondpeak_cliff_surfline | bore | 5.70 | 6.23 | 6.05 | 5.99 |
| secondpeak_cliff_surfline | tubeclassic | 0.18 | 0.22 | 0.25 | 0.21 |
| secondpeak_cliff_surfline | sections | 0.19 | 0.20 | 0.24 | 0.21 |
| secondpeak_cliff_surfline | all | 5.99 | 6.47 | 6.37 | 6.28 |
| secondpeak_cliff_setwave | bore | 5.51 | 4.61 | 3.61 | 4.58 |
| secondpeak_cliff_setwave | tubeclassic | 0.17 | 0.22 | 0.27 | 0.22 |
| secondpeak_cliff_setwave | sections | 0.22 | 0.23 | 0.22 | 0.22 |
| secondpeak_cliff_setwave | all | 5.63 | 4.87 | 3.98 | 4.83 |

Reading: on both cliff rigs `tubeclassic` and `sections` are no-ops (0.2 = JPEG noise); only `bore` moves the
picture there, and `all` = `bore`. At sewers_close every arm moves clock 52; bore is a near no-op at 54/56; clock 56
is nearly arm-invariant everywhere (the bright head has left the frame, so 56 is not a head test).

Supporting census (bright blobs >60 px above grey 175 in the lower 60% of each squint tile; share = largest blob / all bright):

| rig | arm | 52 blobs / share | 54 blobs / share | 56 blobs / share |
|---|---|---|---|---|
| sewers_close | default | 1 / 1.00 | 3 / 0.92 | 1 / 1.00 |
| sewers_close | bore | 1 / 1.00 | 2 / 0.93 | 1 / 1.00 |
| sewers_close | tubeclassic | 1 / 1.00 | 3 / 0.88 | 2 / 0.89 |
| sewers_close | sections | 1 / 1.00 | 1 / 1.00 | 1 / 1.00 |
| sewers_close | all | 1 / 1.00 | 1 / 1.00 | 1 / 1.00 |
| surfline | default (= tubeclassic = sections) | 1 / 1.00 | 2 / 0.89 | 3 / 0.66 |
| surfline | bore (~ all) | 2 / 0.59 | 4 / 0.62 | 3 / 0.46 |
| setwave | default (= tubeclassic = sections) | 3 / 0.56 | 5 / 0.53 | 5 / 0.60 |
| setwave | bore (~ all) | 4 / 0.48 | 5 / 0.52 | 7 / 0.58 |

## Ballot table — arm x rig x question

(a) one dominant bright mass at the head, or several competing patches
(b) does a dark unbroken face read as ground against a bright figure
(c) head reads as compact knuckle / horizontal band / detached polygon
Deciding frame named in each cell.

### sewers_close (fixed camera near the head)

| arm | (a) mass | (b) dark face as ground | (c) head shape |
|---|---|---|---|
| default | One mass at 52, but it is a wide flat slab bleeding into the bright backwater; at 54 it splits into three lower-right foam patches (share 0.92). `sewers_close_default_54` | Yes at 52: the green face is a broad dark dome under the slab. At 54 the face is a dark diagonal stripe, still ground. `sewers_close_default_52` | Horizontal band. The head is a shelf lying along the top edge of the face, no corner. `sewers_close_default_52` |
| bore | One mass, the largest of any arm (blob 10565 px vs 7146 default). Otherwise the default picture. `sewers_close_bore_52` | Yes, same dome; the brighter slab makes the figure/ground split stronger than default. `sewers_close_bore_52` | Horizontal band, wider and brighter than default; still no knuckle. `sewers_close_bore_52` |
| tubeclassic | Weakest mass (4751 px at 52, 2993 at 56) and the only arm that fragments at both 54 and 56 (3 and 2 blobs). `sewers_close_tubeclassic_52` | Face is ground but it carries vertical streaks on the left at 52 that compete with the head for attention; at 54 a bright patch sits bottom-centre detached from the head. `sewers_close_tubeclassic_54` | Diffuse smear at 52, no readable shape; at 54 a detached polygon bottom-centre. `sewers_close_tubeclassic_52` |
| sections | One compact mass, single blob at all three clocks. `sewers_close_sections_52` | Best of the rig: a large smooth dark dome fills the left two-thirds, one bright corner at upper right. Cleanest figure/ground on the sheet. `sewers_close_sections_52` | Compact knuckle at the lip with a short feather trailing right. The only arm whose head reads as a corner rather than a strip. `sewers_close_sections_52` |
| all | One mass, single blob at all clocks; knuckle plus a brighter lip band along the top edge (6413 px). `sewers_close_all_52` | Yes, same dome as sections; slightly less clean because the lip band runs the whole top edge. `sewers_close_all_52` | Knuckle-plus-band: a corner at right with a strip continuing left. Between sections and default. `sewers_close_all_52` |

### secondpeak_cliff_surfline

| arm | (a) mass | (b) dark face as ground | (c) head shape |
|---|---|---|---|
| default | One small patch at 52; two at 54; three dashes along the near line at 56 (share 0.66). Head is not dominant: the dark far band at the horizon holds more visual weight than any foam. `secondpeak_cliff_surfline_default_54` | Weak. The near face is a thin dark stripe under the foam; the big dark shape is the far band, which is not the face. `secondpeak_cliff_surfline_default_54` | Horizontal band of dashes; no knuckle at this distance. `secondpeak_cliff_surfline_default_56` |
| bore | Several competing patches: a second bright band appears mid-frame plus a brighter far line; 4 blobs at 54, share 0.46 at 56. The frame reads as alternating dark/bright stripes. `secondpeak_cliff_surfline_bore_54` | No. Three dark bands and three bright bands, none of them a face against a head. `secondpeak_cliff_surfline_bore_54` | Horizontal bands, plural; no single head. `secondpeak_cliff_surfline_bore_56` |
| tubeclassic | Identical to default (diff 0.2). `secondpeak_cliff_surfline_tubeclassic_54` | As default. | As default. |
| sections | Identical to default (diff 0.2). `secondpeak_cliff_surfline_sections_54` | As default. | As default. |
| all | Identical to bore for squint purposes (diff vs bore within noise; 4 blobs at 54, share 0.51 at 56). `secondpeak_cliff_surfline_all_56` | No, as bore. | Bands, plural, as bore. |

### secondpeak_cliff_setwave

| arm | (a) mass | (b) dark face as ground | (c) head shape |
|---|---|---|---|
| default | Several patches from the start: 3 at 52, 5 at 54/56, share 0.53-0.60. A near-continuous feathered line, brighter left of centre at 52. `secondpeak_cliff_setwave_default_52` | Partly. The near face is a dark band under the feather line at 52; by 56 the foam is a continuous bright band and the face is a thin stripe. The dark far band again outweighs it. `secondpeak_cliff_setwave_default_56` | Horizontal band; a slight bulge left of centre at 52 is the nearest thing to a knuckle on this rig. `secondpeak_cliff_setwave_default_52` |
| bore | More patches (4 / 5 / 7) and the lowest share on the rig (0.48 at 52): the mid-frame bore band adds a second bright horizontal that fights the near line. `secondpeak_cliff_setwave_bore_52` | No. Stripe stack: dark far band, bright bore band, dark trough, bright near band. `secondpeak_cliff_setwave_bore_56` | Bands, plural. `secondpeak_cliff_setwave_bore_56` |
| tubeclassic | Identical to default (diff 0.2). `secondpeak_cliff_setwave_tubeclassic_52` | As default. | As default. |
| sections | Identical to default (diff 0.2). `secondpeak_cliff_setwave_sections_52` | As default. | As default. |
| all | Identical to bore for squint purposes (4 / 5 / 7 blobs). `secondpeak_cliff_setwave_all_56` | No, as bore. | Bands, plural, as bore. |

## (d) Which head survives the squint

Per rig:

- **sewers_close** — best `sections` (`sewers_close_sections_52`: one dark dome, one bright corner, single blob at every clock); worst `tubeclassic` (`sewers_close_tubeclassic_52`: smallest bright mass, no shape, and the only arm fragmenting at 54 and 56).
- **secondpeak_cliff_surfline** — best `default` (tied with its no-op twins `tubeclassic`, `sections`; `secondpeak_cliff_surfline_default_52`: one patch); worst `bore` (`secondpeak_cliff_surfline_bore_54`: four patches, share 0.62, stripes instead of a head). `all` is bore here.
- **secondpeak_cliff_setwave** — no arm has a dominant head on this rig; least bad `default` / `tubeclassic` / `sections` (`secondpeak_cliff_setwave_default_52`, share 0.56); worst `bore` (`secondpeak_cliff_setwave_bore_52`, share 0.48; `_56` seven blobs). `all` is bore here.

Overall ranking (head survival under squint, all rigs):

1. **sections** — the only arm that turns the sewers head into a compact knuckle on a clean dark dome, and it costs nothing at the cliff (no-op there). `sewers_close_sections_52`.
2. **all** — sewers head nearly as good as sections (knuckle plus lip band, single blob every clock), but it carries bore's stripe problem to both cliff rigs. `sewers_close_all_52` up, `secondpeak_cliff_surfline_all_56` down.
3. **default** — sewers head is a horizontal slab, not a knuckle, and splits into three patches at 54; at the cliff it is the least-fragmented picture available. `sewers_close_default_54`.
4. **bore** — at sewers it only enlarges default's slab (bigger band, still a band, then a no-op at 54/56); at both cliff rigs it is the arm that multiplies bright horizontals and kills any single head. Hurts two rigs of three. `secondpeak_cliff_surfline_bore_54`.
5. **tubeclassic** — invisible at the cliff and the worst head at the near camera: the bright mass shrinks to a smear at 52 and fragments at 54 and 56. Hurts one rig, does nothing for the others. `sewers_close_tubeclassic_52`.

Notes for the other seats: clock 56 at sewers_close is arm-invariant under squint (the dark dome is the figure and the sky/backwater is ground; no bright head in frame), so do not read 56 differences there as arm effects. On the cliff rigs the far dark band at the horizon out-weighs the near head in every arm; whatever arm is chosen, the head is not the squint's dominant subject from that camera.
