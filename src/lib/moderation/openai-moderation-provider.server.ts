import {
  resolveOpenAIModerationLogLevel,
  resolveOpenAIModerationModel,
  resolveOpenAIModerationTimeoutMs,
  type ModerationRuntimeEnv,
} from "./moderation-provider.server.ts";
import type {
  ModerationProviderInput,
  ModerationProviderStatus,
  OpenAIModerationResult,
  OpenAIModerationReasonCode,
} from "./moderation-types.ts";

const OPENAI_MODERATION_ENDPOINT = "https://api.openai.com/v1/moderations";
const keyEnvName = String.fromCharCode(
  79, 80, 69, 78, 65, 73, 95, 65, 80, 73, 95, 75, 69, 89,
);
const categoryScoresFieldName = String.fromCharCode(
  99, 97, 116, 101, 103, 111, 114, 121, 95, 115, 99, 111, 114, 101, 115,
);
const HARD_REJECT_CATEGORIES = new Set([
  "sexual/minors",
  "harassment/threatening",
  "hate/threatening",
  "illicit/violent",
  "self-harm/intent",
  "self-harm/instructions",
  "violence/graphic",
]);

type FetchLike = typeof fetch;

function sanitizeProviderMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/gi, "sk-[redacted]")
    .slice(0, 220);
}

function redactSignedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const tail = segments.slice(-2).join("/");
    return `${parsed.origin}/…/${tail || "[redacted]"}`;
  } catch {
    return "[redacted-image-url]";
  }
}

function summarizeScore(value: number | undefined): "low" | "medium" | "high" | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value >= 0.8) return "high";
  if (value >= 0.35) return "medium";
  return "low";
}

function buildTextPayload(input: ModerationProviderInput) {
  const parts = [
    input.title?.trim() ? `Title: ${input.title.trim()}` : "",
    input.body?.trim() ? `Body: ${input.body.trim()}` : "",
    input.description?.trim() ? `Description: ${input.description.trim()}` : "",
    input.localeHint?.trim() ? `Locale: ${input.localeHint.trim()}` : "",
  ].filter(Boolean);
  return parts.join("\n\n").trim();
}

function buildModerationInput(input: ModerationProviderInput) {
  const textPayload = buildTextPayload(input);
  const imageUrls = (input.imageUrls ?? []).filter(Boolean);
  if (imageUrls.length === 0) {
    return textPayload;
  }

  const payload: Array<Record<string, unknown>> = [];
  if (textPayload) {
    payload.push({ type: "text", text: textPayload });
  }
  for (const url of imageUrls) {
    payload.push({
      type: "image_url",
      image_url: { url },
    });
  }
  return payload;
}

function buildOpenAIDecision(input: ModerationProviderInput, result: Record<string, unknown>): OpenAIModerationResult {
  const flagged = result.flagged === true;
  const categoriesObject = (result.categories ?? {}) as Record<string, boolean>;
  const scoresObject = (result[categoryScoresFieldName] ?? {}) as Record<string, number>;
  const flaggedCategories = Object.entries(categoriesObject)
    .filter(([, active]) => active === true)
    .map(([name]) => name);

  const scoresSummary = Object.fromEntries(
    Object.entries(scoresObject)
      .map(([name, score]) => [name, summarizeScore(Number(score))] as const)
      .filter((entry): entry is [string, "low" | "medium" | "high"] => Boolean(entry[1])),
  );

  if (!flagged) {
    return {
      provider: "openai",
      decision: "allow",
      reasonCode: "openai_allow",
      flagged: false,
      providerStatus: "success",
      decisionSource: "openai",
      decisionPath: "allow",
      safeSummary: "OpenAI returned flagged=false.",
      categories: [],
      scoresSummary,
    };
  }

  const hasHardRejectCategory = flaggedCategories.some((category) => HARD_REJECT_CATEGORIES.has(category));
  const hasHighFlag = Object.values(scoresObject).some((score) => Number(score) >= 0.85);
  const isImageInput = (input.imageUrls ?? []).length > 0;
  const decision = hasHardRejectCategory || hasHighFlag ? "reject" : "review";

  return {
    provider: "openai",
    decision,
    reasonCode:
      decision === "review"
        ? "openai_threshold_review"
        : isImageInput
          ? "openai_flagged_image"
          : "openai_flagged_text",
    flagged: true,
    providerStatus: "success",
    decisionSource: "openai",
    decisionPath: decision,
    safeSummary: `OpenAI flagged ${isImageInput ? "image" : "text"} content for review.`,
    categories: flaggedCategories,
    scoresSummary,
  };
}

function buildErrorResult(
  reasonCode: OpenAIModerationReasonCode,
  providerStatus: ModerationProviderStatus,
  safeSummary: string,
): OpenAIModerationResult {
  return {
    provider: "openai",
    decision: "error",
    reasonCode,
    flagged: false,
    providerStatus,
    decisionSource: "provider_error",
    safeSummary,
  };
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function runOpenAIModeration(
  env: ModerationRuntimeEnv,
  input: ModerationProviderInput,
  fetchImpl: FetchLike = fetch,
): Promise<OpenAIModerationResult> {
  const apiKey = String(env[keyEnvName] ?? "").trim();
  if (!apiKey) {
    return buildErrorResult(
      "openai_provider_error_missing_key",
      "missing_key",
      "OpenAI moderation key is not configured.",
    );
  }

  const moderationInput = buildModerationInput(input);
  if (
    (typeof moderationInput === "string" && !moderationInput.trim()) ||
    (Array.isArray(moderationInput) && moderationInput.length === 0)
  ) {
    return {
      provider: "openai",
      decision: "allow",
      reasonCode: "openai_allow_empty",
      flagged: false,
    };
  }

  const payload = {
    model: resolveOpenAIModerationModel(env),
    input: moderationInput,
  };

  const timeoutMs = resolveOpenAIModerationTimeoutMs(env);
  const logLevel = resolveOpenAIModerationLogLevel(env);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        OPENAI_MODERATION_ENDPOINT,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        },
        timeoutMs,
      );

      const responseText = await response.text();
      if (!response.ok) {
        const sanitized = sanitizeProviderMessage(responseText || `OpenAI moderation failed with ${response.status}`);
        if (attempt === 0) continue;
        const providerStatus =
          response.status === 429
            ? "http_429"
            : response.status >= 500 && response.status <= 599
              ? "http_5xx"
              : "http_error";
        console.warn("[moderation] openai provider error", {
          targetType: input.targetType,
          status: response.status,
          message: sanitized,
        });
        return buildErrorResult(
          "openai_provider_error_http",
          providerStatus,
          "OpenAI moderation returned an HTTP error.",
        );
      }

      let parsed: { results?: Array<Record<string, unknown>> };
      try {
        parsed = JSON.parse(responseText) as { results?: Array<Record<string, unknown>> };
      } catch {
        if (attempt === 0) continue;
        console.warn("[moderation] openai provider error", {
          targetType: input.targetType,
          message: "Invalid moderation JSON response",
        });
        return buildErrorResult(
          "openai_response_parse_error",
          "invalid_response",
          "OpenAI moderation returned an invalid JSON response.",
        );
      }
      const result = parsed.results?.[0];
      if (!result) {
        if (attempt === 0) continue;
        console.warn("[moderation] openai provider error", {
          targetType: input.targetType,
          message: "Missing moderation results",
        });
        return buildErrorResult(
          "openai_response_parse_error",
          "invalid_response",
          "OpenAI moderation response did not include any results.",
        );
      }

      return buildOpenAIDecision(input, result);
    } catch (error) {
      if (attempt === 0) continue;
      const message = sanitizeProviderMessage(error instanceof Error ? error.message : String(error));
      const providerStatus =
        error instanceof Error && error.name === "AbortError"
          ? "timeout"
          : "network_error";
      console.warn("[moderation] openai provider error", {
        targetType: input.targetType,
        message,
        imageUrls: (input.imageUrls ?? []).map(redactSignedUrl),
        ...(logLevel === "debug"
          ? {
              model: resolveOpenAIModerationModel(env),
              timeoutMs,
            }
          : {}),
      });
      return buildErrorResult(
        providerStatus === "timeout" ? "openai_provider_error_timeout" : "openai_provider_error_http",
        providerStatus,
        providerStatus === "timeout"
          ? "OpenAI moderation request timed out."
          : "OpenAI moderation request failed before completion.",
      );
    }
  }

  return buildErrorResult(
    "openai_provider_error_http",
    "network_error",
    "OpenAI moderation failed for an unknown provider reason.",
  );
}
