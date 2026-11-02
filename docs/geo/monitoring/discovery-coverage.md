# 公开发现覆盖监测：离线快照

不逐篇申请收录，不重复提交 Sitemap。保留现有 `test-queries.csv` 的20条查询、
`observations.csv`、`import-exports.md`；本工具不发出任何网络请求。

1. 从已有、获授权的公开资格快照/导出生成 `eligible.json`：只放明确符合公开条件的
   规范记录，保留真实快照日期和完整性声明；不放正文、账号资料、凭据或私密记录。
   `type` 允许 `news/guides/devices/circles/posts/comments`。
   评论使用真实可见页的 `?comments_page=N#comment-UUID` 链接，首屏省略查询参数。
   `complete=false` 表示部分样本，不能据此推算全站覆盖率。

   ```json
   {"asOf":"实际快照的 ISO 日期或时间","complete":false,"records":[]}
   ```

   每条记录形如 `{ "type":"posts", "eligible":true, "url":"真实规范URL" }`。
   示例是格式模板，不是生产数据。数据源须按已发布/审核公开/公开父链/明确分类排除
   生成资格集合；不要把 Sitemap 自身复制成资格清单来证明它完整。

2. 使用已经获准保留的静态、动态及论坛 **urlset** XML 文件；不传 sitemap-index。
   本工具不下载缺失文件、不访问数据库，不扫描文件中引用的链接。

   ```powershell
   node scripts/discovery-coverage.mjs https://lensden.net eligible.json sitemap-0.xml sitemap.xml sitemap-forum.xml
   ```

3. 检查 `missing`、`unmatchedAdvertisedWithinObservedTypes`、重复 URL 及各类型数量。
   未匹配项是供审核的集合差异，不是自动删除名单；部分清单、资料页、资格改变、缓存
   时差都要先核实。评论通过父帖广告统计 `parentAdvertisedObserved`，不要求评论片段
   独立进入 Sitemap，也不把父帖在图中视为评论 SSR 已通过验证。
   输入上限：20,000条资格记录、5MB JSON，最多10个各10MB的 XML；更大清单按类型
   分批离线处理，不静默截断。CLI 输出仅为所提供快照的计数与差异。

4. 周度或正常内容批次后合并真实控制台导出：Google Page indexing 的收录数与未收录
   原因、Sitemaps读取错误，Bing Site Explorer/抓取与索引报告。按原始日期、属性、URL
   和原因保存证据；沿用已有 `import-exports.md`。广告 URL 数不是已收录页数。
   对 `missing` 优先查公开状态、父圈子、原始 HTML、canonical、分页/容量错误；只对
   异常做调查，不要求每篇内容手动申请索引。

5. 真实 Googlebot/Bingbot/OAI-SearchBot 结果只采纳已有合法日志/控制台证据，记录
   已验证来源、URL、时间、状态/挑战和样本范围。仅 User-Agent 字符串或 robots Allow
   不足以证明真实爬虫通过。证据缺失保持 `NOT_VERIFIED`，不降低安全规则来取 PASS。

6. AI 引用记录保留查询、平台、观察时间、答案原文链接/截图和被引规范 URL。
   保留手动观察、真实引用数和 referral 的区别；没有证据就留空/NOT_VERIFIED，
   不把20条查询的小样本推广成全站引用率。IndexNow继续关闭，无定时任务或外部推送。

实际 GSC/Bing 收录、爬虫成功数和 AI 引用不会由覆盖 CLI 推导；它们默认 NOT_VERIFIED。
