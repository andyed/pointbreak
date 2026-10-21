# Attached-body mapping audit

This continuation follows the initial prototype report. It does not supersede
its historical visual verdict or claim final fluid fidelity.

## Evidence-backed failure

The rolling relief was used to vary the circular shoulder's **radius down the
front**. At the toe, the circle's forward derivative tends to zero, while the
rolling radius derivative can remain negative. The intended attached surface
therefore reverses its forward position and overlaps neighbouring triangles.
The effect is independent of the existing curl: the audit selects curl<0.10,
age>0.55, body gain>0.10, and the compact body phase interval.

The GPU audit executes actual `surfacePos` with runtime-only alternatives.
`qa/breaking-continuation-2026-10-20/body-map-audit.mjs` probes2 forcing rigs ×10
source stations ×4 alternatives ×2048 samples across105m. It records source
hashes, summaries, failure examples and raw float output. A new reversal means
a forward step below−2mm where the same sample is nonnegative with only the
new horizontal compaction disabled; existing background folds are separated.

| Rig | New front reversals with varying radius | With crest-owned radius |
| --- | ---: | ---: |
| Field day, H0=1.4,T16,tide.5,sim54 |126|0|
| Second Peak card, H0=1.5,T14,sim50.3 |145|0|

An earlier explicitly labelled T14 field diagnostic agrees (133→0). Freezing
both radius and toe depth gives no additional front benefit. Root applied
crest-owned radius: `breakingRollAt(sourceX,0,time)` still scallops each crest
in x/time, while moving vertical relief and toe variation remain.

This is also supported by the local bound. For the raised-cosine-cubed lobe,
the maximum derivative with respect to its normalized arc is about8.54. The
depth's0.0595 relief coefficient and0.565 reference depth bound its derivative
with respect to face fraction below0.90. Thus `frac/depth(frac)` remains
increasing for0≤frac≤depth. With a positive fixed radius, its circular
horizontal coordinate is nondecreasing. This proves the isolated shape
coordinate only: the shipped radius also follows local carrier amplitude,
which can vary down the front. The GPU transects test that full combination.
The regression test executes the actual relief/depth helpers across sampled
stations and clocks.

## Remaining back join

The phase envelope allowed horizontal compaction well behind the narrow foam
support. With crest radius fixed, field stations14.25 and14.9 still introduced
34 reversed steps, and section station16.625 introduced8. Examples have
negative phase−.47 to−.58 and face fractions−.24 to−.38; the foam back edge
already ends at−.085. These are distinct from the now-correct front radius.
The runtime audit compared two back-support candidates before applying either.
Matching the actual foam support (full at−.025, zero by−.085) removes all34
field and8 section new rear reversals, with zero new front reversals. A broader
−.085 to−.25 candidate retained38 new field rear reversals and was rejected.
The narrow matching support is now applied in `choppyPos`, retaining the
existing phase guard and leaving the existing airborne curl gate unchanged.

`body-backjoin-audit.mjs/json/f32` retain this comparison. The body test suite
now includes numerical monotonicity of the crest-radius front using the actual
relief/depth helpers, plus the matching rear material/geometry support contract.

These are source-z transects. They establish and remove this particular
forward reversal, not a proof of the complete2D displaced mesh Jacobian.

## Applied-source verification

`AUDIT_OUTPUT=body-backjoin-final AUDIT_VERIFY=1 node
qa/breaking-continuation-2026-10-20/body-backjoin-audit.mjs` checks the actual
production arm after both repairs. It passes with **zero newly introduced
attached-body reversals** in both rigs. This does not mean all background
folds disappear:83 field and174 section reversed steps remain at coordinates
that already reverse without the new compaction, predominantly on the back.
The final JSON includes source hashes and the raw binary array layout.

Combined rendered evidence is `postfix-detail-50.3.png` and
`postfix-mature-54.png` in the continuation QA directory. The geometry has
small wavy contours, but still reads as a broad shallow sheet; the detail
head retains sharp triangular edges. The numerical repair is verified, while
the thick rounded tumbling-water appearance remains incomplete. Ten body
regression tests and four contact tests pass; all18 expanded legacy shader
exports remain identical and shader-literal checks pass.

A follow-up CPU interpolation between neighbouring GPU transects at x14.25,
14.9 and16.625 estimates **new negative full XZ Jacobians** on the front despite
positive within-transect z steps. Estimated minimum determinants range−0.27
to−0.95 across the two rigs where the uncompacted determinant is positive.
These are coarse0.65/1.725m alongshore differences, not an exact local GPU
Jacobian measurement. The likely mechanism is retained lateral choppy shear
combined with strong z compression and a sloped crest. This could explain
remaining sharp triangles and requires a local two-axis GPU derivative audit.
The forward transect repairs should not be represented as full mesh validity.

## Full two-axis correction

The local GPU derivative audit confirmed the coarse warning. It evaluates
`surfacePos` at±0.05m along each source axis and computes
`X_x Z_z − X_z Z_x`. With the earlier radius/rear repairs,70 field and114
section samples had newly negative full determinants. The retained lateral
choppy shear was dominating the heavily compressed forward direction.

Applying the **same existing compact weight** to lateral displacement
(`off.x` toward zero) reduced these to6 and13. Those remaining samples had
X_x≈1 and zero cross term; their small negative Z_z came from the physical
carrier amplitude shrinking toward the nearly flat circular toe. A4% retained
source-z slope, anchored at the same source crest, removes the residual. It
adds horizontal reach only and does not change height, crest ceiling, break
permission, or curl ownership. No extra surface evaluation is required in the
production renderer.

The combined candidate has **zero newly negative full XZ determinants** in
both rigs. Among samples where the uncompacted determinant was nonnegative,
the repaired minimum is+0.0233 field and+0.0254 section. Existing background
folds are still not claimed fixed. Production now uses this coherent mapping.
The audit uses10 stations per rig at2048 forward coordinates, with the same
attached-body gain/age/curl selection described above; this is sampled local
verification, not an analytical proof over all conditions.

`body-jacobian-audit` retains the local diagnosis, `body-jacobian-margin` the
candidate comparison, and `body-jacobian-final` the applied-source regression.
Each has a runnable `.mjs`, `.json` source hashes/results, and raw `.f32`
outputs. The body suite now has11 tests, including the shared-axis ownership
contract; four contact tests remain separate.

Final applied-source full-Jacobian verification passes with zero introduced
folds in both sampled rigs and no shader errors. The repeat contact probe also
passes after the new horizontal mapping. Final `postfix-detail-50.3.png` and
`postfix-mature-54.png` show substantially fewer large triangular folded shards
at the head and a more continuous front. Fine material clumps are visible
along the edge. The upper cap remains broad and flat in places, with some
striping; these fixes do not establish raw-footage-level tumbling volume.
