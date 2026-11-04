import { useEffect, useState } from 'react';
import type { VoiceStatus } from '../../api/types';
import { browserVoices } from '../../lib/speech';
import type { VoiceSettings } from '../../lib/voice';
import { Sheet } from '../Sheets';

interface Props {
  settings: VoiceSettings;
  status: VoiceStatus | null;
  onChange: (settings: VoiceSettings) => void;
  onTest: () => void;
  onClose: () => void;
}

function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  const id = `slider-${label}`;
  return (
    <div className="vs-row">
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} type="range" className="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="meta vs-value">{format(value)}</span>
    </div>
  );
}

/** Who answers and how it sounds. Saved in this browser only. */
export function VoiceSettingsSheet({ settings, status, onChange, onTest, onClose }: Props) {
  const [voices, setVoices] = useState(browserVoices);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const update = () => setVoices(browserVoices());
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);

  const set = (p: Partial<VoiceSettings>) => onChange({ ...settings, ...p });
  const rick = settings.persona === 'rick';
  const remote = status?.speech.speak === 'elevenlabs';
  const percent = (v: number) => `${v} %`;
  const times = (v: number) => `${v.toFixed(2).replace('.', ',')}×`;

  return (
    <Sheet
      eyebrow="Röst · inställningar"
      title="Vem svarar och hur låter den."
      label="Röstinställningar"
      onClose={onClose}
      footer={<button className="primary" onClick={onTest}>Testa rösten</button>}
    >
      <div className="vs">
        <div className="vs-row">
          <span className="label">Persona</span>
          <div className="mode-switch" role="group" aria-label="Persona">
            <button className="chip" aria-pressed={rick} onClick={() => set({ persona: 'rick' })}>Rick</button>
            <button className="chip" aria-pressed={!rick} onClick={() => set({ persona: 'neutral' })}>Saklig</button>
          </div>
        </div>
        <Slider label="Cynism" value={settings.cynism} min={0} max={100} step={5} format={percent} onChange={(cynism) => set({ cynism })} />
        {rick && <Slider label="Rapningar" value={settings.burps} min={0} max={100} step={5} format={percent} onChange={(burps) => set({ burps })} />}

        <div className="vs-source">
          <span className="label">Rösten</span>
          <p>
            {remote
              ? 'ElevenLabs med rösten som är satt i API:t. Byt röst med Voice:ElevenLabsVoiceId.'
              : 'Webbläsarens egen röst. Sätt Voice:ElevenLabsApiKey och Voice:ElevenLabsVoiceId i API:t för en röst du designat själv.'}
          </p>
          <p className="meta">
            {status ? `Lyssnar med ${status.speech.listen === 'deepgram' ? 'Deepgram' : 'webbläsaren'} · svarar med ${status.agent === 'sample' ? 'exempelagenten' : status.model}` : 'Hämtar status…'}
          </p>
        </div>

        {!remote && (
          <>
            <div className="vs-row">
              <label htmlFor="vs-voice" className="label">Webbläsarröst</label>
              <select id="vs-voice" className="input" value={settings.voiceURI ?? ''} onChange={(e) => set({ voiceURI: e.target.value || null })}>
                <option value="">Första svenska rösten</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>
                ))}
              </select>
            </div>
            <Slider label="Tempo" value={settings.rate} min={0.6} max={1.6} step={0.02} format={times} onChange={(rate) => set({ rate })} />
            <Slider label="Tonhöjd" value={settings.pitch} min={0.4} max={1.6} step={0.02} format={times} onChange={(pitch) => set({ pitch })} />
          </>
        )}
      </div>
    </Sheet>
  );
}
