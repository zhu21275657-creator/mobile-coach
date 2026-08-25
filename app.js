const $ = (id) => document.getElementById(id);
const key = "koukou-mobile-sessions";
let deferredPrompt;
let recorder;
let stream;
let chunks = [];
let recognition;
let spokenText = "";
let recordingStartedAt = 0;
let recordingTimer;
let isStarting = false;
let recordingActive = false;
const transcribeEndpoint = "/api/transcribe";
const feedbackEndpoint = "/api/feedback";
const maxRecordingSeconds = 55;
const preferenceKey = "koukou-topic-preference";

const topics = [
  ["日常社交", "日常聊天", "先说结论", "朋友问你最近怎么样。请讲一件最近发生的小事，不要只回答“还行”。"],
  ["日常社交", "日常聊天", "接住话题", "和刚认识的人聊天时，请介绍一个你最近感兴趣的东西，并向对方抛出一个问题。"],
  ["日常社交", "日常聊天", "自然表达", "请讲一件周末想做的事，说清楚你为什么想做、准备怎么安排。"],
  ["职场沟通", "工作表达", "说话有结构", "请用一分钟说清楚：你这周最重要的一项进展，以及接下来准备怎么做。"],
  ["职场沟通", "工作表达", "汇报重点", "向同事汇报一个任务：说清楚目标、目前进度和需要对方配合的地方。"],
  ["职场沟通", "工作表达", "表达不同意见", "你不同意一个工作安排。请先认可对方的出发点，再说你的担忧和建议。"],
  ["观点表达", "观点表达", "先说观点", "你更喜欢独处还是热闹？先说选择，再讲一个让你这么想的经历。"],
  ["观点表达", "观点表达", "理由具体", "你认为“忙”代表一个人有价值吗？先说观点，再举一个真实例子。"],
  ["观点表达", "观点表达", "换位思考", "有人说“年轻人应该多尝试，不要过早稳定”。你怎么看？请同时说说另一种看法。"],
  ["故事叙述", "故事叙述", "讲清经过", "讲一次最近让你觉得有点意外的经历，按‘起因—经过—结果’说清楚。"],
  ["故事叙述", "故事叙述", "制造画面", "讲一次你印象深刻的第一次经历，加入一个当时看到、听到或感受到的细节。"],
  ["故事叙述", "故事叙述", "突出转折", "讲一次事情一开始不顺利、后来发生转折的经历，说清楚转折是怎么出现的。"],
  ["即兴反应", "即兴表达", "快速组织", "请用一分钟回答：如果明天多出半天自由时间，你会怎么安排？先给方案，再解释原因。"],
  ["即兴反应", "即兴表达", "举例说明", "有人说“坚持比天赋重要”。请不要只讲道理，立刻举一个生活中的例子。"],
  ["即兴反应", "即兴表达", "收束观点", "请谈谈你对“仪式感”的看法，并在最后用一句话总结你的立场。"],
  ["面试表达", "自我介绍", "说出特点", "用一分钟介绍自己：你擅长什么、正在练习什么、希望别人记住你哪一点？"],
  ["面试表达", "面试回答", "用事实证明", "请回答“你做过最有成就感的一件事是什么”，说清背景、行动和结果。"],
  ["面试表达", "面试回答", "真诚具体", "请回答“你正在努力改进什么”，不要说空泛的优点，给出一个真实场景。"],
  ["情绪表达", "情绪表达", "说出感受", "讲一件最近让你开心或烦恼的事，并说明它为什么影响了你。"],
  ["情绪表达", "情绪表达", "表达需要", "请描述一次你感到委屈或压力的时刻，并说说当时你真正需要什么。"],
  ["情绪表达", "情绪表达", "温和坚定", "有人无意中说了让你不舒服的话。请练习用“我感到……因为……我希望……”回应。"],
  ["说服沟通", "沟通回应", "站在对方角度", "请向朋友推荐一个你喜欢的东西，先说它能帮对方解决什么问题，再讲理由。"],
  ["说服沟通", "沟通回应", "观点有依据", "请说服别人支持一个你喜欢的生活习惯，至少给出一个事实和一个亲身体验。"],
  ["说服沟通", "沟通回应", "回应质疑", "别人质疑你的一个选择。请先复述对方的担心，再清楚说明你为什么仍然这样选。"],
  ["复盘总结", "复盘总结", "提炼经验", "回想一次最近做得不够好的事情：发生了什么，下次你会怎么调整？"],
  ["复盘总结", "复盘总结", "抓住关键", "复盘一次最近完成的任务，只讲三点：目标、最关键的动作、最后学到什么。"],
  ["复盘总结", "复盘总结", "形成行动", "讲一次你最近拖延的事情，分析原因，并说出一个明天就能执行的改进动作。"],
  ["汇报演讲", "汇报表达", "开场抓重点", "请向团队介绍一个你正在推进的想法：先说结论，再说价值、方案和下一步。"],
  ["汇报演讲", "汇报表达", "信息分层", "用一分钟讲清楚一个你熟悉的流程，要求先讲整体，再讲其中两个关键步骤。"],
  ["汇报演讲", "汇报表达", "一句话收束", "请分享一本书、一部电影或一门课，最后用一句话说清楚你推荐或不推荐的理由。"],
].map(([category, scenario, focus, question]) => ({ category, scenario, focus, question }));
const categories = ["全部方向", ...new Set(topics.map((topic) => topic.category))];
let selectedCategory = localStorage.getItem(preferenceKey) || "全部方向";
if (!categories.includes(selectedCategory)) selectedCategory = "全部方向";
const initialPool = selectedCategory === "全部方向" ? topics : topics.filter((topic) => topic.category === selectedCategory);
let today = initialPool[Math.floor(Date.now() / 86400000) % initialPool.length];

function sessions() { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } }
function dateKey(date = new Date()) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-"); }
function streak() { const days = new Set(sessions().map((item) => item.date)); let date = new Date(); if (!days.has(dateKey(date))) date.setDate(date.getDate() - 1); let count = 0; while (days.has(dateKey(date))) { count += 1; date.setDate(date.getDate() - 1); } return count; }
function setup() {
  const hour = new Date().getHours(); $("greeting").textContent = hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  renderTopicPicker();
  $("focusTag").textContent = today.focus; $("scenario").textContent = today.scenario; $("question").textContent = today.question;
  const count = sessions().length; $("streak").textContent = streak(); $("weekProgress").textContent = count ? `已完成 ${count} 次练习` : "本周刚开始";
}
function chooseTopic() {
  const pool = selectedCategory === "全部方向" ? topics : topics.filter((topic) => topic.category === selectedCategory);
  const choices = pool.filter((topic) => topic !== today);
  const available = choices.length ? choices : pool;
  today = available[Math.floor(Math.random() * available.length)];
  setup();
}
function renderTopicPicker() {
  $("topicPreferenceHint").textContent = `当前：${selectedCategory}`;
  $("topicChips").innerHTML = categories.map((category) => `<button type="button" class="topic-chip${category === selectedCategory ? " selected" : ""}" role="option" aria-selected="${category === selectedCategory}" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>`).join("");
  document.querySelectorAll(".topic-chip").forEach((button) => button.addEventListener("click", () => {
    selectedCategory = button.dataset.category;
    localStorage.setItem(preferenceKey, selectedCategory);
    const pool = selectedCategory === "全部方向" ? topics : topics.filter((topic) => topic.category === selectedCategory);
    today = pool[Math.floor(Math.random() * pool.length)];
    setup();
  }));
}
function setRecordingUI(recording) {
  const button = $("recordButton");
  button.classList.toggle("recording", recording); button.setAttribute("aria-pressed", String(recording));
  button.setAttribute("aria-label", recording ? "结束录音" : "开始录音");
  $("micIcon").textContent = recording ? "■" : "⌁";
  $("recordLabel").textContent = recording ? "点击结束录音 · 最长55秒" : "点击开始录音";
  $("wave").classList.toggle("listening", recording);
  $("recordCountdown").hidden = !recording;
  if (recording) $("recordCountdown").textContent = `剩余 ${maxRecordingSeconds} 秒`;
}
function updateRecordingTimer() {
  if (!recordingStartedAt) return;
  const seconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
  if (seconds >= maxRecordingSeconds) {
    $("recordStatus").textContent = "已达到55秒，正在整理录音…";
    $("recordCountdown").textContent = "录音已自动停止";
    if (recorder?.state === "recording") { recorder.stop(); stopRecognition(); }
    return;
  }
  const remaining = maxRecordingSeconds - seconds;
  const hint = seconds >= 50 ? ` · 还剩 ${remaining} 秒` : " · 建议控制在30–55秒";
  $("recordCountdown").textContent = seconds >= 50 ? `请准备收束 · 剩余 ${remaining} 秒` : `剩余 ${remaining} 秒`;
  $("recordStatus").textContent = `正在录音 · ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}${hint}`;
}
function escapeHTML(value = "") { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function renderHistory() {
  const list = sessions().slice().reverse();
  $("historyCount").textContent = `${list.length} 次`;
  $("historyList").innerHTML = list.length ? list.map((item) => `<article class="history-item"><div><strong>${escapeHTML(item.focus)}</strong><small>${escapeHTML(item.date)} · ${escapeHTML(item.time || "")}</small></div><p>${escapeHTML(item.transcript || "完成了一次口头表达练习")}</p></article>`).join("") : '<p class="empty-history">完成一次练习后，这里会留下你的表达轨迹。</p>';
}
function openHistory() {
  $("historyCard").hidden = false; renderHistory();
  $("historyButton").classList.add("active"); $("trainingButton").classList.remove("active");
  $("historyCard").scrollIntoView({ behavior: "smooth", block: "start" });
}
function openTraining() {
  $("historyButton").classList.remove("active"); $("trainingButton").classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function showTranscript(state, text) { $("transcriptCard").hidden = false; $("transcriptState").textContent = state; if (text) $("transcript").value = text; }
function startRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return false;
  try {
    recognition = new SpeechRecognition(); recognition.lang = "zh-CN"; recognition.continuous = true; recognition.interimResults = true;
    recognition.onresult = (event) => { let all = ""; for (let i = 0; i < event.results.length; i += 1) all += event.results[i][0].transcript; spokenText = all.trim(); showTranscript("识别中", spokenText); };
    recognition.onerror = () => { if (!spokenText) showTranscript("等待云端转写", ""); };
    recognition.start(); return true;
  } catch { return false; }
}
function stopRecognition() { try { recognition?.stop(); } catch {} }
async function transcribeAudio(blob) {
  const form = new FormData();
  form.append("file", blob, "recording.wav");
  const response = await fetch(transcribeEndpoint, { method: "POST", body: form });
  let result = {};
  try { result = await response.json(); } catch {}
  if (!response.ok) throw new Error(result.error || "云端转写失败");
  return String(result.text || "").trim();
}
async function normalizeAudioBlob(blob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return blob;
  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = 1; const targetRate = 16000; const frameCount = Math.ceil(buffer.duration * targetRate); const bytesPerSample = 2;
    const output = new ArrayBuffer(44 + frameCount * channels * bytesPerSample); const view = new DataView(output);
    const writeString = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    writeString(0, "RIFF"); view.setUint32(4, 36 + frameCount * channels * bytesPerSample, true); writeString(8, "WAVE"); writeString(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * channels * bytesPerSample, true); view.setUint16(32, channels * bytesPerSample, true); view.setUint16(34, 16, true); writeString(36, "data"); view.setUint32(40, frameCount * channels * bytesPerSample, true);
    let offset = 44;
    const sourceChannels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
    for (let frame = 0; frame < frameCount; frame += 1) { const sourceFrame = Math.min(buffer.length - 1, Math.floor(frame * buffer.sampleRate / targetRate)); const sample = sourceChannels.reduce((sum, data) => sum + data[sourceFrame], 0) / sourceChannels.length; const clipped = Math.max(-1, Math.min(1, sample)); view.setInt16(offset, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true); offset += 2; }
    return new Blob([output], { type: "audio/wav" });
  } catch { return blob; } finally { try { await context.close(); } catch {} }
}
async function toggleRecord() {
  if (isStarting) return;
  if (recordingActive) {
    try { if (recorder?.state === "recording") recorder.stop(); else recordingActive = false; } catch { $("recordStatus").textContent = "录音停止失败，请再点一次结束录音。"; }
    stopRecognition(); return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { $("recordStatus").textContent = "当前浏览器不支持录音，请在 Chrome 或 Safari 中打开。"; return; }
  isStarting = true; $("recordButton").disabled = true; $("recordStatus").textContent = "正在请求麦克风权限…";
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true }); chunks = []; spokenText = "";
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      recordingActive = false;
      clearInterval(recordingTimer); recordingStartedAt = 0;
      $("recordCountdown").hidden = true;
      const sourceBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" }); $("recordStatus").textContent = "正在整理录音…"; const blob = await normalizeAudioBlob(sourceBlob); const audio = $("audio"); audio.src = URL.createObjectURL(blob); audio.hidden = false;
      stream.getTracks().forEach((track) => track.stop()); setRecordingUI(false); $("recordLabel").textContent = "录音已完成"; $("recordButton").disabled = false;
      if (spokenText) { showTranscript("已转文字", spokenText); $("recordStatus").textContent = "文字已自动填入，可以直接开始复盘。"; }
      else {
        showTranscript("云端转写中", ""); $("recordStatus").textContent = "正在上传录音并转文字…";
        try {
          const transcript = await transcribeAudio(blob);
          if (transcript) { spokenText = transcript; showTranscript("已转文字", transcript); $("recordStatus").textContent = "文字已自动填入，可以直接开始复盘。"; }
          else { showTranscript("未识别到文字", ""); $("recordStatus").textContent = "没有识别到清晰语音，可以直接编辑文字。"; }
        } catch (error) {
          showTranscript("转写失败", ""); $("recordStatus").textContent = `云端转写失败：${error.message}，你可以手动输入文字。`;
        }
      }
    };
    recorder.start(); recordingActive = true; const browserTranscription = startRecognition(); recordingStartedAt = Date.now(); recordingTimer = setInterval(updateRecordingTimer, 1000); setRecordingUI(true); $("recordButton").disabled = false; $("recordStatus").textContent = browserTranscription ? "正在录音，并同步转文字…建议控制在30–55秒" : "正在录音…建议控制在30–55秒";
  } catch { recordingActive = false; $("recordStatus").textContent = "请允许浏览器使用麦克风后重试。"; $("recordButton").disabled = false; }
  finally { isStarting = false; }
}
async function createFeedback() {
  const text = $("transcript").value.trim();
  if (text.length < 10) { $("transcriptState").textContent = "请补充内容"; return; }
  const button = $("feedbackButton"); button.disabled = true; button.textContent = "AI 正在分析你的表达…";
  $("transcriptState").textContent = "分析中";
  try {
    const response = await fetch(feedbackEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: selectedCategory, scenario: today.scenario, question: today.question, transcript: text }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "AI 反馈失败");
    $("feedbackTitle").textContent = result.title; $("feedbackText").textContent = result.text;
    $("feedbackCard").hidden = false; $("feedbackCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    $("transcriptState").textContent = "分析失败";
    $("recordStatus").textContent = `AI 反馈失败：${error.message}，请稍后重试。`;
  } finally { button.disabled = false; button.textContent = "给我一个 AI 改进点"; }
}
function finishSession() { const list = sessions(); const now = new Date(); list.push({ date: dateKey(now), time: now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }), category: today.category, focus: today.focus, scenario: today.scenario, transcript: $("transcript").value.trim() }); localStorage.setItem(key, JSON.stringify(list)); $("retryButton").textContent = "今天已完成 ✓"; $("retryButton").disabled = true; setup(); renderHistory(); }
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredPrompt = event; $("installButton").hidden = false; });
$("installButton").addEventListener("click", async () => { await deferredPrompt?.prompt(); $("installButton").hidden = true; });
$("recordButton").addEventListener("click", toggleRecord); $("feedbackButton").addEventListener("click", createFeedback); $("retryButton").addEventListener("click", finishSession);
$("historyButton").addEventListener("click", openHistory); $("trainingButton").addEventListener("click", openTraining);
$("topicButton").addEventListener("click", chooseTopic); $("refreshButton").addEventListener("click", chooseTopic);
document.addEventListener("visibilitychange", () => { if (document.hidden && recordingActive) { try { recorder?.stop(); } catch {} stopRecognition(); $("recordStatus").textContent = "页面暂时离开，录音已安全结束。"; } });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js?v=8", { updateViaCache: "none" });
setup();
