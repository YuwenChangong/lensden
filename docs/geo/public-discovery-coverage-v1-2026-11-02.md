# Lensden 公开内容自动发现覆盖 v1 — 本地实施完成，未部署

已在 `codex/public-discovery-coverage-v1` 完成本地实现。基线 `4e636573` 是当前分支祖先，
其翻页及日期修复完整保留。发布收据记录的 Production 仍为应用 `c9acc845` /
Worker `43ac9bb4-f336-4f37-a917-6639acc0ec82`；本轮没有重新核验云端部署，也没有
使用旧发布授权。新功能及 `4e636573` 均未由本轮部署。

## 覆盖与资格矩阵

共同规则：匿名客户端、不转发会话、不使用 service role；公开页面无需登录，规范域名
`https://lensden.net`；robots允许三种搜索爬虫，错误/私有页面noindex。表内是源码及
本地编译结果，不代表当前搜索引擎收录。Comments是父讨论页的内容，不是独立文章。

| 类型 | 规范 URL、权威公开资格 | 匿名正文、内部链接 | Sitemap | 结构化数据 | 隐藏/删除及测试排除 |
|---|---|---|---|---|---|
| News | `/news/{canonical-slug}/`，status=published；既有旧slug映射 | SSR全文；新闻列表/分页链接 | 既有动态图，发布/撤回后重新读取状态 | Article，真实已知日期 | 非published不入图/公开详情；无证据支持新增资讯测试分类 |
| Guides | `/guides/{slug}/`，非draft；英文图要求有效published_at | SSR全文；英文文章自动列表，中文推荐入口仍策划维护 | 既有内容图；正常源码发布后生效 | Article；明确lastUpdated才输出修改日期 | draft不入图，详情404；无新增内容写入 |
| Devices | `/products/{brand}/{slug}/`，publication_status=published、已知品牌 | SSR公开设备资料/来源；品牌与设备链接 | 既有动态图 | Product；保留证据约束，不伪造报价/评分 | 非published不公开；不以未证实规格更新时间作lastmod |
| Circles | `/circles/{slug}/`，status=active，既有公开规则 | SSR介绍与公开帖子卡片；圈子列表链接 | 既有动态图 | 既有站点级标记；不把圈子伪装为单篇讨论 | 非active不公开；明确QA圈子UUID/slug加入本地排除清单，改名也不能绕过已知身份 |
| Posts / Discussions | `/posts/{UUID}/`，status和moderation_status均published，父圈子active且合格 | 原有主帖SSR；新增严格父链/分类检查。保留latest完整翻页及SSR卡片 | **新增独立`/sitemap-forum.xml`**，不按年龄/浏览/点赞/评论数排除 | 对有真实公开作者、有效日期和可见全文的用户讨论输出DiscussionForumPosting；论坛news类、缺作者/日期或纯媒体页不硬凑标记；仍有普通发现资格 | 草稿/私密/删除/隐藏/审核拒绝、非公开父链、精确已分类fixture均排除；详情404/noindex，无讨论标记 |
| Comments | 父帖URL加真实页码/`#comment-{UUID}`；评论和主帖均审核公开、父圈子公开 | **新增匿名SSR每页50条**及前后页链接；JS禁用也有正文。原交互岛可见后接管同页 | 随规范父帖被发现；片段/分页变体不单独广告 | 仅当前页真实公开评论；正文、作者、日期、可见父评论引用与HTML一致 | pending/hidden/deleted/rejected正文不进入SSR/标记；未知或隐藏父引用清除，公开子回复保留。已分类评论按精确ID排除 |

公开合法普通帖默认合格，不需要人工 SEO 白名单或逐篇提交 URL。`question` 标签本身
不足以证明页面符合 QAPage 条件，因此没有添加 QAPage。Google要求讨论标记有公开作者、
发布日期及正文/媒体，并与可见内容一致；不满足时省略标记而非伪造事实。
[Google官方讨论结构化数据要求](https://developers.google.com/search/docs/appearance/structured-data/discussion-forum)。

**Production覆盖数量**：复用21:19 NZDT清理后的保存动态图，70个唯一URL，其中News7、
Guides9、Devices24、Circles5、Posts0。其余为公开入口/资料页。这只是已广告清单，
不是合格页总量或收录数。生产合格帖子、评论总量及全站覆盖百分比 **NOT_VERIFIED**。
旧生产帖子只有feed/圈子发现路径，存在上轮已修正但未部署的翻页边界；评论正文依赖CSR。
本地正常样本帖子2/2进入独立图，52条公开评论跨两页完整读取；这是合成数据结果。

## 本轮实现与边界

- `forum-discovery.ts`：共享帖子资格、有限额匿名读取、评论分页/父引用清洗。
  `sitemap-forum.xml.ts` 独立预算，`astro.config.mjs` 在现有索引增加该子图，原动态图
  不增加论坛查询；robots已有索引入口，无验证文件、DNS/WAF或后台任务变更。
- 独立图最多5,000条**候选**、每批至多500、最多20次物理GET、5秒截止，每个REST响应
  至多1MB。请求数/条数/字节/时间、非法UUID、重复或变化计数、缺失计数和读取错误均
  受控；不足以读完时503/no-store/noindex，不给部分成功图、不回传后端错误。
  服务端行cap较小时也按实际长度续读；若20次仍不足则安全失败。已测cap250时5,000条
  正好20次，正常500批量编译测试为10次。大于5,000候选不会静默只广告前5,000条。
- 成功图 `public,max-age=300`，不声称已建立边缘缓存或缓存命中。状态改变后新鲜读取会
  排除记录；现有缓存及搜索引擎重读仍可有延迟。无主动purge、KV/R2/Queues/D1/cron。
- 评论每页50条及1条lookahead，独立最多4次GET、5秒、每响应1MB，最多1,000页/
  50,000条评论/帖。低服务端cap或超出总量时不静默截断；主帖保留，评论显示暂不可用。
  新分页交互API失败也隐藏后端错误；旧写入/权限检查不变。分页不把局部子回复数伪装成
  全量数字。认证用户仍沿用原有owner-pending/管理投影与权限过滤。
- `PublicComments.astro` 使用既有评论样式和HTML转义；React岛继续client:visible，
  hydration前保留SSR正文，接管后不重复显示。隐藏/页外父引用不进入新公开响应。
  现有删除评论的无正文占位投影保留；SSR不读取删除正文或内部审核/用户安全表。
- JSON-LD继续安全序列化，主帖全文和当前页公开评论与HTML一致；不填不可靠dateModified、
  总评论数、点赞/访问统计、虚构作者或评价。作者只取匿名RLS允许的display_name/username；
  缺少真实公开名称就省略相应标记。新标记不加入账号ID、邮箱、角色或内部审核字段。

**测试分类的最小设计**：`discovery-exclusions.ts` 仅保留已有收据确认的5个帖子身份和
3个圈子身份/原slug，评论清单目前为空。每次新增需身份/来源证据及代码review，可精确
撤回，不改变普通发布流程、作者和审计记录；没有数据库列或生产迁移。帖子、圈子、feed、
SSR评论、相关公开评论API及新图使用该分类。没有扩大既有RLS测试名称规则；正常包含
“Test camera”的公开讨论通过测试。**未知/未分类测试数据的存在性NOT_VERIFIED**，
不能用内容关键词推断所有fixture。未来若要编辑器内分类，应另行评审权威字段/管理流程。

**账号封禁**：现有user_safety封禁限制写入，不等于自动撤回其全部历史内容；这类私人
状态不允许匿名读取，本轮不绕过。内容是否仍公开继续服从内容审核与父链状态；需要撤回
的违规内容应通过原审核流程改状态，不能在SEO代码中擅自新增“封号即删历史”政策。

## 实测结果与证据

| 检查 | 结果 / 本地证据 |
|---|---|
| 定向单元/回归 | **27/27 PASS**；`artifacts/qa/public-discovery-v1/tests.log`。含新/旧低互动帖、各类非公开状态、已分类fixture、评论翻页/环/父链、XSS、传输边界、计数变化/超限、旧SEO和离线监测 |
| 原评论公开父链约束 | **PASS**；`comment-boundary.log`，既有RLS迁移未修改。SDK匿名路径与完整父链政策来自源码；没有把合成测试当生产RLS实测 |
| 实际编译Worker | **PASS**；`rendered-receipt.json` / `rendered.log`。公开帖2/2、评论52条分两页、主帖稳定canonical、语言参数不改变规范URL、被排除详情404/noindex、四类原页面/图回归、图索引第三入口、5,000最大量与超限503、错误无私密哨兵 |
| JS/移动端 | **PASS**；禁用JS的390/430px正文、评论和页码可读，无横向溢出；启用JS同页接管无重复/XSS执行。`post-390.png`、`post-430.png`已查看；本轮只使用本地合成数据 |
| 构建 | **PASS**；`build.log`，现有构建命令+loopback配置+出站guard；当前ignored dist是本地测试产物，不能作为Production制品 |
| 类型诊断 | **PASS**；`type-ratchet.log`：15个既有诊断、new0，比上轮17减少2。对碰到的feed SDK fallback联合类型作了准确的单行关系类型声明；未改基线/放宽规则 |

运行方式沿用既有环境抑制telemetry、网络guard及本地配置，日志保留于上述目录。
`node --test scripts/test-public-discovery.mjs scripts/test-seo-geo.mjs scripts/test-forum-feed-discovery.mjs scripts/test-geo-monitor.mjs scripts/test-discovery-coverage.mjs`；
编译后 `node scripts/test-public-discovery-rendered.mjs`。没有重跑无关发布/域名/完整负载流程。
浏览器测试曾发现SSR插槽需实体容器才能触发client:visible，修正后最终验证通过，未降低CSP。
本地既有view RPC只由模拟器拦截；没有向生产发出HTTP、SQL或RPC写入。

## 持续监测、NOT_VERIFIED与成本

[离线覆盖流程](monitoring/discovery-coverage.md)及 `scripts/discovery-coverage.mjs` 已实现：
输入真实资格快照和保存的XML，按类型输出资格数、广告数、missing/未匹配集合；评论单列
父帖广告情况。部分样本明确标注不完整，收录/爬虫/AI引用默认NOT_VERIFIED，不用Sitemap
数量代替收录数。保留原20查询、GSC/Bing真实导出、原因和AI引用证据流程，不新增付费API。

剩余 **NOT_VERIFIED**：生产当前合格内容总数/覆盖率、live RLS与行cap的本轮读回、真实
Googlebot/Bingbot/OAI-SearchBot访问、GSC/Bing收录/未收录原因、实际AI引用、未知fixture、
新路径在Workers Free的CPU及共享请求/数据库egress余量。复用上轮Cloudflare策略快照：
Fight Mode及AI/搜索拦截保护关闭，security medium/browser check开启；不能据此证明真实
爬虫通行，不重试限流监控/账单接口，不创建WAF例外。

**成本边界**：本轮仅本地计算/合成数据及官方文档读取，无新服务、依赖、数据库/媒体操作、
付费fallback、通知或后台任务。新Sitemap运行读取上限20/次；SSR评论新增至多4个有限额GET。
Cloudflare官方Free额度为100,000请求/日、10ms CPU、50外部请求/次；限制请求数和体积
不等于证明实际CPU和共享账户余量，本地wall time也不是生产CPU。
[Cloudflare官方限额](https://developers.cloudflare.com/workers/platform/limits/)。
因此仅新增生产读取/部署的成本准入保持待审，**不阻断已完成的本地实现**。无需核验无关
R2账单来继续本地工作；本轮R2操作0，不宣称整个账户账单已核实为0。IndexNow保持可选关闭。

## Owner与最小发布步骤

不需要逐篇提交URL，不需要重复验证控制台、提交Sitemap或手动发布任何文章。
唯一下一步：**Owner审核本分支提交及新增运行读流量的零收费准入，决定是否授权一次
受控发布**。没有足够准入依据就仅保持该生产操作HOLD，不改用付费服务。

获独立授权后：从已审提交按既有手工过程生成真实Production制品（不能用当前loopback
dist），保留环境绑定；不push/merge main、不启用自动构建。发布后只做授权的少量索引、
论坛子图、一个主帖及其评论页检查，并用已有普通流量观察CPU/错误。详情GET可能沿用
既有浏览计数行为，须纳入当次授权；本轮未执行。无需重复域名迁移/旧发布验收。

主要修改文件：`astro.config.mjs`，`src/lib/{forum-discovery,discovery-exclusions,seo,
seo-sitemap,site-navigation,forum-feed}.ts`，`src/pages/sitemap-forum.xml.ts`，
`src/pages/posts/[id].astro`，`src/pages/api/forum/comments.ts`，feed页，公开评论SSR组件及
原React评论岛；离线覆盖脚本、定向测试与本报告/当前状态。package/lockfile/迁移未变。

```text
DISCOVERY_COVERAGE=PASS_LOCAL_BOUNDED_PRODUCTION_PENDING
FORUM_POST_SITEMAP=PASS_LOCAL_5000_MAX
FORUM_SSR_CONTENT=PASS_LOCAL_POST_AND_PAGED_COMMENTS
DISCUSSION_STRUCTURED_DATA=PASS_LOCAL_CONDITIONAL
TEST_CONTENT_EXCLUSION=PASS_EXPLICIT_CLASSIFICATION_ONLY
EXISTING_SEO_REGRESSIONS=PASS_LOCAL
CRAWLER_ACCESS_VERIFICATION=NOT_VERIFIED
ZERO_COST_COMPLIANCE=PASS_LOCAL_ONLY_RUNTIME_NOT_VERIFIED
PRODUCTION_WRITES=0
DEPLOYMENTS=0
REMOTE_PUSH=0
OWNER_APPROVAL_REQUIRED=true
NEXT_SINGLE_ACTION=OWNER_REVIEW_RELEASE_PACKET_AND_RUNTIME_COST_ADMISSION
```
