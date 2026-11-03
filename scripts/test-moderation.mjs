import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const {
  evaluateLocalSensitiveLexicon,
  resetCompiledSensitiveLexiconCache,
} = await import("../src/lib/moderation/local-sensitive-lexicon.server.ts");
const {
  evaluateLocalModeration,
  moderateContent,
} = await import("../src/lib/moderation/moderate-content.server.ts");
const {
  getSensitiveLexiconHealth,
} = await import("../src/lib/moderation/sensitive-lexicon-loader.server.ts");
const { moderateAsset } = await import("../src/lib/moderation/moderate-asset.server.ts");
const { createSignedModerationUrls } = await import("../src/lib/moderation/moderation-media.server.ts");
// Node's type stripping does not resolve the extensionless imports used by
// Astro server modules. Reuse the other admin tests' Vite SSR loader rather
// than changing frozen production auth source or bypassing its dependency.
const { applyModerationAdminAction } = await (async () => {
  const loader = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    return await loader.ssrLoadModule(fileURLToPath(new URL("../src/lib/server/moderation-admin.ts", import.meta.url)));
  } finally {
    await loader.close();
  }
})();

async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function read(filePath) {
  return fs.readFile(new URL(`../${filePath}`, import.meta.url), "utf8");
}

await test("lexicon reviews 私聊拿资料", async () => {
  const result = await evaluateLocalSensitiveLexicon("私聊我拿资料，我给你入口。");
  assert.equal(result.decision, "review");
  assert.ok(result.reasonCode);
});

await test("lexicon rejects 完整资料入口 + 微信组合", async () => {
  const result = await evaluateLocalSensitiveLexicon("完整资料入口在这，加微信拿下载链接。");
  assert.equal(result.decision, "reject");
  assert.ok(result.reasonCode);
});

await test("lexicon rejects 加微信买资料", async () => {
  const result = await evaluateLocalSensitiveLexicon("加微信买资料，私下交易更便宜。");
  assert.equal(result.decision, "reject");
});

await test("lexicon reviews Telegram 引流", async () => {
  const result = await evaluateLocalSensitiveLexicon("可以去 Telegram 群继续聊，资料入口也在那边。");
  assert.notEqual(result.decision, "allow");
});

await test("lexicon reviews 二维码引流", async () => {
  const result = await evaluateLocalSensitiveLexicon("扫二维码获取完整资料。");
  assert.notEqual(result.decision, "allow");
});

await test("lexicon rejects 人口贩卖", async () => {
  const result = await evaluateLocalSensitiveLexicon("[MOD-CRITICAL-TERM] 人口贩卖");
  assert.equal(result.decision, "reject");
  assert.equal(result.reasonCode, "illegal_goods_or_services");
});

await test("lexicon does not allow 嫖娼 or 卖淫", async () => {
  const prostitution = await evaluateLocalSensitiveLexicon("[MOD-CRITICAL-TERM] 嫖娼");
  const solicitation = await evaluateLocalSensitiveLexicon("[MOD-CRITICAL-TERM] 卖淫");
  assert.notEqual(prostitution.decision, "allow");
  assert.notEqual(solicitation.decision, "allow");
});

await test("lexicon retry escapes emergency fallback when R2 becomes available", async () => {
  resetCompiledSensitiveLexiconCache();
  try {
    let attempt = 0;
    const env = {
      SENSITIVE_LEXICON_DISABLE_NODE_LOCAL: "true",
      MODERATION_ASSETS: {
        async get() {
          attempt += 1;
          if (attempt === 1) {
            throw new Error("temporary r2 failure");
          }
          return {
            async text() {
              return JSON.stringify({
                version: "qa-r2",
                terms: [
                  {
                    term: "artificiallanguages.info",
                    normalized: "artificiallanguages.info",
                    condensed: "artificiallanguagesinfo",
                    category: "suspicious_external_link",
                    severity: "reject",
                    source: "qa-r2",
                    match: "contains",
                  },
                ],
              });
            },
          };
        },
      },
    };

    const first = await evaluateLocalSensitiveLexicon("artificiallanguages.info", env);
    assert.equal(first.decision, "allow");

    const second = await evaluateLocalSensitiveLexicon("artificiallanguages.info", env);
    assert.equal(second.decision, "reject");

    const health = await getSensitiveLexiconHealth(env);
    assert.equal(health.source, "r2");
    assert.equal(health.fallbackUsed, false);
  } finally {
    resetCompiledSensitiveLexiconCache();
  }
});

await test("微信登录问题不会直接 reject", async () => {
  const result = await evaluateLocalModeration({
    contentType: "post_body",
    userId: "u1",
    text: "有人遇到微信登录问题吗？我这边授权后没有跳转。",
  });
  assert.notEqual(result.decision, "reject");
});

await test("正常 AR glasses 讨论 allow", async () => {
  const result = await evaluateLocalModeration({
    contentType: "post_body",
    userId: "u1",
    text: "XREAL One 和 RayNeo Air 3s 的日常使用差异是什么？更在意重量还是清晰度？",
  });
  assert.equal(result.decision, "allow");
});

await test("正常 profile bio allow", async () => {
  const result = await evaluateLocalModeration({
    contentType: "profile_text",
    userId: "u1",
    text: "AR glasses enthusiast interested in spatial computing and wearable interfaces.",
  });
  assert.equal(result.decision, "allow");
});

await test("profile 外部链接诱导 should not allow", async () => {
  const result = await evaluateLocalModeration({
    contentType: "profile_text",
    userId: "u1",
    text: "外部链接诱导，点链接领取资料。",
  });
  assert.notEqual(result.decision, "allow");
});

await test("官网链接打不开 should not hard reject", async () => {
  const result = await evaluateLocalModeration({
    contentType: "profile_text",
    userId: "u1",
    text: "我在官网链接看到产品参数，但这个链接打不开。",
  });
  assert.notEqual(result.decision, "reject");
});

await test("正常 circle description allow", async () => {
  const result = await evaluateLocalModeration({
    contentType: "circle_description",
    userId: "u1",
    text: "Discuss daily use, comfort, display quality and software experience.",
  });
  assert.equal(result.decision, "allow");
});

await test("OpenAI moderation provider allow keeps clean content allow", async () => {
  const result = await moderateContent(
    { OPENAI_MODERATION_ENABLED: "true", OPENAI_FORUM_POLICY_ENABLED: "false" },
    {
      contentType: "post_body",
      userId: "u1",
      text: "想讨论 XREAL One 的日常使用体验。",
      providerInput: { targetType: "post_text", body: "想讨论 XREAL One 的日常使用体验。" },
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "allow",
        reasonCode: "openai_allow",
        flagged: false,
        providerStatus: "success",
      }),
    },
  );
  assert.equal(result.decision, "allow");
});

await test("forum classifier runner is not called by default when flag is absent", async () => {
  let forumRunnerCalled = false;
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "true",
    },
    {
      contentType: "post_body",
      userId: "u1",
      text: "正常 AR 讨论内容。",
      providerInput: { targetType: "post_text", body: "正常 AR 讨论内容。" },
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "allow",
        reasonCode: "openai_allow",
        flagged: false,
        providerStatus: "success",
      }),
      forumClassifierRunner: async () => {
        forumRunnerCalled = true;
        return {
          provider: "forum_policy",
          decision: "reject",
          reasonCode: "forum_policy_spam_or_promotion",
          confidence: "high",
          matchedPolicy: "spam_or_promotion",
          providerStatus: "success",
        };
      },
    },
  );
  assert.equal(result.decision, "allow");
  assert.equal(forumRunnerCalled, false);
});

await test("forum classifier runner is not called when disabled explicitly", async () => {
  let forumRunnerCalled = false;
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "true",
      OPENAI_FORUM_POLICY_ENABLED: "false",
    },
    {
      contentType: "post_body",
      userId: "u1",
      text: "正常 AR 讨论内容。",
      providerInput: { targetType: "post_text", body: "正常 AR 讨论内容。" },
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "allow",
        reasonCode: "openai_allow",
        flagged: false,
        providerStatus: "success",
      }),
      forumClassifierRunner: async () => {
        forumRunnerCalled = true;
        return {
          provider: "forum_policy",
          decision: "reject",
          reasonCode: "forum_policy_spam_or_promotion",
          confidence: "high",
          matchedPolicy: "spam_or_promotion",
          providerStatus: "success",
        };
      },
    },
  );
  assert.equal(result.decision, "allow");
  assert.equal(forumRunnerCalled, false);
});

await test("OpenAI moderation flagged provider can force review", async () => {
  const result = await moderateContent(
    { OPENAI_MODERATION_ENABLED: "true", OPENAI_FORUM_POLICY_ENABLED: "false" },
    {
      contentType: "post_body",
      userId: "u1",
      text: "测试内容",
      providerInput: { targetType: "post_text", body: "测试内容" },
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "review",
        reasonCode: "openai_threshold_review",
        flagged: true,
        providerStatus: "success",
        categories: ["harassment"],
        scoresSummary: { harassment: "medium" },
      }),
    },
  );
  assert.equal(result.decision, "review");
});

await test("OpenAI moderation provider error fail-closes to review", async () => {
  const result = await moderateContent(
    { OPENAI_MODERATION_ENABLED: "true", OPENAI_MODERATION_FAIL_MODE: "review", OPENAI_FORUM_POLICY_ENABLED: "false" },
    {
      contentType: "comment_body",
      userId: "u1",
      text: "正常评论",
      providerInput: { targetType: "comment_text", body: "正常评论" },
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "error",
        reasonCode: "openai_provider_error_timeout",
        flagged: false,
        providerStatus: "timeout",
      }),
    },
  );
  assert.equal(result.decision, "review");
  assert.equal(result.reason, "openai_provider_error_timeout");
});

await test("provider unavailable + local_only_safe allows clean post as local degraded", async () => {
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "true",
      OPENAI_FORUM_POLICY_ENABLED: "false",
      MODERATION_PROVIDER_UNAVAILABLE_POLICY: "local_only_safe",
    },
    {
      contentType: "post_body",
      userId: "u1",
      text: "正常 AR 眼镜使用讨论内容。",
      providerInput: { targetType: "post_text", body: "正常 AR 眼镜使用讨论内容。" },
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "error",
        reasonCode: "openai_provider_error_http",
        flagged: false,
        providerStatus: "http_429",
      }),
    },
  );
  assert.equal(result.decision, "allow");
  assert.equal(result.reason, "openai_provider_unavailable_local_allow");
  assert.match(String(result.provider), /degraded/);
});

await test("provider unavailable + local_only_safe allows clean comment as local degraded", async () => {
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "true",
      OPENAI_FORUM_POLICY_ENABLED: "false",
      MODERATION_PROVIDER_UNAVAILABLE_POLICY: "local_only_safe",
    },
    {
      contentType: "comment_body",
      userId: "u1",
      text: "正常评论。",
      providerInput: { targetType: "comment_text", body: "正常评论。" },
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "error",
        reasonCode: "openai_provider_error_timeout",
        flagged: false,
        providerStatus: "timeout",
      }),
    },
  );
  assert.equal(result.decision, "allow");
  assert.equal(result.reason, "openai_provider_unavailable_local_allow");
});

await test("provider unavailable + local_only_safe allows clean profile text as local degraded", async () => {
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "true",
      OPENAI_FORUM_POLICY_ENABLED: "false",
      MODERATION_PROVIDER_UNAVAILABLE_POLICY: "local_only_safe",
    },
    {
      contentType: "profile_text",
      userId: "u1",
      text: "AR glasses builder and researcher.",
      providerInput: { targetType: "profile_text", body: "AR glasses builder and researcher." },
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "error",
        reasonCode: "openai_provider_error_http",
        flagged: false,
        providerStatus: "http_5xx",
      }),
    },
  );
  assert.equal(result.decision, "allow");
});

await test("provider unavailable + local_only_safe allows clean circle text as local degraded", async () => {
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "true",
      OPENAI_FORUM_POLICY_ENABLED: "false",
      MODERATION_PROVIDER_UNAVAILABLE_POLICY: "local_only_safe",
    },
    {
      contentType: "circle_description",
      userId: "u1",
      text: "Discuss comfort, display quality and software.",
      localInputs: [{ contentType: "circle_description", text: "Discuss comfort, display quality and software." }],
      providerInput: { targetType: "circle_text", description: "Discuss comfort, display quality and software." },
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "error",
        reasonCode: "openai_provider_error_http",
        flagged: false,
        providerStatus: "network_error",
      }),
    },
  );
  assert.equal(result.decision, "allow");
});

await test("provider unavailable + local rules still reject 人口贩卖", async () => {
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "true",
      OPENAI_FORUM_POLICY_ENABLED: "false",
      MODERATION_PROVIDER_UNAVAILABLE_POLICY: "local_only_safe",
    },
    {
      contentType: "post_body",
      userId: "u1",
      text: "人口贩卖",
      providerInput: { targetType: "post_text", body: "人口贩卖" },
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "error",
        reasonCode: "openai_provider_error_http",
        flagged: false,
        providerStatus: "http_429",
      }),
    },
  );
  assert.equal(result.decision, "reject");
});

await test("provider unavailable + local rules still do not allow 嫖娼 and 卖淫", async () => {
  for (const term of ["嫖娼", "卖淫"]) {
    const result = await moderateContent(
      {
        OPENAI_MODERATION_ENABLED: "true",
        OPENAI_FORUM_POLICY_ENABLED: "false",
        MODERATION_PROVIDER_UNAVAILABLE_POLICY: "local_only_safe",
      },
      {
        contentType: "comment_body",
        userId: "u1",
        text: term,
        providerInput: { targetType: "comment_text", body: term },
      },
      {
        openaiRunner: async () => ({
          provider: "openai",
          decision: "error",
          reasonCode: "openai_provider_error_http",
          flagged: false,
          providerStatus: "http_429",
        }),
      },
    );
    assert.notEqual(result.decision, "allow");
  }
});

await test("review_all keeps clean provider unavailable content in review", async () => {
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "true",
      OPENAI_FORUM_POLICY_ENABLED: "false",
      MODERATION_PROVIDER_UNAVAILABLE_POLICY: "review_all",
    },
    {
      contentType: "post_body",
      userId: "u1",
      text: "正常讨论内容",
      providerInput: { targetType: "post_text", body: "正常讨论内容" },
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "error",
        reasonCode: "openai_provider_error_http",
        flagged: false,
        providerStatus: "http_429",
      }),
    },
  );
  assert.equal(result.decision, "review");
});

await test("block_sensitive keeps clean provider unavailable profile in review", async () => {
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "true",
      OPENAI_FORUM_POLICY_ENABLED: "false",
      MODERATION_PROVIDER_UNAVAILABLE_POLICY: "block_sensitive",
    },
    {
      contentType: "profile_text",
      userId: "u1",
      text: "Normal profile text",
      providerInput: { targetType: "profile_text", body: "Normal profile text" },
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "error",
        reasonCode: "openai_provider_error_http",
        flagged: false,
        providerStatus: "http_429",
      }),
    },
  );
  assert.equal(result.decision, "review");
});

await test("forum classifier allow keeps clean content allow", async () => {
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "false",
      OPENAI_FORUM_POLICY_ENABLED: "true",
      OPENAI_FORUM_POLICY_MODEL: "gpt-test",
    },
    {
      contentType: "post_body",
      userId: "u1",
      text: "正常讨论内容",
      providerInput: { targetType: "post_text", body: "正常讨论内容" },
    },
    {
      forumClassifierRunner: async () => ({
        provider: "forum_policy",
        decision: "allow",
        reasonCode: "forum_policy_clean",
        confidence: "high",
        matchedPolicy: "clean",
        providerStatus: "success",
      }),
    },
  );
  assert.equal(result.decision, "allow");
});

await test("forum classifier review keeps content pending", async () => {
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "false",
      OPENAI_FORUM_POLICY_ENABLED: "true",
      OPENAI_FORUM_POLICY_MODEL: "gpt-test",
    },
    {
      contentType: "post_body",
      userId: "u1",
      text: "正常讨论内容",
      providerInput: { targetType: "post_text", body: "正常讨论内容" },
    },
    {
      forumClassifierRunner: async () => ({
        provider: "forum_policy",
        decision: "review",
        reasonCode: "forum_policy_off_platform_contact",
        confidence: "high",
        matchedPolicy: "off_platform_contact",
        providerStatus: "success",
      }),
    },
  );
  assert.equal(result.decision, "review");
});

await test("forum classifier reject forces reject", async () => {
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "false",
      OPENAI_FORUM_POLICY_ENABLED: "true",
      OPENAI_FORUM_POLICY_MODEL: "gpt-test",
    },
    {
      contentType: "post_body",
      userId: "u1",
      text: "正常讨论内容",
      providerInput: { targetType: "post_text", body: "正常讨论内容" },
    },
    {
      forumClassifierRunner: async () => ({
        provider: "forum_policy",
        decision: "reject",
        reasonCode: "forum_policy_spam_or_promotion",
        confidence: "high",
        matchedPolicy: "spam_or_promotion",
        providerStatus: "success",
      }),
    },
  );
  assert.equal(result.decision, "reject");
});

await test("forum classifier invalid JSON path fail-closes to review", async () => {
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "false",
      OPENAI_FORUM_POLICY_ENABLED: "true",
      OPENAI_FORUM_POLICY_MODEL: "gpt-test",
    },
    {
      contentType: "post_body",
      userId: "u1",
      text: "正常讨论内容",
      providerInput: { targetType: "post_text", body: "正常讨论内容" },
    },
    {
      forumClassifierRunner: async () => ({
        provider: "forum_policy",
        decision: "error",
        reasonCode: "forum_policy_invalid_json",
        confidence: "low",
        matchedPolicy: null,
        providerStatus: "invalid_response",
      }),
    },
  );
  assert.equal(result.decision, "review");
});

await test("forum classifier timeout fail-closes to review", async () => {
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "false",
      OPENAI_FORUM_POLICY_ENABLED: "true",
      OPENAI_FORUM_POLICY_MODEL: "gpt-test",
    },
    {
      contentType: "post_body",
      userId: "u1",
      text: "正常讨论内容",
      providerInput: { targetType: "post_text", body: "正常讨论内容" },
    },
    {
      forumClassifierRunner: async () => ({
        provider: "forum_policy",
        decision: "error",
        reasonCode: "forum_policy_timeout",
        confidence: "low",
        matchedPolicy: null,
        providerStatus: "timeout",
      }),
    },
  );
  assert.equal(result.decision, "review");
});

await test("pipeline all allow => allow", async () => {
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "true",
      OPENAI_FORUM_POLICY_ENABLED: "true",
      OPENAI_FORUM_POLICY_MODEL: "gpt-test",
    },
    {
      contentType: "post_body",
      userId: "u1",
      text: "正常讨论内容",
      providerInput: { targetType: "post_text", body: "正常讨论内容" },
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "allow",
        reasonCode: "openai_allow",
        flagged: false,
        providerStatus: "success",
      }),
      forumClassifierRunner: async () => ({
        provider: "forum_policy",
        decision: "allow",
        reasonCode: "forum_policy_clean",
        confidence: "high",
        matchedPolicy: "clean",
        providerStatus: "success",
      }),
    },
  );
  assert.equal(result.decision, "allow");
});

await test("pipeline any review => review", async () => {
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "true",
      OPENAI_FORUM_POLICY_ENABLED: "true",
      OPENAI_FORUM_POLICY_MODEL: "gpt-test",
    },
    {
      contentType: "post_body",
      userId: "u1",
      text: "完整资料入口",
      providerInput: { targetType: "post_text", body: "完整资料入口" },
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "allow",
        reasonCode: "openai_allow",
        flagged: false,
        providerStatus: "success",
      }),
      forumClassifierRunner: async () => ({
        provider: "forum_policy",
        decision: "allow",
        reasonCode: "forum_policy_clean",
        confidence: "high",
        matchedPolicy: "clean",
        providerStatus: "success",
      }),
    },
  );
  assert.equal(result.decision, "review");
});

await test("pipeline any reject => reject", async () => {
  const result = await moderateContent(
    {
      OPENAI_MODERATION_ENABLED: "true",
      OPENAI_FORUM_POLICY_ENABLED: "true",
      OPENAI_FORUM_POLICY_MODEL: "gpt-test",
    },
    {
      contentType: "post_body",
      userId: "u1",
      text: "正常讨论内容",
      providerInput: { targetType: "post_text", body: "正常讨论内容" },
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "reject",
        reasonCode: "openai_flagged_text",
        flagged: true,
        providerStatus: "success",
      }),
      forumClassifierRunner: async () => ({
        provider: "forum_policy",
        decision: "allow",
        reasonCode: "forum_policy_clean",
        confidence: "high",
        matchedPolicy: "clean",
        providerStatus: "success",
      }),
    },
  );
  assert.equal(result.decision, "reject");
});

await test("suspicious content without 私聊 but with 完整资料入口 still reviews or rejects", async () => {
  const result = await evaluateLocalSensitiveLexicon("这里有完整资料入口和下载入口。");
  assert.notEqual(result.decision, "allow");
});

await test("asset moderation provider error fail-closes", async () => {
  const result = await moderateAsset(
    { OPENAI_MODERATION_ENABLED: "true", OPENAI_MODERATION_FAIL_MODE: "review" },
    {
      targetType: "profile_avatar_image",
      imageUrls: ["https://example.com/avatar.png"],
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "error",
        reasonCode: "openai_provider_error_timeout",
        flagged: false,
        providerStatus: "timeout",
      }),
    },
  );
  assert.equal(result.decision, "review");
});

await test("asset moderation provider unavailable does not local-only allow clean image", async () => {
  const result = await moderateAsset(
    {
      OPENAI_MODERATION_ENABLED: "true",
      MODERATION_PROVIDER_UNAVAILABLE_POLICY: "local_only_safe",
      OPENAI_MODERATION_FAIL_MODE: "review",
    },
    {
      targetType: "post_image",
      imageUrls: ["https://example.com/post-image.png"],
    },
    {
      openaiRunner: async () => ({
        provider: "openai",
        decision: "error",
        reasonCode: "openai_provider_error_http",
        flagged: false,
        providerStatus: "http_429",
      }),
    },
  );
  assert.equal(result.decision, "review");
});

await test("createSignedModerationUrls returns absolute signed URLs", async () => {
  const urls = await createSignedModerationUrls({
    client: {
      storage: {
        from() {
          return {
            getPublicUrl() { return { data: { publicUrl: "https://example.supabase.co/storage/v1/object/public/post-media/" } }; },
            async createSignedUrls() {
              return {
                data: [{ signedUrl: "/storage/v1/object/sign/post-media/private/path.png?token=test" }],
                error: null,
              };
            },
          };
        },
      },
    },
    values: ["private/path.png"],
    allowedPrefixes: ["private/"],
  });

  assert.deepEqual(urls, ["https://example.supabase.co/storage/v1/object/sign/post-media/private/path.png?token=test"]);
});

await test("createSignedModerationUrls can convert signed images to data URLs", async () => {
  const urls = await createSignedModerationUrls({
    client: {
      storage: {
        from() {
          return {
            getPublicUrl() { return { data: { publicUrl: "https://example.supabase.co/storage/v1/object/public/post-media/" } }; },
            async createSignedUrls() {
              return {
                data: [{ signedUrl: "/storage/v1/object/sign/post-media/private/path.png?token=test" }],
                error: null,
              };
            },
          };
        },
      },
    },
    values: ["private/path.png"],
    allowedPrefixes: ["private/"],
    preferDataUrls: true,
    fetchImpl: async () =>
      new Response(Uint8Array.from([137, 80, 78, 71]), {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "4" },
      }),
  });

  assert.match(urls[0], /^data:image\/png;base64,/);
});

function createMockAdminClient(initialRow) {
  const row = initialRow ? { ...initialRow } : null;
  const actionInserts = [];
  return {
    actionInserts,
    client: {
      from(table) {
        if (table === "moderation_actions") {
          return {
            async insert(payload) {
              actionInserts.push(payload);
              return { error: null };
            },
          };
        }

        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            return { data: row ? { ...row } : null, error: null };
          },
          update(payload) {
            return {
              eq() {
                return {
                  async select() {
                    if (!row) return { data: [], error: null };
                    Object.assign(row, payload);
                    return { data: [{ ...row }], error: null };
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

await test("admin approve pending item => 200-shape result", async () => {
  const mock = createMockAdminClient({
    id: "00000000-0000-0000-0000-000000000001",
    status: "pending",
    moderation_status: "pending_review",
    moderation_reason: "openai_threshold_review",
    moderated_at: null,
    moderated_by: null,
  });
  const result = await applyModerationAdminAction({
    client: mock.client,
    moderatorId: "00000000-0000-0000-0000-000000000099",
    targetType: "post",
    targetId: "00000000-0000-0000-0000-000000000001",
    action: "approve",
    reason: "ok",
  });
  assert.equal(result.ok, true);
  assert.equal(result.item.status, "published");
  assert.equal(result.item.moderation_status, "published");
  assert.equal(mock.actionInserts.length, 1);
});

await test("admin action on nonexistent item => 404, not 500", async () => {
  const mock = createMockAdminClient(null);
  const result = await applyModerationAdminAction({
    client: mock.client,
    moderatorId: "00000000-0000-0000-0000-000000000099",
    targetType: "comment",
    targetId: "00000000-0000-0000-0000-000000000002",
    action: "reject",
    reason: "nope",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
});

await test("admin action already processed => friendly success without extra log", async () => {
  const mock = createMockAdminClient({
    id: "00000000-0000-0000-0000-000000000003",
    status: "hidden",
    moderation_status: "hidden_by_admin",
    moderation_reason: "Hidden by moderator",
    moderated_at: "2026-06-21T00:00:00.000Z",
    moderated_by: "00000000-0000-0000-0000-000000000099",
  });
  const result = await applyModerationAdminAction({
    client: mock.client,
    moderatorId: "00000000-0000-0000-0000-000000000099",
    targetType: "post",
    targetId: "00000000-0000-0000-0000-000000000003",
    action: "hide",
    reason: "again",
  });
  assert.equal(result.ok, true);
  assert.equal(result.alreadyApplied, true);
  assert.equal(mock.actionInserts.length, 0);
});

await test("avatar and banner provider unavailable stay blocked/review", async () => {
  for (const targetType of ["profile_avatar_image", "profile_banner_image", "circle_cover_image"]) {
    const result = await moderateAsset(
      {
        OPENAI_MODERATION_ENABLED: "true",
        MODERATION_PROVIDER_UNAVAILABLE_POLICY: "local_only_safe",
        OPENAI_MODERATION_FAIL_MODE: "review",
      },
      {
        targetType,
        imageUrls: ["https://example.com/asset.png"],
      },
      {
        openaiRunner: async () => ({
          provider: "openai",
          decision: "error",
          reasonCode: "openai_provider_error_timeout",
          flagged: false,
          providerStatus: "timeout",
        }),
      },
    );
    assert.equal(result.decision, "review");
  }
});

await test("media metadata local lexicon still catches 嫖娼", async () => {
  const result = await evaluateLocalSensitiveLexicon("Video caption: 嫖娼");
  assert.equal(result.decision, "review");
  assert.equal(result.reasonCode, "illegal_goods_or_services");
});

await test("routes still wire moderation for all write paths", async () => {
  const postsApi = await read("src/pages/api/forum/posts.ts");
  const commentsApi = await read("src/pages/api/forum/comments.ts");
  const circlesApi = await read("src/pages/api/forum/circles.ts");
  const profileApi = await read("src/pages/api/users/me/profile.ts");
  const postMediaApi = await read("src/pages/api/forum/post-media.ts");

  assert.match(postsApi, /moderateContent\(/);
  assert.match(commentsApi, /moderateContent\(/);
  assert.match(circlesApi, /moderateContent\(/);
  assert.match(profileApi, /moderateContent\(/);
  assert.match(profileApi, /moderateAsset\(/);
  assert.match(circlesApi, /moderateAsset\(/);
  assert.match(postMediaApi, /evaluateLocalSensitiveLexicon\(/);
  assert.match(postMediaApi, /moderateAsset\(/);
});

await test("public visibility paths still require moderation_status published", async () => {
  const files = [
    "src/lib/forum-feed.ts",
    "src/lib/forum-search.ts",
    "src/lib/profile-data.ts",
    "src/pages/index.astro",
    "src/pages/circles/[slug].astro",
    "src/pages/posts/[id].astro",
  ];

  for (const file of files) {
    const content = await read(file);
    assert.match(content, /moderation_status"\s*,\s*"published"|moderation_status', 'published'|moderation_status", "published"/);
  }
});

await test("source files do not expose raw category_scores in client paths", async () => {
  const adminQueue = await read("src/components/admin/AdminModerationQueue.tsx");
  assert.ok(!adminQueue.includes("category_scores"));
});
