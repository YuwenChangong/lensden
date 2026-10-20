const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const retainedVideo = new RegExp(`^${uuid}/${uuid}/r2-retained-${uuid}\\.(mp4|webm|mov)$`, "i");

// Keep the existing actor/post/name provenance contract without a schema change.
export function isRetainedR2VideoPath(path: string): boolean {
  return retainedVideo.test(path);
}

export function isR2VideoPath(path: string): boolean {
  return path.startsWith("tmp/") || isRetainedR2VideoPath(path);
}
