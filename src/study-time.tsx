import { useEffect, useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { timerElapsed, type StudyTimer } from '../shared/agenda.ts';
import type { Topic } from '../shared/types.ts';
import { api } from './api.ts';
import type { SharedProps } from './study.tsx';

type TimeProps = Pick<SharedProps, 'state' | 'mutate'>;

export function StudyTimeControls({ state, mutate, topic }: TimeProps & { topic?: Topic }) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [topicId, setTopicId] = useState('');
  const [day, setDay] = useState(state.today);
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const startRequest = useRef<{ key: string; id: string }>(null);
  const manualRequest = useRef<{ key: string; id: string }>(null);
  const targetId = topic?.id ?? topicId;
  const timer = state.agenda?.timer;
  const topics = topic || !open ? [] : state.topics.map(row => ({
    id: row.id, label: [row.discipline, row.title, state.trails.find(trail => trail.id === row.trailId)?.title].filter(Boolean).join(' · '),
  })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

  function toggleManual() {
    setManual(!manual);
    if (!manual && !minutes) setDay(state.today);
  }

  async function start() {
    if (!targetId || busy || timer) return;
    if (startRequest.current?.key !== targetId) startRequest.current = { key: targetId, id: crypto.randomUUID() };
    const id = startRequest.current.id;
    setBusy(true);
    const ok = await mutate(() => api('/study-timer', 'POST', { id, topicId: targetId }));
    setBusy(false);
    if (ok) { startRequest.current = null; setOpen(false); }
  }

  async function save() {
    if (!targetId || busy) return;
    const key = JSON.stringify([targetId, day, minutes]);
    if (manualRequest.current?.key !== key) manualRequest.current = { key, id: crypto.randomUUID() };
    const id = manualRequest.current.id;
    setBusy(true);
    const ok = await mutate(() => api('/study-time', 'POST', { id, topicId: targetId, day, minutes: Number(minutes) }), 'Tempo de estudo registrado.');
    setBusy(false);
    if (ok) { manualRequest.current = null; setMinutes(''); setManual(false); setOpen(false); }
  }

  if (!topic && !state.topics.length) return null;
  return <div className="study-time-controls">
    {!topic && <button type="button" className="button secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
      <Clock3 size={16} aria-hidden="true"/> Registrar estudo
    </button>}
    {(topic || open) && <div>
      {!topic && <label>Assunto<select value={topicId} disabled={busy} onChange={event => setTopicId(event.target.value)}>
        <option value="">Selecione o assunto</option>
        {topics.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
      </select></label>}
      <div className="actions">
        {!timer && <button type="button" className="button secondary" disabled={busy || !targetId} onClick={() => void start()}>
          <Clock3 size={16} aria-hidden="true"/> Iniciar cronômetro
        </button>}
        <button type="button" className="text-button" disabled={busy || !targetId} aria-expanded={manual} onClick={toggleManual}>
          {topic ? 'Lançar tempo avulso' : 'Adicionar tempo'}
        </button>
      </div>
      {manual && <form className="actions" onSubmit={event => { event.preventDefault(); void save(); }}>
        <label>Minutos estudados<input type="number" required min={1} max={1440} value={minutes}
          disabled={busy} onChange={event => setMinutes(event.target.value)}/></label>
        <label>Data do estudo<input type="date" required max={state.today} value={day}
          disabled={busy} onChange={event => setDay(event.target.value)}/></label>
        <button className="button primary" disabled={busy || !targetId}>Salvar tempo</button>
      </form>}
    </div>}
  </div>;
}

export function ActiveStudyTimer({ timer, mutate }: { timer: StudyTimer; mutate: TimeProps['mutate'] }) {
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const paused = timer.runningSince === null;
  useEffect(() => {
    setNow(Date.now());
    if (paused) return;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [timer.runningSince, paused]);
  const seconds = Math.floor(timerElapsed(timer, now) / 1000);
  const duration = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');

  async function update(action: 'pause' | 'resume' | 'save' | 'discard') {
    if (busy || (action === 'discard' && !window.confirm('Descartar o tempo deste cronômetro?'))) return;
    setBusy(true);
    await mutate(() => api(`/study-timer/${timer.id}/${action}`, 'POST'),
      action === 'save' ? 'Tempo de estudo registrado.' : action === 'discard' ? 'Cronômetro descartado.' : '');
    setBusy(false);
  }

  return <section className="task-row study-timer" aria-label="Cronômetro de estudo">
    <div><h2>{timer.title}</h2><p><strong className="timer-duration">{duration}</strong>{paused && ' · Pausado'}</p></div>
    <div className="actions">
      <button type="button" className="button secondary" disabled={busy} onClick={() => void update(paused ? 'resume' : 'pause')}>
        {paused ? 'Retomar' : 'Pausar'}
      </button>
      <button type="button" className="button primary" disabled={busy} onClick={() => void update('save')}>Encerrar e salvar</button>
      <button type="button" className="text-button" disabled={busy} onClick={() => void update('discard')}>Descartar</button>
    </div>
  </section>;
}
