import React from "react";
import { createRoot } from "react-dom/client";
import PostMediaGallery from "../../../src/components/forum/PostMediaGallery";
import { resolveLocale } from "../../../src/lib/i18n/locale";
import "../../../src/styles/community.css";

const imageUrl = new URL("../../../public/gaze-icon-192-v6.png", import.meta.url).href;

const media = ["First fixture image", "Second fixture image"].map((alt_text, index) => ({
  id: `local-image-${index}`, kind: "image" as const, displayUrl: imageUrl,
  previewUrl: imageUrl, alt_text, width: 192, height: 192, sort_order: index, is_cover: index === 0,
}));
const unavailable = new URLSearchParams(location.search).has("unavailable");
const unavailableMedia = [{ id: "local-unavailable-video", kind: "video" as const,
  displayUrl: "", previewUrl: "", unavailable_at: "2026-10-31T09:42:53.357Z" }];

createRoot(document.getElementById("root")!).render(
  <main style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
    <button type="button" id="before-media">Before media</button>
    <PostMediaGallery media={unavailable ? unavailableMedia : media} postTitle="Local media fixture" localeContext={resolveLocale({ acceptLanguage: "en-US" })} />
    <button type="button" id="after-media">After media</button>
  </main>,
);
