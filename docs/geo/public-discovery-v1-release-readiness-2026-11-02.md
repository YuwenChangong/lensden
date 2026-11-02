# Lensden Public Discovery v1 — Release Readiness Packet

2026-11-02。结论：**HOLD_MISSING_COST_EVIDENCE**。本地代码阻塞已最小修复；未授权 Production 构建或发布。
这是对既有发现闭环的最终复核，不新增 GEO 功能。当前未知项只阻断相应生产操作，不阻断本地工作。

## 发布源与审查结论

| 项目 | 证据与结论 |
|---|---|
| 输入提交 | `4843559f6c5f921b12c453e18ad81363cc897a36`；原提交评论续页 canonical 存在下述缺陷，不能原样作为最终候选 |
| 最小修复后的候选 SOURCE_COMMIT | **`acf9d1560f9fb3bec52d83545852536655ad6c72`**，`fix(discovery): preserve comment pagination self canonicals` |
| 分支/工作树 | `codex/public-discovery-coverage-v1`；开始时 clean，输入 HEAD=4843559f；结束时 clean（本报告与状态更新另作本地文档提交） |
| 继承修复 | `4e636573` 是输入提交和修复后候选的祖先；未重复实现或改动其翻页、日期逻辑 |
| 已确认部署收据 | 应用 `c9acc8458ab0ae5fd7a5f15bdc622716f205aff7`；Worker `43ac9bb4-f336-4f37-a917-6639acc0ec82`；deployment `35ed60e2-0390-41a5-98ae-443db14c9a1c`，2026-11-02T06:47:59.621488Z |
| 实际差异 | c9acc845→4843559f：26 文件，+1339/-49；→acf9d156：27 文件，+1370/-52，均含文档与测试。继承的三篇正式指南保留；没有重做发布或域名迁移 |
| 最新生产一致性 | **NOT_VERIFIED**：上述是已保存部署收据，未读取当前 active version。候选是该已知源的后代，但不能据此排除后续云端/其他分支修改；发布窗口必须核对，否则停止，不能覆盖 |
| 本轮修改文件 | `src/lib/seo.ts`、`src/layouts/CommunityLayout.astro`、`src/pages/posts/[id].astro`、`scripts/test-seo-geo.mjs`、`scripts/test-public-discovery-rendered.mjs`；另本报告及 `docs/ops/PUBLIC_BETA_CURRENT_STATE.md` |

## 精确代码复核

| 检查 | 结果 | 证据/限制 |
|---|---|---|
| 已有 Sitemap / feed 翻页 / 日期 | PASS | 继承祖先及定向测试收据；空的过滤页仍能继续，较老帖子有路径；保留英文 lastUpdated，圈子/设备/新闻无依据的 lastmod 不恢复 |
| 新论坛子图资格 | PASS | 现有匿名客户端/RLS，published + moderation published + active/public 父圈子；规范小写 UUID；精确 fixture 排除。没有年龄/互动门槛；仅输出主帖规范 URL，不广告草稿、隐藏/私密、删除、违规、评论片段或语言变体 |
| >5,000 候选/不完整读取 | PASS | exact count 在输出前验证；>5,000 首批即拒绝，全部读取并验证后才序列化。计数缺失/变化、重复/坏 ID、读不完、HTTP/超时/字节上限均失败，无部分 200 图；不回传后端错误 |
| 匿名评论 SSR / API / Hydration | PASS | 50 条 + lookahead，严格公开审核；主帖及圈子父链有效。编译测试匿名 HTML/API 无 pending 正文；认证 owner-pending 投影仅依原权限保留；SSR 在交互岛接管后替换，不双重显示；既有交互未删除 |
| 评论分页 HTML/canonical/锚点 | PASS（修复后） | 原 4843559f 将每页 canonical 指向第一页，现第 2…1,000 页 self canonical 与 og:url 保留唯一 comments_page，剔除 lang/tracking；第一页不带参数；第 2 页返回根 URL#comments。各页标记的评论都有唯一可见锚点 |
| DiscussionForumPosting 一致性 | PASS | 讨论实体 URL 仍指第一页；Comment URL 指真实所在页和锚点，只标记本页公开正文/公开作者/有效日期；inReplyTo 只引用本页可见且有标记的父评论。缺公开作者/日期/正文则省略相应标记，无虚构统计/评价/测试经历，无错误 QAPage/news 类型扩散 |
| 测试分类 | PASS（已知）/ NOT_VERIFIED（未知） | 既有证据确认的 5 帖、3 圈子 UUID/原 slug 精确排除；评论已分类集为空。没有新关键词黑名单或迁移，不能声称未知 fixture 已全部识别；正常“Test camera”帖子仍合格 |
| Auth / RLS / XSS / CSP / 审核边界 | PASS（源码/本地） | middleware、response-security-headers、supabase-server、supabase 迁移目录与依赖/config 相对 c9acc845 无差异；API 写入分支未修改，无 service-role 替代匿名读取。Astro/React 转义、安全 JSON 序列化保留；真实生产 RLS 执行结果 NOT_VERIFIED |
| 详情 GET 副作用 | PASS（已识别） | 有效主帖各页仍 await safeIncrementPostViewCount→increment_post_view_count；兼容参数回退最多两次 RPC 尝试，不能称为只读。新闻详情也沿用浏览计数。无生产详情请求在本轮执行 |

分页修复依据：[Google 分页说明](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading)要求分页各有 canonical，适用于博客评论；[Google 讨论标记说明](https://developers.google.com/search/docs/appearance/structured-data/discussion-forum)另要求多页讨论实体 URL 使用第一页。二者职责不同。本报告纠正先前编译验收将“所有评论页归一到第一页”作为通过条件的错误；旧历史报告不重写。

多页边界仍为 1,000 页/50,000 评论；超过、低行 cap 读不全或请求失败时，保留可读主帖并显示评论暂不可用，分页 API 返回通用错误，不捏造缺失评论。超出实际末页的合法页码可显示空评论/返回链接，没有伪造末页内容。认证用户的私有 pending 内容可能改变交互列表，不能把认证 DOM 当匿名搜索快照。

## 零实际费用与运行准入

仅复用已有 owner/管理快照，未新增 provider/billing 请求，未重试拒绝的端点。**本轮本地工作 PASS；新生产路径的发布窗口准入 NOT_VERIFIED。**

| 项目 | 结果 | 实际证据与放大边界 |
|---|---|---|
| Workers Free 套餐 | PASS（已有快照） | 11 月 2 日 Workers Free Active，Workers Paid 未订阅。较早 0/100,000，后续文章发布窗口 2,392/100,000，显示 billable $0。后者取代前者，均非本次窗口实时余量；其他 Worker 共享消耗、并发/报表延迟后余量 NOT_VERIFIED |
| 新论坛 Sitemap 请求上限 | PASS | 每次调用最多 20 次物理 GET，顺序执行；每批最多 500 行、总候选 5,000、共享 5 秒、单响应 1MB，无重试/重定向跟随。正常批量需 ceil(N/500) 次（空集也需 1 次）；低 REST cap 会增加次数，最多 20。现有动态图仍独立总上限 40 次/10 秒，不把两张图的预算误加成同一 invocation |
| CPU / 内存 | NOT_VERIFIED | 旧 Worker 43ac9bb4 的 15 次调用、错误 0、median CPU 10.03ms、exceeded CPU/memory 0，不是新路由或 5,000 行路径的证据，也不能认定 10.03ms 本身已违反平台限额。没有新路径真实 CPU/峰值堆或持续余量；本地 wall time、有限请求和合成成功均不能替代 |
| Supabase Free | PASS（套餐/收费边界） | owner 快照 organization Free；项目 DB 0.037GB、Storage 0.006GB、egress 0.005GB、cached 0、MAU 8、Realtime peak 4/messages 0、Edge invocations 0；5 张历史发票 $0。这些是项目/历史值，不是组织总量或当前余额。新增公开 Data API 读取无付费 API/新表；每次 exact count 可重复执行数据库计数，HTTP 上限不约束扫描行数/查询 CPU。组织聚合 egress/读取负载/窗口可用余量 NOT_VERIFIED |
| 实际缓存 | NOT_VERIFIED | 源码只有成功响应 public,max-age=300；无 caches.default match/put、持久缓存、新 KV 或已证实 cache rule/hit。不能按每 5 分钟最多执行一次来算预算，必须按每次 cache miss 都重读。普通客户端可能遵循缓存，删除后仍可有缓存/搜索重读延迟；详情资格检查独立保留 |
| 抓取放大 | PASS（有限单次）/ NOT_VERIFIED（实际总量） | R 次未命中论坛子图抓取最多 20R 个 REST 请求，每次调用响应正文总上界 20MB，R 次最多 20MB×R；这是正文上界，不是生产实际 egress。评论 SSR 额外最多 4 GET/次，另有既有主帖/媒体元数据/互动读取及浏览 RPC。JS 浏览器还会访问旧评论 API，实测现有 useCallback 状态变化可初始取两次；不得把 SSR 的 4 GET 当整页总量。真实爬虫频率/重复抓取未知 |
| 错误与资源耗尽 | PASS（应用处理） | 受控论坛图失败=503、no-store、noindex、Retry-After 3600，未返回私密详情或部分 XML；评论读取失败不伪造结果。平台 CPU/内存终止可能返回 Cloudflare 1102，免费日额度不足可能 1027，不能声称 catch 总能转成 503。禁止升级/扩大限额/付费 fallback，不自动重试 |
| R2 / Workers Builds | PASS（本次不触发） | 无 R2/媒体 data-plane 操作、无 hosted build/push/new resource。R2 Paid、其消费/硬停止和 paid Builds 消费未知，不等于 $0；只阻断相关 R2/hosted-build 操作。手工本地构建/媒体隔离验证方案无需补齐无关 R2 账单；不承诺现有全账户账单为零 |

[Cloudflare 当前限额](https://developers.cloudflare.com/workers/platform/limits/)列出 Free 100,000 请求/日、10ms CPU/次、128MB、50 外部子请求、6 并发连接；这些是上限，不是实际余量。[CPU 指标说明](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/#cpu-time-per-execution)解释 rollover 与指标延迟。[Supabase 成本控制](https://supabase.com/docs/guides/platform/cost-control)明确 Free 不收取使用费用；Spend Cap 是 Pro 部分项目控制，owner 看到的 Enabled 不能冒充全账户硬收费上限。组织总量缺失是可用性评估缺口，不虚构 Free 自动超额计费。

## 容量、制品与回滚

- **当前生产规模 NOT_VERIFIED**。清理后保存动态图 70 个唯一 URL（News 7、Guides 9、Devices 24、Circles 5、Posts 0）只是旧广告清单，不能推算论坛候选或全站覆盖率；没有可信现存 N<=5,000 的收据。因此现在不能排除新子图在当前规模即返回 503。
- 上限指 RLS 下 published/moderated + active 父圈子候选，fixture 在读完后才过滤；即使最终合格 URL 少于 5,000，候选超限仍会失败。REST cap C 下还需 ceil(N/min(C,500))<=20 且在 5 秒内完成。count 改变导致安全失败；多次 REST 读取不提供事务快照，等量并发替换不保证同一时刻全集，后续抓取收敛。
- 本地 5,000 行 cap500=10 GET、cap250=20 GET、5,001 拒绝证据有效，但不是当前规模/生产延迟证明。已有 feed/圈子 SSR 链接继续作为辅助路径，继承的翻页修复随本次候选发布；现有生产旧翻页行为不能被说成已修复。
- 分片图是**未来明确容量任务**：真实候选接近阈值（还需并发增长余量）、行 cap/耗时触顶或出现受控 503 时触发；每片和索引都要有限额/费用准入。当前不开发无界扫描/分片后台服务；若当前已超限，只暂停这个发布并按实测另定最小容量方案。
- **正式发布制品 NOT_BUILT**。本轮只构建 loopback 测试产物，构建输入 Supabase=127.0.0.1、SITE_ORIGIN=https://127.0.0.1；生成配置的 Supabase 绑定和编译页面的 canonical 均已确认是 loopback（SITE_ORIGIN 是构建输入，不冒充生成配置中的运行绑定）。不能部署此 dist；旧发布 manifest 也不代表新候选制品。授权后须在冻结准确 SHA 的 checkout 按既有手工构建机制生成正式产物/manifest、核对 production origin 与绑定、保留 --keep-vars；不触发 GitHub 自动构建。
- **回滚机制 PASS；当前目标存在性/绑定兼容性 NOT_VERIFIED**。无 schema/数据迁移/新资源，可使用现有 Worker 版本回滚；执行之前须核对绑定仍存在、当前 active/source 未改变。若收据基线未变，本次应回滚到 **43ac9bb4-f336-4f37-a917-6639acc0ec82**，不是更旧的 f5ab8d21。后者仅是上一轮保留目标。
- 后续独立授权方案使用现有生成制品部署命令 `node node_modules/wrangler/bin/wrangler.js deploy --config dist/server/wrangler.json --keep-vars`；异常时仅在该授权涵盖回滚且目标已核对时，使用 `node node_modules/wrangler/bin/wrangler.js rollback 43ac9bb4-f336-4f37-a917-6639acc0ec82 --name lensden --yes`。命令仅供审查，均未执行；不得将此文档视为授权。[Cloudflare 回滚限制](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)仍适用，版本回滚不撤回数据库记录或外部缓存。

## 测试与证据收据

| 证据 | 结果 / 复用范围 |
|---|---|
| `artifacts/qa/public-discovery-v1/tests.log` | 继承 **27/27 PASS**；源码未变的资格/边界/旧翻页/监测测试复用，没有重跑无关全站套件 |
| `artifacts/qa/public-discovery-v1/canonical-red.log` | 新定向回归修复前 **1 FAIL**，证明所有评论页指第一页缺陷；不是测试运行失败被忽略 |
| `artifacts/qa/public-discovery-v1/canonical-green.log` | 修复后相关 SEO 单测 **10/10 PASS**：页 2/1000、页 1/无效参数、重复参数按路由首值、locale/tracking、非帖路径、默认 sitemap 策略不变 |
| `artifacts/qa/public-discovery-readiness/build.log` | **PASS**，既有 build-workers --local-config，OS 白名单环境、loopback 服务端/客户端配置，telemetry/远端 CF fetch 关闭；无 provider 凭据继承，无正式生产构建 |
| `artifacts/qa/public-discovery-readiness/rendered-receipt.json` / `rendered.log` | 最终源码编译 Worker **PASS**：11 组断言、24 次有限本地 HTTP，页 2 canonical/og:url、讨论根 URL、可见唯一锚点和上一页根 URL；SSR/Hydration/XSS、原四类页面、旧翻页、容量/失败路径；JS-off 390/430px 无横向溢出 |
| `artifacts/qa/public-discovery-readiness/type-ratchet.log` | **PASS**：15 既有诊断、new0、changed diagnostic source lines0；基线177未放宽，不称为全仓类型零错误 |
| `artifacts/qa/public-discovery-readiness/source-receipt.json` | 输入/修复候选完整 SHA、5 个代码/测试文件 SHA-256、loopback 配置及实际 HTML canonical 断言；绑定当前最终本地证据，不作生产制品证明 |
| `artifacts/qa/public-discovery-readiness/inherited-rendered-receipt.json` | 修复前的旧编译收据已保存，不将其中错误 canonical 断言沿用为正确依据 |
| `artifacts/qa/geo-publish/deployment-receipt.json` / `worker-metrics-ui.txt` / `cleanup-live-3.txt` | 仅复用已确认生产源、旧指标、旧广告数量；无本轮生产请求。套餐/usage 补充来自 owner 11 月 2 日证据及已保存发布报告 |

最终编译收据 externalAttempts=0、productionRequests=0、productionWrites=0、r2Operations=0、deployments=0、remotePush=0。7 次既有 view RPC 由本地合成拦截器处理；1 次只读删除占位 RPC 同样本地拦截，没有生产写入。git diff --check PASS。

## 唯一下一步与最小后续授权边界

**NEXT_SINGLE_ACTION：Owner 提供或单独授权一次有界、只读的发布窗口准入快照；现在不批准部署。**

该次快照仅补实际缺口：现有 Workers Free/未开 Paid 状态与账户共享日请求/CPU-错误视图、当前 active Worker/source 与可回滚版本 metadata；Supabase Free 状态，已有组织 Usage 可用余量若可见则记录（不可见仍不得填 0）；以及论坛 published/moderated/active-circle **候选总数**。若后台无现成计数，仅在另获明确生产读取授权后，一次匿名 HEAD/count:exact、无记录正文的同条件 posts 查询（5 秒、1 次、无重试、无媒体）可确认 N；未在此执行。计数查询仍消耗数据库资源，先按已确认 Free 状态准入；不能伪装零资源操作。

候选未部署，**不存在一次当前生产只读查询能证明新代码生产 CPU**。不能循环要求预先取得不存在的指标，也不能用旧指标宣告通过。若窗口套餐/请求与规模证据适用，剩余 CPU/实际缓存/新路由 RLS 需 Owner 另外明确选择是否授权“带停止/回滚条件的受控验证发布”；这不是当前已准入的正式发布。

该后续待审范围应冻结 acf9d156（或包含它且只有本报告/状态文档差异的后代），独立允许正式本地构建、一次手工激活、元数据读回及有限检查：索引 1 次、论坛图 1 次、经 owner 确认的无媒体公开帖页 1 与真实续页各 1 次（有续页才取），已有 Free Metrics 一次读回/普通流量观察，不为获得好结果重试。HTML 客户端不执行 JS、不跟资源/媒体/头像，**两个帖子详情 GET 的既有浏览计数 RPC 必须明确获准**；若只允许零写，省略详情验证并保持该项 NOT_VERIFIED，不能称为完整验收。图与索引读取不含此 view RPC。

失败停止条件：源/绑定/套餐变化，当前规模超限或余量不足，子图 503/部分图/错误 origin、私密哨兵/审核内容暴露、交互重大回归或资源超限。停止增加流量，在独立授权且目标已核对时回滚，不提高限额、不加付费能力。正式无障碍长期覆盖和运行余量仍需普通流量指标，有限检查不提供未来增长保证。

无需重复 GSC/Bing 注册/逐 URL 申请收录；未知 fixture、真实 Googlebot/Bingbot/OAI-SearchBot、Google/Bing 收录或 AI 引用仍 **NOT_VERIFIED**，但这些单独不构成代码发布失败。不得为获得 PASS 降低 Cloudflare 安全规则。无额外内容清理、文章发布或 IndexNow 推送请求。

```text
TASK=LENSDEN_PUBLIC_DISCOVERY_V1_RELEASE_READINESS
REVIEWED_INPUT_COMMIT=4843559f6c5f921b12c453e18ad81363cc897a36
SOURCE_COMMIT=acf9d1560f9fb3bec52d83545852536655ad6c72
WORKTREE_CLEAN=true
INHERITED_FIX_PRESERVED=PASS
CODE_REVIEW=PASS
FORUM_SITEMAP_CAPACITY=NOT_VERIFIED
COMMENT_PAGINATION_SEO=PASS
PRIVACY_AND_RLS_BOUNDARY=PASS
TEST_CONTENT_CLASSIFICATION=NOT_VERIFIED
CLOUDFLARE_FREE_ADMISSION=NOT_VERIFIED
SUPABASE_FREE_ADMISSION=PASS
CACHE_EVIDENCE=NOT_VERIFIED
RUNTIME_COST_RISK=NOT_VERIFIED
PRODUCTION_SOURCE_COMPATIBILITY=NOT_VERIFIED
RELEASE_ARTIFACT_STATUS=NOT_BUILT
ROLLBACK_READINESS=NOT_VERIFIED
PRODUCTION_DEPLOYMENT_AUTHORIZED=false
PRODUCTION_WRITES=0
DEPLOYMENTS=0
REMOTE_PUSH=0
OWNER_APPROVAL_REQUIRED=true
DECISION=HOLD_MISSING_COST_EVIDENCE
NEXT_SINGLE_ACTION=OWNER_PROVIDE_OR_AUTHORIZE_ONE_BOUNDED_READ_ONLY_ADMISSION_SNAPSHOT
```

PASS 的权限/审核边界结论是本地源码及定向执行范围，未知生产执行/未知 fixture 不被该字段覆盖。SUPABASE_FREE_ADMISSION=PASS 仅适用已报告 Free 下无付费 fallback 的公开数据库读取收费边界，不表示组织聚合余额或未来整站成本已证明。
