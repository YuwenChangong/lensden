# Device knowledge and evidence contract

Existing publication authority: devices.publication_status, read with the anonymous SSR client. Identity and prose come from public-device-data.ts. Structured fields, sources and claims come from public_device_detail_specs / sources / evidence, through public-product-detail.ts. No new schema, migration, grant, RLS change or provider request was introduced.

| Requirement | Existing representation | Presentation rule |
|---|---|---|
| Name/brand/model | name, slug, brand_key, brand_name | preserve stored identity and canonical route |
| Overview and factual summary | short_description, long_description, presentation.keySpec/keySpecOrder | SSR prose and key parameters, no generated product claims |
| Display/optics/hardware/compatibility | spec group/key, typed values, canonical_unit | use the existing catalog labels and formatter; do not infer missing ports or sensors |
| Tracking | structured specs under existing keys | distinguish orientation/position, required accessories and supported applications; unknown is not false |
| Measurement definitions | measurement_context, canonical_unit | render stored context with units; diagonal FOV is not horizontal FOV, per-eye resolution is not binocular total, eye brightness is not panel/projector brightness |
| Requirements | connectivity/developer/compute groups | preserve model, OS, accessory and permission conditions in values/context |
| Known limitations | key_limitations and CONFLICT states | SSR limitations only when already supplied; no invented negative findings |
| Source attribution | source_id, publisher/title/url/source_type | safe HTTPS source links plus linked evidence for known/conflicting specs |
| Verification | confidence, verified_at, state | render only actual stored dates; accessed_at means source access, not product testing |
| Uncertainty | NOT_DISCLOSED, NOT_APPLICABLE, CONFLICT, legacy provenance | preserve distinct states; legacy values remain explicitly unverified; internal UNKNOWN_UNVERIFIED is not public data |
| Regional/model differences | region, variant on spec and evidence | exact key/region/variant match; do not merge different variants into one value |
| Related comparisons | existing brand comparison link | reuse the interactive comparison; no thin query-based sitemap entries |

Product JSON-LD uses visible name/brand/summary. Additional properties require KNOWN + STRUCTURED_VERIFIED + matching non-conflicting evidence + a safe public source. It does not add offers, ratings, reviews, stock, prices, a product test date or a new verification claim. Existing per-spec verification labels remain unchanged; a source link does not imply independent testing.

Opportunities, in order: review legacy descriptions against primary sources; fill missing measurement definitions and precise units; distinguish manufacturer claim from independently reproduced measurement; record conflicts per region/variant instead of selecting a winner; verify every last verification date against an actual review event; fill key_limitations only after editorial evidence review. Keep restricted research notes, raw values, actors and internal sources out of public projections. A complete content-modification timestamp covering normalized specs/evidence would improve lastmod, but requires separate schema/public-projection review; this task omits unreliable device lastmod.
