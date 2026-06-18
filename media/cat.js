(function () {
  const img = document.getElementById('cat-img');
  const label = document.getElementById('state-label');

  const FRAME_INTERVALS = {
    idle: 800,
    typing: 150,
    saved: 0,
    sleeping: 1200,
    error: 0,
    claude_thinking: 400,
    claude_complete: 0,
    claude_permission: 0,
  };

  const STATE_LABELS = {
    idle: 'idle',
    typing: 'typing...',
    saved: 'saved!',
    sleeping: 'zzz...',
    error: 'error!',
    claude_thinking: 'claude thinking...',
    claude_complete: 'claude done!',
    claude_permission: 'waiting...',
  };

  let currentState = 'idle';
  let frameIndex = 0;
  let animTimer = null;

  function startAnimation(state) {
    if (animTimer) {
      clearInterval(animTimer);
      animTimer = null;
    }

    const frames = IMAGE_MAP[state] || IMAGE_MAP['idle'];
    frameIndex = 0;
    img.src = frames[0];
    label.textContent = STATE_LABELS[state] || state;

    const interval = FRAME_INTERVALS[state];
    if (interval > 0 && frames.length > 1) {
      animTimer = setInterval(() => {
        frameIndex = (frameIndex + 1) % frames.length;
        img.src = frames[frameIndex];
      }, interval);
    }
  }

  startAnimation('idle');

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'setState' && msg.state !== currentState) {
      currentState = msg.state;
      startAnimation(currentState);
    }
  });
})();
