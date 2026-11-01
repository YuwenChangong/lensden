// Compatibility entry point for bookmarks and indexed URLs from before Lensden.
export default {
  fetch(request) {
    const destination = new URL(request.url);
    destination.protocol = "https:";
    destination.hostname = "lensden.ogh.workers.dev";
    destination.port = "";
    return new Response(null, {
      status: 308,
      headers: { Location: destination.href, "Cache-Control": "public, max-age=300" },
    });
  },
};
