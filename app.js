(() => {
  const $ = (id) => document.getElementById(id);
  const micBtn = $('micBtn');
  const statusEl = $('status');
  const textEl = $('text');
  const interimEl = $('interim');
  const countEl = $('count');
  const langEl = $('lang');
  const autoPunctEl = $('autoPunct');
  const newLineEl = $('newLine');
  const timestampEl = $('timestamp');
  const fixesEl = $('fixes');
  const historyEl = $('history');
  const historyCountEl = $('historyCount');

  const STORE = {
    text: 'stt.text',
    fixes: 'stt.fixes',
    settings: 'stt.settings',
    history: 'stt.history',
  };

  // localStorage can throw in private mode or when blocked; never let that break the page.
  const load = (key, fallback) => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  };
  const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  };

  // ---------- restore state ----------
  textEl.value = load(STORE.text, '');
  fixesEl.value = load(STORE.fixes, '');
  const settings = load(STORE.settings, {});
  if (settings.lang) langEl.value = settings.lang;
  if (typeof settings.autoPunct === 'boolean') autoPunctEl.checked = settings.autoPunct;
  if (typeof settings.newLine === 'boolean') newLineEl.checked = settings.newLine;
  if (typeof settings.timestamp === 'boolean') timestampEl.checked = settings.timestamp;

  const saveSettings = () => save(STORE.settings, {
    lang: langEl.value,
    autoPunct: autoPunctEl.checked,
    newLine: newLineEl.checked,
    timestamp: timestampEl.checked,
  });
  [langEl, autoPunctEl, newLineEl, timestampEl].forEach((el) => el.addEventListener('change', saveSettings));

  const updateCount = () => {
    countEl.textContent = `${textEl.value.replace(/\s/g, '').length} 字`;
  };
  textEl.addEventListener('input', () => { save(STORE.text, textEl.value); updateCount(); });
  fixesEl.addEventListener('input', () => save(STORE.fixes, fixesEl.value));
  updateCount();

  // ---------- toast ----------
  const toast = document.createElement('div');
  toast.className = 'toast';
  document.body.appendChild(toast);
  let toastTimer;
  const showToast = (msg) => {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
  };

  // ---------- text processing ----------
  const parseFixes = () => fixesEl.value
    .split('\n')
    .map((line) => line.split('='))
    .filter((parts) => parts.length === 2 && parts[0].trim())
    .map(([from, to]) => [from.trim(), to.trim()]);

  const isCJK = () => /^(zh|ja)/.test(langEl.value);
  const pad = (n) => String(n).padStart(2, '0');

  const formatSegment = (raw) => {
    let s = raw.trim();
    if (!s) return '';
    for (const [from, to] of parseFixes()) s = s.split(from).join(to);
    if (autoPunctEl.checked && isCJK() && !/[，。！？、；：,.!?]$/.test(s)) s += '，';
    if (timestampEl.checked) {
      const d = new Date();
      s = `[${pad(d.getHours())}:${pad(d.getMinutes())}] ${s}`;
    }
    return s;
  };

  const appendSegment = (raw) => {
    const seg = formatSegment(raw);
    if (!seg) return;
    let current = textEl.value;
    if (current && newLineEl.checked && !current.endsWith('\n')) current += '\n';
    else if (current && !isCJK() && !/\s$/.test(current)) current += ' ';
    textEl.value = current + seg;
    textEl.scrollTop = textEl.scrollHeight;
    save(STORE.text, textEl.value);
    updateCount();
  };

  // ---------- speech recognition ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!SR) {
    if (isIOS) {
      $('unsupported').innerHTML = 'iPhone／iPad 上只有 <b>Safari</b> 能用語音辨識。請點右上角「⋯」或分享按鈕，選「在 Safari 中打開」，不要用 Chrome、LINE 或 FB 裡的瀏覽器。';
    }
    $('unsupported').hidden = false;
    micBtn.disabled = true;
    statusEl.textContent = '不支援語音辨識';
  }

  let recognition = null;
  let wantRecording = false;
  let autoRestart = false; // true when the current session was started by onend, not by a tap
  let pendingInterim = '';
  let wakeLock = null;

  const setUI = (recording, msg) => {
    micBtn.classList.toggle('recording', recording);
    micBtn.setAttribute('aria-pressed', String(recording));
    micBtn.setAttribute('aria-label', recording ? '停止錄音' : '開始錄音');
    statusEl.classList.toggle('live', recording);
    statusEl.textContent = msg;
  };

  // Keep the screen awake while dictating so the phone/tablet doesn't lock mid-sentence.
  const requestWakeLock = async () => {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* ignore */ }
  };
  const releaseWakeLock = () => {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  };
  document.addEventListener('visibilitychange', () => {
    if (wantRecording && document.visibilityState === 'visible') requestWakeLock();
  });

  const startRecognition = () => {
    recognition = new SR();
    recognition.lang = langEl.value;
    // iOS Safari's continuous mode often never marks results final or repeats them,
    // so on iOS recognize one utterance at a time and restart in onend.
    recognition.continuous = !isIOS;
    recognition.interimResults = true;

    recognition.onstart = () => setUI(true, '正在聆聽…請說話');

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) appendSegment(result[0].transcript);
        else interim += result[0].transcript;
      }
      pendingInterim = interim;
      interimEl.textContent = interim;
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        wantRecording = false;
        releaseWakeLock();
        if (autoRestart) {
          setUI(false, '已暫停，請再按一次麥克風繼續');
        } else if (isIOS) {
          setUI(false, '無法使用語音辨識：請到「設定 > 一般 > 鍵盤」打開「啟用聽寫」，並到「設定 > Safari > 麥克風」選「詢問」或「允許」');
        } else {
          setUI(false, '無法使用麥克風：請在瀏覽器設定中允許此網站使用麥克風');
        }
        return;
      }
      if (event.error === 'network') {
        statusEl.textContent = '網路連線有問題，正在重試…';
        return;
      }
      statusEl.textContent = `發生錯誤：${event.error}`;
    };

    // Browsers stop recognition after a pause or a time limit; restart while the user still wants to record.
    recognition.onend = () => {
      // Some browsers (notably iOS Safari) end without ever marking the last result final; keep that text.
      if (pendingInterim) appendSegment(pendingInterim);
      pendingInterim = '';
      interimEl.textContent = '';
      if (wantRecording) {
        setTimeout(() => { if (wantRecording) { autoRestart = true; startRecognition(); } }, 250);
      } else {
        setUI(false, '已停止');
      }
    };

    try { recognition.start(); } catch { /* already started */ }
  };

  const start = () => {
    if (!SR) return;
    wantRecording = true;
    autoRestart = false;
    setUI(true, '啟動中…');
    requestWakeLock();
    startRecognition();
  };

  const stop = () => {
    wantRecording = false;
    releaseWakeLock();
    if (recognition) recognition.stop();
    setUI(false, '已停止');
  };

  micBtn.addEventListener('click', () => (wantRecording ? stop() : start()));

  langEl.addEventListener('change', () => {
    if (wantRecording && recognition) recognition.stop(); // onend restarts with the new language
  });

  // Space bar toggles recording when not typing in a text box.
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      micBtn.click();
    }
  });

  // ---------- actions ----------
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const tmp = document.createElement('textarea');
      tmp.value = text;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      tmp.remove();
    }
    showToast('已複製');
  };

  const stamp = (d = new Date()) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const downloadText = (text, name) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const fileName = (d = new Date()) => `語音紀錄_${stamp(d).replace(/[ :]/g, '-')}.txt`;

  $('copyBtn').addEventListener('click', () => {
    if (!textEl.value) return showToast('沒有內容');
    copyText(textEl.value);
  });

  $('downloadBtn').addEventListener('click', () => {
    if (!textEl.value) return showToast('沒有內容');
    downloadText(textEl.value, fileName());
  });

  $('clearBtn').addEventListener('click', () => {
    if (!textEl.value) return;
    if (!confirm('確定要清除目前的文字嗎？（建議先「存成一筆紀錄」）')) return;
    textEl.value = '';
    save(STORE.text, '');
    updateCount();
  });

  // ---------- history ----------
  let history = load(STORE.history, []);

  const renderHistory = () => {
    historyCountEl.textContent = history.length;
    historyEl.innerHTML = '';
    history.forEach((item, idx) => {
      const li = document.createElement('li');
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = item.time;
      const preview = document.createElement('div');
      preview.className = 'preview';
      preview.textContent = item.text;
      const row = document.createElement('div');
      row.className = 'row';
      const mk = (label, fn) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.addEventListener('click', fn);
        row.appendChild(b);
      };
      mk('載入編輯', () => {
        if (textEl.value && !confirm('會取代目前的文字，確定嗎？')) return;
        textEl.value = item.text;
        save(STORE.text, textEl.value);
        updateCount();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      mk('複製', () => copyText(item.text));
      mk('下載', () => downloadText(item.text, fileName(new Date(item.ts))));
      mk('刪除', () => {
        if (!confirm('確定刪除這筆紀錄？')) return;
        history.splice(idx, 1);
        save(STORE.history, history);
        renderHistory();
      });
      li.append(meta, preview, row);
      historyEl.appendChild(li);
    });
  };

  $('saveBtn').addEventListener('click', () => {
    const text = textEl.value.trim();
    if (!text) return showToast('沒有內容');
    const now = new Date();
    history.unshift({ ts: now.getTime(), time: stamp(now), text });
    save(STORE.history, history);
    renderHistory();
    showToast('已存成紀錄');
  });

  renderHistory();
})();
