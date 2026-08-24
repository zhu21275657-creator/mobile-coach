const crypto = require("node:crypto");
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

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

function tencentAuthorization(payload, timestamp) {
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  const host = "asr.tencentcloudapi.com";
  const service = "asr";
  const algorithm = "TC3-HMAC-SHA256";
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const signedHeaders = "content-type;host";
  const canonicalHeaders = `content-type:application/json;\nhost:${host};\n`;
  const hashedPayload = crypto.createHash("sha256").update(payload).digest("hex");
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedRequest = crypto.createHash("sha256").update(canonicalRequest).digest("hex");
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedRequest}`;
  const hmac = (key, value) => crypto.createHmac("sha256", key).update(value).digest();
  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = crypto.createHmac("sha256", secretSigning).update(stringToSign).digest("hex");
  return `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

async function transcribeWithTencent(audio) {
  const timestamp = Math.floor(Date.now() / 1000);
  const requestBody = JSON.stringify({
    EngSerivceType: "16k_zh",
    SourceType: 1,
    VoiceFormat: "wav",
    Data: audio.toString("base64"),
    DataLen: audio.length,
  });
  const response = await fetch("https://asr.tencentcloudapi.com/", {
    method: "POST",
    headers: {
      Authorization: tencentAuthorization(requestBody, timestamp),
      "Content-Type": "application/json",
      Host: "asr.tencentcloudapi.com",
      "X-TC-Action": "SentenceRecognition",
      "X-TC-Version": "2019-06-14",
      "X-TC-Region": "ap-guangzhou",
      "X-TC-Timestamp": String(timestamp),
    },
    body: requestBody,
  });
  const result = await response.json();
  if (!response.ok || result.Response?.Error) throw new Error(result.Response?.Error?.Message || "腾讯云转写失败");
  return String(result.Response?.Result || "").trim();
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "只支持 POST 请求" });
  if (!process.env.TENCENT_SECRET_ID || !process.env.TENCENT_SECRET_KEY) return json(503, { error: "腾讯云转写服务尚未配置密钥" });

  try {
    const raw = Buffer.from(event.body || "", event.isBase64Encoded ? "base64" : "utf8");
    if (!raw.length || raw.length > MAX_AUDIO_BYTES) return json(413, { error: "音频为空或超过 25MB 限制" });
    const requestHeaders = event.headers || {};
    const contentType = requestHeaders["content-type"] || requestHeaders["Content-Type"] || "";
    const { audio } = parseMultipart(raw, contentType);
    return json(200, { text: await transcribeWithTencent(audio) });
  } catch (error) {
    return json(400, { error: error.message || "无法处理录音" });
  }
};
