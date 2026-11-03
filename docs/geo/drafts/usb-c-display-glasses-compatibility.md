---
title: "USB-C display glasses compatibility: XREAL One and One Pro"
description: "Check DisplayPort Alt Mode, host power and adapter direction before connecting XREAL One or One Pro glasses to a phone, computer or console."
canonical_path: /guides/usb-c-display-glasses-compatibility/
language: en
author: null
reviewer: null
draft: true
published_at: null
updated_at: null
approval: pending
source_review_date: 2026-11-02
---

## Will a USB-C plug give you a picture?

A matching plug is only the first check. You need to establish three things separately: whether the host sends video through that port, whether the connection supplies the glasses' required power, and whether every cable or adapter supports the intended signal path.

This guide covers **XREAL One and XREAL One Pro**. XREAL lists them as distinct models in its [One-series specifications](https://tutorials.xreal.com/docs/glasses/one-series/spec/). It is a source-based compatibility checklist, not Lensden hands-on testing or certification of a particular setup. Other XREAL models and other brands need their own documentation.

## USB-C describes the connector; DisplayPort Alt Mode carries video

DisplayPort Alt Mode lets a compatible USB-C connection carry DisplayPort audio and video by using the connector's alternate-mode capability. It is a capability of the connection, not something established by the plug's shape. VESA directs users to device documentation to establish support. [VESA DisplayPort FAQ](https://www.displayport.org/faq/)

Look up the **exact host model and port**, not just a product family's USB-C specification. On a computer with several ports, check each port's documented functions. Charging or USB data support alone does not establish display output. A higher-wattage charger is not evidence that the host sends video.

## Check power as well as video

For its direct connection, XREAL specifies DP output and **5 V / 1 A** power, using the supplied cable. Its guide says the glasses have no internal battery and depend on connected-device power. [XREAL connection guide](https://tutorials.xreal.com/docs/glasses/one-series/first-use/connect-device/)

Treat that power figure as a documented supply requirement, not a measured continuous consumption or battery-life result. If documentation confirms video but leaves power delivery to the glasses unclear, the setup remains unconfirmed. Record the power source and any required power input on an adapter separately.

## An adapter must match the signal direction

XREAL describes an HDMI-to-USB-C path for HDMI sources, including computers and PlayStation/Xbox, and a specific XREAL Hub path for Switch-family consoles. Feature availability depends on the host model and system version. [XREAL connection guide](https://tutorials.xreal.com/docs/glasses/one-series/first-use/connect-device/)

A USB-C-to-HDMI adapter intended for a USB-C computer and HDMI monitor is a different path; do not assume it works in reverse. VESA describes that source-to-display direction in its [adapter guidance](https://www.displayport.org/faq/). Check the exact accessory's input, output, power connection and supported source before relying on it.

A USB-C hub also needs explicit video support. VESA distinguishes USB-only hubs from docks that support DisplayPort; adding ports does not by itself add a display path. [VESA connection help](https://vesa.org/dp-usb-type-c/)

## Build a compatibility record before choosing accessories

Use this checklist to keep an unresolved condition visible:

| Item | Evidence to record | If missing |
|---|---|---|
| Glasses | Exact One or One Pro model and relevant firmware | Do not transfer another model's result |
| Host | Exact model, OS version and chosen physical port | Ask the host manufacturer for port-specific documentation |
| Video | Documented DP output over the intended USB-C connection | Keep direct connection unconfirmed |
| Power | Required supply available at the glasses connection | Keep power compatibility unconfirmed |
| Cable and adapter | Exact part, signal direction and any external power input | Do not substitute a look-alike accessory |
| Intended use | Required app, display mode and documented restrictions | Do not treat a picture as proof of every feature |

The checklist is Lensden's editorial method, not a manufacturer compatibility list. A useful result names the complete chain and its sources, rather than saying that an entire phone brand works. This article does not establish app-specific playback, protected-content compatibility or every display mode. If those matter to your setup, obtain separate documentation rather than treating basic video output as the answer.

Continue with the [product library](/products/) and [developer requirement checklist](/guides/developer-limit-checklist-before-choosing-ar-ai-glasses/). The latter is currently a Chinese-language guide. Product records need their own model-specific evidence; this article does not certify them.
