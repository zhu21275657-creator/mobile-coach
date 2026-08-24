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

const topics = [
  { scenario: "日常聊天", focus: "先说结论", question: "朋友问你最近怎么样。请讲一件最近发生的小事，不要只回答“还行”。" },
  { scenario: "工作表达", focus: "说话有结构", question: "请用一分钟说清楚：你这周最重要的一项进展，以及接下来准备怎么做。" },
  { scenario: "即兴表达", focus: "用例子说话", question: "你认为“忙”代表一个人有价值吗？先说观点，再举一个真实例子。" },
  { scenario: "观点表达", focus: "先说观点", question: "你更喜欢独处还是热闹？先说选择，再讲一个让你这么想的经历。" },
  { scenario: "故事叙述", focus: "讲清经过", question: "讲一次最近让你觉得有点意外的经历，按‘起因—经过—结果’说清楚。" },
  { scenario: "沟通回应", focus: "具体地回应", question: "别人请你推荐一个最近用过的好东西，请说清楚它解决了什么问题。" },
  { scenario: "自我介绍", focus: "说出特点", question: "用一分钟介绍自己：你擅长什么、正在练习什么、希望别人记住你哪一点？" },
  { scenario: "情绪表达", focus: "说出感受", question: "讲一件最近让你开心或烦恼的事，并说明它为什么影响了你。" },
  { scenario: "复盘总结", focus: "提炼经验", question: "回想一次最近做得不够好的事情：发生了什么，下次你会怎么调整？" },
];
let today = topics[Math.floor(Date.now() / 86400000) % topics.length];

function sessions() { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } }
function dateKey(date = new Date()) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-"); }
function streak() { const days = new Set(sessions().map((item) => item.date)); let date = new Date(); if (!days.has(dateKey(date))) date.setDate(date.getDate() - 1); let count = 0; while (days.has(dateKey(date))) { count += 1; date.setDate(date.getDate() - 1); } return count; }
function setup() {
  const hour = new Date().getHours(); $("greeting").textContent = hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  $("focusTag").textContent = today.focus; $("scenario").textContent = today.scenario; $("question").textContent = today.question;
  const count = sessions().length; $("streak").textContent = streak(); $("weekProgress").textContent = count ? `已完成 ${count} 次练习` : "本周刚开始";
}
function chooseTopic() {
  const choices = topics.filter((topic) => topic !== today);
  today = choices[Math.floor(Math.random() * choices.length)];
  setup();
}
function setRecordingUI(recording) {
  const button = $("recordButton");
  button.classList.toggle("recording", recording); button.setAttribute("aria-pressed", String(recording));
  button.setAttribute("aria-label", recording ? "结束录音" : "开始录音");
  $("micIcon").textContent = recording ? "■" : "⌁";
  $("recordLabel").textContent = recording ? "点击结束录音" : "点击开始录音";
  $("wave").classList.toggle("listening", recording);
}
function updateRecordingTimer() {
  if (!recordingStartedAt) return;
  const seconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
  $("recordStatus").textContent = `正在录音 · ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
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
    const channels = Math.min(buffer.numberOfChannels, 2); const frameCount = buffer.length; const bytesPerSample = 2;
    const output = new ArrayBuffer(44 + frameCount * channels * bytesPerSample); const view = new DataView(output);
    const writeString = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    writeString(0, "RIFF"); view.setUint32(4, 36 + frameCount * channels * bytesPerSample, true); writeString(8, "WAVE"); writeString(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true); view.setUint16(32, channels * bytesPerSample, true); view.setUint16(34, 16, true); writeString(36, "data"); view.setUint32(40, frameCount * channels * bytesPerSample, true);
    let offset = 44;
    for (let frame = 0; frame < frameCount; frame += 1) for (let channel = 0; channel < channels; channel += 1) { const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame])); view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); offset += 2; }
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
    recorder.start(); recordingActive = true; const browserTranscription = startRecognition(); recordingStartedAt = Date.now(); recordingTimer = setInterval(updateRecordingTimer, 1000); setRecordingUI(true); $("recordButton").disabled = false; $("recordStatus").textContent = browserTranscription ? "正在录音，并同步转文字…" : "正在录音…";
  } catch { recordingActive = false; $("recordStatus").textContent = "请允许浏览器使用麦克风后重试。"; $("recordButton").disabled = false; }
  finally { isStarting = false; }
}
function createFeedback() {
  const text = $("transcript").value.trim(); if (text.length < 10) { $("transcriptState").textContent = "请补充内容"; return; }
  const fillers = (text.match(/(嗯|呃|那个|然后|就是)/g) || []).length;
  let title = "先把结论放到第一句"; let copy = "重说时，先用一句话回答“我最想表达什么”，再解释原因。听的人会更容易跟上你。";
  if (fillers >= 3) { title = "用停顿替代填充词"; copy = `这段里出现了 ${fillers} 个常见填充词。下一遍遇到空白时，停半秒再继续；停顿比“嗯、那个”更有力量。`; }
  else if (!/(一次|那天|后来|当时|我记得)/.test(text)) { title = "补一个真实画面"; copy = "下一遍加一个真实片段：那时在哪里、谁在场、发生了什么。具体细节会让人愿意听下去。"; }
  $("feedbackTitle").textContent = title; $("feedbackText").textContent = copy; $("feedbackCard").hidden = false; $("feedbackCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function finishSession() { const list = sessions(); const now = new Date(); list.push({ date: dateKey(now), time: now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }), focus: today.focus, scenario: today.scenario, transcript: $("transcript").value.trim() }); localStorage.setItem(key, JSON.stringify(list)); $("retryButton").textContent = "今天已完成 ✓"; $("retryButton").disabled = true; setup(); renderHistory(); }
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredPrompt = event; $("installButton").hidden = false; });
$("installButton").addEventListener("click", async () => { await deferredPrompt?.prompt(); $("installButton").hidden = true; });
$("recordButton").addEventListener("click", toggleRecord); $("feedbackButton").addEventListener("click", createFeedback); $("retryButton").addEventListener("click", finishSession);
$("historyButton").addEventListener("click", openHistory); $("trainingButton").addEventListener("click", openTraining);
$("topicButton").addEventListener("click", chooseTopic); $("refreshButton").addEventListener("click", chooseTopic);
document.addEventListener("visibilitychange", () => { if (document.hidden && recordingActive) { try { recorder?.stop(); } catch {} stopRecognition(); $("recordStatus").textContent = "页面暂时离开，录音已安全结束。"; } });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
setup();
