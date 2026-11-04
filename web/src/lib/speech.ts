import { segments, speakable, type VoiceSettings } from './voice';

/** The few parts of the Web Speech API we use; not in TypeScript's DOM types. */
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

const recognitionCtor = (): RecognitionCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export const canRecognise = () => typeof window !== 'undefined' && !!recognitionCtor();
export const canRecord = () => typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
export const canSynthesise = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Something that hears one line while the button is held, then hands over the text. */
export interface Listener {
  stop(): Promise<string>;
  cancel(): void;
}

/** The browser's own recognition, in Swedish, showing the words as they come. */
export function browserListener(onPartial: (text: string) => void): Listener {
  const Ctor = recognitionCtor()!;
  const rec = new Ctor();
  rec.lang = 'sv-SE';
  rec.interimResults = true;
  rec.continuous = true;
  let text = '';
  let finish: ((text: string) => void) | null = null;
  rec.onresult = (e) => {
    text = Array.from(e.results).map((r) => r[0].transcript).join(' ').trim();
    onPartial(text);
  };
  rec.onerror = () => finish?.(text);
  rec.onend = () => finish?.(text);
  rec.start();
  return {
    stop: () =>
      new Promise((resolve) => {
        finish = (t) => {
          finish = null;
          resolve(t);
        };
        rec.stop();
      }),
    cancel: () => rec.abort(),
  };
}

/** Records from the microphone and lets the API (Deepgram) transcribe it. */
export async function recordingListener(transcribe: (audio: Blob) => Promise<string>): Promise<Listener> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.start();
  const done = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () =>
      new Promise((resolve, reject) => {
        recorder.onstop = () => {
          done();
          const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          transcribe(audio).then(resolve, reject);
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = done;
      recorder.stop();
    },
  };
}

let audioContext: AudioContext | null = null;

/** A short, low, wet burp made from noise and a falling tone. No samples, no files. */
export function burp(): Promise<void> {
  const Ctx = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!Ctx) return pause(350);
  audioContext ??= new Ctx();
  const ctx = audioContext;
  const now = ctx.currentTime;
  const length = 0.32 + Math.random() * 0.18;

  const tone = ctx.createOscillator();
  tone.type = 'sawtooth';
  tone.frequency.setValueAtTime(110 + Math.random() * 30, now);
  tone.frequency.exponentialRampToValueAtTime(55, now + length);
  const wobble = ctx.createOscillator();
  wobble.frequency.value = 28 + Math.random() * 10;
  const wobbleGain = ctx.createGain();
  wobbleGain.gain.value = 18;
  wobble.connect(wobbleGain).connect(tone.frequency);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  filter.Q.value = 6;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
  tone.connect(filter).connect(gain).connect(ctx.destination);
  tone.start(now);
  wobble.start(now);
  tone.stop(now + length);
  wobble.stop(now + length);
  return pause(length * 1000 + 120);
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function browserVoices(): SpeechSynthesisVoice[] {
  if (!canSynthesise()) return [];
  return window.speechSynthesis.getVoices();
}

/** The chosen voice, else the first Swedish one, else the browser's default. */
export function pickVoice(settings: VoiceSettings): SpeechSynthesisVoice | undefined {
  const voices = browserVoices();
  return voices.find((v) => v.voiceURI === settings.voiceURI) ?? voices.find((v) => v.lang.toLowerCase().startsWith('sv'));
}

function sayInBrowser(text: string, settings: VoiceSettings): Promise<void> {
  if (!canSynthesise() || !text.trim()) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(settings);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? 'sv-SE';
    u.rate = settings.rate;
    u.pitch = settings.pitch;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

/** Stops whatever is being said. */
export function hush() {
  if (canSynthesise()) window.speechSynthesis.cancel();
  current?.pause();
  current = null;
}

let current: HTMLAudioElement | null = null;

/**
 * Says the reply: through the API's voice (ElevenLabs) when it has one, otherwise the browser's, with
 * the burps played in between the pieces.
 */
export async function say(reply: string, settings: VoiceSettings, remote?: (text: string) => Promise<Blob>): Promise<void> {
  for (const part of segments(reply)) {
    if (part.kind === 'burp') {
      if (settings.persona === 'rick' && settings.burps > 0) await burp();
      continue;
    }
    const text = speakable(part.text);
    if (!text) continue;
    if (remote) {
      try {
        await playBlob(await remote(text));
        continue;
      } catch {
        // Fall back to the browser's voice for this piece.
      }
    }
    await sayInBrowser(text, settings);
  }
}

function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    current = audio;
    const end = () => {
      URL.revokeObjectURL(url);
      if (current === audio) current = null;
      resolve();
    };
    audio.onended = end;
    audio.onpause = end;
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Kunde inte spela upp rösten.'));
    };
    audio.play().catch(reject);
  });
}
