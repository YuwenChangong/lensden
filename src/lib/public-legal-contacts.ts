export type PublicLegalContactKey = "operator" | "support" | "abuse" | "privacy" | "intellectualProperty";

export const PUBLIC_LEGAL_CONTACT_ENV = {
  operator: "PUBLIC_LEGAL_OPERATOR_NAME",
  support: "PUBLIC_SUPPORT_EMAIL",
  abuse: "PUBLIC_ABUSE_EMAIL",
  privacy: "PUBLIC_PRIVACY_EMAIL",
  intellectualProperty: "PUBLIC_IP_EMAIL",
} as const;

export const PUBLIC_LEGAL_CONTACTS = {
  operator: "Jayden",
  support: "lensden.team@gmail.com",
  abuse: "lensden.team@gmail.com",
  privacy: "lensden.team@gmail.com",
  intellectualProperty: "lensden.team@gmail.com",
} as const;

const PLACEHOLDER_PATTERN = /(?:example\.com|todo|tbd|pending|changeme|placeholder)/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePublicLegalContacts(contacts: Record<PublicLegalContactKey, string>): void {
  for (const key of Object.keys(PUBLIC_LEGAL_CONTACT_ENV) as PublicLegalContactKey[]) {
    const value = contacts[key];
    if (!value || value.trim() !== value || PLACEHOLDER_PATTERN.test(value) || /[<>&]/.test(value)) {
      throw new Error(`Invalid public legal contact: ${key}`);
    }
    if (key !== "operator" && !EMAIL_PATTERN.test(value)) {
      throw new Error(`Invalid public legal email: ${key}`);
    }
  }
}

validatePublicLegalContacts(PUBLIC_LEGAL_CONTACTS);
