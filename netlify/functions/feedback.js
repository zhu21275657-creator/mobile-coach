const headers = {
  "Access-Control-Allow-Origin": process.env.APP_ORIGIN || "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const rateWindow = new Map();
function allowed(event) {
  const ip = event.headers?.["x-nf-client-connection-ip"] || event.headers?.["x-forwarded-for"] || "unknown";
  const now = Date.now(); const current = rateWindow.get(ip);
  if (!current || now - current.startedAt > 10 * 60 * 1000) { rateWindow.set(ip, { startedAt: now, count: 1 }); return true; }
  if (current.count >= 20) return false;
  current.count += 1; return true;
}

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "只支持 POST 请求" });
  if (!allowed(event)) return json(429, { error: "请求过于频繁，请稍后再试" });
  if (!process.env.ZHIPU_API_KEY) return json(503, { error: "智谱 AI 反馈服务尚未配置密钥" });
  if ((event.body || "").length > 20000) return json(413, { error: "请求内容过大" });

  try {
    const input = JSON.parse(event.body || "{}");
    const category = String(input.category || "全部方向").slice(0, 40);
    const goal = String(input.goal || "表达更清晰").slice(0, 60);
    const scenario = String(input.scenario || "口头表达").slice(0, 40);
    const question = String(input.question || "").slice(0, 500);
    const transcript = String(input.transcript || "").trim().slice(0, 6000);
    const metrics = input.metrics && typeof input.metrics === "object" ? input.metrics : {};
    if (transcript.length < 10) return json(400, { error: "表达内容太短，暂时无法分析" });

    const prompt = `你是一位温和、具体、鼓励行动的中文口才教练。请分析用户的表达，并只给出一个最值得优先改进的点。

训练方向：${category}
本轮训练目标：${goal}
训练场景：${scenario}
训练题目：${question}
用户转写：${transcript}
初步指标（仅供参考）：${JSON.stringify({ characters: metrics.characters || 0, fillers: metrics.fillers || 0, hasConclusion: Boolean(metrics.hasConclusion), hasExample: Boolean(metrics.hasExample) })}

请严格返回 JSON，不要 Markdown，格式如下：
{"title":"不超过16个字的改进点标题","text":"80到140字的具体建议，指出表达中的一个证据，并给出下一遍可以直接照做的练习方法","metrics":{"score":0,"summary":"一句话总结"}}

要求：不要编造用户没有说过的内容；不要评价口音、长相或人格；不要一次提出多个问题；反馈必须围绕本轮训练目标；即使表达很好，也要给一个可继续优化的小点。`;
    const response = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.ZHIPU_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ZHIPU_FEEDBACK_MODEL || "glm-4-flash",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你只输出合法 JSON。" },
          { role: "user", content: prompt },
        ],
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "AI 反馈请求失败");
    const content = result.choices?.[0]?.message?.content || "{}";
    const feedback = JSON.parse(content);
    if (!feedback.title || !feedback.text) throw new Error("AI 返回内容格式不正确");
    return json(200, { title: String(feedback.title).slice(0, 80), text: String(feedback.text).slice(0, 500), metrics: feedback.metrics || null });
  } catch (error) {
    return json(500, { error: error.message || "暂时无法生成 AI 反馈" });
  }
};
