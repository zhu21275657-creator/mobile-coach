# 开口练习 · 手机网页应用

这是手机优先的 PWA 原型：页面发布到 HTTPS 地址后，可在手机浏览器中打开并添加到桌面。

## 已有功能

- 每日 3 分钟训练题、连续练习记录和单点反馈
- 手机端录音与回听
- 浏览器具备语音识别能力时，边录音边自动填入文字
- 完成练习后将训练重点、时间和转写内容保存在本机“我的记录”
- 录音中离开页面时自动结束并保留已录音内容，避免麦克风持续占用
- 可安装为手机桌面图标，支持离线打开界面

## 自动转文字的上线前置条件

不同手机与浏览器对内置语音识别的支持不一致。要让每位用户都能稳定自动转文字，需要部署一个后端并接入一项云端语音识别服务；录音会被发送给该服务处理，因此需要在选定服务、费用和隐私说明后再启用。

## 本地预览

```bash
python3 -m http.server 4174 --directory mobile-coach
```

然后打开 `http://localhost:4174`。手机使用时需要把它部署到一个 HTTPS 网址，不能使用电脑的 localhost 地址。
## 云端语音转文字配置

浏览器原生语音识别不可用时，录音结束会通过 `/api/transcribe` 调用 Netlify Function，再由腾讯云 ASR 完成普通话转写。部署到 Netlify 后，在 Site configuration → Environment variables 中新增 `TENCENT_SECRET_ID` 和 `TENCENT_SECRET_KEY`，再重新部署。密钥只保存在 Netlify，不要写入前端文件。

## AI 表达反馈配置

反馈接口默认使用智谱 `glm-4-flash`。部署到 Netlify 后，在 Site configuration → Environment variables 中新增 `ZHIPU_API_KEY`。如需切换模型，可新增 `ZHIPU_FEEDBACK_MODEL`，例如 `glm-4-flash`。密钥只保存在 Netlify，不要写入前端文件。
