import {
  PUBLIC_LEGAL_CONTACT_ENV,
  PUBLIC_LEGAL_CONTACTS,
  type PublicLegalContactKey,
} from "./public-legal-contacts.ts";

export const LEGAL_POLICY = {
  platformName: "Lensden",
  minimumAge: 16,
  bundleVersion: "2026-07",
  termsVersion: "2026-07",
  privacyVersion: "2026-07",
  guidelinesVersion: "2026-07",
  effectiveDate: "2026-07-12",
  routes: {
    terms: "/terms/",
    privacy: "/privacy/",
    guidelines: "/community-guidelines/",
    safety: "/safety/",
    accountDeletion: "/account-deletion/",
    contact: "/contact/",
    consent: "/legal-consent/",
  },
  languages: ["zh-CN", "en"] as const,
} as const;

export type LegalRouteKey = keyof typeof LEGAL_POLICY.routes;
export { PUBLIC_LEGAL_CONTACT_ENV };
export type { PublicLegalContactKey };

export const LEGAL_POLICY_LINKS = [
  { key: "terms", href: LEGAL_POLICY.routes.terms, labelZh: "服务条款", labelEn: "Terms" },
  { key: "privacy", href: LEGAL_POLICY.routes.privacy, labelZh: "隐私政策", labelEn: "Privacy" },
  { key: "guidelines", href: LEGAL_POLICY.routes.guidelines, labelZh: "社区准则", labelEn: "Guidelines" },
  { key: "safety", href: LEGAL_POLICY.routes.safety, labelZh: "安全与举报", labelEn: "Safety" },
  { key: "accountDeletion", href: LEGAL_POLICY.routes.accountDeletion, labelZh: "账户删除", labelEn: "Deletion" },
  { key: "contact", href: LEGAL_POLICY.routes.contact, labelZh: "联系", labelEn: "Contact" },
] as const satisfies ReadonlyArray<{
  key: Exclude<LegalRouteKey, "consent">;
  href: string;
  labelZh: string;
  labelEn: string;
}>;

export function getLegalPolicyVersion(routeKey: LegalRouteKey): string {
  if (routeKey === "terms") return LEGAL_POLICY.termsVersion;
  if (routeKey === "privacy") return LEGAL_POLICY.privacyVersion;
  if (routeKey === "guidelines") return LEGAL_POLICY.guidelinesVersion;
  return LEGAL_POLICY.bundleVersion;
}

export function getPublicLegalContacts() {
  return PUBLIC_LEGAL_CONTACTS;
}

export function getMissingPublicLegalContactKeys(): PublicLegalContactKey[] {
  const contacts = getPublicLegalContacts();
  return (Object.keys(contacts) as PublicLegalContactKey[]).filter((key) => !contacts[key]);
}

export function hasConfiguredPublicLegalContacts(): boolean {
  return getMissingPublicLegalContactKeys().length === 0;
}
