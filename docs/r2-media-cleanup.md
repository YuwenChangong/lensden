# R2 媒体清理说明（论坛）

2026-10-15按当前本地源码校正。本文不是Production操作授权；本地修复尚未部署，
Production配置与行为仍为UNKNOWN。唯一项目进度基线为PUBLIC_BETA_CURRENT_STATE.md。

## 0) 当前媒体路径和隔离前提

- 图片和独立缩略图通过Supabase Storage上传，不是R2图片上传。
- 视频先请求R2签名；客户端另有Supabase回退分支，但其真实可用性须单独验证，不能凭代码存在标PASS。
- R2原生绑定MODERATION_ASSETS与媒体S3访问的R2_*配置是不同机制。
- 当前wrangler.toml的Preview和Production使用相同绑定与媒体配置，不能视为隔离桶。
- 未发现可验证的测试桶专用配置/最小权限凭据；云端是否另有测试桶UNKNOWN，未访问Provider API枚举。
- 不允许通过手动往数据库塞R2图片记录来冒充网站原生图片上传。若要求图片也迁往R2，属于另需批准的产品变更。

## 1) 帖子删除时同步清理

删除接口：`DELETE /api/forum/posts?id=<post_id>`

当前行为：

1. 校验登录态、作者/既有审核角色、法律确认、写入安全限制及圈子可见性。
2. 读取该帖媒体记录，包含storage_path、thumbnail_url和owner/post绑定。
3. 先软删除帖子，再同步尝试受管原图、视频与缩略图清理；相同Key去重，共享引用保留。
4. 当前合法R2临时Key通过既有S3 DELETE适配；Supabase对象通过post-media remove。
   不符合owner/post规范的Key失败关闭，不猜测删除旧版或其他账户对象。
5. 仅清理完成的媒体行被删除；失败行保留Key，供显式重试。无自动重试或异步完成声明。
6. HTTP200、顶层ok=true/status=deleted只表示帖子软删除成功。
   cleanup.ok=false表示媒体/记录清理不完整，必须检查errors、warnings及deletedObjects。
   不能把帖子软删除成功、删除任务提交或空DELETE响应当成对象清理成功。
7. 作者可显式重复删除自己已删除的帖子以重试清理，原授权和圈子限制仍生效。
   已不存在对象按结构化缺失结果处理；新的读取、审核操作不因此获得已删除正文访问权。
8. 新浏览器/禁用缓存的媒体读取与存储对象核验是不同证据；不承诺清除所有旧浏览器/CDN缓存。

## 2) 生命周期限制

用途仅应是清理已经证明未被合法内容引用的遗留对象，不能代替本次显式DELETE与后置核验。
当前视频签名生成tmp/owner/post/...，已绑定视频仍可能保留该Key。未证明迁移到其他前缀前，
不能对整个tmp/直接设置到期删除，否则可能误删仍在使用的视频。
当前Production是否配置此类规则UNKNOWN；本任务不检查或更改Production生命周期。
旧说明中一律应用tmp-expire-1d的建议已撤回，不应照此对生产桶操作。

## 3) 最简人工隔离配置（当前未执行）

实际访问方式为S3_API，不是Worker原生Binding：`src/lib/r2-server.ts`使用S3Client生成预签名PUT，
使用aws4fetch签名DELETE。无需增加Worker绑定或部署，但这条实现确实需要测试桶专用S3凭据。
当前代码固定普通账户S3端点，不支持独立的R2_ENDPOINT配置或jurisdiction专属端点。

1. Dashboard进入现有账户的 **Storage & databases > R2 Object Storage > Overview**，
   点击 **Create bucket**，例如命名`ogh-e2e-video-20261015`；使用默认普通jurisdiction/Automatic位置，
   存储类别选 **Standard**，点击 **Create bucket**。不要选择Infrequent Access，不关联任何生产Worker。
   若出现开通新付费订阅/结算要求，停止。此操作由负责人手动完成，Codex不自动创建资源。
2. 回到R2 Overview，在 **Account Details > API Tokens > Manage** 中点击 **Create User API token**
   （若账户界面使用Create Account API token也必须采用同样的桶级权限，不是Admin权限）。
   权限只选 **Object Read & Write**，桶范围选择 **Apply to specific buckets only**，只勾选新测试桶，
   不选All buckets、Admin Read/Write或Production桶，创建后本地保存 **Access Key ID / Secret Access Key**。
   不要把一般Cloudflare API Token值当作R2_SECRET_ACCESS_KEY。保留只含桶名/权限的脱敏截图或说明。
3. 新测试桶 **Settings > Public Development URL > Enable**，按提示输入`allow`并确认。
   将Public Bucket URL用于下述R2_PUBLIC_BASE_URL，不带对象路径、Query或末尾签名。
   当前视频GET由网站`/api/media/post/<id>`检查公开帖子/圈子后代理该URL；不存在已接入的S3签名GET，
   Supabase签名GET只适用于Storage对象。没有可用公开测试URL时，当前R2读取路径BLOCKED。
   这会临时公开桶内合成视频：必须单独接受该风险；仅放一次性合成数据，不复制真实媒体。
   不改生产桶、不加付费域名/Worker；r2.dev限流，不证明生产性能或直接对象URL的私密访问控制。
4. 仍在新桶 **Settings > CORS Policy > Add CORS policy > JSON**，填入下方配置并 **Save**。
   精确来源为当前本地应用`https://127.0.0.1:4328`，不是Production域名；当前浏览器直传代码仅发送Content-Type。
   GET/HEAD/Range用于后续有界读取验证，不允许通配来源或浏览器DELETE：

```json
[
  {
    "AllowedOrigins": ["https://127.0.0.1:4328"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type", "range"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"]
  }
]
```

5. 在本机填写已创建的空白文件：
   `C:\Temp\ogh-product-beta-development-20261013\.env.r2-test.local`。
   已验证Git忽略，并禁用文件ACL继承，仅当前Windows用户/SYSTEM访问。它是受ACL保护的明文环境文件，
   不是DPAPI加密文件；不要上传、粘贴、截图或提交。不要通过命令行带入密钥。
   仅填写以下现有代码实际支持的5个服务端字段（无需PUBLIC_前缀，不填写生产Supabase密钥）：

```dotenv
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_BASE_URL=
```

   Account ID来自当前R2账户；Access Key ID/Secret来自刚创建的测试桶S3凭据；Bucket Name为新测试桶；
   Public Base URL为该桶独立的Public Bucket URL。账户可与Production相同，但桶、凭据权限和媒体URL必须分离。
   文件不会被当前QA入口自动加载，不要直接运行生产/Preview配置或用PowerShell点执行此文件。
   原DPAPI机制仍可用于后续运行时内存装载；不给浏览器传服务器Secret，不修改生产.env/Wrangler配置。
6. 在R2 Overview及账户 **Manage Account > Billing > Billable Usage** 核对当前计费期：
   Standard存储GB-month、Class A和Class B累计使用量，覆盖账户全部桶，而非只看新空桶的Metrics。
   Standard免费额度目前为每月10GB-month、100万次Class A、1000万次Class B；新桶没有独立额度。
   核对账期/更新时间并保留脱敏用量信息；有其他账户活动时需预留余量，不能把延迟统计当实时硬保证。
   页面无法给出足够用量证明，或任何服务/网络会新增费用，则保持UNKNOWN/BLOCKED。
   不启用付费附加服务。预算警报不是硬性防扣费；R2免费出站也不等于操作/存储没有收费风险。
   在Billable Usage按R2筛选，分别读取Total usage、Included allowance、Billable usage；不能仅凭费用为0
   推断还有多少额度。该页不是实时计量，须为其他活动和本次有界测试保留足够余量。
7. 配置完后只回复文件路径、脱敏桶权限/隔离/免费余量证据，以及对该新桶本次小规模测试的独立使用批准。
   不发送密钥。检查桶名与Production不同、凭据仅该桶、媒体URL不同、不含任何生产数据；无须拿凭据尝试删除
   Production对象来验证隔离。批准前不读取或写入真实桶，也不建立有效授权/GO。

当前本地测试入口只允许loopback，尚未接入任何测试桶。配置/权限证据完备之后，才可在同一现有
本地测试路径中做最小、明确受限的目标适配；不能直接继承Preview或Production配置。
最多2个小型合成对象及明确请求上限需在执行前核对是否足以覆盖真实播放器与清理，不能承诺任意固定次数必定完成。
命名须包含本次独立运行标识，并保存精确创建Key到受保护内存清单；只删除此清单，禁止批量清空桶。
完成后逐Key删除并验证不存在；失败时保留明确清理义务，不能把生命周期等待当作已清理。
图片/缩略图继续按实际Supabase路径验证；真实R2仅验证现有视频路径，不冒充R2图片测试。
现有网站媒体代理未透传Range；未来必须区分桶自身Range响应和网站代理响应，不能预先承诺206或完整视频验收。
Public Bucket URL本身公开读取不是越权拒绝测试：网站路径访问规则、作者/其他用户删除权限应分别断言。

官方参考：[R2入口](https://developers.cloudflare.com/r2/get-started/)、
[新建桶](https://developers.cloudflare.com/r2/buckets/create-buckets/)、
[桶级R2权限](https://developers.cloudflare.com/r2/api/tokens/)、
[CORS](https://developers.cloudflare.com/r2/buckets/cors/)、
[开发媒体URL](https://developers.cloudflare.com/r2/buckets/public-buckets/)、
[Standard免费额度及计费](https://developers.cloudflare.com/r2/pricing/)、
[账户用量界面](https://developers.cloudflare.com/billing/manage/billable-usage/)。

## 4) 清理失败核对

若删除帖子返回失败：

1. 查看cleanup.ok、errors、warnings及deletedObjects中的storage/status。
2. 区分deleted、already_missing、retained_shared、skipped和failed；共享保留不表示物理删除。
3. 确认失败媒体记录仍存在，使用原身份/授权范围显式重试，不自动提升权限或绕过RLS。
4. 当前本地Supabase实际对象/行删除已验证；R2适配仅有Mock证据，不能写成真实R2 PASS。
