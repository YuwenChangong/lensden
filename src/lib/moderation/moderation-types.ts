export type ModerationDecision = "allow" | "review" | "reject";

export type LocalModerationReasonCode =
  | "off_platform_contact"
  | "spam_or_promotion"
  | "scam_or_resource_lure"
  | "suspicious_external_link"
  | "fake_download_or_private_access"
  | "sexual_content"
  | "violence_or_threat"
  | "hate_or_harassment"
  | "illegal_goods_or_services"
  | "personal_data_or_doxxing"
  | "political_sensitive"
  | "vulgar_abuse"
  | "low_quality_spam"
  | "platform_policy_custom"
  | "excessive_links"
  | "repeated_content"
  | "gibberish"
  | "sensitive_review";

export type OpenAIModerationReasonCode =
  | "openai_flagged_text"
  | "openai_flagged_image"
  | "openai_threshold_review"
  | "openai_provider_error_review"
  | "openai_provider_error_reject"
  | "openai_provider_error_local_only"
  | "openai_provider_unavailable_local_allow"
  | "openai_provider_error_missing_key"
  | "openai_provider_error_http"
  | "openai_provider_error_timeout"
  | "openai_response_parse_error"
  | "openai_video_thumbnail_missing_review";

export type ForumPolicyReasonCode =
  | "forum_policy_clean"
  | "forum_policy_off_platform_contact"
  | "forum_policy_spam_or_promotion"
  | "forum_policy_scam_or_resource_lure"
  | "forum_policy_suspicious_external_link"
  | "forum_policy_fake_download_or_private_access"
  | "forum_policy_sexual_content"
  | "forum_policy_violence_or_threat"
  | "forum_policy_hate_or_harassment"
  | "forum_policy_illegal_goods_or_services"
  | "forum_policy_personal_data_or_doxxing"
  | "forum_policy_political_sensitive"
  | "forum_policy_vulgar_abuse"
  | "forum_policy_low_quality_spam"
  | "forum_policy_platform_policy_custom"
  | "forum_policy_invalid_json"
  | "forum_policy_timeout"
  | "forum_policy_error"
  | "forum_policy_missing_model";

export type ModerationReasonCode =
  | LocalModerationReasonCode
  | OpenAIModerationReasonCode
  | ForumPolicyReasonCode;

export type ModerationContentType =
  | "post_title"
  | "post_body"
  | "comment_body"
  | "profile_text"
  | "circle_name"
  | "circle_description";

export type ModerationProviderName =
  | "local"
  | "local_degraded"
  | "mock"
  | "openai"
  | "local+openai"
  | "layered"
  | "layered_degraded"
  | "manual-admin"
  | "tencent-disabled";

export type ModerationFailMode = "review" | "reject" | "allow" | "local_only";
export type ModerationProviderUnavailablePolicy = "review_all" | "local_only_safe" | "block_sensitive";
export type ModerationDecisionSource =
  | "local"
  | "local_degraded"
  | "openai"
  | "forum_policy"
  | "local+openai"
  | "provider_error"
  | "fallback"
  | "layered";
export type ModerationProviderStatus =
  | "success"
  | "http_429"
  | "http_5xx"
  | "timeout"
  | "http_error"
  | "invalid_response"
  | "missing_key"
  | "disabled"
  | "circuit_open"
  | "network_error"
  | "not_configured";

export type ModerationProviderTargetType =
  | "post_text"
  | "post_image"
  | "post_video_metadata"
  | "comment_text"
  | "circle_text"
  | "circle_cover_image"
  | "profile_text"
  | "profile_avatar_image"
  | "profile_banner_image";

export interface ModerationProviderInput {
  targetType: ModerationProviderTargetType;
  title?: string;
  body?: string;
  description?: string;
  imageUrls?: string[];
  localeHint?: string;
  metadata?: Record<string, unknown>;
}

export interface ModerationLocalInput {
  contentType: ModerationContentType;
  text: string;
  links?: string[];
  metadata?: Record<string, unknown>;
}

export interface ModerationInput {
  contentType: ModerationContentType;
  userId: string | null;
  text: string;
  links?: string[];
  metadata?: Record<string, unknown>;
  localInputs?: ModerationLocalInput[];
  providerInput?: ModerationProviderInput;
}

export type OpenAIModerationResult = {
  provider: "openai";
  flagged: boolean;
  providerStatus?: ModerationProviderStatus;
  decisionSource?: ModerationDecisionSource;
  decisionPath?: ModerationDecision;
  categories?: string[];
  scoresSummary?: Record<string, "low" | "medium" | "high">;
  safeSummary?: string | null;
} & (
  | { decision: "allow"; reasonCode: "openai_allow" | "openai_allow_empty" }
  | { decision: "review" | "reject" | "error"; reasonCode: OpenAIModerationReasonCode }
);

export interface ForumPolicyClassifierResult {
  provider: "forum_policy";
  decision: "allow" | "review" | "reject" | "error";
  reasonCode: ModerationReasonCode;
  confidence: "low" | "medium" | "high";
  matchedPolicy: string | null;
  providerStatus?: ModerationProviderStatus;
  safeSummary?: string | null;
}

export interface ModerationResult {
  decision: ModerationDecision;
  reason: ModerationReasonCode | null;
  score: number;
  matchedRules: string[];
  provider: ModerationProviderName;
  providerDetails?: {
    decisionSource?: ModerationDecisionSource;
    decisionPath?: ModerationDecision;
    reasonCode?: ModerationReasonCode | string | null;
    providerStatus?: ModerationProviderStatus;
    safeSummary?: string | null;
    localDecision?: ModerationDecision;
    openaiDecision?: ModerationDecision | "error";
    categories?: string[];
    scoresSummary?: Record<string, "low" | "medium" | "high">;
    providerError?: string | null;
  };
}

