/**
 * THE HORCRUX LEDGER — VANILLA APPLICATION LOGIC & SYNTHESIZED AUDIO ENGINE
 * Curated for Lord Voldemort's Secret Sanctuary Registry
 * Palette: bg #120d0a, panel #1d1612, gold #c9a24d, burgundy #a8344a, parchment #eadbbc
 * Fonts: Cinzel Decorative, IM Fell English, Cormorant Garamond
 * Sponsor: The Kapidhwaj Wardens (@kapidhwaj.innovations)
 */

(function () {
  'use strict';

  /* --------------------------------------------------------------------------
     1. SYNTHESIZED WEB AUDIO ENGINE (NO AUDIO FILES)
     -------------------------------------------------------------------------- */
  const AudioEngine = (function () {
    let ctx = null;
    let masterGain = null;
    let compressor = null;
    let isMuted = false; // Enabled by default, respected via localStorage
    let sfxEnabled = true;
    let ambienceEnabled = false;
    let volumeLevel = 0.5;

    // Active nodes for holding drone
    let holdOsc = null;
    let holdFilter = null;
    let holdGain = null;

    // Active nodes for haunted ambience
    let ambienceMasterGain = null;
    let windSource = null;
    let windFilter = null;
    let windLfo = null;
    let windLfoGain = null;
    let droneOsc1 = null;
    let droneOsc2 = null;
    let droneLfo = null;
    let droneLfoGain = null;
    let droneGain = null;
    let crackleTimer = null;
    let oneShotTimer = null;

    const STORAGE_KEY_SOUND = 'horcrux_ledger_sound_pref_v4';
    const STORAGE_KEY_VOL = 'horcrux_ledger_sound_vol_v4';

    // Load saved preferences
    try {
      const savedSound = localStorage.getItem(STORAGE_KEY_SOUND);
      if (savedSound === 'off') {
        isMuted = true;
      } else if (savedSound === 'on') {
        isMuted = false;
      }
      const savedVol = localStorage.getItem(STORAGE_KEY_VOL);
      if (savedVol !== null) {
        volumeLevel = Math.max(0, Math.min(1, parseFloat(savedVol) || 0.5));
      }
    } catch (e) {}

    function initContext() {
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        ctx = new AudioCtx();

        // Dynamics Compressor to prevent clipping
        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-18, ctx.currentTime);
        compressor.knee.setValueAtTime(12, ctx.currentTime);
        compressor.ratio.setValueAtTime(8, ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, ctx.currentTime);
        compressor.release.setValueAtTime(0.25, ctx.currentTime);

        // Master Gain mixed at about 0.4
        masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(isMuted ? 0.0001 : 0.4 * volumeLevel, ctx.currentTime);

        compressor.connect(masterGain);
        masterGain.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      return ctx;
    }

    function setMuted(muted) {
      isMuted = muted;
      try {
        localStorage.setItem(STORAGE_KEY_SOUND, isMuted ? 'off' : 'on');
      } catch (e) {}

      if (ctx && masterGain) {
        const now = ctx.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.linearRampToValueAtTime(isMuted ? 0.0001 : 0.4 * volumeLevel, now + 0.05);
      }

      if (isMuted) {
        stopAmbience(false);
      } else if (ambienceEnabled) {
        initContext();
        startAmbience();
      }
      updateUI();
    }

    function setVolume(val) {
      volumeLevel = Math.max(0, Math.min(1, val));
      try {
        localStorage.setItem(STORAGE_KEY_VOL, String(volumeLevel));
      } catch (e) {}
      if (ctx && masterGain && !isMuted) {
        masterGain.gain.setValueAtTime(0.4 * volumeLevel, ctx.currentTime);
      }
    }

    function setSfx(enabled) {
      sfxEnabled = enabled;
    }

    function setAmbience(enabled) {
      ambienceEnabled = enabled;
      if (ambienceEnabled && !isMuted) {
        initContext();
        startAmbience();
      } else {
        stopAmbience(false);
      }
      updateUI();
    }

    function updateUI() {
      const soundBtn = document.getElementById('btn-sound-toggle');
      const soundIcon = document.getElementById('sound-icon-display');
      const navSoundBtn = document.getElementById('btn-nav-sound');
      const navSoundIcon = document.getElementById('nav-sound-icon');
      const navSoundLabel = document.getElementById('nav-sound-label');
      const introSoundCheckbox = document.getElementById('intro-sound-checkbox');
      const btnAmbienceToggle = document.getElementById('btn-ambience-toggle');

      const isSoundActive = !isMuted;
      if (soundBtn) {
        soundBtn.setAttribute('aria-pressed', String(isSoundActive));
        soundBtn.title = isSoundActive ? "Ambience on/off: ON" : "Ambience on/off: OFF";
      }
      if (soundIcon) soundIcon.textContent = isSoundActive ? "🔊" : "🔇";
      if (navSoundBtn) navSoundBtn.setAttribute('aria-pressed', String(isSoundActive));
      if (navSoundIcon) navSoundIcon.textContent = isSoundActive ? "🔊" : "🔇";
      if (navSoundLabel) navSoundLabel.textContent = isSoundActive ? "Sound: On" : "Sound: Off";

      if (introSoundCheckbox) {
        introSoundCheckbox.checked = isSoundActive;
      }
      if (btnAmbienceToggle) {
        btnAmbienceToggle.setAttribute('aria-pressed', String(ambienceEnabled && !isMuted));
        btnAmbienceToggle.textContent = (ambienceEnabled && !isMuted) ? "Ambience: ON" : "Ambience: OFF";
      }
    }

    // Visibility change pauses ambient audio and resumes when tab returns
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (ctx && ctx.state === 'running') ctx.suspend();
      } else {
        if (ctx && ctx.state === 'suspended' && !isMuted) ctx.resume();
      }
    });

    /* --- Sound Synthesizers (Envelopes on Attack & Release, Non-Clicking) --- */

    // 1. Hold drone: sawtooth at 55Hz rising to 110Hz through a low-pass filter, with gain ramping up
    function startSealHoldDrone(durationSec = 1.5) {
      if (isMuted || !sfxEnabled) return;
      initContext();
      if (!ctx) return;

      stopSealHoldDrone(true);

      const now = ctx.currentTime;
      holdOsc = ctx.createOscillator();
      holdFilter = ctx.createBiquadFilter();
      holdGain = ctx.createGain();

      holdOsc.type = 'sawtooth';
      holdOsc.frequency.setValueAtTime(55, now);
      holdOsc.frequency.exponentialRampToValueAtTime(110, now + durationSec);

      holdFilter.type = 'lowpass';
      holdFilter.frequency.setValueAtTime(180, now);
      holdFilter.frequency.exponentialRampToValueAtTime(550, now + durationSec);

      holdGain.gain.setValueAtTime(0.0001, now);
      holdGain.gain.linearRampToValueAtTime(0.18, now + 0.08);
      holdGain.gain.linearRampToValueAtTime(0.42, now + durationSec);

      holdOsc.connect(holdFilter);
      holdFilter.connect(holdGain);
      holdGain.connect(compressor);

      holdOsc.start(now);
    }

    function stopSealHoldDrone(abrupt = false) {
      if (holdGain && ctx) {
        const now = ctx.currentTime;
        holdGain.gain.cancelScheduledValues(now);
        holdGain.gain.linearRampToValueAtTime(0.0001, now + (abrupt ? 0.03 : 0.12));
        const osc = holdOsc;
        setTimeout(() => {
          try {
            if (osc) { osc.stop(); osc.disconnect(); }
          } catch (e) {}
        }, 130);
      }
      holdOsc = null;
      holdGain = null;
      holdFilter = null;
    }

    // 2. Early-release knock: a dull low sine, double hit
    function playDoubleKnock() {
      if (isMuted || !sfxEnabled) return;
      initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      [0, 0.13].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, now + delay);
        osc.frequency.exponentialRampToValueAtTime(42, now + delay + 0.1);

        gain.gain.setValueAtTime(0.0001, now + delay);
        gain.gain.linearRampToValueAtTime(0.28, now + delay + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.11);

        osc.connect(gain);
        gain.connect(compressor);
        osc.start(now + delay);
        osc.stop(now + delay + 0.12);
      });
    }

    // 3. Seal break: burst of bandpassed noise + low sine thump (70->40Hz) + glassy shimmer of sine partials at 1200, 1800, 2400Hz
    function playSealBreak() {
      if (isMuted || !sfxEnabled) return;
      initContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Burst of bandpassed white noise
      const bufferSize = Math.floor(ctx.sampleRate * 0.22);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(900, now);
      noiseFilter.Q.setValueAtTime(2.2, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.0001, now);
      noiseGain.gain.linearRampToValueAtTime(0.38, now + 0.01);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(compressor);
      noise.start(now);

      // Low sine thump (70Hz falling to 40Hz)
      const thump = ctx.createOscillator();
      const thumpGain = ctx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(70, now);
      thump.frequency.exponentialRampToValueAtTime(40, now + 0.35);

      thumpGain.gain.setValueAtTime(0.0001, now);
      thumpGain.gain.linearRampToValueAtTime(0.5, now + 0.01);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      thump.connect(thumpGain);
      thumpGain.connect(compressor);
      thump.start(now);
      thump.stop(now + 0.36);

      // Glassy shimmer of sine partials at 1200, 1800 and 2400Hz
      [1200, 1800, 2400].forEach((freq, idx) => {
        const shim = ctx.createOscillator();
        const shimGain = ctx.createGain();
        shim.type = 'sine';
        shim.frequency.setValueAtTime(freq, now + 0.02);

        shimGain.gain.setValueAtTime(0.0001, now + 0.02);
        shimGain.gain.linearRampToValueAtTime(0.09 / (idx + 1), now + 0.07);
        shimGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

        shim.connect(shimGain);
        shimGain.connect(compressor);
        shim.start(now + 0.02);
        shim.stop(now + 1.25);
      });
    }

    // 4. Ledger open: slow creak (sawtooth with an LFO-modulated filter) plus soft noise whoosh, about 0.8s
    function playLedgerOpen() {
      if (isMuted || !sfxEnabled) return;
      initContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Slow creak
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(65, now);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(320, now);
      filter.Q.setValueAtTime(5, now);

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(6.5, now);
      lfoGain.gain.setValueAtTime(150, now);
      lfo.connect(filter.frequency);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.24, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(compressor);

      lfo.start(now);
      osc.start(now);
      lfo.stop(now + 0.82);
      osc.stop(now + 0.82);

      // Soft noise whoosh
      const bufferSize = Math.floor(ctx.sampleRate * 0.8);
      const whooshBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = whooshBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const whoosh = ctx.createBufferSource();
      whoosh.buffer = whooshBuffer;

      const whooshFilter = ctx.createBiquadFilter();
      whooshFilter.type = 'lowpass';
      whooshFilter.frequency.setValueAtTime(200, now);
      whooshFilter.frequency.exponentialRampToValueAtTime(600, now + 0.4);
      whooshFilter.frequency.exponentialRampToValueAtTime(150, now + 0.8);

      const whooshGain = ctx.createGain();
      whooshGain.gain.setValueAtTime(0.0001, now);
      whooshGain.gain.linearRampToValueAtTime(0.12, now + 0.35);
      whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

      whoosh.connect(whooshFilter);
      whooshFilter.connect(whooshGain);
      whooshGain.connect(compressor);
      whoosh.start(now);
    }

    // 5. HAUNTED AMBIENCE SYSTEM (Fades in over 3 seconds, fades out over 1 second)
    function startAmbience() {
      if (!ctx || isMuted || !ambienceEnabled) return;
      stopAmbience(true);

      const now = ctx.currentTime;

      // Ambience Master Gain: fades in over 3 seconds
      ambienceMasterGain = ctx.createGain();
      ambienceMasterGain.gain.setValueAtTime(0.0001, now);
      ambienceMasterGain.gain.linearRampToValueAtTime(1.0, now + 3.0);
      ambienceMasterGain.connect(compressor);

      // Layer 1: Wind — white noise through lowpass at 400Hz with 0.08Hz slow LFO
      const bufferDuration = 5;
      const bufferSize = ctx.sampleRate * bufferDuration;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      windSource = ctx.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;

      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.setValueAtTime(400, now);
      windFilter.Q.setValueAtTime(2.0, now);

      windLfo = ctx.createOscillator();
      windLfo.type = 'sine';
      windLfo.frequency.setValueAtTime(0.08, now);

      windLfoGain = ctx.createGain();
      windLfoGain.gain.setValueAtTime(160, now);
      windLfo.connect(windLfoGain);
      windLfoGain.connect(windFilter.frequency);

      const windGain = ctx.createGain();
      windGain.gain.setValueAtTime(0.045, now);

      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ambienceMasterGain);

      windLfo.start(now);
      windSource.start(now);

      // Layer 2: Low haunted drone — two detuned triangle/sine oscillators at 55Hz and 55.6Hz with slow volume swell
      droneOsc1 = ctx.createOscillator();
      droneOsc2 = ctx.createOscillator();
      droneOsc1.type = 'triangle';
      droneOsc2.type = 'triangle';
      droneOsc1.frequency.setValueAtTime(55.0, now);
      droneOsc2.frequency.setValueAtTime(55.6, now);

      droneGain = ctx.createGain();
      droneGain.gain.setValueAtTime(0.04, now);

      droneLfo = ctx.createOscillator();
      droneLfo.type = 'sine';
      droneLfo.frequency.setValueAtTime(0.04, now);

      droneLfoGain = ctx.createGain();
      droneLfoGain.gain.setValueAtTime(0.02, now);
      droneLfo.connect(droneLfoGain);
      droneLfoGain.connect(droneGain.gain);

      droneOsc1.connect(droneGain);
      droneOsc2.connect(droneGain);
      droneGain.connect(ambienceMasterGain);

      droneLfo.start(now);
      droneOsc1.start(now);
      droneOsc2.start(now);

      // Layer 3: Optional crackle — sparse tiny noise clicks like candle flame
      scheduleCrackle();

      // Layer 4: Random one-shots every 10 to 25 seconds
      scheduleOneShot();
    }

    function scheduleCrackle() {
      if (crackleTimer) clearTimeout(crackleTimer);
      const delay = 1800 + Math.random() * 2500;
      crackleTimer = setTimeout(() => {
        if (ambienceEnabled && !isMuted && ctx && ctx.state === 'running') {
          playSingleCrackle();
          scheduleCrackle();
        }
      }, delay);
    }

    function playSingleCrackle() {
      if (!ctx || isMuted || !ambienceMasterGain) return;
      const now = ctx.currentTime;
      const dur = 0.025 + Math.random() * 0.02;
      const bufferSize = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(1600, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.015 + Math.random() * 0.01, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      source.connect(hp);
      hp.connect(gain);
      gain.connect(ambienceMasterGain);

      source.start(now);
    }

    function scheduleOneShot() {
      if (oneShotTimer) clearTimeout(oneShotTimer);
      const delay = 10000 + Math.random() * 15000; // 10 to 25 seconds
      oneShotTimer = setTimeout(() => {
        if (ambienceEnabled && !isMuted && ctx && ctx.state === 'running') {
          playRandomOneShot();
          scheduleOneShot();
        }
      }, delay);
    }

    function playRandomOneShot() {
      if (!ctx || isMuted || !ambienceMasterGain) return;
      const choice = Math.floor(Math.random() * 3);
      if (choice === 0) {
        playCreakingDoor();
      } else if (choice === 1) {
        playFaintBell();
      } else {
        playOwlHoot();
      }
    }

    // One-shot: distant creaking door (sawtooth through moving bandpass)
    function playCreakingDoor() {
      if (!ctx || isMuted || !ambienceMasterGain) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(62, now);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(280, now);
      filter.frequency.exponentialRampToValueAtTime(520, now + 0.9);
      filter.Q.setValueAtTime(6, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.04, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ambienceMasterGain);

      osc.start(now);
      osc.stop(now + 1.25);
    }

    // One-shot: faint bell (sine partials at 880, 1320 and 1760Hz with long decay)
    function playFaintBell() {
      if (!ctx || isMuted || !ambienceMasterGain) return;
      const now = ctx.currentTime;
      const partials = [
        { freq: 880, vol: 0.025 },
        { freq: 1320, vol: 0.015 },
        { freq: 1760, vol: 0.008 }
      ];

      partials.forEach(p => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(p.freq, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(p.vol, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.0);

        osc.connect(gain);
        gain.connect(ambienceMasterGain);

        osc.start(now);
        osc.stop(now + 3.1);
      });
    }

    // One-shot: owl-like hoot (two sine tones with falling pitch)
    function playOwlHoot() {
      if (!ctx || isMuted || !ambienceMasterGain) return;
      const now = ctx.currentTime;

      // First hoot
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(460, now);
      osc1.frequency.exponentialRampToValueAtTime(390, now + 0.38);

      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.linearRampToValueAtTime(0.025, now + 0.08);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

      osc1.connect(gain1);
      gain1.connect(ambienceMasterGain);
      osc1.start(now);
      osc1.stop(now + 0.42);

      // Second hoot
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(420, now + 0.55);
      osc2.frequency.exponentialRampToValueAtTime(340, now + 1.15);

      gain2.gain.setValueAtTime(0.0001, now + 0.55);
      gain2.gain.linearRampToValueAtTime(0.028, now + 0.65);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

      osc2.connect(gain2);
      gain2.connect(ambienceMasterGain);
      osc2.start(now + 0.55);
      osc2.stop(now + 1.25);
    }

    function stopAmbience(instant = false) {
      if (crackleTimer) { clearTimeout(crackleTimer); crackleTimer = null; }
      if (oneShotTimer) { clearTimeout(oneShotTimer); oneShotTimer = null; }

      if (ambienceMasterGain && ctx) {
        const now = ctx.currentTime;
        const fadeDuration = instant ? 0.03 : 1.0;
        ambienceMasterGain.gain.cancelScheduledValues(now);
        ambienceMasterGain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);

        const oldNodes = {
          gain: ambienceMasterGain,
          wind: windSource,
          windLfo: windLfo,
          osc1: droneOsc1,
          osc2: droneOsc2,
          droneLfo: droneLfo
        };

        setTimeout(() => {
          try {
            if (oldNodes.wind) oldNodes.wind.stop();
            if (oldNodes.windLfo) oldNodes.windLfo.stop();
            if (oldNodes.osc1) oldNodes.osc1.stop();
            if (oldNodes.osc2) oldNodes.osc2.stop();
            if (oldNodes.droneLfo) oldNodes.droneLfo.stop();
            if (oldNodes.gain) oldNodes.gain.disconnect();
          } catch (e) {}
        }, (fadeDuration + 0.1) * 1000);
      }

      ambienceMasterGain = null;
      windSource = null;
      windLfo = null;
      droneOsc1 = null;
      droneOsc2 = null;
      droneLfo = null;
    }

    // Additional UI Audio Effects
    let lastHoverTickTime = 0;
    function playHoverTick() {
      if (isMuted || !sfxEnabled) return;
      const nowMs = performance.now();
      if (nowMs - lastHoverTickTime < 80) return;
      lastHoverTickTime = nowMs;

      initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(2000, now);

      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

      osc.connect(gain);
      gain.connect(compressor);
      osc.start(now);
      osc.stop(now + 0.035);
    }

    let lastGlitchTime = 0;
    function playGlitchSound() {
      if (isMuted || !sfxEnabled) return;
      const nowMs = performance.now();
      if (nowMs - lastGlitchTime < 180) return;
      lastGlitchTime = nowMs;

      initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      const f1 = 200 + Math.random() * 400;
      const f2 = 400 + Math.random() * 400;
      osc.frequency.setValueAtTime(f1, now);
      osc.frequency.setValueAtTime(f2, now + 0.06);

      gain.gain.setValueAtTime(0.07, now);
      gain.gain.linearRampToValueAtTime(0.09, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

      osc.connect(gain);
      gain.connect(compressor);
      osc.start(now);
      osc.stop(now + 0.16);
    }

    function playWaxStamp(status) {
      if (isMuted || !sfxEnabled) return;
      initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.18);

      gain.gain.setValueAtTime(0.42, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      osc.connect(gain);
      gain.connect(compressor);
      osc.start(now);
      osc.stop(now + 0.24);

      if (status === 'Traced') {
        playTone(784, 0.45, 'sine', 0.08);
      } else if (status === 'Recovered') {
        playTone(330, 0.5, 'sine', 0.07);
        playTone(493.88, 0.5, 'sine', 0.06);
      } else if (status === 'Warded') {
        playTone(196, 0.7, 'triangle', 0.12);
        playTone(392, 0.7, 'sine', 0.08);
      }
    }

    function playTone(freq, dur, type = 'sine', vol = 0.08) {
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      osc.connect(gain);
      gain.connect(compressor);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }

    function playToastSound() {
      if (isMuted || !sfxEnabled) return;
      initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const bufferSize = Math.floor(ctx.sampleRate * 0.08);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.4;

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(2200, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

      noise.connect(hp);
      hp.connect(gain);
      gain.connect(compressor);
      noise.start(now);
    }

    function playQuillScratch() {
      if (isMuted || !sfxEnabled) return;
      initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const dur = 0.35;
      const bufferSize = Math.floor(ctx.sampleRate * dur);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.Q.setValueAtTime(3, now);

      const gain = ctx.createGain();
      const am = ctx.createOscillator();
      const amGain = ctx.createGain();
      am.frequency.setValueAtTime(24, now);
      amGain.gain.setValueAtTime(0.5, now);
      am.connect(amGain.gain);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(compressor);

      am.start(now);
      noise.start(now);
      am.stop(now + dur);
    }

    function playDrawerWhoosh(direction = 'open') {
      if (isMuted || !sfxEnabled) return;
      initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sine';
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, now);

      if (direction === 'open') {
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(360, now + 0.25);
      } else {
        osc.frequency.setValueAtTime(340, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.25);
      }

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(compressor);
      osc.start(now);
      osc.stop(now + 0.3);
    }

    function playFinaleSwell() {
      if (isMuted || !sfxEnabled) return;
      initContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const chord = [110, 130.81, 164.81, 220];

      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq + (idx % 2 === 0 ? 0.4 : -0.4), now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 1.2);
        gain.gain.linearRampToValueAtTime(0.12, now + 2.0);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);

        osc.connect(gain);
        gain.connect(compressor);
        osc.start(now);
        osc.stop(now + 3.5);
      });

      playTone(523.25, 2.2, 'sine', 0.15);
    }

    return {
      initContext,
      setMuted,
      isMuted: () => isMuted,
      setVolume,
      setSfx,
      setAmbience,
      updateUI,
      startSealHoldDrone,
      stopSealHoldDrone,
      playDoubleKnock,
      playSealBreak,
      playLedgerOpen,
      playHoverTick,
      playGlitchSound,
      playWaxStamp,
      playToastSound,
      playQuillScratch,
      playDrawerWhoosh,
      playFinaleSwell
    };
  })();

  /* --------------------------------------------------------------------------
     2. HORCRUX DATA
     -------------------------------------------------------------------------- */
  const DEFAULT_HORCRUXES = [
    {
      id: 1,
      numeral: 'I',
      name: "Tom Riddle’s Diary",
      location: "Chamber of Secrets, Hogwarts",
      mapCoords: { x: 380, y: 190 },
      lastSeen: "Hogwarts Castle, Slytherin’s Chamber, circa June 1993.",
      clue: "My sixteen-year-old memory, preserved within pristine parchment. I entrusted it to that spineless fool Malfoy—yet whispers reached me that he cast it into a schoolgirl’s cauldron like common rubbish. If that serpent is slain, he shall pay dearly.",
      status: 'Lost',
      icon: 'diary',
      wardStrength: 65
    },
    {
      id: 2,
      numeral: 'II',
      name: "Gaunt Family Ring",
      location: "Gaunt shack, Little Hangleton",
      mapCoords: { x: 490, y: 340 },
      lastSeen: "The ruins of the House of Gaunt, Little Hangleton.",
      clue: "The black stone of Cadmus Peverell, bearing the Deathly mark. Entombed under the rotting floorboards of my wretched ancestral hovel with fatal blood curses. Surely no meddling old fool could have deciphered its hiding place.",
      status: 'Lost',
      icon: 'ring',
      wardStrength: 75
    },
    {
      id: 3,
      numeral: 'III',
      name: "Slytherin’s Locket",
      location: "Island cave, then Grimmauld Place",
      mapCoords: { x: 230, y: 440 },
      lastSeen: "Submerged within the potion basin of the Sea Cave; recent echoes in London.",
      clue: "The heavy gold locket emblazoned with the ornate serpentine ‘S’. Guarded behind a lake of Inferi and a potion of purest despair. Yet my senses prickle—did a treasonous house-elf dare defy me in the dark?",
      status: 'Lost',
      icon: 'locket',
      wardStrength: 80
    },
    {
      id: 4,
      numeral: 'IV',
      name: "Hufflepuff’s Cup",
      location: "Lestrange vault, Gringotts",
      mapCoords: { x: 570, y: 460 },
      lastSeen: "Gringotts Wizarding Bank, Vault 393, London.",
      clue: "The golden two-handled chalice engraved with the badger of Helga Hufflepuff. Stored deep beneath London in Bellatrix’s vault, guarded by blind dragons, Gemino, and Flagrante curses. Safe... unless goblin scum prove treacherous.",
      status: 'Traced', // Starts Traced per brief
      icon: 'cup',
      wardStrength: 85
    },
    {
      id: 5,
      numeral: 'V',
      name: "Ravenclaw’s Diadem",
      location: "Room of Requirement, Hogwarts",
      mapCoords: { x: 395, y: 215 },
      lastSeen: "The Room of Hidden Things, seventh floor corridor, Hogwarts.",
      clue: "The tiara of boundless wit, inscribed ‘Wit beyond measure is man’s greatest treasure’. Concealed within the Room of Hidden Things amongst centuries of forgotten refuse. Only I alone unlocked that secret—or so I believed.",
      status: 'Lost',
      icon: 'diadem',
      wardStrength: 70
    },
    {
      id: 6,
      numeral: 'VI',
      name: "Nagini",
      location: "At the Dark Lord’s side",
      mapCoords: { x: 520, y: 390 },
      lastSeen: "At the Dark Lord’s right hand; prowling Malfoy Manor.",
      clue: "My living vessel, coiled in shadow. She breathes my malice and strikes with venom that defies all healing. Kept close within a translucent protective sphere... yet she wanders hungrily when battle looms.",
      status: 'Lost',
      icon: 'snake',
      wardStrength: 90
    },
    {
      id: 7,
      numeral: 'VII',
      name: "The Unwitting Vessel",
      location: "A scarred boy, last seen in the Forest",
      mapCoords: { x: 420, y: 250 },
      lastSeen: "The Forbidden Forest, clearing near the sunken hollow.",
      clue: "The scar upon the Potter boy’s brow. A splinter of my fractured soul cleaved away that fateful night in Godric’s Hollow without my deliberate sanction. He must fall by my hand—and my hand alone.",
      status: 'Lost',
      icon: 'scar',
      wardStrength: 50
    }
  ];

  const STATUS_CYCLE = ['Lost', 'Traced', 'Recovered', 'Warded'];

  const VOLDEMORT_QUOTES = {
    Lost: "“Severed from my sight once more! Incompetents shall suffer for this negligence.”",
    Traced: "“A whisper of its whereabouts. The scent grows warm; fetch my servants.”",
    Recovered: "“Mine again. The soul fragment rests securely beneath my dominion.”",
    Warded: "“Bound and sealed by the Kapidhwaj Wardens. Let mortal vermin search until their bones turn to dust.”"
  };

  /* --------------------------------------------------------------------------
     3. LOCAL STORAGE WITH TRY / CATCH
     -------------------------------------------------------------------------- */
  const STORAGE_KEY_ITEMS = 'horcrux_ledger_items_v4';
  const STORAGE_KEY_NOTES = 'horcrux_ledger_notes_v4';
  const STORAGE_KEY_THEME = 'horcrux_ledger_candlelight_v4';
  const STORAGE_KEY_JOURNAL = 'horcrux_ledger_journal_v4';
  const STORAGE_KEY_SEALED = 'horcrux_ledger_unsealed_v4';

  function loadHorcruxes() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_ITEMS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length === 7) return parsed;
      }
    } catch (e) {
      console.warn("Error reading Horcrux items from localStorage:", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_HORCRUXES));
  }

  function saveHorcruxes(items) {
    try {
      localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(items));
    } catch (e) {
      console.warn("Error saving Horcrux items to localStorage:", e);
    }
  }

  function loadFieldNotes() {
    try {
      const notes = localStorage.getItem(STORAGE_KEY_NOTES);
      return notes ? JSON.parse(notes) : {};
    } catch (e) {
      return {};
    }
  }

  function saveFieldNote(id, text) {
    try {
      const notes = loadFieldNotes();
      notes[id] = text;
      localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
    } catch (e) {
      console.warn("Error saving field note:", e);
    }
  }

  function loadJournal() {
    try {
      const logs = localStorage.getItem(STORAGE_KEY_JOURNAL);
      if (logs) return JSON.parse(logs);
    } catch (e) {}
    return [
      {
        time: new Date(Date.now() - 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: "“Hufflepuff’s Cup traced to Vault 393 under Gringotts. The blind dragon sleeps atop our gold.”"
      }
    ];
  }

  function appendJournal(quote) {
    try {
      const logs = loadJournal();
      logs.unshift({
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: quote
      });
      if (logs.length > 25) logs.pop();
      localStorage.setItem(STORAGE_KEY_JOURNAL, JSON.stringify(logs));
      renderJournal();
      updateJournalBadge();
    } catch (e) {}
  }

  /* --------------------------------------------------------------------------
     4. APPLICATION STATE & DOM REFERENCES
     -------------------------------------------------------------------------- */
  let horcruxes = loadHorcruxes();
  let fieldNotes = loadFieldNotes();
  let activeFilter = 'all';
  let searchQuery = '';
  let activeSort = 'number';
  let activeDossierId = null;
  let previousActiveElement = null;
  let viewMode = 'ledger';

  const gridContainer = document.getElementById('main-ledger-grid');
  const emptyState = document.getElementById('empty-state');
  const searchInput = document.getElementById('search-input');
  const sortSelect = document.getElementById('sort-select');
  const filterChips = document.querySelectorAll('.chip');
  const gaugeTrack = document.getElementById('gauge-track');
  const gaugeCounterText = document.getElementById('gauge-counter-text');
  const temperStateText = document.getElementById('temper-state-text');
  const temperFillBar = document.getElementById('temper-fill-bar');
  const finaleBanner = document.getElementById('finale-banner');
  const emberCanvas = document.getElementById('ember-canvas');
  const toastContainer = document.getElementById('toast-container');

  // Intro Scene Elements
  const sealedIntro = document.getElementById('sealed-intro');
  const introMotesCanvas = document.getElementById('intro-motes-canvas');
  const ledgerCoverCard = document.getElementById('ledger-cover-card');
  const waxSealBtn = document.getElementById('wax-seal-btn');
  const waxSealElement = document.getElementById('wax-seal-element');
  const sealRingFill = document.getElementById('seal-ring-fill');
  const sealPromptText = document.getElementById('seal-prompt-text');
  const introSoundCheckbox = document.getElementById('intro-sound-checkbox');
  const btnReducedOpen = document.getElementById('btn-reduced-open');
  const btnSkipIntro = document.getElementById('btn-skip-intro');
  const btnReplayIntro = document.getElementById('btn-replay-intro');
  const introLiveRegion = document.getElementById('intro-live-region');
  const appWrapper = document.getElementById('app-wrapper');

  // Sound Widget & Popover
  const btnSoundToggle = document.getElementById('btn-sound-toggle');
  const btnSoundSettings = document.getElementById('btn-sound-settings');
  const soundPopoverPanel = document.getElementById('sound-popover-panel');
  const masterVolumeSlider = document.getElementById('master-volume-slider');
  const btnSfxToggle = document.getElementById('btn-sfx-toggle');
  const btnAmbienceToggle = document.getElementById('btn-ambience-toggle');
  const btnNavSound = document.getElementById('btn-nav-sound');

  // Modals & Drawers
  const dossierDrawer = document.getElementById('dossier-drawer');
  const dossierBackdrop = document.getElementById('dossier-backdrop');
  const btnCloseDossier = document.getElementById('btn-close-dossier');
  const btnPrintDossier = document.getElementById('btn-print-dossier');
  const notesTextarea = document.getElementById('dossier-field-notes');
  const wardStrengthSlider = document.getElementById('ward-strength-slider');
  const wardStrengthVal = document.getElementById('ward-strength-val');

  const journalModal = document.getElementById('journal-modal');
  const btnJournalToggle = document.getElementById('btn-journal-toggle');
  const btnCloseJournal = document.getElementById('btn-close-journal');
  const journalList = document.getElementById('journal-list');
  const journalBadge = document.getElementById('journal-badge');

  const owlPostModal = document.getElementById('owl-post-modal');
  const btnOwlPost = document.getElementById('btn-owl-post');
  const btnCloseOwl = document.getElementById('btn-close-owl');

  const shortcutsModal = document.getElementById('shortcuts-modal');
  const btnShortcutsHelp = document.getElementById('btn-shortcuts-help');
  const btnCloseShortcuts = document.getElementById('btn-close-shortcuts');

  const resetBackdrop = document.getElementById('reset-dialog-backdrop');
  const btnResetLedger = document.getElementById('btn-reset-ledger');
  const btnConfirmReset = document.getElementById('btn-confirm-reset');
  const btnCancelReset = document.getElementById('btn-cancel-reset');

  const btnToggleCandle = document.getElementById('btn-toggle-candle');
  const candleText = document.getElementById('candle-text');
  const btnToggleView = document.getElementById('btn-toggle-view');
  const estateMapView = document.getElementById('estate-map-view');

  /* --------------------------------------------------------------------------
     5. GLITCH IN THE CRYPT ENGINE & SOUND SYNTHESIS
     -------------------------------------------------------------------------- */
  document.addEventListener('pointerdown', (e) => {
    // Unlock Web Audio Context on first gesture
    AudioEngine.initContext();

    const target = e.target.closest('.glitch-target');
    if (target) {
      target.classList.remove('crypt-glitched');
      void target.offsetWidth;
      target.classList.add('crypt-glitched');
      AudioEngine.playGlitchSound();
      setTimeout(() => {
        target.classList.remove('crypt-glitched');
      }, 550);
    }
  });

  // Hover sound tick & hover glitch sound
  document.addEventListener('mouseover', (e) => {
    const btnOrLink = e.target.closest('button, a, .artifact-card, .map-pin-group');
    if (btnOrLink) {
      AudioEngine.playHoverTick();
    }
    const glitchTarget = e.target.closest('.glitch-target');
    if (glitchTarget) {
      AudioEngine.playGlitchSound();
    }
  });

  /* --------------------------------------------------------------------------
     6. EMBLEM SVGS (ANTIQUE INLINE PLATE STYLE)
     -------------------------------------------------------------------------- */
  function getEmblemSvg(type) {
    switch (type) {
      case 'diary':
        return `
          <svg class="emblem-svg" viewBox="0 0 64 64" aria-hidden="true">
            <rect x="14" y="10" width="36" height="44" rx="2" />
            <line x1="20" y1="10" x2="20" y2="54" stroke-dasharray="2 2" />
            <path d="M28 24 L42 24" />
            <path d="M28 32 L40 32" />
            <path d="M34 16 L34 44" stroke="var(--burgundy)" stroke-width="2" />
            <circle cx="34" cy="44" r="2.5" fill="var(--burgundy)" />
          </svg>
        `;
      case 'ring':
        return `
          <svg class="emblem-svg" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="36" r="16" />
            <polygon points="32,12 40,24 24,24" fill="currentColor" fill-opacity="0.15" />
            <line x1="32" y1="12" x2="32" y2="24" />
            <circle cx="32" cy="18" r="3" fill="var(--gold-bright)" />
          </svg>
        `;
      case 'locket':
        return `
          <svg class="emblem-svg" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M32 8 C20 8 16 18 16 26 C16 42 32 54 32 54 C32 54 48 42 48 26 C48 18 44 8 32 8 Z" />
            <path d="M30 22 C34 20 36 24 32 28 C28 32 30 36 34 36" stroke="var(--gold-bright)" stroke-width="2.2" />
            <circle cx="32" cy="14" r="2" fill="var(--gold-bright)" />
          </svg>
        `;
      case 'cup':
        return `
          <svg class="emblem-svg" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M20 14 L44 14 L40 36 C40 42 36 44 32 44 C28 44 24 42 24 36 Z" />
            <line x1="32" y1="44" x2="32" y2="52" />
            <line x1="22" y1="52" x2="42" y2="52" stroke-width="2" />
            <path d="M20 18 C12 18 12 28 21 30" />
            <path d="M44 18 C52 18 52 28 43 30" />
          </svg>
        `;
      case 'diadem':
        return `
          <svg class="emblem-svg" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M12 40 C20 22 44 22 52 40 C42 36 22 36 12 40 Z" />
            <path d="M32 18 L36 28 L28 28 Z" fill="var(--gold-bright)" />
            <path d="M20 34 C26 28 38 28 44 34" stroke-dasharray="2 2" />
            <circle cx="32" cy="30" r="2.5" fill="var(--gold-bright)" />
          </svg>
        `;
      case 'snake':
        return `
          <svg class="emblem-svg" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M18 46 C16 38 24 32 30 36 C36 40 46 36 46 26 C46 16 36 14 30 16 C26 17 22 22 22 26" />
            <circle cx="21" cy="24" r="1.5" fill="var(--burgundy)" />
            <path d="M22 28 L16 30" stroke="var(--burgundy)" />
            <ellipse cx="32" cy="48" rx="16" ry="6" stroke-dasharray="3 3" />
          </svg>
        `;
      case 'scar':
        return `
          <svg class="emblem-svg" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M36 8 L22 32 L34 32 L26 56" stroke="var(--burgundy)" stroke-width="2.5" stroke-linejoin="miter" />
            <circle cx="32" cy="32" r="22" stroke-dasharray="4 3" />
          </svg>
        `;
      case 'kapidhwaj':
        return `
          <svg class="emblem-svg" viewBox="0 0 64 64" aria-hidden="true">
            <polygon points="32,6 56,18 56,46 32,58 8,46 8,18" stroke="var(--gold-bright)" stroke-width="2" />
            <circle cx="32" cy="32" r="14" stroke-dasharray="3 2" />
            <path d="M32 20 L32 44" stroke="var(--gold-bright)" />
            <path d="M20 32 L44 32" stroke="var(--gold-bright)" />
            <circle cx="32" cy="32" r="4" fill="var(--gold-bright)" />
          </svg>
        `;
      default:
        return '';
    }
  }

  /* --------------------------------------------------------------------------
     7. DUST MOTES & EMBERS CANVAS (INTRO SCENE)
     -------------------------------------------------------------------------- */
  let motesAnimId = null;
  let motes = [];

  function initIntroMotes() {
    if (!introMotesCanvas) return;
    introMotesCanvas.width = window.innerWidth;
    introMotesCanvas.height = window.innerHeight;

    motes = [];
    const count = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 38;
    for (let i = 0; i < count; i++) {
      motes.push({
        x: Math.random() * introMotesCanvas.width,
        y: Math.random() * introMotesCanvas.height,
        r: Math.random() * 2 + 0.6,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -0.2 - Math.random() * 0.4,
        alpha: Math.random() * 0.6 + 0.2,
        isEmber: Math.random() > 0.75
      });
    }

    if (count > 0 && !motesAnimId) renderIntroMotes();
  }

  function renderIntroMotes() {
    if (!introMotesCanvas || sealedIntro.classList.contains('unsealed')) {
      if (motesAnimId) {
        cancelAnimationFrame(motesAnimId);
        motesAnimId = null;
      }
      return;
    }
    const ctx2 = introMotesCanvas.getContext('2d');
    ctx2.clearRect(0, 0, introMotesCanvas.width, introMotesCanvas.height);

    motes.forEach(m => {
      m.x += m.vx;
      m.y += m.vy;
      if (m.y < -10) {
        m.y = introMotesCanvas.height + 10;
        m.x = Math.random() * introMotesCanvas.width;
      }
      if (m.x < -10) m.x = introMotesCanvas.width + 10;
      if (m.x > introMotesCanvas.width + 10) m.x = -10;

      ctx2.beginPath();
      ctx2.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx2.fillStyle = m.isEmber ? `rgba(235, 140, 60, ${m.alpha})` : `rgba(201, 162, 77, ${m.alpha * 0.6})`;
      if (m.isEmber) {
        ctx2.shadowBlur = 6;
        ctx2.shadowColor = '#ffaa33';
      } else {
        ctx2.shadowBlur = 0;
      }
      ctx2.fill();
    });

    motesAnimId = requestAnimationFrame(renderIntroMotes);
  }

  /* --------------------------------------------------------------------------
     8. 3D PARALLAX TILT ON LEDGER COVER & CANDLELIGHT CURSOR
     -------------------------------------------------------------------------- */
  let candleX = window.innerWidth / 2;
  let candleY = window.innerHeight / 2;
  const candleGlow = document.getElementById('candlelight-glow');

  window.addEventListener('mousemove', (e) => {
    candleX = e.clientX;
    candleY = e.clientY;

    if (candleGlow) {
      document.body.classList.add('has-cursor');
      candleGlow.style.transform = `translate3d(${candleX}px, ${candleY}px, 0)`;
    }

    // 3D Parallax Tilt (about 6 degrees, disabled on reduced motion/touch)
    if (ledgerCoverCard && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !('ontouchstart' in window)) {
      const rect = ledgerCoverCard.getBoundingClientRect();
      const cardCenterX = rect.left + rect.width / 2;
      const cardCenterY = rect.top + rect.height / 2;
      const deltaX = (e.clientX - cardCenterX) / (window.innerWidth / 2);
      const deltaY = (e.clientY - cardCenterY) / (window.innerHeight / 2);

      const tiltX = -deltaY * 6;
      const tiltY = deltaX * 6;
      ledgerCoverCard.style.transform = `rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`;

      // Brighten seal glow when pointer gets near
      const dist = Math.hypot(e.clientX - cardCenterX, e.clientY - cardCenterY);
      const proximity = Math.max(0, 1 - dist / 500);
      waxSealElement.style.boxShadow = `0 12px 35px rgba(0, 0, 0, 0.9), 0 0 ${25 + proximity * 30}px var(--burgundy-glow)`;
    }
  });

  /* --------------------------------------------------------------------------
     9. PRESS-AND-HOLD UNSEALING SEQUENCE (1.5 SECONDS)
     -------------------------------------------------------------------------- */
  const HOLD_DURATION = 1500; // 1.5s hold per brief
  let holdStartTime = null;
  let holdInterval = null;
  let isUnsealing = false;
  const RING_CIRCUMFERENCE = 464.95; // 2 * PI * 74

  function startHold(e) {
    if (isUnsealing) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    if (e.type === 'keydown') e.preventDefault();

    // Unlock Web Audio synchronously on user gesture (required by Mobile Safari)
    AudioEngine.initContext();

    holdStartTime = Date.now();
    waxSealElement.classList.add('holding');
    sealPromptText.textContent = "Keep holding...";

    AudioEngine.startSealHoldDrone(HOLD_DURATION / 1000);

    clearInterval(holdInterval);
    holdInterval = setInterval(() => {
      const elapsed = Date.now() - holdStartTime;
      const progress = Math.min(1, elapsed / HOLD_DURATION);

      // Fill circular gold progress ring
      const offset = RING_CIRCUMFERENCE * (1 - progress);
      sealRingFill.style.strokeDashoffset = offset.toFixed(1);

      if (progress >= 1) {
        clearInterval(holdInterval);
        completeUnseal();
      }
    }, 20);
  }

  function cancelHold() {
    if (isUnsealing || !holdStartTime) return;
    clearInterval(holdInterval);
    holdStartTime = null;

    waxSealElement.classList.remove('holding');
    sealRingFill.style.strokeDashoffset = RING_CIRCUMFERENCE;
    sealPromptText.textContent = "Press and hold to break the seal.";

    AudioEngine.stopSealHoldDrone(false);
    AudioEngine.playDoubleKnock();
  }

  function completeUnseal() {
    if (isUnsealing) return;
    isUnsealing = true;

    clearInterval(holdInterval);
    AudioEngine.stopSealHoldDrone(true);
    AudioEngine.playSealBreak();

    // Flash of gold light
    const flash = document.getElementById('seal-break-flash');
    if (flash) {
      flash.classList.add('active');
      setTimeout(() => flash.classList.remove('active'), 350);
    }

    waxSealElement.classList.remove('holding');
    waxSealElement.classList.add('broken');
    sealPromptText.textContent = "⚜ THE SEAL IS SHATTERED ⚜";

    // Screen reader live region notification
    if (introLiveRegion) {
      introLiveRegion.textContent = "Seal broken. Ledger open.";
    }

    // Ledger cover opens like double doors in about 1.4 seconds
    setTimeout(() => {
      AudioEngine.playLedgerOpen();
      sealedIntro.classList.add('unsealed');

      if (appWrapper) {
        appWrapper.removeAttribute('inert');
        appWrapper.removeAttribute('aria-hidden');
        appWrapper.style.visibility = 'visible';
        appWrapper.classList.add('active');
      }

      // Ambience begins fading in over 3 seconds
      AudioEngine.setAmbience(true);

      try {
        sessionStorage.setItem(STORAGE_KEY_SEALED, 'true');
      } catch (e) {}

      // Focus moves to main heading
      const mainTitle = document.getElementById('crypt-main-title');
      if (mainTitle) {
        setTimeout(() => {
          mainTitle.focus();
        }, 50);
      }
    }, 450);
  }

  function completeUnsealFast() {
    if (isUnsealing) return;
    isUnsealing = true;
    clearInterval(holdInterval);

    AudioEngine.stopSealHoldDrone(true);
    sealedIntro.classList.add('unsealed');

    if (appWrapper) {
      appWrapper.removeAttribute('inert');
      appWrapper.removeAttribute('aria-hidden');
      appWrapper.style.visibility = 'visible';
      appWrapper.classList.add('active');
    }

    if (introLiveRegion) {
      introLiveRegion.textContent = "Seal broken. Ledger open.";
    }

    AudioEngine.setAmbience(true);

    try {
      sessionStorage.setItem(STORAGE_KEY_SEALED, 'true');
    } catch (e) {}

    setTimeout(() => {
      const mainTitle = document.getElementById('crypt-main-title');
      if (mainTitle) {
        mainTitle.setAttribute('tabindex', '-1');
        mainTitle.focus();
      }
    }, 300);
  }

  // Bind Press & Hold Events (Mouse, Touch, Keyboard Space/Enter)
  waxSealBtn.addEventListener('mousedown', startHold);
  window.addEventListener('mouseup', cancelHold);

  waxSealBtn.addEventListener('touchstart', startHold, { passive: false });
  window.addEventListener('touchend', cancelHold);
  window.addEventListener('touchcancel', cancelHold);

  waxSealBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') startHold(e);
  });
  waxSealBtn.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' || e.key === ' ') cancelHold();
  });

  // Skip Intro Button
  btnSkipIntro.addEventListener('click', () => {
    AudioEngine.initContext();
    if (introSoundCheckbox) {
      AudioEngine.setMuted(!introSoundCheckbox.checked);
    }
    completeUnsealFast();
  });

  // Plain "Open ledger" button for prefers-reduced-motion
  if (btnReducedOpen) {
    btnReducedOpen.addEventListener('click', () => {
      AudioEngine.initContext();
      if (introSoundCheckbox) {
        AudioEngine.setMuted(!introSoundCheckbox.checked);
      }
      completeUnsealFast();
    });
  }

  // Sync intro sound checkbox with engine state
  if (introSoundCheckbox) {
    introSoundCheckbox.checked = !AudioEngine.isMuted();
    introSoundCheckbox.addEventListener('change', () => {
      AudioEngine.initContext();
      AudioEngine.setMuted(!introSoundCheckbox.checked);
    });
  }

  // Replay Intro Link in Footer
  if (btnReplayIntro) {
    btnReplayIntro.addEventListener('click', () => {
      isUnsealing = false;
      waxSealElement.classList.remove('broken', 'holding');
      sealRingFill.style.strokeDashoffset = RING_CIRCUMFERENCE;
      sealPromptText.textContent = "Press and hold to break the seal.";
      sealedIntro.classList.remove('unsealed');

      if (appWrapper) {
        appWrapper.setAttribute('inert', '');
        appWrapper.setAttribute('aria-hidden', 'true');
        appWrapper.style.visibility = 'hidden';
        appWrapper.classList.remove('active');
      }

      AudioEngine.setAmbience(false);
      initIntroMotes();
    });
  }

  // Check if previously unsealed in this session
  try {
    if (sessionStorage.getItem(STORAGE_KEY_SEALED) === 'true') {
      sealedIntro.classList.add('unsealed');
      if (appWrapper) {
        appWrapper.removeAttribute('inert');
        appWrapper.removeAttribute('aria-hidden');
        appWrapper.style.visibility = 'visible';
        appWrapper.classList.add('active');
      }
      AudioEngine.setAmbience(true);
    }
  } catch (e) {}

  /* --------------------------------------------------------------------------
     10. SOUND SETTINGS WIDGET & POPOVER
     -------------------------------------------------------------------------- */
  // Fixed corner button toggles sound on/off
  btnSoundToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    AudioEngine.initContext();
    AudioEngine.setMuted(!AudioEngine.isMuted());
  });

  // Gear button opens/closes volume popover
  if (btnSoundSettings) {
    btnSoundSettings.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = soundPopoverPanel.classList.contains('open');
      if (isOpen) {
        soundPopoverPanel.classList.remove('open');
        soundPopoverPanel.setAttribute('aria-hidden', 'true');
      } else {
        soundPopoverPanel.classList.add('open');
        soundPopoverPanel.setAttribute('aria-hidden', 'false');
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#corner-sound-widget')) {
      soundPopoverPanel.classList.remove('open');
      soundPopoverPanel.setAttribute('aria-hidden', 'true');
    }
  });

  btnNavSound.addEventListener('click', () => {
    AudioEngine.initContext();
    AudioEngine.setMuted(!AudioEngine.isMuted());
  });

  masterVolumeSlider.addEventListener('input', (e) => {
    AudioEngine.setVolume(parseFloat(e.target.value));
  });

  btnSfxToggle.addEventListener('click', () => {
    const isPressed = btnSfxToggle.getAttribute('aria-pressed') === 'true';
    btnSfxToggle.setAttribute('aria-pressed', String(!isPressed));
    btnSfxToggle.textContent = !isPressed ? "SFX: ON" : "SFX: OFF";
    AudioEngine.setSfx(!isPressed);
  });

  btnAmbienceToggle.addEventListener('click', () => {
    const isPressed = btnAmbienceToggle.getAttribute('aria-pressed') === 'true';
    AudioEngine.setAmbience(!isPressed);
  });

  /* --------------------------------------------------------------------------
     11. DYNAMIC INSTABILITY & TEMPER GAUGE
     -------------------------------------------------------------------------- */
  function updateTemperAndInstability() {
    const lostCount = horcruxes.filter(h => h.status === 'Lost').length;
    const intensity = 0.8 + (lostCount / 7) * 1.6;
    document.documentElement.style.setProperty('--glitch-intensity', intensity.toFixed(2));

    const fillPercent = Math.round((lostCount / 7) * 100);
    temperFillBar.style.width = `${fillPercent}%`;

    let stateLabel = "Calm & Collected";
    if (lostCount >= 6) {
      stateLabel = "Unhinged Malice (High Danger)";
      document.body.classList.add('temper-critical');
    } else if (lostCount >= 4) {
      stateLabel = "Wrathful & Suspicious";
      document.body.classList.remove('temper-critical');
    } else if (lostCount >= 2) {
      stateLabel = "Agitated & Restless";
      document.body.classList.remove('temper-critical');
    } else {
      stateLabel = "Impassive Dominion";
      document.body.classList.remove('temper-critical');
    }
    temperStateText.textContent = `${stateLabel} (${lostCount} Lost)`;
  }

  /* --------------------------------------------------------------------------
     12. SOUL INTEGRITY METER & FINALE PARTICLES
     -------------------------------------------------------------------------- */
  function updateSoulIntegrity() {
    const securedCount = horcruxes.filter(h => h.status === 'Recovered' || h.status === 'Warded').length;
    gaugeCounterText.textContent = `${securedCount} of 7 fragments secured or warded`;
    gaugeTrack.setAttribute('aria-valuenow', securedCount);

    const notches = gaugeTrack.querySelectorAll('.gauge-notch');
    notches.forEach((notch, idx) => {
      if (idx < securedCount) {
        notch.classList.add('active');
      } else {
        notch.classList.remove('active');
      }
    });

    if (securedCount === 7) {
      finaleBanner.style.display = 'block';
      startEmberParticles();
      AudioEngine.playFinaleSwell();
    } else {
      finaleBanner.style.display = 'none';
      stopEmberParticles();
    }
  }

  let emberAnimId = null;
  let emberParticles = [];

  function startEmberParticles() {
    if (!emberCanvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    emberCanvas.style.display = 'block';
    emberCanvas.width = window.innerWidth;
    emberCanvas.height = window.innerHeight;

    emberParticles = [];
    for (let i = 0; i < 45; i++) {
      emberParticles.push({
        x: Math.random() * emberCanvas.width,
        y: Math.random() * emberCanvas.height,
        size: Math.random() * 3 + 1.5,
        speedY: Math.random() * 1.5 + 0.5,
        speedX: (Math.random() - 0.5) * 1,
        opacity: Math.random() * 0.7 + 0.3
      });
    }

    if (!emberAnimId) renderEmbers();
  }

  function stopEmberParticles() {
    if (emberAnimId) {
      cancelAnimationFrame(emberAnimId);
      emberAnimId = null;
    }
    if (emberCanvas) {
      emberCanvas.style.display = 'none';
      const ctx2 = emberCanvas.getContext('2d');
      if (ctx2) ctx2.clearRect(0, 0, emberCanvas.width, emberCanvas.height);
    }
  }

  function renderEmbers() {
    if (!emberCanvas) return;
    const ctx2 = emberCanvas.getContext('2d');
    ctx2.clearRect(0, 0, emberCanvas.width, emberCanvas.height);

    emberParticles.forEach(p => {
      p.y -= p.speedY;
      p.x += p.speedX;
      if (p.y < -10) {
        p.y = emberCanvas.height + 10;
        p.x = Math.random() * emberCanvas.width;
      }
      ctx2.beginPath();
      ctx2.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx2.fillStyle = `rgba(201, 162, 77, ${p.opacity})`;
      ctx2.shadowBlur = 6;
      ctx2.shadowColor = '#ecd38c';
      ctx2.fill();
    });

    emberAnimId = requestAnimationFrame(renderEmbers);
  }

  /* --------------------------------------------------------------------------
     13. FILTER, SEARCH & SORT LOGIC
     -------------------------------------------------------------------------- */
  function getFilteredAndSortedHorcruxes() {
    return horcruxes.filter(item => {
      if (activeFilter !== 'all' && item.status !== activeFilter) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.name.toLowerCase().includes(q);
        const matchLoc = item.location.toLowerCase().includes(q);
        const matchClue = item.clue.toLowerCase().includes(q);
        const matchNumeral = item.numeral.toLowerCase().includes(q);
        if (!matchName && !matchLoc && !matchClue && !matchNumeral) return false;
      }
      return true;
    }).sort((a, b) => {
      if (activeSort === 'number') return a.id - b.id;
      if (activeSort === 'name') return a.name.localeCompare(b.name);
      if (activeSort === 'status') return STATUS_CYCLE.indexOf(a.status) - STATUS_CYCLE.indexOf(b.status);
      return 0;
    });
  }

  function updateCounts() {
    const all = horcruxes.length;
    const lost = horcruxes.filter(h => h.status === 'Lost').length;
    const traced = horcruxes.filter(h => h.status === 'Traced').length;
    const recovered = horcruxes.filter(h => h.status === 'Recovered').length;
    const warded = horcruxes.filter(h => h.status === 'Warded').length;

    document.getElementById('count-all').textContent = `(${all})`;
    document.getElementById('count-lost').textContent = `(${lost})`;
    document.getElementById('count-traced').textContent = `(${traced})`;
    document.getElementById('count-recovered').textContent = `(${recovered})`;
    document.getElementById('count-warded').textContent = `(${warded})`;
  }

  /* --------------------------------------------------------------------------
     14. GRID & CARD RENDERING (4x2 SYMMETRICAL WITH KAPIDHWAJ CARD)
     -------------------------------------------------------------------------- */
  function renderGrid() {
    const items = getFilteredAndSortedHorcruxes();
    gridContainer.innerHTML = '';

    if (items.length === 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
    }

    items.forEach(item => {
      const card = document.createElement('article');
      card.className = 'artifact-card';
      card.id = `card-horcrux-${item.id}`;
      card.dataset.id = item.id;
      card.setAttribute('aria-label', `${item.numeral} ${item.name} · ${item.status}`);

      const nextStatusIdx = (STATUS_CYCLE.indexOf(item.status) + 1) % STATUS_CYCLE.length;
      const nextStatus = STATUS_CYCLE[nextStatusIdx];
      const statusClass = `status-${item.status.toLowerCase()}`;
      const isWarded = item.status === 'Warded';

      card.innerHTML = `
        <div class="card-numeral glitch-target">${item.numeral}</div>

        <div class="stamp-container" id="stamp-box-${item.id}" aria-hidden="true">
          <div class="stamp-disc">
            <span id="stamp-text-${item.id}">${item.status}</span>
          </div>
        </div>

        <div class="card-top">
          <div class="card-emblem-wrap">
            ${getEmblemSvg(item.icon)}
          </div>
          <button type="button" class="card-name-btn glitch-target" data-action="dossier" data-id="${item.id}" aria-label="Open dossier for ${item.name}">
            ${item.name}
          </button>
          <div class="card-location glitch-target">
            <span>📍</span> ${item.location}
          </div>

          <div class="status-badge-wrap">
            <div class="status-badge ${statusClass} glitch-target" id="badge-${item.id}">
              ${item.status}
            </div>
            ${isWarded ? `<span class="warded-subtext glitch-target">Sealed by the Kapidhwaj Wardens</span>` : ''}
          </div>
        </div>

        <div class="card-clue-box">
          <button type="button" class="clue-toggle-btn glitch-target" data-action="clue" data-id="${item.id}" aria-expanded="false">
            <span>📜 Reveal Clue</span>
            <span class="clue-arrow" id="clue-arrow-${item.id}">▾</span>
          </button>
          <div class="clue-content-drawer" id="clue-drawer-${item.id}">
            <span id="clue-text-${item.id}"></span><span class="quill-caret" id="caret-${item.id}" style="display:none;"></span>
          </div>
        </div>

        <div class="card-actions">
          <button type="button" class="btn-advance glitch-target" data-action="advance" data-id="${item.id}">
            <span>Advance to ${nextStatus}</span> <span>→</span>
          </button>
          <button type="button" class="btn-dossier glitch-target" data-action="dossier" data-id="${item.id}">
            Inspect Dossier & Notes
          </button>
        </div>
      `;

      setupCardSwipe(card, item.id);
      gridContainer.appendChild(card);
    });

    // 8th Card: The Kapidhwaj Wardens Sponsor Card
    const sponsorCard = document.createElement('article');
    sponsorCard.className = 'artifact-card card-kapidhwaj';
    sponsorCard.setAttribute('aria-label', 'The Kapidhwaj Wardens Arcane Guild');
    sponsorCard.innerHTML = `
      <div class="card-numeral glitch-target">VIII</div>

      <div class="card-top">
        <div class="card-emblem-wrap kapidhwaj-seal-rotating">
          ${getEmblemSvg('kapidhwaj')}
        </div>
        <h2 class="card-name-btn glitch-target" style="cursor: default; color: var(--gold-bright);">
          The Kapidhwaj Wardens
        </h2>
        <div class="card-location glitch-target">
          <span>⚜</span> Artificers of Ancient Bindings
        </div>

        <div class="status-badge-wrap">
          <div class="kapidhwaj-badge glitch-target">
            <span>⚜</span> Sacred Covenant
          </div>
        </div>
      </div>

      <div style="font-size: 0.98rem; font-style: italic; color: var(--parchment-dim); line-height: 1.45; text-align: center; margin: 0.5rem 0 1.25rem 0;" class="glitch-target">
        “Every fragment I recover is bound behind their wards. Ancient wards forged in blood; no mortal or order can pierce their seals.”
      </div>

      <div class="card-actions" style="margin-top: auto;">
        <a href="https://www.instagram.com/kapidhwaj.innovations/" target="_blank" rel="noopener noreferrer" class="btn-seek-wardens glitch-target" aria-label="Seek The Kapidhwaj Wardens on Instagram at @kapidhwaj.innovations">
          <span>Seek the Wardens ↗</span>
        </a>
        <div style="text-align: center; font-size: 0.88rem; color: var(--gold-bright); margin-top: 0.25rem;" class="glitch-target">
          @kapidhwaj.innovations
        </div>
      </div>
    `;
    gridContainer.appendChild(sponsorCard);

    updateCounts();
    updateSoulIntegrity();
    updateTemperAndInstability();
    renderMapPins();
  }

  /* --------------------------------------------------------------------------
     15. TOUCH SWIPE HANDLER FOR CARDS
     -------------------------------------------------------------------------- */
  function setupCardSwipe(card, id) {
    let startX = 0;
    let startY = 0;

    card.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
    }, { passive: true });

    card.addEventListener('touchend', (e) => {
      if (!e.changedTouches || !e.changedTouches[0]) return;
      const deltaX = e.changedTouches[0].clientX - startX;
      const deltaY = e.changedTouches[0].clientY - startY;

      if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        if (deltaX < 0) {
          stepStatus(id, 1);
        } else {
          stepStatus(id, -1);
        }
      }
    }, { passive: true });
  }

  /* --------------------------------------------------------------------------
     16. STATUS ADVANCEMENT, BADGE FLIP & WAX STAMP
     -------------------------------------------------------------------------- */
  function stepStatus(id, step) {
    const item = horcruxes.find(h => h.id === id);
    if (!item) return;

    let idx = STATUS_CYCLE.indexOf(item.status);
    idx = (idx + step + STATUS_CYCLE.length) % STATUS_CYCLE.length;
    const newStatus = STATUS_CYCLE[idx];
    item.status = newStatus;
    saveHorcruxes(horcruxes);

    AudioEngine.playWaxStamp(newStatus);

    const stampBox = document.getElementById(`stamp-box-${id}`);
    const stampText = document.getElementById(`stamp-text-${id}`);
    if (stampBox && stampText) {
      stampText.textContent = newStatus;
      stampBox.classList.remove('stamping');
      void stampBox.offsetWidth;
      stampBox.classList.add('stamping');
    }

    const badge = document.getElementById(`badge-${id}`);
    if (badge) {
      badge.classList.add('flipping');
      setTimeout(() => {
        badge.classList.remove('flipping');
        renderGrid();
      }, 250);
    } else {
      renderGrid();
    }

    const quote = VOLDEMORT_QUOTES[newStatus] || "“My will is done.”";
    showToast(newStatus, quote);
    appendJournal(`“${item.name} marked as ${newStatus}. ${quote}”`);
  }

  function advanceStatus(id) {
    stepStatus(id, 1);
  }

  /* --------------------------------------------------------------------------
     17. CLUE REVEAL (TYPEWRITER EFFECT WITH QUILL AUDIO)
     -------------------------------------------------------------------------- */
  const activeTypewriters = {};

  function toggleClue(id) {
    const item = horcruxes.find(h => h.id === id);
    if (!item) return;

    const drawer = document.getElementById(`clue-drawer-${id}`);
    const arrow = document.getElementById(`clue-arrow-${id}`);
    const textSpan = document.getElementById(`clue-text-${id}`);
    const caret = document.getElementById(`caret-${id}`);
    if (!drawer || !arrow || !textSpan) return;

    const isOpen = drawer.style.display === 'block';

    if (isOpen) {
      drawer.style.display = 'none';
      arrow.classList.remove('expanded');
      if (activeTypewriters[id]) {
        clearInterval(activeTypewriters[id]);
        delete activeTypewriters[id];
      }
    } else {
      drawer.style.display = 'block';
      arrow.classList.add('expanded');
      textSpan.textContent = '';
      if (caret) caret.style.display = 'inline-block';

      AudioEngine.playQuillScratch();

      let charIndex = 0;
      const fullText = item.clue;
      if (activeTypewriters[id]) clearInterval(activeTypewriters[id]);

      activeTypewriters[id] = setInterval(() => {
        if (charIndex < fullText.length) {
          textSpan.textContent += fullText.charAt(charIndex);
          charIndex++;
          if (charIndex % 35 === 0) {
            AudioEngine.playQuillScratch();
          }
        } else {
          clearInterval(activeTypewriters[id]);
          delete activeTypewriters[id];
          if (caret) caret.style.display = 'none';
        }
      }, 16);
    }
  }

  /* --------------------------------------------------------------------------
     18. ESTATE SURVEY MAP VIEW
     -------------------------------------------------------------------------- */
  function renderMapPins() {
    const mapWrap = document.getElementById('map-pins-container');
    if (!mapWrap) return;
    mapWrap.innerHTML = '';

    horcruxes.forEach(item => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', `map-pin-group status-${item.status.toLowerCase()}`);
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `${item.name} location: ${item.location}`);

      g.innerHTML = `
        <circle cx="${item.mapCoords.x}" cy="${item.mapCoords.y}" r="8" class="pin-circle"></circle>
        <circle cx="${item.mapCoords.x}" cy="${item.mapCoords.y}" r="3" fill="#ecd38c"></circle>
        <text x="${item.mapCoords.x}" y="${item.mapCoords.y - 12}" class="pin-label glitch-target">${item.numeral} · ${item.name}</text>
      `;

      g.addEventListener('mouseenter', () => highlightCard(item.id, true));
      g.addEventListener('mouseleave', () => highlightCard(item.id, false));
      g.addEventListener('focus', () => highlightCard(item.id, true));
      g.addEventListener('blur', () => highlightCard(item.id, false));
      g.addEventListener('click', () => {
        openDossier(item.id);
      });

      mapWrap.appendChild(g);
    });
  }

  function highlightCard(id, active) {
    const card = document.getElementById(`card-horcrux-${id}`);
    if (card) {
      if (active) card.classList.add('highlighted-by-map');
      else card.classList.remove('highlighted-by-map');
    }
  }

  function toggleLedgerMapView() {
    AudioEngine.playDrawerWhoosh(viewMode === 'ledger' ? 'open' : 'close');
    if (viewMode === 'ledger') {
      viewMode = 'map';
      gridContainer.style.display = 'none';
      estateMapView.style.display = 'block';
      btnToggleView.innerHTML = `<span>📜</span> <span>Ledger Grid</span>`;
    } else {
      viewMode = 'ledger';
      estateMapView.style.display = 'none';
      gridContainer.style.display = 'grid';
      btnToggleView.innerHTML = `<span>🗺️</span> <span>Estate Map</span>`;
    }
  }

  /* --------------------------------------------------------------------------
     19. DOSSIER DRAWER WITH WHOOSH AUDIO & PRINT
     -------------------------------------------------------------------------- */
  function openDossier(id) {
    const item = horcruxes.find(h => h.id === id);
    if (!item) return;

    activeDossierId = id;
    previousActiveElement = document.activeElement;

    document.getElementById('dossier-numeral').textContent = item.numeral;
    document.getElementById('dossier-name').textContent = item.name;
    document.getElementById('dossier-location').textContent = item.location;
    document.getElementById('dossier-last-seen').textContent = item.lastSeen;
    document.getElementById('dossier-clue-text').textContent = item.clue;

    notesTextarea.value = fieldNotes[id] || '';
    wardStrengthSlider.value = item.wardStrength || 75;
    wardStrengthVal.textContent = `${wardStrengthSlider.value}%`;

    const cert = document.getElementById('ward-certificate');
    cert.style.display = item.status === 'Warded' ? 'block' : 'none';

    document.querySelectorAll('.status-pick-btn').forEach(btn => {
      if (btn.dataset.setStatus === item.status) {
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-checked', 'false');
      }
    });

    AudioEngine.playDrawerWhoosh('open');
    dossierDrawer.classList.add('open');
    dossierBackdrop.classList.add('open');
    dossierDrawer.setAttribute('aria-hidden', 'false');
    btnCloseDossier.focus();
  }

  function closeDossier() {
    AudioEngine.playDrawerWhoosh('close');
    dossierDrawer.classList.remove('open');
    dossierBackdrop.classList.remove('open');
    dossierDrawer.setAttribute('aria-hidden', 'true');
    activeDossierId = null;

    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
      previousActiveElement.focus();
    }
  }

  dossierDrawer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDossier();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = dossierDrawer.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  notesTextarea.addEventListener('input', (e) => {
    if (activeDossierId !== null) {
      saveFieldNote(activeDossierId, e.target.value);
      fieldNotes[activeDossierId] = e.target.value;
    }
  });

  wardStrengthSlider.addEventListener('input', (e) => {
    if (activeDossierId !== null) {
      const item = horcruxes.find(h => h.id === activeDossierId);
      if (item) {
        item.wardStrength = parseInt(e.target.value, 10);
        wardStrengthVal.textContent = `${item.wardStrength}%`;
        saveHorcruxes(horcruxes);
      }
    }
  });

  document.querySelectorAll('.status-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (activeDossierId !== null) {
        const item = horcruxes.find(h => h.id === activeDossierId);
        if (item) {
          item.status = btn.dataset.setStatus;
          saveHorcruxes(horcruxes);
          renderGrid();
          openDossier(activeDossierId);
          AudioEngine.playWaxStamp(item.status);
          const quote = VOLDEMORT_QUOTES[item.status] || "“Recorded in shadow.”";
          showToast(item.status, quote);
          appendJournal(`“${item.name} set to ${item.status}. ${quote}”`);
        }
      }
    });
  });

  btnPrintDossier.addEventListener('click', () => {
    window.print();
  });

  /* --------------------------------------------------------------------------
     20. DARK LORD'S JOURNAL
     -------------------------------------------------------------------------- */
  function renderJournal() {
    const logs = loadJournal();
    journalList.innerHTML = '';
    logs.forEach(log => {
      const entry = document.createElement('div');
      entry.className = 'journal-entry';
      entry.innerHTML = `
        <div class="journal-entry-time glitch-target">${log.time} · Lord Voldemort</div>
        <div class="journal-entry-quote glitch-target">${log.text}</div>
      `;
      journalList.appendChild(entry);
    });
  }

  function updateJournalBadge() {
    const logs = loadJournal();
    journalBadge.textContent = logs.length;
  }

  function openJournal() {
    renderJournal();
    AudioEngine.playDrawerWhoosh('open');
    journalModal.classList.add('open');
    btnCloseJournal.focus();
  }

  function closeJournal() {
    AudioEngine.playDrawerWhoosh('close');
    journalModal.classList.remove('open');
    btnJournalToggle.focus();
  }

  /* --------------------------------------------------------------------------
     21. TOAST NOTIFICATIONS (RUSTLE SOUND & VOLDEMORT'S VOICE)
     -------------------------------------------------------------------------- */
  function showToast(status, quote) {
    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.setAttribute('role', 'status');

    toast.innerHTML = `
      <div style="flex:1;">
        <div class="toast-speaker glitch-target">Lord Voldemort · ${status}</div>
        <div class="toast-quote glitch-target">${quote}</div>
      </div>
      <button type="button" class="toast-dismiss-btn glitch-target" aria-label="Dismiss toast" style="color:var(--parchment-faint); font-size:1.1rem; min-height:24px;">✕</button>
    `;

    toastContainer.appendChild(toast);
    AudioEngine.playToastSound();

    toast.querySelector('.toast-dismiss-btn').addEventListener('click', () => {
      dismissToast(toast);
    });

    setTimeout(() => {
      dismissToast(toast);
    }, 4500);
  }

  function dismissToast(toast) {
    if (!toast || toast.classList.contains('dismissing')) return;
    toast.classList.add('dismissing');
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    toast.style.transition = 'all 300ms ease';
    setTimeout(() => {
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    }, 320);
  }

  /* --------------------------------------------------------------------------
     22. CANDLELIGHT ILLUMINATION MODE
     -------------------------------------------------------------------------- */
  function setCandlelightMode(isCandlelightOn) {
    if (isCandlelightOn) {
      document.body.classList.remove('candlelight-off');
      document.body.classList.add('forced-dark');
      candleText.textContent = "Candlelight: On";
    } else {
      document.body.classList.add('candlelight-off');
      document.body.classList.add('forced-light');
      document.body.classList.remove('forced-dark');
      candleText.textContent = "Candlelight: Off";
    }
    try {
      localStorage.setItem(STORAGE_KEY_THEME, isCandlelightOn ? 'on' : 'off');
    } catch (e) {}
  }

  btnToggleCandle.addEventListener('click', () => {
    const isCurrentlyOff = document.body.classList.contains('candlelight-off');
    setCandlelightMode(isCurrentlyOff);
    AudioEngine.playHoverTick();
  });

  try {
    const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
    if (savedTheme === 'off') setCandlelightMode(false);
    else if (savedTheme === 'on') setCandlelightMode(true);
  } catch (e) {}

  /* --------------------------------------------------------------------------
     23. KEYBOARD SHORTCUTS & "TOM" EASTER EGG
     -------------------------------------------------------------------------- */
  let keyBuffer = '';

  window.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    const isTyping = (activeTag === 'input' || activeTag === 'textarea');

    if (!isTyping) {
      keyBuffer += e.key.toLowerCase();
      if (keyBuffer.length > 6) keyBuffer = keyBuffer.slice(-6);
      if (keyBuffer.endsWith('tom')) {
        const easterEgg = document.getElementById('easter-egg-overlay');
        easterEgg.style.display = 'flex';
        AudioEngine.playGlitchSound();
        setTimeout(() => {
          easterEgg.style.display = 'none';
        }, 2500);
        keyBuffer = '';
      }
    }

    if (e.key === '/' && !isTyping) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    if (!e.ctrlKey && !e.metaKey && !e.altKey && !isTyping) {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 7) {
        openDossier(num);
        return;
      }
    }

    if (e.key === '?' && !isTyping) {
      e.preventDefault();
      shortcutsModal.classList.toggle('open');
      return;
    }

    if (e.key === 'Escape') {
      if (dossierDrawer.classList.contains('open')) closeDossier();
      if (journalModal.classList.contains('open')) closeJournal();
      if (owlPostModal.classList.contains('open')) owlPostModal.classList.remove('open');
      if (shortcutsModal.classList.contains('open')) shortcutsModal.classList.remove('open');
      if (resetBackdrop.classList.contains('open')) resetBackdrop.classList.remove('open');
      soundPopoverPanel.classList.remove('open');
    }
  });

  /* --------------------------------------------------------------------------
     24. EVENT DELEGATION FOR MAIN GRID & DIALOGS
     -------------------------------------------------------------------------- */
  gridContainer.addEventListener('click', (e) => {
    const targetBtn = e.target.closest('button');
    if (!targetBtn) return;

    const action = targetBtn.dataset.action;
    const id = parseInt(targetBtn.dataset.id, 10);

    if (action === 'advance') {
      advanceStatus(id);
    } else if (action === 'clue') {
      toggleClue(id);
    } else if (action === 'dossier') {
      openDossier(id);
    }
  });

  btnCloseDossier.addEventListener('click', closeDossier);
  dossierBackdrop.addEventListener('click', closeDossier);

  btnJournalToggle.addEventListener('click', openJournal);
  btnCloseJournal.addEventListener('click', closeJournal);
  journalModal.addEventListener('click', (e) => {
    if (e.target === journalModal) closeJournal();
  });

  btnOwlPost.addEventListener('click', () => {
    AudioEngine.playDrawerWhoosh('open');
    owlPostModal.classList.add('open');
  });
  btnCloseOwl.addEventListener('click', () => {
    AudioEngine.playDrawerWhoosh('close');
    owlPostModal.classList.remove('open');
  });
  owlPostModal.addEventListener('click', (e) => {
    if (e.target === owlPostModal) owlPostModal.classList.remove('open');
  });

  btnShortcutsHelp.addEventListener('click', () => {
    shortcutsModal.classList.add('open');
  });
  btnCloseShortcuts.addEventListener('click', () => {
    shortcutsModal.classList.remove('open');
  });
  shortcutsModal.addEventListener('click', (e) => {
    if (e.target === shortcutsModal) shortcutsModal.classList.remove('open');
  });

  btnResetLedger.addEventListener('click', () => {
    AudioEngine.playDoubleKnock();
    resetBackdrop.classList.add('open');
    btnCancelReset.focus();
  });

  btnCancelReset.addEventListener('click', () => {
    resetBackdrop.classList.remove('open');
    btnResetLedger.focus();
  });

  btnConfirmReset.addEventListener('click', () => {
    AudioEngine.playDoubleKnock();
    horcruxes = JSON.parse(JSON.stringify(DEFAULT_HORCRUXES));
    fieldNotes = {};
    saveHorcruxes(horcruxes);
    try {
      localStorage.removeItem(STORAGE_KEY_NOTES);
    } catch (e) {}

    resetBackdrop.classList.remove('open');
    renderGrid();
    showToast("Sanctuary Archives Reset", "“All seals are broken. The fragments plunge back into eternal shadows.”");
    appendJournal("“All seals broken. Lord Voldemort has expunged the sanctuary records.”");
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderGrid();
  });

  sortSelect.addEventListener('change', (e) => {
    activeSort = e.target.value;
    renderGrid();
  });

  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-pressed', 'false');
      });
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
      activeFilter = chip.dataset.filter;
      renderGrid();
    });
  });

  btnToggleView.addEventListener('click', toggleLedgerMapView);

  /* --------------------------------------------------------------------------
     25. INITIAL BOOTSTRAP
     -------------------------------------------------------------------------- */
  AudioEngine.updateUI();
  updateJournalBadge();
  renderGrid();
  initIntroMotes();

  window.addEventListener('resize', () => {
    if (introMotesCanvas && !sealedIntro.classList.contains('unsealed')) {
      introMotesCanvas.width = window.innerWidth;
      introMotesCanvas.height = window.innerHeight;
    }
  });

})();
