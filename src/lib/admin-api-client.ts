import type { Session } from "@supabase/supabase-js";

export class AdminApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.details = details;
  }
}

type AdminFetchOptions = RequestInit & {
  session: Session | null;
};

type JsonObject = Record<string, unknown>;

export async function adminFetch<T = JsonObject>(path: string, options: AdminFetchOptions): Promise<T> {
  const { session, headers, ...rest } = options;
  const accessToken = session?.access_token?.trim();
  if (!accessToken) {
    throw new AdminApiError("登录状态已失效，请重新登录", 401);
  }

  const response = await fetch(path, {
    ...rest,
    headers: {
      ...(headers ?? {}),
      authorization: `Bearer ${accessToken}`,
    },
  });

  const rawText = await response.text().catch(() => "");
  let payload: JsonObject | null = null;
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as JsonObject;
    } catch {
      payload = { error: rawText };
    }
  }

  const payloadMessage =
    typeof payload?.message === "string" && payload.message.trim().length > 0
      ? payload.message.trim()
      : null;
  const payloadError =
    typeof payload?.error === "string" && payload.error.trim().length > 0
      ? payload.error.trim()
      : null;

  if (response.ok && payload && payload.ok === false) {
    throw new AdminApiError(payloadMessage || payloadError || "操作失败，请稍后重试。", response.status, payload?.details);
  }

  if (!response.ok) {
    const apiMessage = payloadMessage || payloadError || `请求失败 (${response.status})`;

    if (response.status === 401) {
      throw new AdminApiError("登录状态已失效，请重新登录", 401, payload?.details);
    }

    if (response.status === 403) {
      if (payload?.code === "ADMIN_AAL2_REQUIRED") {
        throw new AdminApiError("Verify your authenticator at /admin/security/ before continuing.", 403);
      }
      const forbiddenMessage =
        payloadError && payloadError !== "Forbidden"
          ? payloadError
          : "当前账号没有管理员权限";
      throw new AdminApiError(forbiddenMessage, 403, payload?.details);
    }

    throw new AdminApiError(apiMessage, response.status, payload?.details);
  }

  return (payload ?? {}) as T;
}
