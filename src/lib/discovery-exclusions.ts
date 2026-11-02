// Reviewed fixture identities, not title/keyword heuristics. Source evidence:
// docs/geo/production-content-2026-11-02.md. Add only with identity/provenance
// evidence and review. This does not classify unknown content or mutate records.
const excluded: Record<string, ReadonlySet<string>> = {
  posts: new Set([
    'fba0a005-1008-4fe5-8899-52c23efd2bfb',
    '3516d117-b1a8-4a44-a497-9350466b59ec',
    'd1449619-ec81-46b2-89be-364fa196a7c4',
    '7199bf70-8afa-4448-ab93-cc56cc15f191',
    '5230791d-10e1-41c1-bd95-99e8093b22ae',
  ]),
  circles: new Set([
    '06b4eb20-07fa-417e-b62b-e87eb0087381', 'ed595c9f-75fc-4b82-ada8-f5e38c596063', 'a2aecbee-6b9b-48c8-a5c7-7597bb9a53b3',
    'qa0a39aa70-f4d5-40e1', 'cv-677480-circle', 'fullopenai-677480-daily',
  ]),
  comments: new Set(),
};
export function isDiscoveryExcluded(kind: 'posts' | 'circles' | 'comments', identity: string): boolean {
  return excluded[kind].has(identity.toLowerCase());
}
