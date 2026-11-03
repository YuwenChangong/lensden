# Lensden — Post-Release Source Continuity
2026-11-03；只读调查及本地文档准备。**DECISION=READY_FOR_LOCAL_INTEGRATION_REVIEW；REMOTE_SYNC=HOLD_OWNER_AUTHORIZATION**。

## 已确认的发布与 Git 身份

| 对象 | 精确身份 / 关系 |
|---|---|
| 生产 Worker / deployment | `7b0c94f9-f7ec-4a5b-aa8d-f807a7df0e46` / `d23613cb-5298-43f8-89ae-7c51a73fc3c0`；本轮管理 GET 再次确认 100% 流量，激活 2026-11-03T00:31:24.248692Z |
| 批准的应用源码 | `acf9d1560f9fb3bec52d83545852536655ad6c72` |
| 实际构建 checkout | `f4b365e1b7f0c2451ae303a52f49f1dc613a2c28`；部署注释明确绑定 acf9d156 / f4b365e1，复用已完成的发布收据，不重建制品 |
| 本轮开始的发布分支 | `codex/public-discovery-coverage-v1`，`15641ae62b39d1ee74aacab31b3ef8d5a129b23f`；工作树 clean；相对实际构建源只有文档更新，运行时代码相同 |
| 本地 main | `fedf5627a7cd2a28a6f5c0732c333b4e2fad56bb`；发布分支的祖先，落后 188 commits |
| 新鲜远端 main | `98b23b911fe4729febc1bdf81375b638a165ec67`；本轮唯一 `git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main` 成功，无 push |
| 双方共同祖先 | `88680a6eaab8de4123199f16b325ec0a430b0b86`；发布分支独有 262 commits，远端 main 独有 6 commits，**不能直接 fast-forward 远端 main** |
| 回滚身份 | 前一 deployment `35ed60e2-0390-41a5-98ae-443db14c9a1c` 的 Worker `43ac9bb4-f336-4f37-a917-6639acc0ec82`，本轮 deployment 元数据可见；未重新部署/执行回滚 |

本轮实际 checkout 为 `C:/Users/1/.codex/worktrees/lensden-seo-geo-foundation/OpenGlass Hub`。
`D:/OpenGlass Hub` 是另一工作树，`feature/interaction-motion-performance-polish-v1` / `80b59eeb732953489dfa9a395d9fbd23be654a8b`，不是当前生产源。该 UI 基线已经是发布分支祖先，无需重放。

## 主分支与生产差异：该保留什么

远端 main 的六个独有提交依次为 `1cf1dcbc`、`2845c055`、`73736e56`、`3677315c`、`247cb8ab`、`98b23b91`，涉及品牌、README/文档、生产品牌同步及新闻兼容候选。
从共同祖先计算其修改 **47 个路径**：**33 个在发布分支内容逐字节相同**，剩余 **14 个存在发布后的扩展/修复**。
README、PRODUCT、导航 logo、主要品牌/联系信息等已经一致。所检查的 14 个差异中未发现必须用旧 main 内容覆盖生产的独有业务行为；仍须保留六个提交的历史，不能用“看起来一样”抹掉远端父链。

| 内容 / 精确路径组 | 已部署内容及覆盖风险 | 最小处理 |
|---|---|---|
| 三篇英文 GEO 指南；`src/content/editorial-translations/en/guides/{usb-c-display-glasses-compatibility,xr-display-specifications,3dof-6dof-tracking}.mdx`；`src/pages/guides/` | main 没有这些发布结果及其加载/元数据扩展；只挑三个 discovery commits 会遗漏指南/前置基础 | 保留 c9acc845 和之前已发布基础，不重新发表内容 |
| `astro.config.mjs`、`src/lib/seo-sitemap.ts`、`src/pages/sitemap.xml.ts`、`src/pages/sitemap-forum.xml.ts`、`src/lib/forum-discovery.ts` | main 缺少动态/论坛图注册、资格与容量边界、真实日期及部署已有的 Worker SDK 构建适配 | 保留生产实现及依赖，不能只复制单个 sitemap 文件 |
| `src/lib/forum-feed.ts`、`src/pages/feed/index.astro` | main 缺少 4e636573 的过滤后翻页续接修复 | 保留 4e636573，不重复实现 |
| `src/pages/posts/[id].astro`、`src/components/forum/{PublicComments.astro,CommentsSection.tsx}`、`src/pages/api/forum/comments.ts`、`src/lib/{seo,discovery-exclusions}.ts`、`src/layouts/CommunityLayout.astro` | main 缺少公开评论 SSR/同页 hydration、讨论 schema、测试身份排除、分页自身 canonical；直接回到 main 会回退 | 保留 4843559f + acf9d156 及配套基础，不能全路径选择旧 main |
| `src/lib/site-origin.ts`、`src/lib/auth-redirect.ts`、`src/middleware.ts`、`wrangler.toml` | main 仍指向 lensden.ogh.workers.dev；没有当前 apex/www 路由声明、legacy host-local auth 延续 marker 与私有缓存边界 | 保留已发布 lensden.net、workers.dev/preview 开关、回调原域策略；不重做域迁移 |
| `src/lib/admin-totp.ts`、`src/lib/server/{admin-assurance,admin-auth,circle-management}.ts`、`src/pages/api/admin/mfa.ts`、论坛写入边界 | 较旧 main 缺少发布分支上 staff MFA/verified assurance 与后续修复；45ca7236 等已在发布父链 | 保留整个已发布安全链；不得将老分支当“main 权威”覆盖认证/审核 |
| `src/pages/news/[slug].astro`、`src/lib/news.ts` | main 有初始新闻重定向候选，但缺少 a00e7eb9 的指定文章过渡兼容、后续 Article/日期和空值修复 | 保留主分支品牌及已部署新闻兼容；不重放 slug 数据库更新 |
| 媒体/审核、产品与 locale 相关文件 | 发布分支包含既有 media recovery/retention 安全修复、产品类型修复等；差异不全是 GEO | 保留生产树；本轮不移植未发布的分支功能、不执行 SQL/媒体清理 |
| 剩余 14 路径中的文档/package/messages/test 差异 | `docs/README.md`、`docs/seo-checklist.md`、`package.json`、`scripts/test-auth-redirect-safety.mjs`、`src/content/docs/about/search-console-launch-checklist.mdx`、`src/lib/i18n/messages/community.ts`：生产增加文档指引、脚本、legacy auth 检查、域名指引及已发布功能消息 | 合并时保留双方既有正文及这些扩展；历史“未部署”语句不替代最新状态文档 |

上述列出的 8 个运行时/配置差异路径加最后一行 6 个路径，正好覆盖 14 个 residual 路径。完整差异清单在本地证据；没有把 47 个共同修改路径误报为 47 个文本冲突。未执行 merge，因此实际 Git 冲突位置仍为 NOT_VERIFIED。

**本地分支保护**：盘点 161 个 heads，139 个为发布分支祖先（包括其自身），22 个分叉，没有发布分支的额外后继 head。
State D `f65e7b1d`、locale `8c1e9d5b`、品牌/新闻 `a00e7eb9`、既有 release candidate `0b6d94ff`、本地 main 均已继承。
22 个分叉原样保留，完整名字/SHA 见 git-lineage.json；例如 `codex/public-beta-cutover-guard-20261022` 比发布链独有 5 commits、`codex/public-beta-managed-hooks-20261021` 独有 4 commits，涉及尚未纳入生产的操作工具，**不能顺便合入或删除**。
这些分支提交时间均早于本次生产发布；未发现更新的本地 head 意味着必须覆盖本次生产。未检查/修改其他工作树的未提交内容，不把提交祖先关系当作它们工作树 clean 的证明。

## main 是否会自动部署：YES（满足路径条件并构建成功时）

本轮使用 Cloudflare skill 指导的现有只读管理工具，5 次 GET，无浏览器操作/配置变更：
- Worker `lensden` tag `0617a766df474d9db943b236191a10a2` 的 active trigger：
  `861a1cd7-ae6a-4397-9cab-b09707eb46cb`，GitHub **YuwenChangong/lensden**。
- `branch_includes=["main"]`，excludes=[]；根目录 `/`；路径 includes=["*"]。
- 仅排除 `README.md`、`PRODUCT.md`、`AGENTS.md`、`docs/{auth-strategy,device-spec-crawler,openai-moderation-setup,seo-checklist,README}.md`。
  这不是排除整个 docs；本报告和当前状态文档也不在排除名单内。
- build：`npm run build`；deploy：`npx wrangler deploy --config dist/server/wrangler.json --keep-vars`。
  是部署而不是只上传版本。匹配 main 的普通源码同步会触发 hosted build，并在成功后替换 live Worker。
- 仓库两端都没有 tracked `.github/workflows` 文件；它们缺失不阻止 Cloudflare 自有构建集成。
  `buildWorkersReleaseGuard` 只是离线校验辅助，未接入上述 build/deploy 调用链；不能当作 main 自动发布审批锁。
- 旧 Worker `openglasshub` 的 Builds triggers 为 []。
- 既有 Pages 项目 `lensden` 仍为 github/main，
  `deployments_enabled=true`、`production_deployments_enabled=true`、preview includes=["*"]，
  仅排除一个旧 staged 分支。其 source.repo_name 仍显示 `openglasshub`，
  与 GitHub 当前同一项目名称 lensden 不同；**改名后的 webhook 实际投递 NOT_VERIFIED**。
  应视为可能的第二构建链，不能断言已关闭。不要用一次实验 push 验证它。

规则解释来自 [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)、
[Build watch paths](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/)：
任一未排除且匹配的路径可触发；20+ commits 等情况会绕过路径匹配。
**不能靠 docs-only、历史 [skip ci] 标题、非 main 分支或 PR 来保证零 hosted builds**（Pages previews 仍开启）。
未查验所有外部 GitHub webhooks/branch protections，不承诺只有上述两条链。

## 最小整合方案（下列整合命令全部未执行）

**推荐目标**：在远端 main 的历史上纳入完整已发布父链，运行时树保持与 15641ae6 / f4b365e1 相同。保留 main 独有六个提交、全部生产提交及本轮文档；不挑选旧快照覆盖全树，不 force-push，不 squash 丢失来源关系。
仅 cherry-pick 4e636573/4843559f/acf9d156 不足以同步生产，存在指南/认证/媒体等前置遗漏。

1. Owner 下一步只需授权一次**本地隔离整合及结果复核**，仍不授权 push/config/deploy。
   再 fetch main，并核对远端仍为 `98b23b911fe4729febc1bdf81375b638a165ec67`、发布应用树未变；任一新代码先做增量比较，不能套用本报告的相等结论。
2. 在新工作树上从 pinned remote main 建立 `codex/source-continuity-v1`；
   保留本轮文档的精确本地提交作为发布链文档后继。以下为核心历史整合步骤的计划示例：
   ```powershell
   git worktree add -b codex/source-continuity-v1 "C:/Temp/lensden-source-continuity-v1" 98b23b911fe4729febc1bdf81375b638a165ec67
   # 在新工作树；先纳入已经发布的精确父链，停在本地审阅阶段
   git merge --no-commit --no-ff 15641ae62b39d1ee74aacab31b3ef8d5a129b23f
   ```
   若工作树路径/分支已存在，停止并检查，不能删除/覆盖。冲突逐文件复核 14 路径，不使用全局 ours/theirs。
   33 个已相同路径维持相同；14 个 runtime 扩展/文档补充按上表保留；其他生产差异继承发布树。
   本轮两份文档应另行从其精确文档提交纳入，保存最新状态和历史，不把旧 main 状态正文覆盖回来。
3. 本地候选提交前证明两条 pinned 父链均保留，review staged diff；
   运行时文件必须逐字节相等，包括 **src/、public/、workers/、astro.config.mjs、wrangler.toml、package.json、package-lock.json、tsconfig.json、构建脚本及 scripts/lib/**。
   对候选与 15641ae6 的**全树 diff**也需检查，仅允许明确列出的本轮文档差异，不能靠上述路径清单遗漏其他构建输入。
   例：`git diff --exit-code 15641ae62b39d1ee74aacab31b3ef8d5a129b23f -- src public workers astro.config.mjs wrangler.toml package.json package-lock.json tsconfig.json scripts`。
   不重跑已完成 Public Discovery/GEO 历史测试；如确有新的代码冲突修复，才运行其直接相关的离线检查。
   不使用当前 dist 验证新候选构建成功；它属于已完成发布，保留原制品/manifest。
4. 记录候选完整 SHA、两条 ancestry 结果、全树差异与本地检查收据，提交 owner 审阅。
   由于尚未合并，候选 SHA、实际文本冲突、合并树等价证明现在 **NOT_VERIFIED**，不能声称已可安全推送。
5. **后续远端同步必须另行授权**。优先选择纯源码同步、线上不变：
   先获准暂停相关 Worker Git 自动构建以及 Pages production/**preview** 自动构建，并只读确认生效；
   不只是将 deploy_command 改为 versions upload（那仍会 build/upload），也不移除 live 路由/关闭站点。
   未授权配置更改前本 agent 不执行这些操作。
   再 fresh-fetch/比较 main CAS 前置条件、确认无 in-flight/queued 旧构建及 live Worker 未被他人改变，
   owner 批准精确候选后仅做普通 fast-forward push，**绝不 force**；远端若前进则停止。
   推送后只读确认 remote main SHA 和 live Worker 仍为 7b0c94f9；如不一致停止，不自动重推/回滚他人发布。
   是否恢复自动构建、何时恢复及是否触发队列须单独说明并读回，不能在旧构建仍排队时直接恢复。
   如 owner 要保留自动发布，则该 push 本身必须作为**新 production release**审批，包含 hosted build 免费准入及严格验证/回滚预算；本轮没有该授权。
6. 本地 main 可在最终候选通过审批后以 fast-forward 对齐（本轮不操作）；其他 22 个分叉及工作树保持原状。
   数据库已完成的新闻 slug/QA 清理不属于 Git integration，绝不重放 SQL、迁移、发布文章或计数验证。

当前 active Worker 应作为未来同步操作的保持基线；旧 43ac9bb4 仅用于理解上一发布回滚链。
未来意外自动部署若需回滚，应另外授权恢复本次 **7b0c94f9** 的可用版本，并先确认没有覆盖他人的更晚发布；本轮没有执行/授权任何回滚。

## 证据、费用和结论

- 忽略目录 `artifacts/qa/source-continuity-2026-11-03/`：
  `git-lineage.json`（fresh refs、全部 branch SHA/关系、47/33/14 清单、工作树元数据），
  `remote-main-residual.diff`、`remote-main-to-release-files.txt`、`provider-metadata.json`（仅所需配置/部署元数据，不含凭据值）。
- 复用 [已完成发布收据](public-discovery-v1-controlled-release-2026-11-03.md) 及其 artifact manifest；
  本轮没有新增测试、生产 HTML/API/数据库/媒体请求，没有 build、merge、push 或修改运行时代码。
- 只做一次 Git fetch、GitHub 只读 repo/branch 元数据、5 次现有 Cloudflare 管理 GET 和官方文档读取。
  无付费服务/额度变更/R2 对象操作，**本轮无新增基础设施收费操作**；未重新查账单，不能把账户全量费用声明为已验证 $0。
- 安全可纳入候选：已发布完整父链 + main 六提交历史 + 本轮文档，按上述运行时等价约束。
  不安全：直接推旧 main/其他工作树、force-reset main、仅挑 discovery 三提交、全路径采用 main、未经处理触发器就 push。
- Owner 最小下一动作：**授权本地隔离历史整合与等价性复核，继续禁止 push/build/deploy/config changes**。
  该候选具体化后，再审批触发器防护及精确远端同步；无需重复 GEO 审计或当前发布验证。

```text
TASK=LENSDEN_POST_RELEASE_SOURCE_CONTINUITY
PRODUCTION_SOURCE=acf9d1560f9fb3bec52d83545852536655ad6c72
REMOTE_MAIN=98b23b911fe4729febc1bdf81375b638a165ec67
SOURCE_CONTINUITY=CONFIRMED_LOCAL_RELEASE_LINEAGE_REMOTE_MAIN_DIVERGED
DEPLOYED_FUNCTIONALITY_PRESERVED=PASS_LOCAL_SOURCE_UNCHANGED
INTEGRATION_EXECUTED=false
INTEGRATION_CONFLICTS=NOT_VERIFIED
MAIN_AUTO_DEPLOY=ENABLED_WITH_PATH_FILTERS
PAGES_AUTO_BUILD_RISK=ENABLED_CONFIG_WEBHOOK_DELIVERY_NOT_VERIFIED
PRODUCTION_WRITES=0
CONFIGURATION_CHANGES=0
BUILDS=0
DEPLOYMENTS=0
REMOTE_PUSH=0
MERGES=0
OWNER_AUTHORIZATION_REQUIRED=true
NEXT_SINGLE_ACTION=AUTHORIZE_LOCAL_ISOLATED_HISTORY_INTEGRATION_ONLY
```
