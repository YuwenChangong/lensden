# Research provenance and editorial checks
Reviewed 2026-11-03. Source-based manuscripts, not device testing or a keyword-volume study.

## Question selection and non-duplication
| Selected piece | Public demand evidence | Original synthesis / distinct scope |
|---|---|---|
| PS5 adapter/power/audio | [XREAL One + PS5 question](https://www.reddit.com/r/Xreal/comments/1lw7a8u/xreal_one_and_playstation_5/), [Air 2 Pro HDMI problem](https://www.reddit.com/r/Xreal/comments/1d355ea/) | Console-specific signal chain and symptom/uncertainty table; extends rather than rewrites the published One/One Pro connector guide |
| Coding and virtual monitors | [VITURE Pro coding question](https://www.reddit.com/r/VITURE/comments/1frsrus/anyone_using_the_viture_pro_xr_glasses_to_code/), [managed work environment](https://www.reddit.com/r/VITURE/comments/1hfy198/are_the_pro_xrs_suitable_for_productivity_with_a/) | Distinguishes an ordinary OS display, one ultrawide surface and spatial multi-monitor software; adds an OS/permission decision gate and a clearly unperformed evaluation protocol |

These are a small purposive set of actual questions, not proof of demand volume, representative satisfaction, conversion rate or ranking potential. No Reddit quote or user identity is reproduced. Community claims identify questions; technical conclusions use primary documentation. No submission or interaction took place.

## Primary source register
All entries reviewed on November 3, 2026. Documentary confidence applies to a specific attributed claim; no source guarantees the whole connection chain.
| Source | Supported scope / qualification |
|---|---|
| [XREAL series specifications](https://tutorials.xreal.com/docs/glasses/one-series/spec/) | Separate One and One Pro columns; do not copy the adjacent 1S column |
| [XREAL One-series user guide](https://us.shop.xreal.com/blogs/buying-guide/user-guide_xreal-one-series) | Source-powered laptop connection, HDMI-console path, console audio mode and different model-specific lens frames |
| [VITURE Pro/One manual](https://www.viture.com/academy/xr-glasses/pro-one-series) | Pro-specific display/optics and magnetic cable; includes mixed-model wording, so exact range conflicts are disclosed. Regional redirect to viture.co.nz was observed |
| [VITURE desktop requirements](https://www.viture.com/academy/spacewalker/desktop) | Current Mac/Windows requirements and adapter restrictions; do not reuse old “Windows coming soon” language |
| [VITURE Pro/One Mobile Dock](https://www.viture.com/academy/mobile-dock/pro-one-series) | Different generations and conditional input-mode ceilings; accessory footnotes stay attached to their named model |
| [RayNeo EU Air 3s](https://eu.rayneo.com/products/rayneo-air-3s-xr-glasses) | Air 3s-specific display claims; separate 120 Hz display refresh from 3840 Hz dimming marketing |
| [RayNeo Air 3s FAQ](https://eu.rayneo.com/pages/support-faq-air3) / [package](https://eu.rayneo.com/pages/support-air3s) | Video-capable USB-C check and included prescription frame |
| [Rokid FAQ](https://global.rokid.com/pages/faq) | Max secondary-display limitation; does not resolve all legacy Max specs or prove Max 2 accessory interchangeability |
| [VESA FAQ](https://www.displayport.org/faq/) | USB-C alternate-mode and source/display distinctions; no model-specific compatibility verdict |
| [Sony video-output help](https://www.playstation.com/en-us/support/hardware/ps5-4k-resolution-guide/) / [CFI-1115B guide](https://www.playstation.com/content/dam/global_pdc/en/corporate/support/manuals/ps5-docs/1000b-digital-edition/EN_FR_ES_AMER_CFI-1115B_Safety_Guide_V2_Web.pdf) | Console output and supported-display conditions; named console revision only |
| [Breezy Desktop upstream](https://github.com/wheaney/breezy-desktop) | Separate Linux community project, not official universal vendor support |
| Publisher contact/pitch pages linked in outreach.md | A real editorial route, not acceptance, endorsement or permission to mass pitch |

## Catalog lineage and concrete conflicts
Existing local catalog: src/data/product-public-data.json, generated_at **2026-07-04T07:28:34.070Z**, 24 records; src/lib/device-catalog.ts supplies identities; src/lib/product-route.ts supplies canonical /products/{brand}/{slug}/ paths. Current runtime reads published Supabase device records and separately sourced fields. This task did **not** query or modify the production database; the local snapshot is not a fresh production export.

1. Local viture-pro keySpecs.field_of_view=52° conflicts with the current Pro manual's 46°. The resource uses the documented Pro value. Do not silently claim the live database has been corrected.
2. Local brightness=4000 nits has no eye/panel context. The source distinguishes projected/perceived values; the manuscript preserves the distinction. Do not rank it against to-eye numbers.
3. VITURE generic introduction URL now redirects to Beast; the old Pro store URL returned 404. Both would be poor current sources for Pro. The manuscript uses the dedicated Pro/One manual instead.
4. Generic ray-ban-meta identity lacks a verified generation in this review. New-generation product names must not inherit old claims.
5. Rokid Max versus Max 2 is an unresolved identity/capability boundary for some fields. Those remain Unknown.
6. Exact glasses-only power figures and per-chain negotiated modes were not established for most models. Cable/dock power ratings must not become consumption estimates.

These are precise future catalog-review items, not an instruction to update production rows. No device numeric fields in the source catalog were changed.

## Publication checklist
- [x] Complete resource + exactly two distinct English pieces, direct answers and tables.
- [x] All new manuscripts outside the served content collections; draft=true, publication date null.
- [x] Existing guides/product routes referenced; canonical candidates distinct and labelled not live.
- [x] Original synthesis separated from manufacturer claims; no invented test, endorsement, battery runtime or independent performance result.
- [x] Sources, model limits, conflicts and source-review date included; Unknown retained.
- [ ] Owner accepts Jayden byline and final text.
- [ ] Reviewer resolves live publication eligibility of linked product records at publication time; local route/identity checks alone cannot prove current anonymous 200 responses.
- [ ] Owner authorizes publication via existing guide architecture and sets actual publication timestamp; no new UI/data collection needed.
- [ ] Owner separately approves any external posting, GitHub About-field write or provider action.
