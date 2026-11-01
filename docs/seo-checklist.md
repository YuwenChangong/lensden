# Lensden — SEO 发布与监控清单

> 历史记录：以下为 2026-05-17 的 Pages 上线检查结果与当时的操作步骤，不是当前生产指引。当前生产地址及 Sitemap 请参阅 [Search Console 上线检查清单](/about/search-console-launch-checklist/)。

> 最后更新: 2026-05-17
> 目标站点: https://openglasshub.pages.dev

---

## 一、技术 SEO 验证结果

| 检查项 | 状态 | 说明 |
|--------|------|------|
| Site URL (openglasshub.pages.dev) | ✅ PASS | astro.config.mjs site 字段正确 |
| 无旧域名引用 (openglass.gaze.dev) | ✅ PASS | dist 中无残留 |
| Canonical URL | ✅ PASS | 所有页面 canonical 指向正确域名 |
| Sitemap (sitemap-index.xml) | ✅ PASS | 构建时自动生成 |
| robots.txt 指向 Sitemap | ✅ PASS | Sitemap: https://openglasshub.pages.dev/sitemap-index.xml |
| Favicon (gaze-icon-v6) | ✅ PASS | .ico / .svg / .png 全部引用 |
| 无 /favicon.svg 引用 | ✅ PASS | dist 中无残留 |
| html lang="zh-CN" | ✅ PASS | Starlight locale 配置 root: zh-CN |
| Title 标签 | ✅ PASS | 所有 20 个页面均有 |
| Meta Description | ✅ PASS | 所有页面均有 |
| Open Graph (og:title/desc/url) | ✅ PASS | 所有页面均有 |
| 结构化数据 (LD+JSON) | ✅ PASS | 首页 WebSite Schema |
| Pagefind 搜索索引 | ✅ PASS | 检测到 zh-cn，19 页已索引 |
| 404 页面 | ✅ PASS | dist/404.html 存在 |
| 无 href="#" 占位链接 | ✅ PASS | dist 中无残留 |
| 无假 Discord/微信链接 | ✅ PASS | 不可点击的 `<span>` 标记 |
| 路由完整性 | ✅ PASS | 6 个主路由全部存在 |

---

## 二、Google Search Console 提交清单

### 2.1 验证方式（推荐 HTML Tag）

Cloudflare Pages 无服务器端，使用 **HTML Tag 验证**最简单：

1. 打开 [Google Search Console](https://search.google.com/search-console)
2. 添加资源 → 网址前缀 → 输入 `https://openglasshub.pages.dev`
3. 选择 **HTML 标记** 验证方法
4. 复制 `content="xxxxxx"` 中的验证码
5. 在 `astro.config.mjs` 的 `head` 数组中添加：
   ```js
   {
     tag: 'meta',
     attrs: {
       name: 'google-site-verification',
       content: 'YOUR_CODE_HERE',
     },
   },
   ```
6. 重新构建并部署
7. 回到 Search Console 点击验证

### 2.2 提交 Sitemap

1. 在 Search Console 左侧菜单选择「站点地图」
2. 输入 `sitemap-index.xml` 点击提交
3. 等待状态变为「成功」

### 2.3 请求编入索引

在「URL 检查」工具中逐一提交以下 URL：

```
https://openglasshub.pages.dev/
https://openglasshub.pages.dev/devices/
https://openglasshub.pages.dev/guides/
https://openglasshub.pages.dev/developers/
https://openglasshub.pages.dev/gaze-os/
https://openglasshub.pages.dev/community/
https://openglasshub.pages.dev/about/
```

---

## 三、首批手动检查 URL

优先级从高到低：

| 优先级 | URL | 原因 |
|--------|-----|------|
| P0 | `/` | 首页，权重最高 |
| P0 | `/devices/` | 核心内容入口 |
| P0 | `/guides/` | 选购指南，搜索流量主力 |
| P0 | `/guides/ar-ai-glasses-buying-guide-2026/` | 长尾关键词目标页 |
| P1 | `/guides/ar-ai-xr-glasses-difference/` | 高搜索量问题 |
| P1 | `/guides/best-ar-ai-glasses-for-developers/` | 开发者长尾词 |
| P1 | `/devices/xreal-air-2-ultra/` | 品牌产品页 |
| P1 | `/devices/ray-ban-meta/` | 品牌产品页 |
| P2 | `/developers/` | 开发者入口 |
| P2 | `/gaze-os/` | Gaze 生态入口 |
| P2 | `/community/` | 社区入口 |

---

## 四、30 天 SEO 监控清单

### 第 1 周（上线后 1-7 天）

- [ ] Search Console 验证成功
- [ ] Sitemap 提交成功，状态显示「成功」
- [ ] 首页被 Google 收录（URL 检查 → 已编入索引）
- [ ] 至少 3 个核心页面被收录
- [ ] 无「抓取错误」
- [ ] 无「移动设备易用性」问题
- [ ] 提交所有 P0 URL 的索引请求

### 第 2 周（8-14 天）

- [ ] 检查「网页索引」→ 已索引页面数量
- [ ] 检查「搜索效果」→ 是否有展示次数
- [ ] 确认所有产品页被收录
- [ ] 确认所有指南页被收录
- [ ] 提交百度站长平台（可选，针对中文搜索）

### 第 3 周（15-21 天）

- [ ] 检查「搜索效果」→ 开始出现点击数据
- [ ] 分析搜索查询，识别有机会的关键词
- [ ] 确认无手动操作（安全与人工处置）
- [ ] 检查 Core Web Vitals 数据

### 第 4 周（22-30 天）

- [ ] 汇总收录率（目标：>80% 页面被收录）
- [ ] 分析搜索表现数据，规划内容优化
- [ ] 识别表现最好的页面和需要改进的页面
- [ ] 基于搜索查询数据规划新内容

---

## 五、robots.txt / Sitemap 验证清单

### robots.txt 验证

```
URL: https://openglasshub.pages.dev/robots.txt

期望内容：
User-agent: *
Allow: /
Sitemap: https://openglasshub.pages.dev/sitemap-index.xml

检查项：
[ ] 返回 200 状态码
[ ] Content-Type 为 text/plain
[ ] Allow: / 存在（未误封）
[ ] Sitemap 指向正确的 URL
[ ] 无 Disallow 规则阻塞关键页面
```

### Sitemap 验证

```
URL: https://openglasshub.pages.dev/sitemap-index.xml

检查项：
[ ] 返回 200 状态码
[ ] Content-Type 为 application/xml 或 text/xml
[ ] XML 格式合法
[ ] 包含所有主要页面 URL
[ ] URL 使用 https://openglasshub.pages.dev 域名
[ ] 无 openglass.gaze.dev 残留
[ ] 在 Search Console 中显示「成功」状态
```

---

## 六、已知限制与风险

| 项目 | 说明 | 缓解措施 |
|------|------|----------|
| Pagefind 不支持中文词干提取 | 搜索不会跨词根匹配 | 用户输入精确关键词仍可匹配 |
| 无独立自定义域名 | pages.dev 域名 SEO 权重较低 | 后续绑定自定义域名（如 openglasshub.com） |
| 结构化数据仅首页 | 产品页无 Product Schema | 后续为设备页添加 Product Schema |
| 无百度验证 | 中文搜索流量可能受影响 | 后续添加百度站长平台验证 |
| Cloudflare Pages 免费计划 | 构建限制 500 次/月 | MVP 阶段足够 |

---

## 七、文件变更记录

| 文件 | 变更 | 原因 |
|------|------|------|
| `astro.config.mjs` | 添加 `defaultLocale: 'root'`, `locales: { root: { label: '简体中文', lang: 'zh-CN' } }` | HTML lang 从 en 改为 zh-CN |
| `src/content/docs/index.mdx` | frontmatter 添加 `head` 字段，注入 LD+JSON 结构化数据 | 搜索引擎理解网站结构 |
| `scripts/verify-seo.cjs` | 新建 | 自动化 SEO 验证脚本 |

---

*此文档由 Lensden 项目维护。*
