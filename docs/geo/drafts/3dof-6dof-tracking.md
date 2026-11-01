---
title: "3DoF versus 6DoF: what the tracking label actually tells you"
draft: true
published_at: null
updated_at: null
approval: pending
source_review_date: 2026-11-02
---

## What is the difference?

Three degrees of freedom describe rotational tracking: turning left or right, looking up or down, and tilting your head. Six degrees of freedom add positional movement along three axes. This distinction describes motion the system tracks; it is not a complete specification for every application the device can run. [Microsoft tracking explanation](https://learn.microsoft.com/en-us/windows/mixed-reality/enthusiast-guide/tracking-system)

## Keep three questions separate

| Question | What to record |
|---|---|
| What can the hardware track? | Orientation, position and the documented conditions |
| What does the selected runtime expose? | The supported experience and coordinate-space behavior |
| What does this application use? | The motion and features actually supported in that app |

Microsoft explicitly notes that an application can provide an orientation-only experience even on hardware capable of positional tracking. Its coordinate-system guidance also distinguishes positional tracking from additional capabilities such as floor definition, boundaries and spatial anchors. A tracking label alone does not settle those separate requirements. [Tracking explanation](https://learn.microsoft.com/en-us/windows/mixed-reality/enthusiast-guide/tracking-system), [coordinate-system guidance](https://learn.microsoft.com/en-us/windows/mixed-reality/design/coordinate-systems)

## How to read a product specification

For an evidence-based comparison, start with the exact device and accessory configuration. Then record the documented tracking capability, the intended app, any required runtime and the source. Keep accessory-dependent behavior separate from the base configuration. If two sources refer to different setups, preserve both conditions before treating their statements as a conflict.

This recording method is an editorial recommendation. It does not certify any named glasses, imply OpenXR support, or prove that a device has persistent mapping, eye tracking or hand tracking. Those capabilities need their own evidence. A device with missing documentation should retain an unknown value.

## Scope and uncertainty

The cited Microsoft documents describe Windows Mixed Reality concepts; their definitions are useful here, but platform behavior cannot be transferred automatically to another manufacturer's product. This article contains no physical tracking measurements or first-hand test results. A publication review should verify any later device example against its own primary documentation.

See the [product library](/products/) and [developer resources](/developers/). Record known limitations beside each comparison rather than compressing them into an unsupported overall score.

Editorial claim ledger: rotational/positional distinction and application limitation from Microsoft's tracking guide; experience-scale distinctions from its coordinate-system guide; sources accessed 2026-11-02. The proposed record format is Lensden editorial analysis, not a manufacturer claim.
