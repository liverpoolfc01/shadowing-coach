const DATA_URL = "./audio-manifest.json";
const REMOTE_ASSET_ORIGIN = "https://incandescent-tapioca-61a2a5.netlify.app";
const STORAGE_KEY = "shadowing-coach-progress-v2";
const PASS_SCORE = 86;

const state = {
  lines: [],
  filteredLines: [],
  currentId: null,
  selectorMode: "window",
  recognition: null,
  recognitionActive: false,
  mediaStream: null,
  mediaRecorder: null,
  recordingLineId: null,
  recordingChunks: [],
  recordingUrls: {},
  isRecording: false,
  progress: loadProgress(),
};

const els = {
  app: document.querySelector("#app"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  statusHint: document.querySelector("#statusHint"),
  lineNumber: document.querySelector("#lineNumber"),
  lineTime: document.querySelector("#lineTime"),
  bestBadge: document.querySelector("#bestBadge"),
  lineText: document.querySelector("#lineText"),
  inlineTranslation: document.querySelector("#inlineTranslation"),
  showTranslation: document.querySelector("#showTranslation"),
  clipPlayer: document.querySelector("#clipPlayer"),
  voicePlayback: document.querySelector("#voicePlayback"),
  voiceHint: document.querySelector("#voiceHint"),
  userPlayer: document.querySelector("#userPlayer"),
  reviewUserPlayer: document.querySelector("#reviewUserPlayer"),
  compareAudioBtn: document.querySelector("#compareAudioBtn"),
  audioBtn: document.querySelector("#audioBtn"),
  replaySlowBtn: document.querySelector("#replaySlowBtn"),
  rateInput: document.querySelector("#rateInput"),
  prevBtn: document.querySelector("#prevBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  recordBtn: document.querySelector("#recordBtn"),
  markBtn: document.querySelector("#markBtn"),
  recordingStatus: document.querySelector("#recordingStatus"),
  scoreBox: document.querySelector("#scoreBox"),
  summaryBox: document.querySelector("#summaryBox"),
  correctionBox: document.querySelector("#correctionBox"),
  reviewOriginalBtn: document.querySelector("#reviewOriginalBtn"),
  reviewMineBtn: document.querySelector("#reviewMineBtn"),
  reviewCompareBtn: document.querySelector("#reviewCompareBtn"),
  transcriptBox: document.querySelector("#transcriptBox"),
  manualInput: document.querySelector("#manualInput"),
  checkManualBtn: document.querySelector("#checkManualBtn"),
  tipsBox: document.querySelector("#tipsBox"),
  searchInput: document.querySelector("#searchInput"),
  showCurrentWindowBtn: document.querySelector("#showCurrentWindowBtn"),
  showAllBtn: document.querySelector("#showAllBtn"),
  showDoneBtn: document.querySelector("#showDoneBtn"),
  libraryCount: document.querySelector("#libraryCount"),
  lineList: document.querySelector("#lineList"),
  template: document.querySelector("#lineItemTemplate"),
  tabs: Array.from(document.querySelectorAll(".tab-btn")),
};

boot();

async function boot() {
  bindEvents();
  setupRecognition();

  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    hydrate(payload.clips || []);
    els.statusHint.textContent = `已载入 ${state.lines.length} 句可跟读。`;
  } catch (error) {
    hydrate(fallbackLines());
    els.statusHint.textContent = "本地清单读取失败，已载入示例句。";
    console.warn(error);
  }
}

function bindEvents() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  els.showTranslation.addEventListener("change", renderCurrentLine);
  els.rateInput.addEventListener("input", () => {
    els.clipPlayer.playbackRate = Number(els.rateInput.value) || 1;
  });
  els.audioBtn.addEventListener("click", () => playCurrentClip());
  els.replaySlowBtn.addEventListener("click", () => playCurrentClip(0.78));
  els.compareAudioBtn.addEventListener("click", playOriginalThenMine);
  els.reviewOriginalBtn.addEventListener("click", () => playCurrentClip());
  els.reviewMineBtn.addEventListener("click", playUserRecording);
  els.reviewCompareBtn.addEventListener("click", playOriginalThenMine);
  els.prevBtn.addEventListener("click", () => moveCurrent(-1));
  els.nextBtn.addEventListener("click", () => moveCurrent(1));
  els.recordBtn.addEventListener("click", toggleRecording);
  els.markBtn.addEventListener("click", toggleCurrentDone);
  els.checkManualBtn.addEventListener("click", handleManualCheck);
  els.searchInput.addEventListener("input", renderList);
  els.showCurrentWindowBtn.addEventListener("click", () => setSelectorMode("window"));
  els.showAllBtn.addEventListener("click", () => setSelectorMode("all"));
  els.showDoneBtn.addEventListener("click", () => setSelectorMode("done"));
  els.clipPlayer.addEventListener("error", handleAudioError);
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function hydrate(lines) {
  state.lines = lines.filter((line) => wordsForCompare(line.text).length > 0);
  state.currentId = state.lines[0]?.id || null;
  renderAll();
}

function renderAll() {
  renderCurrentLine();
  renderProgress();
  renderList();
}

function currentLine() {
  return state.lines.find((line) => line.id === state.currentId) || state.lines[0] || null;
}

function currentLineIndex() {
  return state.lines.findIndex((line) => line.id === state.currentId);
}

function renderCurrentLine() {
  const line = currentLine();
  if (!line) {
    els.lineNumber.textContent = "句子 000";
    els.lineTime.textContent = "00:00";
    els.lineText.textContent = "还没有可练习的句子。";
    return;
  }

  const progress = state.progress[line.id] || {};
  els.lineNumber.textContent = `句子 ${String(line.id).padStart(3, "0")}`;
  els.lineTime.textContent = line.time;
  els.bestBadge.textContent = progress.bestScore != null ? `最佳 ${progress.bestScore}%` : "最佳 --";
  els.lineText.textContent = line.text;
  els.markBtn.textContent = progress.done ? "取消已练" : "标记已练";
  els.audioBtn.disabled = !line.audio;
  els.clipPlayer.playbackRate = Number(els.rateInput.value) || 1;
  renderVoicePlayback(line.id);

  if (els.showTranslation.checked) {
    els.inlineTranslation.classList.remove("is-hidden");
    els.inlineTranslation.textContent = translateLine(line.text);
  } else {
    els.inlineTranslation.classList.add("is-hidden");
  }

  if (progress.lastTranscript) {
    const analysis = analyzeSpeech(line.text, progress.lastTranscript);
    renderReview(analysis, progress.lastTranscript);
  } else {
    clearReview();
  }
}

function renderProgress() {
  const total = state.lines.length;
  const done = state.lines.filter((line) => state.progress[line.id]?.done).length;
  const pct = total ? (done / total) * 100 : 0;
  els.progressText.textContent = `${done} / ${total}`;
  els.progressBar.style.width = `${pct.toFixed(1)}%`;
}

function renderList() {
  const active = currentLine();
  const query = els.searchInput.value.trim().toLowerCase();

  let lines = state.lines.filter((line) => {
    if (state.selectorMode === "done" && !state.progress[line.id]?.done) return false;
    if (!query) return true;
    return [
      String(line.id),
      line.time,
      line.text.toLowerCase(),
      translateLine(line.text).toLowerCase(),
    ].some((value) => value.includes(query));
  });

  if (state.selectorMode === "window" && active && !query) {
    lines = lines.filter((line) => Math.abs(line.id - active.id) <= 25);
  }

  state.filteredLines = lines;
  els.libraryCount.textContent = `${lines.length} 句`;
  els.lineList.innerHTML = "";

  if (!lines.length) {
    els.lineList.innerHTML = '<p class="muted">没有匹配的句子。</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const line of lines) {
    const progress = state.progress[line.id] || {};
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.querySelector(".line-item-meta").textContent = `${String(line.id).padStart(3, "0")} · ${line.time}`;
    node.querySelector(".line-item-score").textContent = progress.bestScore != null ? `${progress.bestScore}%` : "";
    node.querySelector(".line-item-text").textContent = compactText(line.text, 86);
    if (line.id === active?.id) node.classList.add("active");
    if (progress.done) node.classList.add("done");
    node.addEventListener("click", () => {
      state.currentId = line.id;
      renderAll();
      switchView("practice");
    });
    fragment.appendChild(node);
  }

  els.lineList.appendChild(fragment);
}

function setSelectorMode(mode) {
  state.selectorMode = mode;
  const pressed = {
    window: els.showCurrentWindowBtn,
    all: els.showAllBtn,
    done: els.showDoneBtn,
  };
  Object.entries(pressed).forEach(([key, button]) => {
    button.setAttribute("aria-pressed", String(key === mode));
  });
  renderList();
}

function moveCurrent(step) {
  const index = currentLineIndex();
  if (index < 0) return;
  const nextIndex = Math.min(Math.max(index + step, 0), state.lines.length - 1);
  state.currentId = state.lines[nextIndex].id;
  renderAll();
}

function toggleCurrentDone() {
  const line = currentLine();
  if (!line) return;
  const progress = state.progress[line.id] || {};
  state.progress[line.id] = { ...progress, done: !progress.done };
  saveProgress();
  renderAll();
}

function switchView(view) {
  els.app.dataset.view = view;
  els.tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === view);
  });
}

function playCurrentClip(forcedRate = null) {
  const line = currentLine();
  if (!line?.audio) return Promise.resolve();

  const rate = forcedRate || Number(els.rateInput.value) || 1;
  els.clipPlayer.pause();
  els.userPlayer.pause();
  els.reviewUserPlayer.pause();
  els.clipPlayer.muted = false;
  els.clipPlayer.volume = 1;
  els.clipPlayer.src = resolveAudioUrl(line.audio);
  els.clipPlayer.playbackRate = rate;
  els.clipPlayer.currentTime = 0;
  els.clipPlayer.load();
  const playPromise = els.clipPlayer.play();
  return playPromise.catch((error) => {
    els.recordingStatus.textContent = "原声播放失败，请点播放器再试一次。";
    console.warn(error);
  });
}

function handleAudioError() {
  const line = currentLine();
  if (!line?.audio || !els.clipPlayer.src) return;
  const fallback = new URL(line.audio, `${REMOTE_ASSET_ORIGIN}/`).href;
  if (els.clipPlayer.src === fallback) return;
  els.clipPlayer.src = fallback;
  els.clipPlayer.load();
  els.clipPlayer.play().catch(() => {
    els.recordingStatus.textContent = "已切换到线上音频，请再点一次播放。";
  });
}

function renderVoicePlayback(lineId) {
  const url = state.recordingUrls[lineId];
  const hasRecording = Boolean(url);
  els.voicePlayback.classList.toggle("is-empty", !hasRecording);
  els.compareAudioBtn.disabled = !hasRecording;
  els.reviewMineBtn.disabled = !hasRecording;
  els.reviewCompareBtn.disabled = !hasRecording;
  els.reviewUserPlayer.classList.toggle("has-audio", hasRecording);

  if (!hasRecording) {
    if (!state.isRecording) {
      els.voiceHint.textContent = "跟读后这里会出现你的声音回放。";
      els.userPlayer.removeAttribute("src");
      els.userPlayer.load();
      els.reviewUserPlayer.removeAttribute("src");
      els.reviewUserPlayer.load();
    }
    return;
  }

  if (els.userPlayer.src !== url) {
    els.userPlayer.src = url;
    els.userPlayer.load();
  }
  if (els.reviewUserPlayer.src !== url) {
    els.reviewUserPlayer.src = url;
    els.reviewUserPlayer.load();
  }
  els.voiceHint.textContent = "可以播放自己的声音，再和原声对比。";
}

function playUserRecording() {
  const line = currentLine();
  const url = line ? state.recordingUrls[line.id] : "";
  if (!url) {
    els.recordingStatus.textContent = "这一句还没有录音。";
    return Promise.resolve();
  }

  els.clipPlayer.pause();
  const player = currentUserAudioPlayer();
  const otherPlayer = player === els.userPlayer ? els.reviewUserPlayer : els.userPlayer;
  otherPlayer.pause();
  if (player.src !== url) {
    player.src = url;
    player.load();
  }
  player.currentTime = 0;
  const playPromise = player.play();
  return playPromise.catch((error) => {
    els.recordingStatus.textContent = "我的录音播放失败，请点播放器再试一次。";
    console.warn(error);
  });
}

function currentUserAudioPlayer() {
  return els.app.dataset.view === "review" ? els.reviewUserPlayer : els.userPlayer;
}

async function playOriginalThenMine() {
  const line = currentLine();
  if (!line || !state.recordingUrls[line.id]) {
    els.recordingStatus.textContent = "这一句还没有录音，先点开始跟读。";
    return;
  }

  els.recordingStatus.textContent = "先播放原声，随后播放你的录音。";
  await playCurrentClip();
  await waitForAudioEnd(els.clipPlayer, Math.max((line.duration || 4) * 1000 + 1800, 4500));
  els.recordingStatus.textContent = "现在播放你的录音。";
  await playUserRecording();
}

function waitForAudioEnd(audio, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      audio.removeEventListener("ended", finish);
      audio.removeEventListener("error", finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
  });
}

function resolveAudioUrl(audio) {
  if (/^https?:\/\//i.test(audio)) return audio;
  const localPreview = ["", "localhost", "127.0.0.1"].includes(window.location.hostname)
    || window.location.protocol === "file:";
  const base = localPreview ? REMOTE_ASSET_ORIGIN : window.location.origin;
  return new URL(audio, `${base}/`).href;
}

function setupRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    els.recordingStatus.textContent = "当前浏览器不支持自动识别，但可以录音回放并手动纠错。";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    state.recognitionActive = true;
  };

  recognition.onend = () => {
    state.recognitionActive = false;
    if (state.isRecording) {
      stopRecordingSession("recognition-ended");
    }
  };

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(" ")
      .trim();
    handleTranscript(transcript);
  };

  recognition.onerror = (event) => {
    els.recordingStatus.textContent = `识别失败：${event.error}。`;
  };

  state.recognition = recognition;
}

function toggleRecording() {
  if (state.isRecording) {
    stopRecordingSession("manual-stop");
    return;
  }

  startRecordingSession();
}

async function startRecordingSession() {
  const line = currentLine();
  if (!line) return;

  els.transcriptBox.textContent = "识别中...";
  els.scoreBox.textContent = "--";
  els.summaryBox.textContent = "正在录音和识别。";
  els.correctionBox.innerHTML = '<span class="empty-state">正在听...</span>';
  els.recordingStatus.textContent = "正在准备麦克风。";
  els.clipPlayer.pause();
  els.userPlayer.pause();
  els.reviewUserPlayer.pause();
  switchView("practice");

  state.recordingLineId = line.id;
  state.recordingChunks = [];

  const recorderStarted = await startUserAudioRecording(line.id);
  const recognitionStarted = startSpeechRecognition();

  if (!recorderStarted && !recognitionStarted) {
    els.recordingStatus.textContent = "无法启动麦克风。请检查浏览器麦克风权限。";
    updateRecordingUi(false);
    return;
  }

  state.isRecording = true;
  updateRecordingUi(true);
  els.recordingStatus.textContent = recognitionStarted
    ? "正在录音并识别，读完会自动生成回放。"
    : "正在录音。读完点停止，再用手动纠错对比文字。";
}

async function startUserAudioRecording(lineId) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    els.voiceHint.textContent = "当前浏览器不支持录音回放。";
    return false;
  }

  try {
    state.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const options = preferredRecorderOptions();
    const recorder = options ? new MediaRecorder(state.mediaStream, options) : new MediaRecorder(state.mediaStream);
    state.mediaRecorder = recorder;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) {
        state.recordingChunks.push(event.data);
      }
    });

    recorder.addEventListener("stop", () => {
      finalizeUserRecording(lineId, recorder.mimeType);
    });

    recorder.start();
    els.voicePlayback.classList.remove("is-empty");
    els.voiceHint.textContent = "正在录音...";
    return true;
  } catch (error) {
    els.voiceHint.textContent = "录音启动失败，请允许麦克风权限后再试。";
    console.warn(error);
    stopMicStream();
    return false;
  }
}

function preferredRecorderOptions() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType } : null;
}

function startSpeechRecognition() {
  if (!state.recognition) return false;
  try {
    state.recognition.start();
    return true;
  } catch (error) {
    els.recordingStatus.textContent = "识别启动失败，但录音回放仍可使用。";
    console.warn(error);
    return false;
  }
}

function stopRecordingSession(reason = "manual-stop") {
  const wasRecording = state.isRecording;
  state.isRecording = false;
  updateRecordingUi(false);

  if (state.recognitionActive && state.recognition) {
    try {
      state.recognition.stop();
    } catch (error) {
      console.warn(error);
    }
    state.recognitionActive = false;
  }

  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    els.recordingStatus.textContent = "正在生成你的录音回放。";
    state.mediaRecorder.stop();
  } else {
    stopMicStream();
    if (wasRecording && reason === "manual-stop") {
      els.recordingStatus.textContent = "已停止跟读。";
    }
  }
}

function updateRecordingUi(isActive) {
  els.recordBtn.textContent = isActive ? "停止跟读" : "开始跟读";
  els.recordBtn.classList.toggle("is-recording", isActive);
  els.prevBtn.disabled = isActive;
  els.nextBtn.disabled = isActive;
  els.markBtn.disabled = isActive;
}

function finalizeUserRecording(lineId, mimeType = "audio/webm") {
  const chunks = state.recordingChunks.splice(0);
  stopMicStream();
  state.mediaRecorder = null;

  if (!chunks.length) {
    renderVoicePlayback(lineId);
    els.voiceHint.textContent = "这次没有录到声音，可以再试一次。";
    return;
  }

  if (state.recordingUrls[lineId]) {
    URL.revokeObjectURL(state.recordingUrls[lineId]);
  }

  const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
  state.recordingUrls[lineId] = URL.createObjectURL(blob);
  if (currentLine()?.id === lineId) {
    renderVoicePlayback(lineId);
  }
  els.recordingStatus.textContent = "已生成你的录音，可以和原声对比。";
}

function stopMicStream() {
  if (!state.mediaStream) return;
  state.mediaStream.getTracks().forEach((track) => track.stop());
  state.mediaStream = null;
}

function handleManualCheck() {
  const transcript = els.manualInput.value.trim();
  if (!transcript) {
    els.manualInput.focus();
    return;
  }
  handleTranscript(transcript);
  switchView("review");
}

function handleTranscript(transcript) {
  const line = currentLine();
  if (!line || !transcript) {
    els.recordingStatus.textContent = "这次没有识别到完整句子，可以再试一次。";
    clearReview();
    return;
  }

  const analysis = analyzeSpeech(line.text, transcript);
  const previous = state.progress[line.id] || {};
  const bestScore = Math.max(previous.bestScore || 0, analysis.score);

  state.progress[line.id] = {
    ...previous,
    lastScore: analysis.score,
    bestScore,
    lastTranscript: transcript,
    done: previous.done || analysis.score >= PASS_SCORE,
    attempts: (previous.attempts || 0) + 1,
  };
  saveProgress();

  renderCurrentLine();
  renderProgress();
  renderList();
  switchView("review");
}

function clearReview() {
  els.scoreBox.textContent = "--";
  els.summaryBox.textContent = "等待第一次跟读。";
  els.correctionBox.innerHTML = '<span class="empty-state">跟读完成后显示正确、漏读、多读和读错的词。</span>';
  els.transcriptBox.textContent = "还没有识别结果。";
  els.tipsBox.innerHTML = "<p>先听原声，再跟读一句。</p>";
}

function renderReview(analysis, transcript) {
  els.scoreBox.textContent = `${analysis.score}%`;
  els.transcriptBox.textContent = transcript;
  els.summaryBox.textContent = buildSummary(analysis);
  els.correctionBox.innerHTML = renderAlignment(analysis.alignment);
  els.tipsBox.innerHTML = renderTips(analysis);
  els.recordingStatus.textContent = analysis.score >= PASS_SCORE
    ? "这一句已经达标。"
    : "这一句还可以再跟一遍。";
}

function analyzeSpeech(target, spoken) {
  const expected = wordsForCompare(target);
  const actual = wordsForCompare(spoken);
  const alignment = alignWords(expected, actual);
  const correct = alignment.filter((item) => item.type === "equal").length;
  const missed = alignment.filter((item) => item.type === "delete").length;
  const changed = alignment.filter((item) => item.type === "replace").length;
  const extra = alignment.filter((item) => item.type === "insert").length;
  const distance = missed + changed + extra * 0.65;
  const base = Math.max(expected.length, actual.length, 1);
  const score = Math.max(0, Math.round((1 - distance / base) * 100));

  return {
    expected,
    actual,
    alignment,
    correct,
    missed,
    changed,
    extra,
    score,
  };
}

function alignWords(expected, actual) {
  const rows = expected.length + 1;
  const cols = actual.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = expected[i - 1] === actual[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + cost,
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
      );
    }
  }

  const alignment = [];
  let i = expected.length;
  let j = actual.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cost = expected[i - 1] === actual[j - 1] ? 0 : 1;
      if (dp[i][j] === dp[i - 1][j - 1] + cost) {
        alignment.unshift({
          type: cost === 0 ? "equal" : "replace",
          expected: expected[i - 1],
          actual: actual[j - 1],
          index: i - 1,
        });
        i -= 1;
        j -= 1;
        continue;
      }
    }

    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      alignment.unshift({ type: "delete", expected: expected[i - 1], actual: "", index: i - 1 });
      i -= 1;
      continue;
    }

    alignment.unshift({ type: "insert", expected: "", actual: actual[j - 1], index: i });
    j -= 1;
  }

  return alignment;
}

function wordsForCompare(text) {
  return normalizeForCompare(text)
    .match(/[a-z0-9]+/g) || [];
}

function normalizeForCompare(text) {
  const replacements = [
    [/\bI'm\b/gi, "I am"],
    [/\byou're\b/gi, "you are"],
    [/\bwe're\b/gi, "we are"],
    [/\bthey're\b/gi, "they are"],
    [/\bit's\b/gi, "it is"],
    [/\bthat's\b/gi, "that is"],
    [/\bthere's\b/gi, "there is"],
    [/\bdon't\b/gi, "do not"],
    [/\bdoesn't\b/gi, "does not"],
    [/\bdidn't\b/gi, "did not"],
    [/\bcan't\b/gi, "can not"],
    [/\bcannot\b/gi, "can not"],
    [/\bwon't\b/gi, "will not"],
    [/\bwouldn't\b/gi, "would not"],
    [/\bcouldn't\b/gi, "could not"],
    [/\bshouldn't\b/gi, "should not"],
    [/\bI've\b/gi, "I have"],
    [/\byou've\b/gi, "you have"],
    [/\bI'd\b/gi, "I would"],
    [/\byou'd\b/gi, "you would"],
    [/\bI'll\b/gi, "I will"],
    [/\byou'll\b/gi, "you will"],
    [/\bwhat's\b/gi, "what is"],
    [/\bwho's\b/gi, "who is"],
    [/\b'cause\b/gi, "because"],
    [/\bgonna\b/gi, "going to"],
    [/\bwanna\b/gi, "want to"],
  ];

  let normalized = text.replace(/[’‘]/g, "'");
  for (const [pattern, value] of replacements) {
    normalized = normalized.replace(pattern, value);
  }
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSummary(analysis) {
  if (analysis.score >= 94) return "非常稳，词序和关键词都对齐。";
  if (analysis.score >= PASS_SCORE) return "已达标，少量细节可以继续打磨。";

  const parts = [];
  if (analysis.missed) parts.push(`漏读 ${analysis.missed} 个词`);
  if (analysis.changed) parts.push(`读错 ${analysis.changed} 个词`);
  if (analysis.extra) parts.push(`多读 ${analysis.extra} 个词`);
  return parts.length ? parts.join("，") + "。" : "再试一次，尽量跟住完整句子。";
}

function renderAlignment(alignment) {
  return alignment.map((item) => {
    if (item.type === "equal") {
      return `<span class="word-chip ok">${escapeHtml(item.expected)}</span>`;
    }
    if (item.type === "delete") {
      return `<span class="word-chip missed">${escapeHtml(item.expected)}</span>`;
    }
    if (item.type === "insert") {
      return `<span class="word-chip extra">+ ${escapeHtml(item.actual)}</span>`;
    }
    return `<span class="word-chip wrong"><span>${escapeHtml(item.expected)}</span><span class="heard">听成 ${escapeHtml(item.actual)}</span></span>`;
  }).join("");
}

function renderTips(analysis) {
  const tips = [];
  const missed = alignmentValues(analysis.alignment, "delete", "expected");
  const changed = analysis.alignment
    .filter((item) => item.type === "replace")
    .slice(0, 4)
    .map((item) => `${item.expected} -> ${item.actual}`);
  const extra = alignmentValues(analysis.alignment, "insert", "actual");

  if (missed.length) tips.push(`<p>补上：${escapeHtml(missed.join(", "))}</p>`);
  if (changed.length) tips.push(`<p>注意：${escapeHtml(changed.join(", "))}</p>`);
  if (extra.length) tips.push(`<p>少读多余词：${escapeHtml(extra.join(", "))}</p>`);

  const focus = focusPhrase(analysis);
  if (focus) tips.push(`<p>重读句块：${escapeHtml(focus)}</p>`);
  if (!tips.length) tips.push("<p>可以进入下一句。</p>");
  return tips.join("");
}

function alignmentValues(alignment, type, key) {
  return alignment
    .filter((item) => item.type === type)
    .slice(0, 5)
    .map((item) => item[key]);
}

function focusPhrase(analysis) {
  const firstIssue = analysis.alignment.find((item) => item.type !== "equal");
  if (!firstIssue) return "";
  const start = Math.max(0, firstIssue.index - 2);
  const end = Math.min(analysis.expected.length, firstIssue.index + 4);
  return analysis.expected.slice(start, end).join(" ");
}

function translateLine(text) {
  const exact = {
    "I'm a weirdo. That's what everyone says.": "我是个怪人。大家都这么说。",
    "Sometimes, I don't know what people mean when they say things,": "有时候，我不明白别人说那些话时到底是什么意思。",
    "and that can make me feel alone even when there are other people in the room.": "这会让我即使和别人在同一个房间里，也还是感到孤单。",
    "And all I can do is sit and twiddle,": "而我能做的，只有坐着反复摆弄东西。",
    "which is what I call my self-stimulatory behavior,": "我把这叫作我的自我刺激行为。",
    "when I flick a pencil against a rubber band at a certain frequency": "比如我会以某种固定频率，让铅笔去弹橡皮筋。",
    "and think about all the things that I could never do,": "然后想着那些我永远做不到的事，",
    "like research penguins in Antarctica or have a girlfriend.": "比如去南极研究企鹅，或者拥有一个女朋友。",
  };
  if (exact[text]) return exact[text];

  const replacements = [
    [/I don't know/gi, "我不知道"],
    [/I'd like to/gi, "我想要"],
    [/It's quiet there/gi, "那里很安静"],
    [/People/gi, "人们"],
    [/girls/gi, "女生"],
    [/girl/gi, "女生"],
    [/date/gi, "约会"],
    [/dating/gi, "谈恋爱"],
    [/penguins/gi, "企鹅"],
    [/Antarctica/gi, "南极洲"],
    [/brain/gi, "大脑"],
    [/research/gi, "研究"],
    [/I like/gi, "我喜欢"],
    [/I love/gi, "我很喜欢"],
    [/I'm/gi, "我是"],
    [/You're/gi, "你是"],
    [/weird/gi, "奇怪"],
    [/alone/gi, "孤单"],
    [/sorry/gi, "对不起"],
    [/good/gi, "不错"],
  ];

  let translated = text;
  for (const [pattern, value] of replacements) {
    translated = translated.replace(pattern, value);
  }
  return translated === text ? `参考理解：${text}` : `参考理解：${translated}`;
}

function compactText(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fallbackLines() {
  return [
    {
      id: 1,
      time: "00:07",
      text: "I'm a weirdo. That's what everyone says.",
      audio: "./audio/001.mp3",
    },
    {
      id: 2,
      time: "00:10",
      text: "Sometimes, I don't know what people mean when they say things,",
      audio: "./audio/002.mp3",
    },
  ];
}
