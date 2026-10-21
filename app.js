/**
 * FocusFlow Pomodoro Timer
 * Core Application Logic, Web Audio API Sound Engine, and State Management
 */

// --- Constants & Configuration ---
const FOCUS_TIME_SECONDS = 25 * 60; // 25분 (1500초)
const BREAK_TIME_SECONDS = 5 * 60;  // 5분 (300초)

// Circumference of SVG Circle (r = 150 -> 2 * PI * 150 ≈ 942.477)
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 150;

// Application State
const state = {
  mode: 'focus', // 'focus' | 'break'
  remainingSeconds: FOCUS_TIME_SECONDS,
  totalDuration: FOCUS_TIME_SECONDS,
  isRunning: false,
  timerInterval: null,
  completedSessions: 0,
  activeSound: null, // null | 'ocean' | 'rain' | 'birds'
  volume: 0.5,
  isMuted: false,
};

// --- DOM Element References ---
const elements = {
  body: document.body,
  timerDisplay: document.getElementById('timer-display'),
  statusHint: document.getElementById('timer-status-hint'),
  currentPhaseLabel: document.getElementById('current-phase-label'),
  modeBadgeText: document.getElementById('mode-text'),
  progressCircle: document.getElementById('progress-circle'),
  btnStart: document.getElementById('btn-start'),
  startBtnText: document.getElementById('start-btn-text'),
  btnPause: document.getElementById('btn-pause'),
  btnReset: document.getElementById('btn-reset'),
  tabFocus: document.getElementById('tab-focus'),
  tabBreak: document.getElementById('tab-break'),
  completedCount: document.getElementById('completed-count'),
  sessionDots: document.getElementById('session-dots'),
  btnResetCounter: document.getElementById('btn-reset-counter'),
  soundIndicator: document.getElementById('sound-indicator'),
  soundChips: document.querySelectorAll('.sound-chip'),
  volumeSlider: document.getElementById('volume-slider'),
  volumeText: document.getElementById('volume-text'),
  btnMute: document.getElementById('btn-mute'),
  volIcon: document.getElementById('vol-icon'),
};

// --- Web Audio API Engine for Realistic White Noise & Alarm Chimes ---
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.noiseNode = null;
    this.filterNode = null;
    this.gainNode = null;
    this.masterGain = null;
    this.birdsInterval = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(state.isMuted ? 0 : state.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMasterVolume(val) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(state.isMuted ? 0 : val, this.ctx.currentTime, 0.05);
    }
  }

  stopCurrentNoise() {
    if (this.birdsInterval) {
      clearInterval(this.birdsInterval);
      this.birdsInterval = null;
    }
    if (this.gainNode && this.ctx) {
      try {
        this.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
        setTimeout(() => {
          if (this.noiseNode) {
            this.noiseNode.disconnect();
            this.noiseNode = null;
          }
        }, 300);
      } catch (e) {
        console.error(e);
      }
    }
  }

  // Generate continuous Pink / Brown noise buffer for Ocean & Rain
  createNoiseBuffer(type = 'pink') {
    const bufferSize = 5 * this.ctx.sampleRate; // 5초 루프 버퍼
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let lastOut = 0.0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'pink') {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else if (type === 'brown') {
        // Brown noise for deep rolling waves
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 3.5;
      }
    }
    return buffer;
  }

  playOcean() {
    this.init();
    this.stopCurrentNoise();

    const buffer = this.createNoiseBuffer('brown');
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Filter to simulate undulating rolling waves
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, this.ctx.currentTime);

    // LFO to modulate wave surge frequency
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.12, this.ctx.currentTime); // ~8초 파도 주기
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(250, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.setValueAtTime(0.01, this.ctx.currentTime);
    this.gainNode.gain.linearRampToValueAtTime(0.8, this.ctx.currentTime + 1.2);

    source.connect(filter);
    filter.connect(this.gainNode);
    this.gainNode.connect(this.masterGain);

    source.start();
    this.noiseNode = source;
  }

  playRain() {
    this.init();
    this.stopCurrentNoise();

    const buffer = this.createNoiseBuffer('pink');
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Filter for soft pattering rain
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, this.ctx.currentTime);

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.setValueAtTime(0.01, this.ctx.currentTime);
    this.gainNode.gain.linearRampToValueAtTime(0.65, this.ctx.currentTime + 1);

    source.connect(filter);
    filter.connect(this.gainNode);
    this.gainNode.connect(this.masterGain);

    source.start();
    this.noiseNode = source;
  }

  playBirds() {
    this.init();
    this.stopCurrentNoise();

    // Gentle outdoor background ambience
    const bgBuffer = this.createNoiseBuffer('pink');
    const bgSource = this.ctx.createBufferSource();
    bgSource.buffer = bgBuffer;
    bgSource.loop = true;
    const bgFilter = this.ctx.createBiquadFilter();
    bgFilter.type = 'lowpass';
    bgFilter.frequency.setValueAtTime(400, this.ctx.currentTime);
    const bgGain = this.ctx.createGain();
    bgGain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    bgSource.connect(bgFilter);
    bgFilter.connect(bgGain);
    bgGain.connect(this.masterGain);
    bgSource.start();

    // Function to trigger realistic bird chirps
    const chirp = () => {
      if (state.activeSound !== 'birds' || !this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = this.ctx.currentTime + Math.random() * 0.2;
      const baseFreq = 2200 + Math.random() * 800;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, startTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq + 700, startTime + 0.08);
      osc.frequency.exponentialRampToValueAtTime(baseFreq - 300, startTime + 0.16);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.35, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.22);
    };

    chirp();
    this.birdsInterval = setInterval(() => {
      chirp();
      if (Math.random() > 0.4) {
        setTimeout(chirp, 250);
      }
    }, 2400);

    this.gainNode = bgGain;
    this.noiseNode = bgSource;
  }

  // Pleasant bell/chime completion alarm
  playAlarmChime(isFocusEnd = true) {
    this.init();
    const notes = isFocusEnd ? [523.25, 659.25, 783.99, 1046.50] : [783.99, 659.25, 523.25]; // C5-E5-G5-C6 or G5-E5-C5
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const noteTime = this.ctx.currentTime + idx * 0.18;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.001, noteTime);
      gain.gain.linearRampToValueAtTime(0.5, noteTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 1.2);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(noteTime);
      osc.stop(noteTime + 1.3);
    });
  }
}

const audio = new AudioEngine();

// --- Formatting Helpers ---
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --- UI Updaters ---
function updateTimerDisplay() {
  const timeStr = formatTime(state.remainingSeconds);
  elements.timerDisplay.textContent = timeStr;

  // 1. Calculate & Update SVG Progress Ring
  const progressRatio = state.remainingSeconds / state.totalDuration;
  // Offset decreases as time passes (from 0 to 942.5)
  const offset = CIRCLE_CIRCUMFERENCE * (1 - progressRatio);
  elements.progressCircle.style.strokeDashoffset = offset;

  // 2. Synchronize Browser Tab Title
  const modeEmoji = state.mode === 'focus' ? '🍅' : '☕';
  const modeLabel = state.mode === 'focus' ? '집중 중' : '휴식 중';
  document.title = `(${timeStr}) ${modeEmoji} ${modeLabel} | FocusFlow`;
}

function updateThemeMode(newMode) {
  state.mode = newMode;
  state.totalDuration = newMode === 'focus' ? FOCUS_TIME_SECONDS : BREAK_TIME_SECONDS;
  state.remainingSeconds = state.totalDuration;

  // Update Body Theme Class
  if (newMode === 'focus') {
    elements.body.classList.remove('mode-break');
    elements.body.classList.add('mode-focus');
    elements.currentPhaseLabel.textContent = 'FOCUS SESSION';
    elements.modeBadgeText.textContent = '집중 시간 (25m)';
    elements.tabFocus.classList.add('active');
    elements.tabBreak.classList.remove('active');
  } else {
    elements.body.classList.remove('mode-focus');
    elements.body.classList.add('mode-break');
    elements.currentPhaseLabel.textContent = 'BREAK TIME';
    elements.modeBadgeText.textContent = '휴식 시간 (5m)';
    elements.tabBreak.classList.add('active');
    elements.tabFocus.classList.remove('active');
  }

  updateTimerDisplay();
}

function renderSessionDots() {
  elements.completedCount.textContent = state.completedSessions;
  elements.sessionDots.innerHTML = '';
  const maxIcons = Math.min(state.completedSessions, 12);
  for (let i = 0; i < maxIcons; i++) {
    const dot = document.createElement('span');
    dot.className = 'session-badge-item';
    dot.textContent = '🍅';
    elements.sessionDots.appendChild(dot);
  }
}

// --- Timer Control Functions ---
function startTimer() {
  if (state.isRunning) return;

  // Audio Context unlock requirement for modern browsers
  audio.init();

  state.isRunning = true;
  elements.btnStart.disabled = true;
  elements.btnPause.disabled = false;
  elements.statusHint.textContent = state.mode === 'focus' ? '깊은 몰입 상태를 유지하세요' : '편안하게 숨을 고르며 휴식하세요';

  state.timerInterval = setInterval(() => {
    if (state.remainingSeconds > 0) {
      state.remainingSeconds -= 1;
      updateTimerDisplay();
    } else {
      handleSessionCompletion();
    }
  }, 1000);
}

function pauseTimer() {
  if (!state.isRunning) return;

  state.isRunning = false;
  clearInterval(state.timerInterval);
  state.timerInterval = null;

  elements.btnStart.disabled = false;
  elements.btnPause.disabled = true;
  elements.statusHint.textContent = '타이머가 일시정지되었습니다';
}

function resetTimer() {
  pauseTimer();
  state.remainingSeconds = state.totalDuration;
  updateTimerDisplay();
  elements.statusHint.textContent = '시작 버튼을 눌러 집중을 시작하세요';
}

function handleSessionCompletion() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.isRunning = false;

  if (state.mode === 'focus') {
    // 25분 집중 완료
    audio.playAlarmChime(true);
    state.completedSessions += 1;
    saveSessionCount();
    renderSessionDots();
    
    // 자동 휴식 모드로 전환 및 자동 시작
    updateThemeMode('break');
    elements.statusHint.textContent = '집중 완료! 5분 휴식을 시작합니다 ☕';
    startTimer();
  } else {
    // 5분 휴식 완료
    audio.playAlarmChime(false);
    
    // 자동 집중 모드로 전환 및 대기
    updateThemeMode('focus');
    elements.statusHint.textContent = '휴식 완료! 다음 25분 집중을 시작할 준비를 하세요';
    startTimer();
  }
}

// --- LocalStorage Session Persistence ---
function loadSessionCount() {
  const saved = localStorage.getItem('focusflow_completed_sessions');
  if (saved !== null) {
    state.completedSessions = parseInt(saved, 10) || 0;
  }
  renderSessionDots();
}

function saveSessionCount() {
  localStorage.setItem('focusflow_completed_sessions', state.completedSessions);
}

// --- Ambient Sound Controller ---
function toggleSound(soundName) {
  audio.init();

  if (state.activeSound === soundName) {
    // Turn off sound
    audio.stopCurrentNoise();
    state.activeSound = null;
    elements.soundIndicator.textContent = 'OFF';
    elements.soundIndicator.classList.remove('playing');
    elements.soundChips.forEach(c => c.classList.remove('active'));
  } else {
    // Turn on sound
    state.activeSound = soundName;
    elements.soundIndicator.textContent = soundName.toUpperCase();
    elements.soundIndicator.classList.add('playing');
    elements.soundChips.forEach(c => {
      c.classList.toggle('active', c.dataset.sound === soundName);
    });

    if (soundName === 'ocean') audio.playOcean();
    if (soundName === 'rain') audio.playRain();
    if (soundName === 'birds') audio.playBirds();
  }
}

// --- Event Listeners Setup ---
function bindEvents() {
  elements.btnStart.addEventListener('click', startTimer);
  elements.btnPause.addEventListener('click', pauseTimer);
  elements.btnReset.addEventListener('click', resetTimer);

  // Manual Mode Switch Tabs
  elements.tabFocus.addEventListener('click', () => {
    if (state.mode !== 'focus') {
      pauseTimer();
      updateThemeMode('focus');
    }
  });

  elements.tabBreak.addEventListener('click', () => {
    if (state.mode !== 'break') {
      pauseTimer();
      updateThemeMode('break');
    }
  });

  // Session Counter Reset
  elements.btnResetCounter.addEventListener('click', () => {
    if (confirm('완료한 세션 카운트를 초기화하시겠습니까?')) {
      state.completedSessions = 0;
      saveSessionCount();
      renderSessionDots();
    }
  });

  // Sound Chips Click
  elements.soundChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const sound = chip.dataset.sound;
      toggleSound(sound);
    });
  });

  // Volume Slider
  elements.volumeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.volume = val / 100;
    elements.volumeText.textContent = `${val}%`;
    if (state.isMuted && val > 0) {
      state.isMuted = false;
      updateMuteIcon();
    }
    audio.setMasterVolume(state.volume);
  });

  // Mute Button Toggle
  elements.btnMute.addEventListener('click', () => {
    state.isMuted = !state.isMuted;
    updateMuteIcon();
    audio.setMasterVolume(state.volume);
  });
}

function updateMuteIcon() {
  if (state.isMuted) {
    elements.volIcon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27l4.73 4.73H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    elements.btnMute.classList.add('muted');
  } else {
    elements.volIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    elements.btnMute.classList.remove('muted');
  }
}

// --- Initialization ---
function init() {
  updateTimerDisplay();
  loadSessionCount();
  bindEvents();
}

window.addEventListener('DOMContentLoaded', init);
