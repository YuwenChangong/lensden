# Lensden Public Discovery v1 — Production Admission Receipt

**DECISION=READY_FOR_SEPARATELY_AUTHORIZED_CONTROLLED_RELEASE**

2026-11-03，13:08:16–13:18:33 NZDT（00:08:16–00:18:33 UTC）。本轮单次有界只读授权已完成；**这不是部署授权，也不是发布后验收**。候选固定为 `acf9d1560f9fb3bec52d83545852536655ad6c72`。未改代码、未重跑历史测试、未构建正式制品。

## 准入快照

| 项目 | 结果与真实证据 |
|---|---|
| Cloudflare 套餐 | 订阅页 **Workers Free / Active**；订阅列表无 Workers Paid，并显示 Upgrade to Workers Paid。无升级/账单修改 |
| 共享日额度 | Workers & Pages 账户面板显示 November 3–November 3：**1/100,000 请求**，据显示计数剩余 **99,999**；不是预留或无延迟余额。Observability 0/200,000。此页 billable usage $0.00，不冒充全账户/R2 账单证明 |
| 当前生产 | Worker **43ac9bb4-f336-4f37-a917-6639acc0ec82** / version168 / 100%；deployment **35ed60e2-0390-41a5-98ae-443db14c9a1c**，2026-11-02T06:47:59.621488Z；注释 c9acc845，与保存的完整源 `c9acc8458ab0ae5fd7a5f15bdc622716f205aff7` 发布收据匹配。最新部署/版本列表未发现更新的生产代码 |
| CPU/运行错误 | 现有 Metrics 刷新一次，Last24h/All deployed versions：Invocations **3.95k**、Subrequests **5.13k**、Errors **0**；active43ac9bb4 median CPU **23.15ms**。全版本 CPU 图 P50/P90/P99/P999=22.93/48.41/60.3/62.52ms，不能混作单一路由或新候选指标 |
| 内存/资源事件 | 全版本内存图 P50/P90/P99/P999=25.52/28.54/29.51/29.57MB。Exceeded CPU、Exceeded Memory、Internal、Load Shed、Uncaught Exception 均 **0**。active版本 client disconnects11；全版本 Cancelled61、response stream disconnected0；不是捏造“所有请求均完成” |
| 现有后端/缓存指标 | CF→Supabase 子请求表显示2xx约5k、4xx71、duration259.5ms、cache rate0%；4xx原因未调查，不能直接等同 Worker runtime errors。静态 assets hit94.20%不是动态论坛子图命中率；新子图缓存仍 **NOT_VERIFIED**，只按全部 miss 预算 |
| Supabase 套餐 | 管理连接器确认组织 **free/tier_free**，Lensden **ACTIVE_HEALTHY**；UI Free/Nano/Healthy。未加资源、未开付费 fallback |
| 组织用量 | Usage明确 **All projects**，周期Oct7–Nov7，显示本周期未超Free额度，更新可延迟1小时。摘要：egress **0.007/5GB**、cached egress **0/5GB**、storage **0.007/1GB**、MAU9/50,000、Realtime peak4/200、messages0/2,000,000、Edge Functions0/500,000。Logs现有用量ingestion0.207/1GB、query0.153/100GB；未启用日志服务 |
| 数据库指标 | Lensden **35.07MB**，Free0.5GB/项目；组织摘要数据库0.037GB是该指标摘要/最大项目值，不把它伪装成所有项目大小之和。项目概览：CPU3%、Disk21%、RAM55%、connections12/60。未把磁盘总利用率21%与计费数据库配额混同 |
| Data API 指标 | 现有项目概览 Last60min（Nov3 12:14–13:14 NZDT）：总63请求，success100%；API Gateway53、Postgres6、Auth4，对应 warnings/errors均0。初始加载占位0不作为证据；只记录加载后结果。查询计划、扫描行数及未来峰值仍 **NOT_VERIFIED** |
| 论坛候选 | **精确计数=0，排除 fixture 之前**。一次匿名 HEAD，200、Content-Range `*/0`、Preference-Applied `count=exact`；00:12:05.768–00:12:07.051 UTC，1,281ms。无正文、无重试、无翻页、无service-role |

计数使用与 `readForumSitemapRows` 相同 select/inner-parent 路径及条件：

```text
posts.status = published
posts.moderation_status = published
circles:circle_id!inner(...).status = active
role = anon; Prefer: count=exact; HEAD; offset=0; limit=1
deadline=5000ms; redirect=manual; retries=0; recordBodiesRead=0
```

这是 **当前匿名 RLS 下实现会读取的预过滤候选数**，不表示数据库没有历史/私密帖子，也不代表所有测试内容已分类。0低于5,000，因此没有当前规模超限的证据；正常空图仍执行一次 REST 读取。HEAD不测行cap或正文大小，不能用其1.28秒推算 Worker CPU、5,000条性能或未来增长容量。不再执行第二次计数。

## 发布源、绑定与回滚

- 当前不可变版本与既有部署收据一致；c9acc845是acf9d156祖先，4e636573亦保留。相对基线，既有Auth/RLS/CSP、Supabase迁移、package/lock、wrangler配置及静态安全头/重定向源未改。没有发现会被覆盖的新生产代码。
- 当前与先前保留版本f5ab8d21的27个绑定描述及API可见配置一致；未读取秘密值。SESSION namespace、R2 binding标识、Worker名、兼容日期、canonical origin与候选配置吻合。AUTH_CAPTCHA_MODE当前required；SITE_ORIGIN=https://lensden.net。已启用apex/www域名和原workers.dev/preview设置保留。
- 当前已部署静态安全头及重定向规则与**既有本地候选测试制品**一致。public/_headers原文件不含构建自动附加的/_astro不可变缓存段，因此原文件和部署raw文本不能直接称为字节相等；原安全头均保留。没有重新构建。新正式制品仍须在独立授权后生成并核对。
- 本次受控发布的回滚目标是 **43ac9bb4-f336-4f37-a917-6639acc0ec82**（当前active、元数据读取成功），不是更旧的 **f5ab8d21-8aa6-4b32-a33f-22899c73d3cf**；后者也仍可读取、为version167。无新schema/资源/DO迁移使版本回滚复杂化。未进行回滚测试或R2/KV data-plane探测。
- 后续使用既有 `--keep-vars` 手工机制保留绑定/环境；不得更改路由、DNS/WAF或安全配置。未重做全区WAF审计；Worker代码发布不会被授权修改这些外部规则。若执行前active/source/配置发生变化，停止核对，不能盲目覆盖。

## A–D 判断

**A. 现有证据支持的安全范围**：免费套餐未变、当前共享额度/组织用量未超限、实际论坛候选0、生产源一致、回滚元数据可用；支持下一次明确授权的手工激活及下述最多三次XML读取。没有新增依赖/服务、付费构建、R2对象操作或付费API。

**B. 不独立阻断的未知项**：真实Googlebot/Bingbot/OAI-SearchBot、索引/AI引用、未知fixture、查询扫描成本、未来增长及细粒度新路由缓存命中。没有把这些填0或当成代码失败。4xx71的原因未知；最近60min项目概览和Worker资源事件未显示当前故障证据。

**C. 受控发布才可验证的风险**：新代码真实CPU/内存、真实子图HTTP结果与新路由RLS执行、动态缓存及爬虫重复抓取放大。当前CPU高于名义Free10ms，不能宣称有稳定CPU余量；但平台[rollover/指标规则](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/#cpu-time-per-execution)及当前0 exceeded事件不支持仅凭分位数判定已发生资源失败。采用有限验证/停止/回滚，不要求未部署代码预先产生指标，不升级掩盖问题。[Supabase Free收费边界](https://supabase.com/docs/guides/platform/cost-control)与当前Usage未计overage的说明适用公开读取；不是用Spend Cap标签担保所有服务。

**D. 实际阻塞证据**：本轮未发现。若后续出现套餐变化/不足、版本漂移、超限计数、配置不兼容或实际资源错误，再按具体风险HOLD。R2 Paid仍存在且未核验其账单/余量；只禁止相关R2操作，不把它扩展为本次无R2方案的全局阻塞。静态缓存高命中不能替代动态预算。

## 待另行批准的最小受控发布方案（未执行）

1. 冻结 **acf9d1560f9fb3bec52d83545852536655ad6c72**，或仅有本收据/状态文档差异的后代；继续独立分支，不push/merge、不触发GitHub/Cloudflare Builds。一次发布前active/source元数据读回须仍匹配43ac9bb4；若套餐/绑定/路由状态已改变或快照已不适用，停止，不擅自扩大准入。
2. 仅在新授权内做**一次正式本地构建**，沿用现有build-workers机制，核对生产origin、完整源SHA、manifest及原绑定；不部署当前loopback dist，不新建资源/安装付费依赖，不重跑历史整套测试。构建或工具要求创建资源/升级时停止。
3. **一次**既有手工部署：`node node_modules/wrangler/bin/wrangler.js deploy --config dist/server/wrangler.json --keep-vars`。保存新version/deployment/source关联，读回一次active版本与流量分配。此次授权目前不存在。
4. 最多 **3次顺序匿名XML GET**：`https://lensden.net/sitemap-index.xml`、`https://lensden.net/sitemap-forum.xml`、`https://lensden.net/sitemap.xml`；每次15秒客户端截止、正文上限1MB、不重试、不跟重定向/资源、不运行JS。索引应含一次新子图；当前无正常发布改变时论坛图应200且合法空urlset；旧图规范域名/资格不得退化。若出现意外非空结果，先核对普通发布变化，不凭猜测判断泄露或追加扫描。
5. 现有Free Metrics一次读回，按新version/部署时间区分历史错误，普通流量观察；不生成额外请求凑CPU样本，不开logging/paid analytics。指标延迟/路由样本不足即NOT_VERIFIED，不轮询求PASS。验证不保证长期高负载或搜索收录。

**帖子详情与写入的精确边界**：当前候选0，没有可证明合格的真实帖子用于详情验收。上述三次XML验证不请求帖子/新闻详情，预期view-counter RPC **0**；不创建、恢复或发布fixture。评论SSR/Hydration的生产验收保持NOT_VERIFIED，沿用已通过本地证据。若Owner后续提供已有合格真实帖子并要求详情/续页验证，必须在**单独授权扩展**中明确最多2次详情GET（有真实续页才取），允许其既有increment_post_view_count、每GET最多2次兼容RPC尝试；可能产生浏览计数写入，绝不包装为只读。HTML客户端仍不取媒体/头像、不运行JS。此次快照未触发任何这些写入。

**停止/回滚条件**：源/套餐/绑定不符；构建/上传需额外资源或付费能力；XML超时、503/部分图、错误canonical origin、已确认非公开内容/已分类fixture泄露；新version实际exceededCPU/memory、未处理异常或明显功能回归。停止额外流量，在另行授权涵盖回滚且active仍是本次新版本时，回滚至43ac9bb4：`node node_modules/wrangler/bin/wrangler.js rollback 43ac9bb4-f336-4f37-a917-6639acc0ec82 --name lensden --yes`。不盲目回滚其他人的后续版本，不回滚数据库/作者历史，不提高限额或改安全策略。CPU分位数单独偏高、历史4xx、指标延迟或无帖可验不自动冒充资源错误。

## 收据与操作计数

忽略目录 `artifacts/qa/public-discovery-admission-2026-11-03/`：

- `forum-count-dispatch.json`、`forum-count-receipt.json`：先落唯一dispatch哨兵，再HEAD；状态/计数/截止/正文缺失/一次请求证明，不保存API key。
- `management-metadata.json`：本轮Cloudflare版本/域名/绑定脱敏元数据及Supabase组织/项目元数据。
- `dashboard-observations.json`：上述已加载UI数值、各自范围/时间窗/来源页面与延迟限定；不是原始账单/完整API流量导出。
- `source-compatibility.json`：静态头/重定向现有制品比较与源/绑定对应范围；不是新Production构建或部署证明。

直接连接器调用：Cloudflare7次GET管理读取；Supabase3次组织/项目/公开key管理读取；匿名数据面仅**1次HEAD精确计数**。管理UI内部网络请求数未单独计数；仅有限导航/一次指标刷新，无脚本轮询。没有生成应用流量来产生指标。公共anon key只用于该项目指定请求，未使用service-role、未保存或输出key值。

```text
TASK=LENSDEN_PUBLIC_DISCOVERY_V1_PRODUCTION_ADMISSION_SNAPSHOT
SOURCE_COMMIT=acf9d1560f9fb3bec52d83545852536655ad6c72
CLOUDFLARE_FREE_ADMISSION=PASS_FOR_BOUNDED_CONTROLLED_RELEASE
SUPABASE_FREE_ADMISSION=PASS_FOR_BOUNDED_CONTROLLED_RELEASE
FORUM_CANDIDATE_COUNT=0
ANONYMOUS_EXACT_COUNT_REQUESTS=1
PRODUCTION_SOURCE_COMPATIBILITY=PASS
ROLLBACK_METADATA=PASS
NEW_ROUTE_RUNTIME_CPU=NOT_VERIFIED
NEW_ROUTE_CACHE_HITS=NOT_VERIFIED
PRODUCTION_DEPLOYMENT_AUTHORIZED=false
APPLICATION_HTML_XML_REQUESTS=0
PRODUCTION_WRITES=0
PRODUCTION_BUILDS=0
DEPLOYMENTS=0
REMOTE_PUSH=0
R2_OBJECT_OPERATIONS=0
DECISION=READY_FOR_SEPARATELY_AUTHORIZED_CONTROLLED_RELEASE
NEXT_SINGLE_ACTION=OWNER_SEPARATELY_AUTHORIZE_EXACT_CANDIDATE_CONTROLLED_RELEASE_WITH_THREE_XML_CHECKS_AND_ZERO_DETAIL_VIEW_RPCS
```
