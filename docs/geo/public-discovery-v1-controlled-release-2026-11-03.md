# Lensden Public Discovery v1 — Controlled Production Release Receipt

**DECISION=CONTROLLED_RELEASE_VERIFIED**

2026-11-03。仅完成 owner 在附件 `1e412ff9-4733-4fbe-b24f-44c1e65816da` 明确授权的受控范围；不是全量真实内容/长期性能/搜索收录验收。授权的构建、部署、XML请求及指标读取次数已使用完毕，不作后续操作授权。

## 发布身份与产物

| 检查 | 分类 | 结果 |
|---|---|---|
| 冻结代码源 | PASS | **acf9d1560f9fb3bec52d83545852536655ad6c72**，继承4e636573。实际构建checkout为 **f4b365e1b7f0c2451ae303a52f49f1dc613a2c28**，仅包含已审阅的3个文档路径差异；开始/构建后/上传前工作树clean，无应用代码修改 |
| 发布前核对 | PASS | baseline43ac9bb4、deployment35ed60e2未变；回滚版本168可读，27绑定匹配；Workers Free Active、Workers Paid未启用，账户当日显示1/100,000请求，Workers面板billable$0。复用刚完成的Supabase Free/组织余量证据，未重复候选计数或调用拒绝的billing接口 |
| 唯一正式构建 | PASS | 00:29:02.623Z起，既有build-workers生产配置构建一次成功；OS环境白名单，telemetry/远端CF fetch关闭，出站guard继承至Astro，外部尝试0。不是旧loopback dist，没有重跑历史测试 |
| 产物核对 | PASS | **376文件，8,640,098 bytes**；manifest SHA-256 **7b7c09d97ed1202c848261e8f69b9905673681844bdcb18fe9a8dedd342a5c10**。上传前逐文件hash核对，上传后产物仍一致。origin=https://lensden.net，Supabase生产URL正确，captcha=required；无service-role/secret嵌入 |
| 三篇GEO指南 | PASS | USB-C、XR规格、3DoF/6DoF三个MDX与已部署c9acc845源内容一致、全部包含在编译server内，三个规范URL均在新生产Sitemap出现一次；没有重新发布/改写文章 |
| 手工部署 | PASS | 一次生成制品Wrangler deploy，保留--keep-vars，版本注释绑定acf9d156/文档checkout；无push/merge/hosted build。更新Worker模块及**2个Cloudflare静态资产**（sitemap-index.xml、CommentsSection脚本），不是R2对象操作 |
| 新Worker版本 | PASS | **7b0c94f9-f7ec-4a5b-aa8d-f807a7df0e46**，version169，100%流量；注释与冻结源匹配。script etag=`480474dc8c4a8e5e0a0605f3ae101d3df45ead8dbe6f020517a777e6f0233ab8` |
| 新deployment | PASS | **d23613cb-5298-43f8-89ae-7c51a73fc3c0**；激活 **2026-11-03T00:31:24.248692Z / 13:31:24.248692 NZDT**；新版本active确认后才发出验证请求 |
| 配置/安全/资源 | PASS | 前后27个绑定的API可见元数据一致，秘密值未读取/更新；apex/www、workers.dev/preview、兼容日期/flags、静态安全头/重定向均一致。无资源/套餐/DNS/WAF/安全策略变更；Auth/RLS/审核代码沿用冻结源 |
| 回滚 | PASS：未触发 | 43ac9bb4-f336-4f37-a917-6639acc0ec82仍可用。没有观察到此次部署导致的已验证失败，因此没有执行回滚；未回滚数据库或其他人的部署 |

## 三次生产XML验证

全部为顺序匿名GET、15秒客户端截止、正文上限1,000,000 bytes、redirect=manual、无重试/JavaScript/资源跟随。验证窗口00:35:35.459–00:35:38.028 UTC（13:35:35–13:35:38 NZDT）。仅解析XML，不执行页面脚本或下载媒体。

| URL | 分类 | HTTP / 结果 |
|---|---|---|
| https://lensden.net/sitemap-index.xml | PASS | 200，310bytes，合法sitemapindex，3个子图；论坛子图**恰好一次**，所有loc为正确规范域名 |
| https://lensden.net/sitemap-forum.xml | PASS | 200，107bytes，合法空urlset，**0 URL**；与准入时匿名预过滤count0一致。Cache-Control public,max-age=300；CF-Cache-Status未提供，不能声称命中缓存 |
| https://lensden.net/sitemap.xml | PASS | 200，5,066bytes，**71个唯一规范URL**；历史70条全部保留，removed0；新增1条news URL。三篇正式指南各一次，日期格式有效 |

论坛子图本次实际完整输出：

```xml
<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>
```

新增URL为 `https://lensden.net/news/ar-ai-glasses-weekly-2026-10-27-11-02/`，由既有published-only运行时查询广告；本轮未发布新闻、未读取该详情或正文、未追加数据库扫描。**原70条保留=PASS；精确URL集合未变化=false**，不能把正常新增URL误报为旧内容丢失。

这三份XML未出现受限路径、查询/fragment变体、重复loc或11项已明确分类fixture身份。资格生成沿用已审状态/RLS过滤；没有逐条查询正文或内部审核记录，不据此宣称未知测试内容已全部分类或全量真实内容已验收。

## 唯一一次Free Metrics读回

| 指标 | 分类 | 读回值及范围 |
|---|---|---|
| active/version | PASS | UI显示7b0c94f9，100%流量 |
| 新版本调用 | PASS（小样本实测） | **3次invocations**；不把它们逐一归因于本轮3份XML，也没有额外制造流量 |
| 新版本CPU | PASS（已测值） | active版本 **median10.13ms**；不是子图专属、最大容量或长期余量证明。Wrangler另显示startup20ms，这是启动指标，不能混作请求CPU |
| 新版本错误 | PASS（已测值） | Errors **0**；active error rate0% |
| 资源/关键错误 | PASS（所示窗口） | Last24h/All deployed versions：Exceeded CPU0、Exceeded Memory0、Internal0、Load Shed0、Uncaught Exception0。没有触发本次条件回滚 |
| 历史/全版本指标 | PASS（只记录） | invocations约3.95k，subrequests约5.13k，CPU P50/P90/P99/P999=22.34/47.27/58.97/61.16ms；内存25.49/28.4/29.36/29.42MB；这些**不是新版本专属分位数** |
| 细粒度与长期指标 | NOT_VERIFIED | 新子图专属CPU、实际缓存命中、新版本峰值内存、持续Free CPU/高容量余量；3个样本且指标可能延迟，不重复轮询 |

现有Supabase子请求4xx71仍在全版本历史窗口；原因未扩查，不能自动归因于新部署。静态assets命中94.31%不能代替论坛动态子图缓存。历史CPU分位数或单个median超过名义Free值本身不作为已发生资源超限证据；[Cloudflare指标说明](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/#cpu-time-per-execution)说明指标/rollover及聚合范围。

## 权限、费用与剩余限制

- **生产应用写入PASS：0**。没有帖子/新闻详情GET、浏览计数RPC、文章/fixture发布或恢复、数据库更新/迁移、R2对象/生命周期操作。部署本身是唯一获准的Worker发布管理写入，不能把它称为整次任务“无生产变更”。
- **费用控制PASS（本次已核实Free范围）**：无Workers Paid、付费fallback/hosted build、新付费资源/API、日志/analytics开启或限额上调。只使用原有Free Worker及Free Supabase公开读取；2个静态资产上传属于正常Workers Assets发布。没有为证明费用而反复读取billing或引入额外请求。
- **总账单NOT_VERIFIED**：部署后未追加账单/发票读取；不把发布前Workers面板$0当作已验证的全账户总账单，既有R2 Paid的无关消费也未核查。该未知不代表0，也没有授权任何R2操作。
- **评论SSR/Hydration生产结果NOT_VERIFIED**：本次论坛图为空且严格禁止详情/计数写入，没有创建fixture来凑验收；只继承本地已通过证据。未知fixture、真实搜索爬虫、Google/Bing索引及AI引用、未来容量仍未验证，未重启通用GEO审计。
- **FAIL / BLOCKED：本轮无已确认发布失败或阻塞动作**。不进行追加验证、重复指标读取或下一次部署；本次授权范围已完成。

## 本地证据

`artifacts/qa/public-discovery-release-2026-11-03/`（忽略目录，不提交制品/凭据）：

- `preflight.json`：本次授权摘要/基线/套餐/配额；`build-dispatch.json`、`build-receipt.json`、`build.log`及出站guard。
- `artifact-manifest.json`：完整逐文件SHA-256、生产配置及三篇指南保留结果。
- `deploy-dispatch.json`、`deploy-cli-receipt.json`、`deploy.log`、`deployment-receipt.json`、`post-deploy-compatibility.json`：一次部署及active/绑定/域名读回。
- `xml-1/2/3-dispatch.json`、各自receipt、`xml-validation-receipt.json`及三份原始XML：恰好3次请求，无重试；旧URL全保留与新增项分别记录。
- `metrics-dispatch.json`、`metrics-receipt.json`：一次现有UI读回及明确范围；`release-summary.json`：最终操作计数。

```text
SOURCE_COMMIT=acf9d1560f9fb3bec52d83545852536655ad6c72
BUILD_CHECKOUT_COMMIT=f4b365e1b7f0c2451ae303a52f49f1dc613a2c28
PRODUCTION_BUILD=PASS
PRODUCTION_BUILD_ATTEMPTS=1
DEPLOYMENT=PASS
WORKER_VERSION=7b0c94f9-f7ec-4a5b-aa8d-f807a7df0e46
DEPLOYMENT_ID=d23613cb-5298-43f8-89ae-7c51a73fc3c0
XML_VALIDATION=PASS
XML_REQUESTS=3
FORUM_SITEMAP_URLS=0
EXISTING_SITEMAP_URLS=71
BASELINE_URLS_RETAINED=70
NEW_VERSION_OBSERVED_INVOCATIONS=3
NEW_VERSION_MEDIAN_CPU_MS=10.13
NEW_VERSION_ERRORS=0
METRICS_READBACKS=1
ROLLBACK_REQUIRED=false
ROLLBACKS=0
DEPLOYMENTS=1
APPLICATION_PRODUCTION_WRITES=0
VIEW_COUNT_WRITES=0
R2_OBJECT_OPERATIONS=0
HOSTED_BUILDS=0
REMOTE_PUSH=0
DECISION=CONTROLLED_RELEASE_VERIFIED
```
