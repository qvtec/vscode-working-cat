(function () {
  const container = document.getElementById('cats-container');

  const FRAME_INTERVALS = {
    idle: 800,
    typing: 180,
    saved: 0,
    sleeping: 1200,
    error: 0,
    claude_idle: 800,
    claude_thinking: 800,
    claude_complete: 0,
    claude_permission: 0,
  };

  const STATE_LABELS = {
    idle: 'idle',
    typing: 'typing...',
    saved: 'saved!',
    sleeping: 'zzz...',
    error: 'error!',
    claude_thinking: 'thinking...',
    claude_complete: 'done!',
    claude_permission: 'waiting...',
  };

  // スポット座標（%）。背景画像に合わせて調整してください
  const SPOTS = [
    { left: 50, top: 60 },  // 中央手前（1匹目）
    { left: 15, top: 62 },  // 左手前
    { left: 80, top: 62 },  // 右手前
    { left: 30, top: 46 },  // 左中間
    { left: 68, top: 44 },  // 右中間
    { left: 10, top: 34 },  // 左奥
    { left: 82, top: 34 },  // 右奥
    { left: 50, top: 32 },  // 中央奥
  ];

  const LOCAL_ID = '__local__';
  const cats = new Map(); // id -> { el, img, labelWrap, title, status, animTimer, labelTimer, state, dismissed, entering, pendingState }
  const LABEL_HIDE_STATES = new Set(['idle', 'sleeping', 'claude_idle', 'claude_thinking', 'typing']);

  // 背景画像の高さ比率を取得して猫の top% を補正する
  function getBgRatio() {
    const bg = document.getElementById('bg');
    if (!bg || !bg.naturalHeight) return 1;
    const rendered = bg.getBoundingClientRect();
    return rendered.height / window.innerHeight;
  }

  function applySpot(item, spot) {
    const ratio = getBgRatio();
    item.style.left = spot.left + '%';
    item.style.top = (spot.top * ratio) + '%';
  }
  const usedSpots = new Map(); // id -> spotIndex
  let spotCounter = 0;

  function assignSpot(id) {
    const used = new Set(usedSpots.values());
    const free = SPOTS.map((_, i) => i).filter(i => !used.has(i));
    const index = free.length > 0 ? free[0] : spotCounter % SPOTS.length;
    spotCounter++;
    usedSpots.set(id, index);
    return SPOTS[index];
  }

  function createCat(id, initialState) {
    const item = document.createElement('div');
    item.className = 'cat-item';

    const spot = id === LOCAL_ID ? SPOTS[0] : assignSpot(id);
    applySpot(item, spot);
    if (id !== LOCAL_ID) {
      item.style.cursor = 'pointer';
      item.title = 'Click to open session';
      item.addEventListener('click', () => {
        const cat = cats.get(id);
        if (cat?.state === 'claude_complete') {
          cat.dismissed = true;
          applyState(id, 'sleeping');
        }
        if (cat && LABEL_HIDE_STATES.has(cat.state)) {
          cat.labelWrap.style.display = '';
          clearTimeout(cat.labelTimer);
          cat.labelTimer = setTimeout(() => {
            if (LABEL_HIDE_STATES.has(cat.state)) cat.labelWrap.style.display = 'none';
            cat.labelTimer = null;
          }, 3000);
        }
        vscode.postMessage({ type: 'catClicked', sessionId: id, title: cat?.title?.textContent });
      });
    }

    // div を使って background-image でフレームを切り替える
    const img = document.createElement('div');
    img.className = 'cat-img';

    const labelWrap = document.createElement('div');
    labelWrap.className = 'cat-label-wrap';

    const title = document.createElement('div');
    title.className = 'cat-title';

    const status = document.createElement('div');
    status.className = 'cat-status';

    labelWrap.appendChild(title);
    labelWrap.appendChild(status);
    item.appendChild(img);
    item.appendChild(labelWrap);
    container.appendChild(item);

    const cat = { el: item, img, labelWrap, title, status, animTimer: null, labelTimer: null, soundTimers: [], state: null, dismissed: false, entering: false, pendingState: null };
    cats.set(id, cat);
    if (id === LOCAL_ID) title.textContent = 'editor';
    applyState(id, initialState);
    return cat;
  }

  function removeCat(id) {
    const cat = cats.get(id);
    if (!cat) return;
    clearInterval(cat.animTimer);
    clearTimeout(cat.labelTimer);
    clearSoundTimers(cat);
    cat.el.remove();
    cats.delete(id);
    usedSpots.delete(id);
  }

  function clearSoundTimers(cat) {
    cat.soundTimers.forEach(t => clearTimeout(t));
    cat.soundTimers = [];
  }

function applyState(id, state) {
    const cat = cats.get(id);
    if (!cat) return;

    if (cat.state === state) return;
    const prevState = cat.state;
    cat.state = state;

    clearSoundTimers(cat);

    if (id !== LOCAL_ID && prevState !== 'typing') {
      if (state === 'claude_complete') {
        playSound('energetic');
      } else if (state === 'claude_idle') {
        playSound('hesitant');
      } else if (state === 'claude_permission') {
        playSound('calm');
      }
    }

    clearInterval(cat.animTimer);
    cat.animTimer = null;
    clearTimeout(cat.labelTimer);
    cat.labelTimer = null;

    cat.status.textContent = STATE_LABELS[state] || state;
    const hideLabel = LABEL_HIDE_STATES.has(state);
    cat.labelWrap.style.display = hideLabel ? 'none' : '';

    const sprite = SPRITE_MAP[state];
    if (sprite) {
      // CSS animation でスプライトシートを回す（JS setInterval 不要）
      const url = (IMAGE_MAP[state] || IMAGE_MAP['idle'])[0][0];
      cat.img.style.backgroundImage = `url(${url})`;
      cat.img.classList.add('sprite-run');
    } else {
      cat.img.classList.remove('sprite-run');
      // 通常フレームアニメーション（IMAGE_MAP[state] は string[][] 構造）
      const patterns = IMAGE_MAP[state] || IMAGE_MAP['idle'];
      const frames = patterns[Math.floor(Math.random() * patterns.length)];
      cat.img.style.backgroundImage = `url(${frames[0]})`;
      cat.img.style.backgroundSize = 'contain';
      cat.img.style.backgroundPosition = 'center';
      cat.img.style.backgroundRepeat = 'no-repeat';

      let frameIndex = 0;
      const interval = FRAME_INTERVALS[state];
      if (interval > 0 && frames.length > 1) {
        cat.animTimer = setInterval(() => {
          frameIndex = (frameIndex + 1) % frames.length;
          cat.img.style.backgroundImage = `url(${frames[frameIndex]})`;
        }, interval);
      }
    }
  }

  let audioUnlocked = false;

  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    const btn = document.getElementById('sound-unlock-btn');
    if (btn) btn.style.display = 'none';
    ['snd-calm', 'snd-energetic', 'snd-hesitant'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const vol = el.volume;
      el.volume = 0;
      el.play().then(() => { el.pause(); el.currentTime = 0; el.volume = vol; }).catch(() => {});
    });
  }

  document.addEventListener('click', unlockAudio);

  function playSound(name) {
    if (!SOUND_ENABLED) return;
    const el = document.getElementById('snd-' + name);
    if (!el) return;
    el.volume = SOUND_VOLUME;
    el.currentTime = 0;
    el.play().catch(() => {});
  }

  function claudeStatusToState(status) {
    if (status === 'thinking') return 'claude_thinking';
    if (status === 'complete') return 'claude_complete';
    if (status === 'permission') return 'claude_permission';
    if (status === 'error') return 'error';
    return 'claude_idle';
  }

  function reapplySpots() {
    for (const [id, cat] of cats) {
      const spot = id === LOCAL_ID ? SPOTS[0] : (SPOTS[usedSpots.get(id)] ?? SPOTS[0]);
      applySpot(cat.el, spot);
    }
  }

  window.addEventListener('resize', reapplySpots);
  document.getElementById('bg')?.addEventListener('load', reapplySpots);

  window.addEventListener('message', (event) => {
    const msg = event.data;

    if (msg.type === 'setSessions') {
      const sessions = msg.sessions;


      if (sessions.length === 0) {
        for (const id of [...cats.keys()]) {
          if (id !== LOCAL_ID) removeCat(id);
        }
        if (!cats.has(LOCAL_ID)) createCat(LOCAL_ID, 'idle');
      } else {
        if (cats.has(LOCAL_ID)) removeCat(LOCAL_ID);

        const activeIds = new Set(sessions.map(s => s.id));
        for (const id of [...cats.keys()]) {
          if (id !== LOCAL_ID && !activeIds.has(id)) removeCat(id);
        }

        for (const session of sessions) {
          let state = claudeStatusToState(session.status);
          if (!cats.has(session.id)) {
            createCat(session.id, 'typing');
            const cat = cats.get(session.id);
            const spotIndex = usedSpots.get(session.id);
            const targetSpot = SPOTS[spotIndex];
            const fromRight = targetSpot.left > 50;
            cat.entering = true;
            cat.pendingState = state;
            if (fromRight) {
              cat.img.classList.add('cat-flip');
              cat.el.classList.add('cat-entering-right');
            } else {
              cat.el.classList.add('cat-entering-left');
            }
            setTimeout(() => {
              if (cats.has(session.id)) {
                const c = cats.get(session.id);
                c.entering = false;
                c.el.classList.remove('cat-entering-left', 'cat-entering-right');
                c.img.classList.remove('cat-flip');
                applyState(session.id, c.pendingState || state);
              }
            }, 2100);
          } else {
            const cat = cats.get(session.id);
            if (cat.entering) {
              cat.pendingState = state;
            } else {
              if (state === 'claude_thinking') cat.dismissed = false;
              if (cat.dismissed && state === 'claude_complete') state = 'sleeping';
              applyState(session.id, state);
            }
          }
          const cat = cats.get(session.id);
          if (cat) cat.title.textContent = session.title || '';
        }
      }
    } else if (msg.type === 'setLocalState') {
      if (cats.has(LOCAL_ID)) {
        applyState(LOCAL_ID, msg.state);
      }
    } else if (msg.type === 'setBackground') {
      const bg = document.getElementById('bg');
      if (bg) bg.src = msg.uri;
    } else if (msg.type === 'setSoundEnabled') {
      SOUND_ENABLED = msg.enabled;
      const btn = document.getElementById('sound-unlock-btn');
      if (btn) btn.style.display = (msg.enabled && !audioUnlocked) ? '' : 'none';
    } else if (msg.type === 'setSoundVolume') {
      SOUND_VOLUME = msg.volume;
    }
  });
})();
