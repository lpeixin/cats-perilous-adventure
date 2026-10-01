/**
 * 程序化音频引擎（Web Audio API）
 * ---------------------------------------------------------------
 * 本项目**不使用任何外部音频文件**：全部音效与背景音乐都是运行时用
 * 振荡器 / 噪声合成的，因此
 *   1) 不存在任何第三方音乐版权问题；
 *   2) 零加载体积、零网络依赖，离线也能完整发声。
 *
 * 音色走的是 jsfxr 那一派"8-bit 方波 + 快速包络"的路子：
 *   方波/锯齿波 + 频率滑音 + 极短 attack + 指数 decay。
 */

// ---------------------------------------------------------------------------
// 音高工具
// ---------------------------------------------------------------------------
const NOTE_OFFSET = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'A4' / 'C#5' / 'Eb3' → 频率(Hz) */
export function noteFreq(name) {
  if (typeof name === 'number') return name;
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(name);
  if (!m) return 440;
  let semi = NOTE_OFFSET[m[1]];
  if (m[2] === '#') semi += 1;
  if (m[2] === 'b') semi -= 1;
  const octave = parseInt(m[3], 10);
  const midi = (octave + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---------------------------------------------------------------------------
// 音效配方：每一种都是"振荡器层 + 噪声层"的简单组合
// ---------------------------------------------------------------------------
const SFX = {
  // 起跳：方波快速上滑
  jump: { osc: 'square', from: 340, to: 760, dur: 0.14, vol: 0.22, slide: 'exp' },
  // 踩敌人：下坠的"噗"
  stomp: {
    osc: 'square', from: 320, to: 110, dur: 0.12, vol: 0.26, slide: 'exp',
    noise: { dur: 0.08, vol: 0.16, hp: 900 },
  },
  // 顶砖块
  bump: { osc: 'square', from: 220, to: 150, dur: 0.07, vol: 0.2 },
  // 撞碎砖块
  brick: {
    osc: 'square', from: 260, to: 90, dur: 0.16, vol: 0.2,
    noise: { dur: 0.2, vol: 0.22, hp: 500 },
  },
  // 吃到金鱼：经典两音上行
  coin: { seq: [{ f: 'B5', d: 0.06 }, { f: 'E6', d: 0.16 }], osc: 'square', vol: 0.2 },
  // 吃道具 / 变大
  powerup: {
    seq: [{ f: 'C5', d: 0.05 }, { f: 'E5', d: 0.05 }, { f: 'G5', d: 0.05 },
          { f: 'C6', d: 0.05 }, { f: 'E6', d: 0.16 }],
    osc: 'square', vol: 0.2,
  },
  // 吃到无敌星
  star: {
    seq: [{ f: 'G5', d: 0.05 }, { f: 'C6', d: 0.05 }, { f: 'G5', d: 0.05 },
          { f: 'C6', d: 0.05 }, { f: 'D6', d: 0.05 }, { f: 'E6', d: 0.18 }],
    osc: 'square', vol: 0.2,
  },
  // 受伤（又惨又搞笑：锯齿波一路滑下去 + 一点噪声）
  hurt: {
    osc: 'sawtooth', from: 520, to: 130, dur: 0.32, vol: 0.24,
    noise: { dur: 0.12, vol: 0.1, hp: 400 },
  },
  // 死亡：更长更惨的下滑 + 弹跳音
  die: {
    seq: [{ f: 'C6', d: 0.08 }, { f: 'G5', d: 0.08 }, { f: 'E5', d: 0.08 },
          { f: 'C5', d: 0.1 }, { f: 'G4', d: 0.1 }, { f: 'E4', d: 0.28 }],
    osc: 'square', vol: 0.24, vibrato: true,
  },
  // 陷阱触发：低沉不祥的嗡鸣
  trap: {
    osc: 'sawtooth', from: 120, to: 62, dur: 0.42, vol: 0.2,
    noise: { dur: 0.16, vol: 0.1, hp: 200 },
  },
  // 天空掉落物砸下
  crash: {
    osc: 'triangle', from: 180, to: 40, dur: 0.4, vol: 0.26,
    noise: { dur: 0.35, vol: 0.26, hp: 260 },
  },
  // 过关小号角
  goal: {
    seq: [{ f: 'C5', d: 0.1 }, { f: 'E5', d: 0.1 }, { f: 'G5', d: 0.1 },
          { f: 'C6', d: 0.12 }, { f: 'G5', d: 0.1 }, { f: 'C6', d: 0.34 }],
    osc: 'square', vol: 0.22,
  },
  // "假通关"：先播一段扭曲的过关音
  fakeGoal: {
    seq: [{ f: 'C5', d: 0.1 }, { f: 'E5', d: 0.1 }, { f: 'G#5', d: 0.12 },
          { f: 'C6', d: 0.12 }, { f: 'F#5', d: 0.1 }, { f: 'A#5', d: 0.3 }],
    osc: 'sawtooth', vol: 0.22,
  },
  // 地板碎裂
  crumble: { osc: 'square', from: 200, to: 120, dur: 0.1, vol: 0.14,
             noise: { dur: 0.14, vol: 0.1, hp: 1400 } },
  // 菜单确认
  select: { seq: [{ f: 'E5', d: 0.05 }, { f: 'A5', d: 0.1 }], osc: 'square', vol: 0.18 },
  // 水管弹出
  pop: { osc: 'square', from: 160, to: 900, dur: 0.16, vol: 0.24, slide: 'exp' },
};

// ---------------------------------------------------------------------------
// 背景音乐：一段原创的轻快 chiptune 循环（I–vi–IV–V 进行）
// ---------------------------------------------------------------------------
const BPM = 140;
const BEAT = 60 / BPM;

// 每格 = 八分音符；null = 休止
const MUSIC = {
  lead: [
    'C5', 'E5', 'G5', 'E5', 'A4', 'C5', 'E5', 'C5',
    'F4', 'A4', 'C5', 'A4', 'G4', 'B4', 'D5', 'G5',
    'C5', 'E5', 'G5', 'C6', 'A4', 'C5', 'E5', 'A5',
    'F4', 'A4', 'C5', 'F5', 'G4', 'B4', 'D5', 'G5',
    'E5', 'G5', 'C6', 'G5', 'E5', 'C5', 'G4', 'E4',
    'F5', 'A5', 'C6', 'A5', 'F5', 'C5', 'A4', 'F4',
    'G4', 'B4', 'D5', 'G5', 'B5', 'D6', 'B5', 'G5',
    'C5', 'E5', 'G5', 'C6', 'G5', 'E5', 'C5', null,
  ],
  bass: [
    'C3', null, 'C3', null, 'A2', null, 'A2', null,
    'F2', null, 'F2', null, 'G2', null, 'G2', null,
    'C3', null, 'C3', null, 'A2', null, 'A2', null,
    'F2', null, 'F2', null, 'G2', null, 'G2', null,
    'C3', null, 'C3', null, 'A2', null, 'A2', null,
    'F2', null, 'F2', null, 'G2', null, 'G2', null,
    'C3', null, 'C3', null, 'G2', null, 'G2', null,
    'C3', null, 'G2', null, 'C3', null, null, null,
  ],
};

// ---------------------------------------------------------------------------
// 引擎
// ---------------------------------------------------------------------------
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.muted = false;
    this.musicOn = false;
    this._timer = null;
    this._step = 0;
    this._nextTime = 0;
  }

  /** 浏览器要求音频必须在用户手势之后才能启动 */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(this.master);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // -- 基础发声单元 ------------------------------------------------------

  /** 一个带包络的振荡器音符 */
  _blip({ osc = 'square', from, to, dur = 0.15, vol = 0.2, at, dest,
          slide = 'exp', detune = 0 }) {
    if (!this.ctx) return;
    const t0 = at ?? this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = osc;
    o.detune.value = detune;
    o.frequency.setValueAtTime(from, t0);
    if (to && to !== from) {
      if (slide === 'exp') {
        o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
      } else {
        o.frequency.linearRampToValueAtTime(Math.max(20, to), t0 + dur);
      }
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest || this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  /** 一段噪声（用于碎裂、撞击、死亡） */
  _noise({ dur = 0.15, vol = 0.15, hp = 600, at, dest }) {
    if (!this.ctx) return;
    const t0 = at ?? this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      // 越靠后越安静的噪声，听感更像"撞击"而不是"电流声"
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filt);
    filt.connect(g);
    g.connect(dest || this.sfxBus);
    src.start(t0);
  }

  // -- 公开接口 ----------------------------------------------------------

  /** 播放一个具名音效 */
  play(name) {
    this.unlock();
    if (!this.ctx) return;
    const cfg = SFX[name];
    if (!cfg) return;

    if (cfg.seq) {
      // 音序型音效：一串音符顺次播放
      let t = this.ctx.currentTime;
      for (const step of cfg.seq) {
        this._blip({
          osc: cfg.osc, from: noteFreq(step.f), dur: step.d, vol: cfg.vol, at: t,
          vibrato: cfg.vibrato,
        });
        t += step.d * 0.92;
      }
      return;
    }
    this._blip({
      osc: cfg.osc, from: cfg.from, to: cfg.to, dur: cfg.dur, vol: cfg.vol,
      slide: cfg.slide,
    });
    if (cfg.noise) this._noise({ ...cfg.noise });
  }

  /** 单音（供内部与调试使用） */
  beep(freq, dur = 0.1, vol = 0.2, type = 'square') {
    this.unlock();
    this._blip({ osc: type, from: freq, dur, vol });
  }

  // -- 背景音乐 ----------------------------------------------------------

  startMusic() {
    this.unlock();
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this._step = 0;
    this._nextTime = this.ctx.currentTime + 0.06;
    this._timer = setInterval(() => this._tick(), 25);
  }

  stopMusic() {
    this.musicOn = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  /** 前向调度：每次把未来 120ms 内该响的音符排进 WebAudio 时间轴 */
  _tick() {
    if (!this.musicOn || !this.ctx) return;
    const lookahead = 0.12;
    const eighth = BEAT / 2;
    while (this._nextTime < this.ctx.currentTime + lookahead) {
      const i = this._step % MUSIC.lead.length;
      const lead = MUSIC.lead[i];
      const bass = MUSIC.bass[i];
      if (lead) {
        this._blip({
          osc: 'square', from: noteFreq(lead), dur: eighth * 0.86,
          vol: 0.13, at: this._nextTime, dest: this.musicBus,
        });
        // 叠一层三角波让旋律更饱满
        this._blip({
          osc: 'triangle', from: noteFreq(lead) / 2, dur: eighth * 0.8,
          vol: 0.06, at: this._nextTime, dest: this.musicBus,
        });
      }
      if (bass) {
        this._blip({
          osc: 'triangle', from: noteFreq(bass), dur: eighth * 1.7,
          vol: 0.22, at: this._nextTime, dest: this.musicBus,
        });
      }
      // 每两拍一记轻"沙锤"
      if (i % 2 === 1) {
        this._noise({ dur: 0.035, vol: 0.035, hp: 6000, at: this._nextTime,
                      dest: this.musicBus });
      }
      this._nextTime += eighth;
      this._step++;
    }
  }
}

/** 全局单例：整个游戏共用一套音频上下文 */
export const audio = new AudioEngine();
