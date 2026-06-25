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
    { left: 82, top: 24 },  // 右奥
    { left: 50, top: 28 },  // 中央奥
  ];

  const DECORATION_KEYS = ['glasses', 'ribbon', 'crown', 'flower', 'strawhat'];
  const DECO_CHANCE = 0.15; // 15% でレアキャラ登場

  const LOCAL_ID = '__local__';
  const cats = new Map(); // id -> { el, img, imgWrap, decoration, decorationIndex, labelWrap, title, status, animTimer, labelTimer, snoozeTimers, state, dismissed, entering, pendingState }
  const LABEL_HIDE_STATES = new Set(['idle', 'sleeping', 'claude_idle', 'claude_thinking', 'typing']);

  // 背景画像の高さ比率を取得して猫の top% を補正する
  function getBgRatio() {
    const bg = document.getElementById('bg');
    if (!bg || !bg.naturalHeight) return 1;
    const rendered = bg.getBoundingClientRect();
    return rendered.height / window.innerHeight;
  }

  // CSS top% から遠近スケールを計算（手前=1.0, 奥=0.62）
  function calcScale(cssTopPercent) {
    const ratio = getBgRatio() || 1;
    const rawTop = cssTopPercent / ratio;
    const t = Math.max(0, Math.min(1, (rawTop - 24) / (62 - 24)));
    return 0.62 + t * 0.38;
  }

  function applySpot(el, imgWrap, spot) {
    const ratio = getBgRatio();
    el.style.left = spot.left + '%';
    const cssTop = spot.top * ratio;
    el.style.top = cssTop + '%';
    const scale = calcScale(cssTop);
    imgWrap.style.transform = `scale(${scale.toFixed(3)})`;
    imgWrap.style.transformOrigin = 'bottom center';
    el.style.zIndex = Math.round(scale * 10).toString();
    const labelWrap = el.querySelector('.cat-label-wrap');
    if (labelWrap) labelWrap.style.bottom = Math.round(100 * scale) + 'px';
  }
  const usedSpots = new Map(); // id -> spotIndex
  let spotCounter = 0;

  function assignSpot(id) {
    const used = new Set(usedSpots.values());
    const free = SPOTS.map((_, i) => i).filter(i => !used.has(i));
    let index;
    if (used.size === 0) {
      index = 0;
    } else if (free.length > 0) {
      index = free[Math.floor(Math.random() * free.length)];
    } else {
      index = spotCounter % SPOTS.length;
    }
    spotCounter++;
    usedSpots.set(id, index);
    return SPOTS[index];
  }

  function createCat(id, initialState) {
    const item = document.createElement('div');
    item.className = 'cat-item';

    const spot = id === LOCAL_ID ? SPOTS[0] : assignSpot(id);
    item.style.cursor = 'grab';

    item.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = parseFloat(item.style.left);
      const startTop = parseFloat(item.style.top);
      let moved = false;
      item.style.cursor = 'grabbing';
      item.style.zIndex = '10';

      function onMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) moved = true;
        if (moved) {
          const cw = container.offsetWidth;
          const ch = container.offsetHeight;
          const newLeft = Math.max(0, Math.min(100, startLeft + dx / cw * 100));
          const newTop  = Math.max(0, Math.min(100, startTop  + dy / ch * 100));
          item.style.left = newLeft + '%';
          item.style.top  = newTop + '%';
          const cat = cats.get(id);
          if (cat) {
            const scale = calcScale(newTop);
            cat.imgWrap.style.transform = `scale(${scale.toFixed(3)})`;
            cat.labelWrap.style.bottom = Math.round(100 * scale) + 'px';
          }
        }
      }

      function onUp() {
        item.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        if (moved) {
          const cat = cats.get(id);
          if (cat) {
            const finalTop = parseFloat(item.style.top);
            const scale = calcScale(finalTop);
            cat.imgWrap.style.transform = `scale(${scale.toFixed(3)})`;
            item.style.zIndex = Math.round(scale * 10).toString();
            cat.labelWrap.style.bottom = Math.round(100 * scale) + 'px';
            cat.customPos = { left: parseFloat(item.style.left), top: finalTop };
          }
        } else {
          item.style.zIndex = '';
        }
        if (!moved && id !== LOCAL_ID) {
          const cat = cats.get(id);
          if (cat?.state === 'claude_complete') {
            cat.toggled = true;
            applyState(id, 'sleeping');
          } else if (cat?.state === 'sleeping' && cat.toggled) {
            cat.toggled = false;
            applyState(id, 'claude_complete');
          }
          if (cat && LABEL_HIDE_STATES.has(cat.state)) {
            cat.labelWrap.style.display = '';
            clearTimeout(cat.labelTimer);
            cat.labelTimer = setTimeout(() => {
              if (LABEL_HIDE_STATES.has(cat.state)) cat.labelWrap.style.display = 'none';
              cat.labelTimer = null;
            }, 3000);
          }
        }
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // div を使って background-image でフレームを切り替える
    const imgWrap = document.createElement('div');
    imgWrap.className = 'cat-img-wrap';

    const img = document.createElement('div');
    img.className = 'cat-img';

    const decoEl = document.createElement('img');
    decoEl.className = 'cat-decoration';

    imgWrap.appendChild(img);
    imgWrap.appendChild(decoEl);

    const labelWrap = document.createElement('div');
    labelWrap.className = 'cat-label-wrap';

    const title = document.createElement('div');
    title.className = 'cat-title';

    const status = document.createElement('div');
    status.className = 'cat-status';

    labelWrap.appendChild(title);
    labelWrap.appendChild(status);

    const notifType = document.createElement('div');
    notifType.className = 'cat-notif-type';
    notifType.style.display = 'none';

    item.appendChild(imgWrap);
    item.appendChild(labelWrap);
    item.appendChild(notifType);
    container.appendChild(item);

    const cat = { el: item, img, imgWrap, decoration: decoEl, labelWrap, title, status, notifType, animTimer: null, labelTimer: null, soundTimers: [], snoozeTimers: [], state: null, toggled: false, entering: false, pendingState: null, customPos: null };
    cats.set(id, cat);
    applySpot(item, imgWrap, spot);
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
    clearSnoozeTimers(cat);
    cat.el.remove();
    cats.delete(id);
    usedSpots.delete(id);
  }

  function clearSoundTimers(cat) {
    cat.soundTimers.forEach(t => clearTimeout(t));
    cat.soundTimers = [];
  }

  function clearSnoozeTimers(cat) {
    cat.snoozeTimers.forEach(t => clearTimeout(t));
    cat.snoozeTimers = [];
    cat.el.classList.remove('snooze-ring-1', 'snooze-ring-2', 'snooze-ring-3');
  }

  function scheduleSnooze(id, cat, remaining) {
    if (remaining <= 0) return;
    const t = setTimeout(() => {
      const c = cats.get(id);
      if (!c || c.state !== 'claude_permission') return;
      playSound('calm');
      const ring = SNOOZE_COUNT - remaining + 1;
      c.el.classList.remove('snooze-ring-1', 'snooze-ring-2', 'snooze-ring-3');
      c.el.classList.add(`snooze-ring-${Math.min(ring, 3)}`);
      scheduleSnooze(id, c, remaining - 1);
    }, SNOOZE_INTERVAL * 1000);
    cat.snoozeTimers.push(t);
  }

function applyState(id, state) {
    const cat = cats.get(id);
    if (!cat) return;

    if (cat.state === state) return;
    const prevState = cat.state;
    cat.state = state;
    cat.el.classList.toggle('workflow-done', state === 'claude_complete' || state === 'sleeping');

    clearSoundTimers(cat);
    clearSnoozeTimers(cat);

    if (id !== LOCAL_ID) {
      if (state === 'claude_complete') {
        if (prevState !== 'sleeping') {
          playSound('energetic');
          if (Math.random() < DECO_CHANCE) {
            const key = DECORATION_KEYS[Math.floor(Math.random() * DECORATION_KEYS.length)];
            cat.decoration.src = DECO_MAP[key];
            cat.decoration.style.top = '0px';
            cat.decoration.style.left = '0px';
            cat.decoration.style.transform = '';
            cat.decoration.style.display = 'block';
          } else {
            cat.decoration.style.display = 'none';
          }
        } else {
          cat.decoration.style.top = '0px';
          cat.decoration.style.left = '0px';
          cat.decoration.style.transform = '';
        }
      } else if (state === 'sleeping' && cat.toggled) {
        if (cat.decoration.style.display === 'block') {
          cat.decoration.style.top = '30px';
          cat.decoration.style.left = '4px';
          cat.decoration.style.transform = 'rotate(-32deg)';
        }
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

    if (state === 'claude_permission' && SNOOZE_ENABLED && SNOOZE_COUNT > 0) {
      scheduleSnooze(id, cat, SNOOZE_COUNT);
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
      if (cat.customPos) {
        cat.el.style.left = cat.customPos.left + '%';
        cat.el.style.top  = cat.customPos.top  + '%';
        const scale = calcScale(cat.customPos.top);
        cat.imgWrap.style.transform = `scale(${scale.toFixed(3)})`;
        cat.el.style.zIndex = Math.round(scale * 10).toString();
      } else {
        const spot = id === LOCAL_ID ? SPOTS[0] : (SPOTS[usedSpots.get(id)] ?? SPOTS[0]);
        applySpot(cat.el, cat.imgWrap, spot);
      }
    }
  }

  window.addEventListener('resize', reapplySpots);
  document.getElementById('bg')?.addEventListener('load', reapplySpots);

  window.addEventListener('message', (event) => {
    const msg = event.data;

    if (msg.type === 'setSessions') {
      const sessions = msg.sessions;

      const catsContainer = document.getElementById('cats-container');
      const hasSubagent = sessions.some(s => s.shellPid == null && s.status !== 'idle');
      if (catsContainer) catsContainer.classList.toggle('workflow', hasSubagent);

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
              if (state === 'claude_thinking') {
                cat.toggled = false;
                cat.decoration.style.display = 'none';
              }
              if (cat.toggled && state === 'claude_complete') state = 'sleeping';
              applyState(session.id, state);
            }
          }
          const cat = cats.get(session.id);
          if (cat) {
            cat.title.textContent = session.title || '';
            cat.notifType.textContent = session.notificationType || '';
          }
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
    } else if (msg.type === 'setSnoozeConfig') {
      SNOOZE_ENABLED = msg.enabled;
      SNOOZE_INTERVAL = msg.interval;
      SNOOZE_COUNT = msg.count;
    }
  });
})();
