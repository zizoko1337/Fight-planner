type OscillatorKind = OscillatorType;

interface WebkitAudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export class RetroSound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;

  playCard() {
    this.tone(340, 0.055, 'square', 0.035);
  }

  playMove() {
    this.tone(190, 0.08, 'square', 0.04, 0, 280);
    this.tone(280, 0.07, 'square', 0.03, 0.055, 360);
  }

  playSword() {
    this.noise(0.08, 0.05, 900);
    this.tone(520, 0.09, 'sawtooth', 0.035, 0, 180);
  }

  playThrow() {
    this.tone(220, 0.2, 'triangle', 0.045, 0, 620);
  }

  playImpact() {
    this.noise(0.12, 0.07, 600);
    this.tone(120, 0.09, 'square', 0.04, 0, 70);
  }

  playPickup() {
    this.tone(360, 0.06, 'square', 0.035);
    this.tone(540, 0.07, 'square', 0.035, 0.055);
    this.tone(760, 0.08, 'square', 0.03, 0.11);
  }

  playWait() {
    this.tone(210, 0.08, 'triangle', 0.025);
  }

  playEnemyAttack() {
    this.tone(130, 0.12, 'sawtooth', 0.05, 0, 95);
    this.noise(0.07, 0.045, 500);
  }

  playSimulationStart() {
    this.tone(260, 0.07, 'square', 0.035);
    this.tone(390, 0.07, 'square', 0.035, 0.07);
  }

  private getContext(): AudioContext | null {
    const AudioContextConstructor =
      window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    if (!this.context) {
      this.context = new AudioContextConstructor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.28;
      this.master.connect(this.context.destination);
    }

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    return this.context;
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorKind,
    volume: number,
    delay = 0,
    endFrequency = frequency,
  ) {
    const context = this.getContext();

    if (!context || !this.master) {
      return;
    }

    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private noise(duration: number, volume: number, filterFrequency: number) {
    const context = this.getContext();

    if (!context || !this.master) {
      return;
    }

    const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const channel = buffer.getChannelData(0);

    for (let index = 0; index < sampleCount; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const start = context.currentTime;

    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = filterFrequency;

    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(start);
    source.stop(start + duration);
  }
}
