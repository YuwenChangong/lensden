---
title: "PS5 to AR glasses: HDMI adapters, power and missing audio"
description: "Build a documented PS5-to-glasses connection chain. Check HDMI direction, separate power, display modes, audio and protected-content limits."
language: en
draft: true
author: Jayden
author_approval: pending
published_at: null
source_review_date: "2026-11-03"
canonical_candidate: "https://lensden.net/guides/ps5-ar-glasses-hdmi-adapter-power-audio/"
status: "Local editorial candidate; not published"
---

# PS5 to AR glasses: HDMI adapters, power and missing audio

**For the display glasses discussed here, use the PS5's HDMI output with a correctly directed, powered conversion chain. Do not assume the console's USB-C port is a display output, or that a laptop's USB-C-to-HDMI adapter works backwards. A picture, audio and a requested refresh rate are three separate checks.**

Prepared for Jayden's approval; source review November 3, 2026. Lensden has not tested these setups.

## Why the connector answer is incomplete

A recurring [XREAL community question](https://www.reddit.com/r/Xreal/comments/1lw7a8u/xreal_one_and_playstation_5/) asks whether the PS5 can power a conversion setup and what the HDMI adapter actually does. An [earlier Air 2 Pro troubleshooting discussion](https://www.reddit.com/r/Xreal/comments/1d355ea/) shows why an adapter's own power arrangement matters. These discussions identify the question; their replies are not compatibility certification.

Sony identifies HDMI as the console's AV output in the [CFI-1115B safety guide](https://www.playstation.com/content/dam/global_pdc/en/corporate/support/manuals/ps5-docs/1000b-digital-edition/EN_FR_ES_AMER_CFI-1115B_Safety_Guide_V2_Web.pdf). Check the matching manual for a different console revision. Its USB data/charging capabilities do not establish DP Alt Mode video. [VESA](https://www.displayport.org/faq/) explains that DisplayPort over USB-C is a distinct port capability.

Write the connection in order:

**PS5 HDMI OUT → converter/dock HDMI IN → display output and correct glasses cable → glasses.**

Add the converter's required power input or charged battery as a separate branch. The correct arrangement is accessory-specific; do not infer it from a product photograph.

## What the model documentation actually supports

| Glasses in Lensden | Source-based starting point | Still conditional |
|---|---|---|
| [XREAL One](/products/xreal/xreal-one/) / [One Pro](/products/xreal/xreal-one-pro/) | [XREAL One-series guide](https://us.shop.xreal.com/blogs/buying-guide/user-guide_xreal-one-series) gives a PlayStation/Xbox HDMI-adapter path and a console DP-audio setting | Exact converter, power arrangement, firmware and accepted display mode |
| [VITURE Pro XR](/products/viture/viture-pro/) | [Pro/One Mobile Dock manual](https://www.viture.com/academy/mobile-dock/pro-one-series) documents HDMI input and generation-dependent mode limits | Exact dock generation and glasses combination; a footnote for Beast is not a Pro XR guarantee |
| [RayNeo Air 3s](/products/rayneo/rayneo-air-3s/) | [EU product page](https://eu.rayneo.com/products/rayneo-air-3s-xr-glasses) advertises PS5 through an HDMI-adapter path | Exact accessory, accepted timing, power and audio confirmation |
| [Rokid Max](/products/rokid/rokid-max/) | Model-specific PS5 chain not established in this review | **Unknown**; do not substitute a Max 2 bundle result |

This table states documentary scope, not a “tested compatible” list.

## Select for the chain's weakest confirmed mode

Sony's [video-output guide](https://www.playstation.com/en-us/support/hardware/ps5-4k-resolution-guide/) describes 120 Hz output for compatible displays and games. A console capability is not a downstream guarantee. The converter and glasses must accept the same timing; a 4K-accepting converter does not add pixels to a 1080p glasses display.

Begin with a mode supported by both accessory and glasses documentation. Confirm the negotiated resolution and refresh in the actual device menus before trying a more demanding mode. Do not infer HDR, VRR or protected-streaming compatibility from a 120 Hz badge.

## Diagnose each failure separately

| Symptom | Check first | Avoid concluding |
|---|---|---|
| No image | Converter input/output direction, its required power, correct glasses cable, documented mode | That every adapter with USB-C output is equivalent |
| Image but no glasses audio | Console audio destination and exact glasses/adapter audio protocol | That the cable is defective merely because video works |
| Image at a lower rate | Supported mode intersection across console, game, adapter and glasses | That panel maximum refresh is achieved by every chain |
| Game works but a streaming app fails | Accessory and app documentation for protected content | That a game's successful picture certifies HDCP or every app |

XREAL's One-series guide gives a DP-audio setting specifically for console use. Do not transfer button sequences from an Air model to One/One Pro or to another brand. We do not recommend disabling content protection as a universal fix; that does not establish support for protected apps.

## Before buying an accessory

Keep a single setup record: console revision; glasses model; accessory product name; current firmware; cable direction; power source; supported timing; audio mode; and the manufacturer's evidence URL. If a seller cannot confirm one element, leave it **Unknown** instead of buying on the strength of a connector label.

The [Lensden device library](/products/) provides existing records and comparison controls. Read the [One/One Pro USB-C guide](/guides/usb-c-display-glasses-compatibility/) for the general signal and power checks. This article adds the console-specific failure map; it does not claim firsthand gaming results.
