(() => {
  'use strict';

  const STORAGE_KEY = 'video-counter:v0.1';
  const COUNTERS = [
    { key: 'red', color: '#ef476f', label: '赤' },
    { key: 'green', color: '#2ecc71', label: '緑' },
    { key: 'yellow', color: '#f4d03f', label: '黄' },
    { key: 'blue', color: '#3498db', label: '青' },
    { key: 'white', color: '#ecf0f1', label: '白' }
  ];
  const MODES = ['A', 'B', 'C', 'D', 'E', 'F'];

  const defaultsForMode = () => ({
    game: 0,
    counters: Object.fromEntries(COUNTERS.map(c => [c.key, 0]))
  });

  const defaults = () => ({
    version: 1,
    activeMode: 'A',
    videoId: '',
    videoUrl: '',
    modes: Object.fromEntries(MODES.map(m => [m, defaultsForMode()])),
    tools: { startGame: 0, totalGame: 0, trialCount: 0, hitCount: 0 }
  });

  let state = loadState();
  let saveTimer = null;

  const $ = id => document.getElementById(id);
  const els = {
    counterGrid: $('counterGrid'),
    youtubeUrl: $('youtubeUrl'),
    loadVideo: $('loadVideo'),
    clearVideo: $('clearVideo'),
    openVideoSettings: $('openVideoSettings'),
    videoDialog: $('videoDialog'),
    videoError: $('videoError'),
    youtubePlayer: $('youtubePlayer'),
    playerPlaceholder: $('playerPlaceholder'),
    gameCount: $('gameCount'),
    gamePlus: $('gamePlus'),
    gameMinus: $('gameMinus'),
    resetMode: $('resetMode'),
    clearAll: $('clearAll'),
    openTools: $('openTools'),
    toolsDialog: $('toolsDialog'),
    confirmDialog: $('confirmDialog'),
    dialogTitle: $('dialogTitle'),
    dialogMessage: $('dialogMessage'),
    saveStatus: $('saveStatus'),
    startGame: $('startGame'),
    totalGame: $('totalGame'),
    personalGame: $('personalGame'),
    trialCount: $('trialCount'),
    hitCount: $('hitCount'),
    hitRate: $('hitRate')
  };

  function sanitizeNonNegativeInt(value, fallback = 0) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 99999999) : fallback;
  }

  function normalizeMode(input) {
    const base = defaultsForMode();
    if (!input || typeof input !== 'object') return base;
    return {
      game: sanitizeNonNegativeInt(input.game),
      counters: Object.fromEntries(
        COUNTERS.map(c => [c.key, sanitizeNonNegativeInt(input.counters?.[c.key])])
      )
    };
  }

  function loadState() {
    const base = defaults();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      const activeMode = MODES.includes(parsed.activeMode) ? parsed.activeMode : 'A';
      return {
        ...base,
        activeMode,
        videoId: typeof parsed.videoId === 'string' ? parsed.videoId.slice(0, 32) : '',
        videoUrl: typeof parsed.videoUrl === 'string' ? parsed.videoUrl.slice(0, 500) : '',
        modes: Object.fromEntries(MODES.map(m => [m, normalizeMode(parsed.modes?.[m])])),
        tools: {
          startGame: sanitizeNonNegativeInt(parsed.tools?.startGame),
          totalGame: sanitizeNonNegativeInt(parsed.tools?.totalGame),
          trialCount: sanitizeNonNegativeInt(parsed.tools?.trialCount),
          hitCount: sanitizeNonNegativeInt(parsed.tools?.hitCount)
        }
      };
    } catch (error) {
      console.warn('Saved state was invalid and has been reset.', error);
      return base;
    }
  }

  function queueSave() {
    els.saveStatus.textContent = '保存中…';
    els.saveStatus.className = 'save-status is-saving';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        els.saveStatus.textContent = '保存済み';
        els.saveStatus.className = 'save-status is-saved';
      } catch (error) {
        console.error(error);
        els.saveStatus.textContent = '保存できません';
        els.saveStatus.className = 'save-status';
      }
    }, 120);
  }

  function feedback(kind = 'light') {
    document.documentElement.dataset.lastFeedback = String(Date.now());
    if ('vibrate' in navigator) {
      const pattern = kind === 'strong' ? 30 : kind === 'medium' ? 18 : 10;
      navigator.vibrate(pattern);
    }
  }

  function currentMode() {
    return state.modes[state.activeMode];
  }

  function rateText(game, count) {
    if (!count || !game) return '—';
    return `1/${(game / count).toFixed(game / count >= 100 ? 1 : 2)}`;
  }

  function renderCounters() {
    const mode = currentMode();
    els.gameCount.textContent = mode.game.toLocaleString('ja-JP');
    els.gameMinus.disabled = mode.game <= 0;
    els.counterGrid.innerHTML = '';

    COUNTERS.forEach(item => {
      const count = mode.counters[item.key];
      const card = document.createElement('article');
      card.className = 'counter-card';
      card.innerHTML = `
        <div class="counter-count" aria-label="${item.label} ${count}回">${count}</div>
        <div class="counter-rate">${rateText(mode.game, count)}</div>
        <button class="counter-button" type="button" data-action="inc" data-key="${item.key}" aria-label="${item.label}を1増やす" style="background:${item.color}"></button>
        <button class="counter-minus" type="button" data-action="dec" data-key="${item.key}" ${count <= 0 ? 'disabled' : ''}>−1</button>`;
      els.counterGrid.appendChild(card);
    });

    document.querySelectorAll('.mode-tab').forEach(tab => {
      const active = tab.dataset.mode === state.activeMode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
  }

  function parseYouTubeId(input) {
    const value = String(input || '').trim();
    if (!value) return '';
    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
    try {
      const url = new URL(value);
      const host = url.hostname.replace(/^www\./, '');
      if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
      if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
        if (url.pathname === '/watch') return url.searchParams.get('v') || '';
        const parts = url.pathname.split('/').filter(Boolean);
        if (['shorts', 'embed', 'live'].includes(parts[0])) return parts[1] || '';
      }
    } catch (_) {}
    return '';
  }

  function loadVideoFromState() {
    if (!state.videoId) {
      els.youtubePlayer.src = '';
      els.youtubePlayer.hidden = true;
      els.playerPlaceholder.hidden = false;
      return;
    }
    els.youtubePlayer.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(state.videoId)}?playsinline=1&rel=0`;
    els.youtubePlayer.hidden = false;
    els.playerPlaceholder.hidden = true;
  }

  function openVideoDialog() {
    els.youtubeUrl.value = state.videoUrl;
    els.videoError.hidden = true;
    els.videoDialog.showModal();
    setTimeout(() => els.youtubeUrl.focus(), 0);
  }

  function setVideoFromInput() {
    const id = parseYouTubeId(els.youtubeUrl.value);
    if (!id) {
      els.videoError.hidden = false;
      els.youtubeUrl.setAttribute('aria-invalid', 'true');
      return;
    }
    els.videoError.hidden = true;
    els.youtubeUrl.removeAttribute('aria-invalid');
    state.videoId = id;
    state.videoUrl = els.youtubeUrl.value.trim();
    feedback('medium');
    loadVideoFromState();
    queueSave();
    els.videoDialog.close();
  }

  function showConfirm(title, message) {
    els.dialogTitle.textContent = title;
    els.dialogMessage.textContent = message;
    els.confirmDialog.showModal();
    return new Promise(resolve => {
      const onClose = () => {
        els.confirmDialog.removeEventListener('close', onClose);
        resolve(els.confirmDialog.returnValue === 'confirm');
      };
      els.confirmDialog.addEventListener('close', onClose);
    });
  }

  function renderTools() {
    const t = state.tools;
    els.startGame.value = t.startGame || '';
    els.totalGame.value = t.totalGame || '';
    els.trialCount.value = t.trialCount || '';
    els.hitCount.value = t.hitCount || '';
    const personal = Math.max(0, t.totalGame - t.startGame);
    els.personalGame.textContent = personal.toLocaleString('ja-JP');
    els.hitRate.textContent = t.hitCount > 0 && t.trialCount > 0
      ? `1/${(t.trialCount / t.hitCount).toFixed(2)}`
      : '—';
  }

  function mutate(mutator, feedbackKind = 'light') {
    mutator();
    feedback(feedbackKind);
    renderCounters();
    queueSave();
  }

  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.activeMode = tab.dataset.mode;
      feedback('light');
      renderCounters();
      queueSave();
    });
  });

  els.gamePlus.addEventListener('click', () => mutate(() => { currentMode().game += 1; }, 'medium'));
  els.gameMinus.addEventListener('click', () => mutate(() => {
    currentMode().game = Math.max(0, currentMode().game - 1);
  }, 'medium'));

  els.counterGrid.addEventListener('click', event => {
    const button = event.target.closest('button[data-key]');
    if (!button) return;
    const key = button.dataset.key;
    if (!COUNTERS.some(c => c.key === key)) return;
    mutate(() => {
      const counters = currentMode().counters;
      counters[key] = button.dataset.action === 'inc'
        ? counters[key] + 1
        : Math.max(0, counters[key] - 1);
    });
  });

  els.resetMode.addEventListener('click', async () => {
    const ok = await showConfirm(
      `MODE ${state.activeMode} をリセット`,
      '現在のGAME数と5つのカウントを0に戻します。'
    );
    if (!ok) return;
    state.modes[state.activeMode] = defaultsForMode();
    feedback('strong');
    renderCounters();
    queueSave();
  });

  els.clearAll.addEventListener('click', async () => {
    const ok = await showConfirm(
      '全データを削除',
      'A〜Fの記録、補助計算、保存した動画URLをすべて削除します。'
    );
    if (!ok) return;
    state = defaults();
    localStorage.removeItem(STORAGE_KEY);
    feedback('strong');
    els.youtubeUrl.value = '';
    loadVideoFromState();
    renderCounters();
    renderTools();
    queueSave();
  });

  els.openVideoSettings.addEventListener('click', openVideoDialog);
  els.playerPlaceholder.addEventListener('click', openVideoDialog);
  els.loadVideo.addEventListener('click', setVideoFromInput);
  els.clearVideo.addEventListener('click', () => {
    state.videoId = '';
    state.videoUrl = '';
    els.youtubeUrl.value = '';
    els.videoError.hidden = true;
    loadVideoFromState();
    feedback('medium');
    queueSave();
    els.videoDialog.close();
  });

  els.youtubeUrl.addEventListener('input', () => {
    els.videoError.hidden = true;
    els.youtubeUrl.removeAttribute('aria-invalid');
  });

  els.youtubeUrl.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      setVideoFromInput();
    }
  });

  els.openTools.addEventListener('click', () => els.toolsDialog.showModal());

  ['startGame', 'totalGame', 'trialCount', 'hitCount'].forEach(key => {
    els[key].addEventListener('input', () => {
      state.tools[key] = sanitizeNonNegativeInt(els[key].value);
      renderTools();
      queueSave();
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') queueSave();
  });

  renderCounters();
  renderTools();
  loadVideoFromState();
  queueSave();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(console.warn);
    });
  }
})();
