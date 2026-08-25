const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "只支持 POST 请求" });
  if (!process.env.OPENAI_API_KEY) return json(503, { error: "AI 反馈服务尚未配置密钥" });

  try {
    const input = JSON.parse(event.body || "{}");
    const category = String(input.category || "全部方向").slice(0, 40);
    const scenario = String(input.scenario || "口头表达").slice(0, 40);
    const question = String(input.question || "").slice(0, 500);
    const transcript = String(input.transcript || "").trim().slice(0, 6000);
    if (transcript.length < 10) return json(400, { error: "表达内容太短，暂时无法分析" });

    const prompt = `你是一位温和、具体、鼓励行动的中文口才教练。请分析用户的表达，并只给出一个最值得优先改进的点。

训练方向：${category}
训练场景：${scenario}
训练题目：${question}
用户转写：${transcript}

请严格返回 JSON，不要 Markdown，格式如下：
{"title":"不超过16个字的改进点标题","text":"80到140字的具体建议，指出表达中的一个证据，并给出下一遍可以直接照做的练习方法"}

要求：不要编造用户没有说过的内容；不要评价口音、长相或人格；不要一次提出多个问题；即使表达很好，也要给一个可继续优化的小点。`;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_FEEDBACK_MODEL || "gpt-4o-mini",
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
    return json(200, { title: String(feedback.title).slice(0, 80), text: String(feedback.text).slice(0, 500) });
  } catch (error) {
    return json(500, { error: error.message || "暂时无法生成 AI 反馈" });
  }
};
