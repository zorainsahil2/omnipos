// Web Audio API se beep — koi external file nahi
export function playBeep(type = 'success') {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx  = new AudioContextClass();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const configs = {
      success: { freq: 1200, duration: 0.1, gainVal: 0.3 },
      error:   { freq: 300,  duration: 0.4, gainVal: 0.4 },
      warning: { freq: 600,  duration: 0.2, gainVal: 0.3 },
    };
    const { freq, duration, gainVal } = configs[type] || configs.success;

    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => {
      try {
        ctx.close();
      } catch {
        // Silently catch error closing context
      }
    };
  } catch {
    // Audio unavailable — silently ignore
  }
}
