# 开口练习 · 手机网页应用

这是手机优先的 PWA 原型：页面发布到 HTTPS 地址后，可在手机浏览器中打开并添加到桌面。

## 已有功能

- 每日 3 分钟训练题、连续练习记录和单点反馈
- 10 个训练方向、每个方向至少 30 个题目，分为入门/进阶/挑战三个阶段
- 题目按练习次数逐步提升难度，并自动避开最近练过的题目
- 手机端录音与回听
- 浏览器具备语音识别能力时，边录音边自动填入文字
- 完成练习后将训练重点、时间和转写内容保存在本机“我的记录”
- “我的记录”保存每次练习的主题、问题、第一遍/第二遍转写和 AI 改进点；录音保存在浏览器 IndexedDB，可在历史记录中展开回听
- 历史记录提供累计练习次数、完成二次表达次数和连续练习天数，帮助用户对比自己的表达变化
- 录音中离开页面时自动结束并保留已录音内容，避免麦克风持续占用
- 可安装为手机桌面图标，支持离线打开界面

## 自动转文字的上线前置条件

不同手机与浏览器对内置语音识别的支持不一致。要让每位用户都能稳定自动转文字，需要部署一个后端并接入一项云端语音识别服务；录音会被发送给该服务处理，因此需要在选定服务、费用和隐私说明后再启用。

## 本地预览

```bash
python3 -m http.server 4174
```

然后打开 `http://localhost:4174`。手机使用时需要把它部署到一个 HTTPS 网址，不能使用电脑的 localhost 地址。
## Cloudflare Pages + Workers 部署

前端发布到 Cloudflare Pages，`worker/` 中的 Cloudflare Worker 提供 `/api/transcribe` 和 `/api/feedback`。在 Worker 中使用 `wrangler secret put TENCENT_SECRET_ID`、`wrangler secret put TENCENT_SECRET_KEY` 和 `wrangler secret put ZHIPU_API_KEY` 写入密钥；不要把密钥写入前端或提交到仓库。Pages 项目需将 `/api/*` 路由绑定到该 Worker（可通过 Cloudflare Dashboard 的 Worker Route 配置，或将 Worker 绑定到 Pages 使用的自定义域名）。

部署 Worker：

```bash
cd worker
npx wrangler login
npx wrangler secret put TENCENT_SECRET_ID
npx wrangler secret put TENCENT_SECRET_KEY
npx wrangler secret put ZHIPU_API_KEY
npx wrangler deploy
```

未配置密钥时，录音和本机保存仍可用，用户可以直接手动输入文字。

可在浏览器打开 `/api/transcribe` 做配置自检：返回 `ok: true` 表示当前 Worker 已读到两个变量；该检查不会返回密钥内容。

电脑不需要一直开着：Cloudflare Workers、腾讯云和智谱负责云端能力，手机直接访问 Pages 网址即可。只有本地开发预览时才需要电脑运行本地服务器。Supabase 邮箱登录只用于跨设备同步，不登录也能在当前手机本地使用；腾讯云和智谱的密钥由云端服务使用，用户不需要在手机上登录这些平台。

## AI 表达反馈配置

反馈接口默认使用智谱 `glm-4-flash`。如需切换模型，可在 Worker 中设置 `ZHIPU_FEEDBACK_MODEL`。生产环境建议设置 `APP_ORIGIN` 为正式 Pages 站点地址，用于收紧跨域来源。反馈接口每个运行实例每 10 分钟最多处理 20 次，转写接口最多处理 10 次；正式公开运营仍建议接入网关级限流。
