let audioCtx: AudioContext | null = null;
let soundEnabled = true;

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

function playTone(frequency: number, duration: number, type: OscillatorType = "square"): void {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration);
}

export function playMessageReceived(): void {
  playTone(659, 0.1); // E5
  setTimeout(() => playTone(784, 0.1), 100); // G5 - two-note chime
}

export function playEscalation(): void {
  // Urgent three-note alert
  playTone(440, 0.15); // A4
  setTimeout(() => playTone(440, 0.15), 200);
  setTimeout(() => playTone(523, 0.3), 400); // C5
}

export function playAgentActive(): void {
  playTone(392, 0.08, "triangle"); // G4 - soft blip when agent starts working
}

export function playTaskComplete(): void {
  // Ascending victory jingle
  playTone(523, 0.1); // C5
  setTimeout(() => playTone(659, 0.1), 100); // E5
  setTimeout(() => playTone(784, 0.15), 200); // G5
  setTimeout(() => playTone(1047, 0.2), 300); // C6
}

export function playTicketCreated(): void {
  playTone(349, 0.1, "triangle"); // F4
  setTimeout(() => playTone(440, 0.1, "triangle"), 100); // A4
}

export function playError(): void {
  playTone(200, 0.2, "sawtooth"); // Low buzz for errors
  setTimeout(() => playTone(180, 0.3, "sawtooth"), 200);
}
