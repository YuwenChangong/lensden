# Auth Strategy

## 产品原则

- 登录是 Lensden 的全站能力，不嵌在 `/forum/` 这种测试页里
- `/login/` 是统一登录与注册入口
- `/auth/callback/` 负责邮箱确认与登录回调
- 首页、设备页、指南页、动态页、圈子页、帖子页都允许未登录浏览
- 发帖、评论等互动操作需要登录后进行

## 跳转策略

- 未登录用户访问需要互动的入口时，跳转到 `/login/?next=...`
- 登录成功后，返回 `next` 对应的站内地址
- 注册确认邮件中的回跳地址使用 `/auth/callback/?next=...`
- `next` 仅允许站内相对路径，禁止开放重定向

## 当前实现

- `/forum/` 仅作为旧入口，直接重定向到 `/feed/`
- `/posts/new/` 是正式发帖页；未登录用户会先被引导到 `/login/?next=/posts/new/`
- 帖子详情页中，未登录用户可以阅读评论，但评论区只显示“登录后评论”入口
- 所有客户端认证仅使用 `PUBLIC_SUPABASE_URL` 与 `PUBLIC_SUPABASE_ANON_KEY`
- 不使用 `SUPABASE_SERVICE_ROLE_KEY`，不绕过 Supabase RLS
