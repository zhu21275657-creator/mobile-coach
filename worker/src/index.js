const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const rateWindow = new Map();

function corsHeaders(request, env) {
  const origin = env.APP_ORIGIN || request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function json(request, env, status, body) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request, env) });
}

function allowed(request, limit) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const current = rateWindow.get(ip);
  if (!current || now - current.startedAt > 10 * 60 * 1000) {
    rateWindow.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  return hex(await crypto.subtle.digest("SHA-256", typeof value === "string" ? new TextEncoder().encode(value) : value));
}

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let result = "";
  for (let index = 0; index < bytes.length; index += 0x8000) result += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(result);
}

async function hmac(key, value) {
  const cryptoKey = await crypto.subtle.importKey("raw", typeof key === "string" ? new TextEncoder().encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
}

async function tencentAuthorization(payload, timestamp, env) {
  const host = "asr.tencentcloudapi.com";
  const service = "asr";
  const algorithm = "TC3-HMAC-SHA256";
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const signedHeaders = "content-type;host";
  const canonicalHeaders = `content-type:application/json\nhost:${host}\n`;
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${await sha256(payload)}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${await sha256(canonicalRequest)}`;
  const secretDate = await hmac(`TC3${env.TENCENT_SECRET_KEY}`, date);
  const secretService = await hmac(secretDate, service);
  const secretSigning = await hmac(secretService, "tc3_request");
  const signature = hex(await hmac(secretSigning, stringToSign));
  return `${algorithm} Credential=${env.TENCENT_SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

async function transcribe(request, env) {
  if (!env.TENCENT_SECRET_ID || !env.TENCENT_SECRET_KEY) return json(request, env, 503, { code: "TRANSCRIBE_NOT_CONFIGURED", error: "当前部署未读取到腾讯云密钥，请检查 Cloudflare Worker 环境变量" });
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_AUDIO_BYTES + 100000) return json(request, env, 413, { error: "音频超过 3MB 限制" });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json(request, env, 400, { code: "EMPTY_AUDIO", error: "没有收到有效音频" });
  const audio = await file.arrayBuffer();
  if (!audio.byteLength || audio.byteLength > MAX_AUDIO_BYTES) return json(request, env, 413, { error: "音频为空或超过 3MB 限制" });
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ EngSerViceType: "16k_zh", SourceType: 1, VoiceFormat: "wav", Data: base64(audio), DataLen: audio.byteLength });
  const response = await fetch("https://asr.tencentcloudapi.com/", { method: "POST", headers: { Authorization: await tencentAuthorization(payload, timestamp, env), "Content-Type": "application/json", Host: "asr.tencentcloudapi.com", "X-TC-Action": "SentenceRecognition", "X-TC-Version": "2019-06-14", "X-TC-Region": "ap-guangzhou", "X-TC-Timestamp": String(timestamp) }, body: payload });
  const result = await response.json();
  if (!response.ok || result.Response?.Error) return json(request, env, response.status >= 500 ? 502 : 400, { error: result.Response?.Error?.Message || "腾讯云转写失败" });
  return json(request, env, 200, { text: String(result.Response?.Result || "").trim() });
}

async function feedback(request, env) {
  if (!env.ZHIPU_API_KEY) return json(request, env, 503, { error: "智谱 AI 反馈服务尚未配置密钥" });
  const input = await request.json();
  const transcript = String(input.transcript || "").trim().slice(0, 6000);
  if (transcript.length < 10) return json(request, env, 400, { error: "表达内容太短，暂时无法分析" });
  const prompt = `你是一位温和、具体、鼓励行动的中文口才教练。请分析用户的表达，并只给出一个最值得优先改进的点。\n训练方向：${String(input.category || "全部方向").slice(0, 40)}\n本轮训练目标：${String(input.goal || "表达更清晰").slice(0, 60)}\n训练场景：${String(input.scenario || "口头表达").slice(0, 40)}\n训练题目：${String(input.question || "").slice(0, 500)}\n用户转写：${transcript}\n初步指标：${JSON.stringify(input.metrics || {})}\n请严格返回 JSON，不要 Markdown，格式如下：{"title":"不超过16个字的改进点标题","text":"80到140字的具体建议，指出表达中的一个证据，并给出下一遍可以直接照做的练习方法","metrics":{"score":0,"summary":"一句话总结"}}`;
  const response = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${env.ZHIPU_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.ZHIPU_FEEDBACK_MODEL || "glm-4-flash", temperature: 0.4, response_format: { type: "json_object" }, messages: [{ role: "system", content: "你只输出合法 JSON。" }, { role: "user", content: prompt }] }) });
  const result = await response.json();
  if (!response.ok) return json(request, env, 502, { error: result.error?.message || "AI 反馈请求失败" });
  const feedback = JSON.parse(result.choices?.[0]?.message?.content || "{}");
  if (!feedback.title || !feedback.text) return json(request, env, 502, { error: "AI 返回内容格式不正确" });
  return json(request, env, 200, { title: String(feedback.title).slice(0, 80), text: String(feedback.text).slice(0, 500), metrics: feedback.metrics || null });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    const url = new URL(request.url);
    if (url.pathname === "/api/transcribe" && request.method === "GET") return json(request, env, 200, { ok: Boolean(env.TENCENT_SECRET_ID && env.TENCENT_SECRET_KEY), service: "tencent-asr" });
    if (url.pathname === "/api/transcribe" && request.method === "POST") { if (!allowed(request, 10)) return json(request, env, 429, { error: "请求过于频繁，请稍后再试" }); try { return await transcribe(request, env); } catch (error) { return json(request, env, 400, { error: error.message || "无法处理录音" }); } }
    if (url.pathname === "/api/feedback" && request.method === "POST") { if (!allowed(request, 20)) return json(request, env, 429, { error: "请求过于频繁，请稍后再试" }); try { return await feedback(request, env); } catch (error) { return json(request, env, 500, { error: error.message || "暂时无法生成 AI 反馈" }); } }
    return json(request, env, 404, { error: "Not found" });
  },
};
