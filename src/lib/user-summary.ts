export type UserSummarySuccess = {
  ok: true;
  profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    profile_href: string | null;
    avatar_resolved_url: string | null;
  };
  stats: { post_count: number | null; received_like_count: number | null };
  availability: {
    avatar: "ready" | "unavailable";
    posts: "ready" | "unavailable";
    commentLikes: "ready" | "unavailable";
  };
};

export type UserSummaryFailure = {
  ok: false;
  code: "UNAUTHORIZED" | "PROFILE_NOT_FOUND" | "PROFILE_UNAVAILABLE";
};

export type UserSummaryObservation = {
  stage: "auth" | "profile" | "avatar" | "posts" | "comments";
  status: "ok" | "missing" | "unavailable";
  durationMs: number;
};
