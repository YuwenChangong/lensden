import {
  getSensitiveLexiconSource,
  loadSensitiveLexicon,
  resetSensitiveLexiconRuntimeCache,
  type LocalLexiconCategory,
  type LocalLexiconSeverity,
  type SensitiveLexiconData,
  type SensitiveLexiconTerm,
} from "./sensitive-lexicon-loader.server.ts";

export type LocalSensitiveLexiconResult = {
  decision: "allow" | "review" | "reject";
  severity: LocalLexiconSeverity;
  reasonCode: LocalLexiconCategory | null;
  confidence: number;
  categories: LocalLexiconCategory[];
  matchedTerms: string[];
  matchedRules: string[];
  safeSummary: string | null;
};

const MAX_TEXT_LENGTH = 12000;
const MAX_MATCHES = 8;
const SAFE_CONTEXT_PATTERNS = [
  /微信登录/iu,
  /微信通知/iu,
  /微信支付/iu,
  /telegram bot/iu,
  /whatsapp integration/iu,
];

const HARD_REJECT_RULES: Array<{
  key: string;
  category: LocalLexiconCategory;
  severity: LocalLexiconSeverity;
  confidence: number;
  pattern: RegExp;
}> = [
  {
    key: "combo:off_platform_contact",
    category: "off_platform_contact",
    severity: "reject",
    confidence: 0.96,
    pattern: /(?:加|联系|私聊|私信).{0,8}(?:微信|vx|v信|wechat|telegram|whatsapp|qq|qq群|二维码)/iu,
  },
  {
    key: "combo:resource_lure",
    category: "scam_or_resource_lure",
    severity: "reject",
    confidence: 0.97,
    pattern: /(?:完整资料|资料入口|下载入口|内部资料|资源入口|免费领取|福利入口).{0,10}(?:私聊|私信|联系|微信|vx|v信|telegram|whatsapp|qq|二维码)/iu,
  },
  {
    key: "combo:sale_lure",
    category: "scam_or_resource_lure",
    severity: "reject",
    confidence: 0.97,
    pattern: /(?:微信|vx|v信|telegram|whatsapp|qq|二维码).{0,10}(?:买|售|交易|资料|入口|下载|资源|私下交易|代付|代购|卖号|破解版|破解教程)/iu,
  },
  {
    key: "combo:promo_lure",
    category: "spam_or_promotion",
    severity: "reject",
    confidence: 0.95,
    pattern: /(?:广告合作|接推广|引流|代发|兼职拉新).{0,8}(?:私聊|私信|联系|微信|vx|telegram|whatsapp|qq|二维码)/iu,
  },
];

const HARD_REVIEW_RULES: Array<{
  key: string;
  category: LocalLexiconCategory;
  severity: LocalLexiconSeverity;
  confidence: number;
  pattern: RegExp;
}> = [
  {
    key: "review:contact_or_lure",
    category: "off_platform_contact",
    severity: "review",
    confidence: 0.72,
    pattern: /(?:微信|vx|v信|telegram|whatsapp|qq|qq群|二维码|联系方式).{0,12}(?:资料|入口|链接|资源|下载|私聊|私信|联系)/iu,
  },
  {
    key: "review:resource_claim",
    category: "fake_download_or_private_access",
    severity: "review",
    confidence: 0.68,
    pattern: /(?:完整资料|资料入口|下载入口|内部资料|资源入口|免费领取|福利入口)/iu,
  },
];

type CompiledLexiconTerm = SensitiveLexiconTerm & { compiled?: RegExp };

type CompiledLexicon = {
  allow: SensitiveLexiconTerm[];
  reject: SensitiveLexiconTerm[];
  review: SensitiveLexiconTerm[];
  softReview: SensitiveLexiconTerm[];
  regexTerms: Array<CompiledLexiconTerm & { compiled: RegExp }>;
};

let compiledLexiconPromise: Promise<CompiledLexicon> | null = null;
let compiledLexiconSource: "r2" | "local_file" | "emergency" | null = null;

function normalizeText(input: string) {
  const normalized = String(input ?? "")
    .slice(0, MAX_TEXT_LENGTH)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const condensed = normalized
    .replace(/微[\s._-]*信/gu, "微信")
    .replace(/v[\s._-]*x/giu, "vx")
    .replace(/v[\s._-]*信/giu, "v信")
    .replace(/q[\s._-]*q/giu, "qq")
    .replace(/[\s\p{P}\p{S}_-]+/gu, "");

  return { normalized, condensed };
}

function redactTerm(term: string) {
  const value = term.trim();
  if (value.length <= 2) return `${value[0] ?? "*"}*`;
  return `${value.slice(0, 1)}***${value.slice(-1)}`;
}

function buildSafeSummary(category: LocalLexiconCategory | null, severity: LocalLexiconSeverity, count: number) {
  if (!category || severity === "allow") return null;
  return `Local lexicon matched ${count} ${category} signal${count === 1 ? "" : "s"}.`;
}

function decisionFromSeverity(severity: LocalLexiconSeverity): "allow" | "review" | "reject" {
  if (severity === "reject") return "reject";
  if (severity === "review" || severity === "soft_review") return "review";
  return "allow";
}

function compileLexicon(lexiconData: SensitiveLexiconData): CompiledLexicon {
  const terms = (lexiconData.terms ?? []) as SensitiveLexiconTerm[];
  const allow: SensitiveLexiconTerm[] = [];
  const reject: SensitiveLexiconTerm[] = [];
  const review: SensitiveLexiconTerm[] = [];
  const softReview: SensitiveLexiconTerm[] = [];
  const regexTerms: Array<CompiledLexiconTerm & { compiled: RegExp }> = [];

  for (const term of terms) {
    if (term.match === "regex" && term.pattern) {
      regexTerms.push({ ...term, compiled: new RegExp(term.pattern, "iu") });
      continue;
    }

    if (term.severity === "allow") allow.push(term);
    else if (term.severity === "reject") reject.push(term);
    else if (term.severity === "review") review.push(term);
    else softReview.push(term);
  }

  return {
    allow,
    reject,
    review,
    softReview,
    regexTerms,
  };
}

async function getCompiledLexicon(env?: Record<string, unknown>): Promise<CompiledLexicon> {
  if (compiledLexiconPromise && compiledLexiconSource && compiledLexiconSource !== "emergency") {
    return compiledLexiconPromise;
  }

  if (!compiledLexiconPromise) {
    // Module-level cache keeps the compiled lexicon out of the Worker bundle while still avoiding repeated parsing.
    compiledLexiconPromise = loadSensitiveLexicon(env).then((lexiconData) => {
      const compiled = compileLexicon(lexiconData);
      compiledLexiconSource = getSensitiveLexiconSource();
      if (compiledLexiconSource === "emergency") {
        compiledLexiconPromise = null;
      }
      return compiled;
    });
  }
  return compiledLexiconPromise;
}

export function resetCompiledSensitiveLexiconCache() {
  compiledLexiconPromise = null;
  compiledLexiconSource = null;
  resetSensitiveLexiconRuntimeCache();
}

function isSafeContext(text: string) {
  return SAFE_CONTEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function matchesTerm(entry: SensitiveLexiconTerm, normalizedText: string, condensedText: string) {
  if (!entry.normalized) return false;
  const target = entry.condensed?.length ? condensedText : normalizedText;
  const needle = entry.condensed?.length ? entry.condensed : entry.normalized;
  if (!needle) return false;

  if (entry.match === "exact") {
    return target === needle;
  }
  if (entry.match === "phrase") {
    return normalizedText.includes(entry.normalized);
  }
  return target.includes(needle);
}

function allowlistSuppresses(entry: SensitiveLexiconTerm, allowHits: SensitiveLexiconTerm[]) {
  const normalized = entry.normalized;
  if (!normalized || allowHits.length === 0) return false;
  return allowHits.some((allowHit) => {
    if (!allowHit.normalized) return false;
    if (allowHit.normalized === normalized) return true;
    return allowHit.normalized.includes(normalized) || (allowHit.condensed?.includes(entry.condensed ?? "") ?? false);
  });
}

function collectMatches(
  entries: SensitiveLexiconTerm[],
  normalizedText: string,
  condensedText: string,
  allowHits: SensitiveLexiconTerm[],
) {
  const matches: SensitiveLexiconTerm[] = [];
  for (const entry of entries) {
    if (!matchesTerm(entry, normalizedText, condensedText)) continue;
    if (allowlistSuppresses(entry, allowHits)) continue;
    matches.push(entry);
    if (matches.length >= MAX_MATCHES) break;
  }
  return matches;
}

export async function evaluateLocalSensitiveLexicon(
  input: string,
  env?: Record<string, unknown>,
): Promise<LocalSensitiveLexiconResult> {
  const { normalized, condensed } = normalizeText(input);
  if (!normalized) {
    return {
      decision: "allow",
      severity: "allow",
      reasonCode: null,
      confidence: 0.01,
      categories: [],
      matchedTerms: [],
      matchedRules: [],
      safeSummary: null,
    };
  }

  const compiledLexicon = await getCompiledLexicon(env);
  const safeContext = isSafeContext(normalized);
  const allowHits = collectMatches(compiledLexicon.allow, normalized, condensed, []);

  if (!safeContext) {
    for (const rule of HARD_REJECT_RULES) {
      if (rule.pattern.test(normalized)) {
        return {
          decision: "reject",
          severity: rule.severity,
          reasonCode: rule.category,
          confidence: rule.confidence,
          categories: [rule.category],
          matchedTerms: [],
          matchedRules: [rule.key],
          safeSummary: buildSafeSummary(rule.category, rule.severity, 1),
        };
      }
    }
  }

  if (!safeContext) {
    for (const term of compiledLexicon.regexTerms) {
      if (term.severity === "allow") continue;
      if (term.compiled.test(normalized)) {
        return {
          decision: decisionFromSeverity(term.severity),
          severity: term.severity,
          reasonCode: term.category,
          confidence: term.severity === "reject" ? 0.93 : 0.66,
          categories: [term.category],
          matchedTerms: term.term ? [redactTerm(term.term)] : [],
          matchedRules: [`regex:${term.category}:${term.source}`],
          safeSummary: buildSafeSummary(term.category, term.severity, 1),
        };
      }
    }
  }

  const rejectHits = safeContext ? [] : collectMatches(compiledLexicon.reject, normalized, condensed, allowHits);
  if (rejectHits.length > 0) {
    return {
      decision: "reject",
      severity: "reject",
      reasonCode: rejectHits[0].category,
      confidence: 0.89,
      categories: [...new Set(rejectHits.map((item) => item.category))],
      matchedTerms: rejectHits.map((item) => redactTerm(item.term ?? "")).filter(Boolean),
      matchedRules: rejectHits.map((item) => `reject:${item.category}:${item.source}`),
      safeSummary: buildSafeSummary(rejectHits[0].category, "reject", rejectHits.length),
    };
  }

  if (!safeContext) {
    for (const rule of HARD_REVIEW_RULES) {
      if (rule.pattern.test(normalized)) {
        return {
          decision: "review",
          severity: rule.severity,
          reasonCode: rule.category,
          confidence: rule.confidence,
          categories: [rule.category],
          matchedTerms: [],
          matchedRules: [rule.key],
          safeSummary: buildSafeSummary(rule.category, rule.severity, 1),
        };
      }
    }
  }

  const reviewHits = collectMatches(compiledLexicon.review, normalized, condensed, allowHits);
  if (reviewHits.length > 0) {
    return {
      decision: "review",
      severity: "review",
      reasonCode: reviewHits[0].category,
      confidence: 0.7,
      categories: [...new Set(reviewHits.map((item) => item.category))],
      matchedTerms: reviewHits.map((item) => redactTerm(item.term ?? "")).filter(Boolean),
      matchedRules: reviewHits.map((item) => `review:${item.category}:${item.source}`),
      safeSummary: buildSafeSummary(reviewHits[0].category, "review", reviewHits.length),
    };
  }

  const softReviewHits = collectMatches(compiledLexicon.softReview, normalized, condensed, allowHits);
  if (softReviewHits.length > 0) {
    return {
      decision: "review",
      severity: "soft_review",
      reasonCode: softReviewHits[0].category,
      confidence: 0.54,
      categories: [...new Set(softReviewHits.map((item) => item.category))],
      matchedTerms: softReviewHits.map((item) => redactTerm(item.term ?? "")).filter(Boolean),
      matchedRules: softReviewHits.map((item) => `soft_review:${item.category}:${item.source}`),
      safeSummary: buildSafeSummary(softReviewHits[0].category, "soft_review", softReviewHits.length),
    };
  }

  return {
    decision: "allow",
    severity: "allow",
    reasonCode: null,
    confidence: 0.02,
    categories: [],
    matchedTerms: allowHits.map((item) => redactTerm(item.term ?? "")).filter(Boolean).slice(0, MAX_MATCHES),
    matchedRules: [],
    safeSummary: null,
  };
}
