class TacticalAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private muted = false;
  private masterVolume = 0.85;
  private sfxVolume = 0.9;
  private uiVolume = 0.85;
  private noiseBuffer: AudioBuffer | null = null;

  private ensureContext(): AudioContext | null {
    if (this.muted || this.masterVolume <= 0.001) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    if (this.ctx && !this.masterGain) {
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.uiGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);
      this.uiGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.syncGainNodes();
    }
    if (this.ctx && !this.noiseBuffer) {
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * 0.4);
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    return this.ctx;
  }

  private syncGainNodes(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.uiGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, now, 0.015);
    this.sfxGain.gain.setTargetAtTime(this.sfxVolume, now, 0.015);
    this.uiGain.gain.setTargetAtTime(this.uiVolume, now, 0.015);
  }

  public setVolumes(master: number, sfx: number, ui: number): void {
    this.masterVolume = Math.max(0, Math.min(1, master));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    this.uiVolume = Math.max(0, Math.min(1, ui));
    this.syncGainNodes();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.syncGainNodes();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public playGunshot(isRemote = false, weaponId = 'carbine'): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer || !this.sfxGain) return;

    const now = ctx.currentTime;
    const isHeavy = weaponId === 'shotgun' || weaponId === 'sniper';
    const isLight = weaponId === 'smg' || weaponId === 'pistol';
    const gainScale = isRemote ? 0.16 : isHeavy ? 0.52 : isLight ? 0.34 : 0.42;
    const dur = isHeavy ? 0.24 : isLight ? 0.11 : 0.16;

    // Sharp supersonic crack (filtered noise burst)
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const startFreq = isRemote
      ? 950
      : weaponId === 'shotgun'
        ? 880
        : weaponId === 'sniper'
          ? 1850
          : weaponId === 'smg'
            ? 1950
            : 1400;
    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(isHeavy ? 180 : 280, now + dur);
    filter.Q.value = weaponId === 'sniper' ? 0.85 : 1.1;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(gainScale, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + dur + 0.02);

    // Low chest thump
    if (!isRemote) {
      const osc = ctx.createOscillator();
      osc.type = weaponId === 'sniper' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(isHeavy ? 125 : isLight ? 210 : 165, now);
      osc.frequency.exponentialRampToValueAtTime(isHeavy ? 34 : 46, now + (isHeavy ? 0.15 : 0.09));

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(isHeavy ? 0.46 : 0.32, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + (isHeavy ? 0.16 : 0.1));

      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + (isHeavy ? 0.17 : 0.11));
    }
  }

  public playWeaponSwap(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.uiGain) return;
    const now = ctx.currentTime;
    [340, 560].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.045);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + idx * 0.045 + 0.04);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.11, now + idx * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.045);
      osc.connect(gain);
      gain.connect(this.uiGain!);
      osc.start(now + idx * 0.045);
      osc.stop(now + idx * 0.045 + 0.05);
    });
  }

  public playDryFire(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.03);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playReload(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const clicks = [0, 0.22, 0.65];
    const freqs = [480, 620, 780];
    const dest = this.sfxGain;
    clicks.forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freqs[idx], now + offset);
      osc.frequency.exponentialRampToValueAtTime(220, now + offset + 0.05);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.16, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now + offset);
      osc.stop(now + offset + 0.065);
    });
  }

  public playHitMarker(isKill: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isKill ? 1320 : 980, now);
    osc.frequency.exponentialRampToValueAtTime(isKill ? 1760 : 620, now + (isKill ? 0.14 : 0.05));

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(isKill ? 0.24 : 0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isKill ? 0.16 : 0.06));

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + (isKill ? 0.17 : 0.065));
  }

  public playDamageTaken(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.12);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playPickup(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.uiGain) return;
    const now = ctx.currentTime;
    const dest = this.uiGain;
    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.07);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.14, now + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.12);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.13);
    });
  }

  public playEmote(emoteId: string): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.uiGain) return;
    const now = ctx.currentTime;
    const dest = this.uiGain;
    const notes =
      emoteId === 'dance'
        ? [392, 493.88, 587.33, 783.99]
        : emoteId === 'victory-cheer'
          ? [523.25, 659.25, 783.99]
          : emoteId === 'salute'
            ? [440, 587.33]
            : [493.88, 659.25];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = emoteId === 'dance' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.09);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.13, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.14);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.15);
    });
  }

  public playGlooWallDeploy(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.14);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  public playGrenadeThrow(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.11);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playExplosion(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer || !this.sfxGain) return;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, now);
    filter.frequency.exponentialRampToValueAtTime(95, now + 0.38);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.62, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.41);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.35);
    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.55, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc.connect(oGain);
    oGain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.37);
  }

  public playDash(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.09);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }
}

export const tacticalAudio = new TacticalAudioEngine();
