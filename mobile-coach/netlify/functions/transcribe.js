const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function parseMultipart(body, contentType) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new Error("缺少音频上传边界");
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const start = body.indexOf(boundary);
  if (start < 0) throw new Error("未找到音频内容");
  const headerStart = start + boundary.length + 2;
  const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), headerStart);
  if (headerEnd < 0) throw new Error("音频请求格式不正确");
  const partHeaders = body.subarray(headerStart, headerEnd).toString("utf8");
  if (!/name="file"/.test(partHeaders)) throw new Error("上传字段必须是 file");
  const fileStart = headerEnd + 4;
  const fileEnd = body.indexOf(Buffer.from("\r\n"), body.indexOf(boundary, fileStart) - 2);
  if (fileEnd < fileStart) throw new Error("音频内容为空");
  const disposition = partHeaders.match(/filename="([^"]*)"/i);
  const filename = disposition?.[1] || "recording.wav";
  const type = partHeaders.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || "audio/wav";
  return { audio: body.subarray(fileStart, fileEnd), filename, type };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "只支持 POST 请求" });
  if (!process.env.OPENAI_API_KEY) return json(503, { error: "转写服务尚未配置 API 密钥" });

  try {
    const raw = Buffer.from(event.body || "", event.isBase64Encoded ? "base64" : "utf8");
    if (!raw.length || raw.length > MAX_AUDIO_BYTES) return json(413, { error: "音频为空或超过 25MB 限制" });
    const requestHeaders = event.headers || {};
    const contentType = requestHeaders["content-type"] || requestHeaders["Content-Type"] || "";
    const { audio, filename, type } = parseMultipart(raw, contentType);
    const form = new FormData();
    form.append("file", new Blob([audio], { type }), filename);
    form.append("model", "whisper-1");
    form.append("language", "zh");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    const result = await response.json();
    if (!response.ok) return json(502, { error: result.error?.message || "云端转写失败" });
    return json(200, { text: String(result.text || "").trim() });
  } catch (error) {
    return json(400, { error: error.message || "无法处理录音" });
  }
};
