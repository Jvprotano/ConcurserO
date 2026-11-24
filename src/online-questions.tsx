import { createElement, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { GranAnswer, GranQuestion, GranQuestionPage } from '../server/gran-questions.ts';
import { api, message } from './api.ts';

const granEndpoint = '/online-questions/gran';
const gran = 'https://questoes.grancursosonline.com.br/questoes';
const granMedia = 'https://arquivos.infra-questoes.grancursosonline.com.br';
const htmlTags = new Set(['p', 'div', 'blockquote', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
  'ol', 'ul', 'li', 'span', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col']);

function QuestionImage({ url, alt, offline }: { url: string; alt?: string; offline: boolean }) {
  try {
    if (!url.trim()) return <span>Imagem indisponível</span>;
    const image = new URL(url, gran);
    if (!offline && image.origin === granMedia) return <img className="question-illustration" src={image.href}
      alt={alt?.trim() || 'Ilustração da questão'} loading="lazy" referrerPolicy="no-referrer"/>;
    if (image.protocol === 'https:') return <a href={image.href} target="_blank" rel="noreferrer">
      {offline ? 'Abrir figura com internet' : 'Abrir imagem da questão'}</a>;
  } catch { /* A fonte enviou um endereço inválido. */ }
  return <span>Imagem indisponível</span>;
}

function contentNode(node: ChildNode, key: number, offline: boolean): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (!(node instanceof HTMLElement)) return null;
  const tag = node.localName;
  if (tag === 'img') return <QuestionImage key={key} url={node.getAttribute('src') || ''} alt={node.getAttribute('alt') ?? undefined} offline={offline}/>;
  if (tag === 'a' || tag === 'h1') return createElement(tag === 'a' ? 'span' : 'strong', { key },
    [...node.childNodes].map((child, i) => contentNode(child, i, offline)));
  if (!htmlTags.has(tag)) return null;
  if (tag === 'br' || tag === 'col') return createElement(tag, { key });
  if (node instanceof HTMLTableCellElement) return createElement(tag, { key, rowSpan: node.rowSpan, colSpan: node.colSpan },
    [...node.childNodes].map((child, i) => contentNode(child, i, offline)));
  return createElement(tag, { key }, [...node.childNodes].map((child, i) => contentNode(child, i, offline)));
}

export function QuestionContent({ html, offline }: { html: string; offline: boolean }) {
  const content = useMemo(() => {
    const template = document.createElement('template');
    template.innerHTML = html;
    return [...template.content.childNodes].map((node, i) => contentNode(node, i, offline));
  }, [html, offline]);
  return <div className="question-content">{content}</div>;
}

function GranQuestionCard({ question, pageId }: { question: GranQuestion; pageId: string }) {
  const [choice, setChoice] = useState('');
  const [result, setResult] = useState<GranAnswer>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = question.options;
  const source = [...new Set([question.banca?.nome, question.instituicao?.nome, question.nomeProva || question.ano].filter(Boolean))];

  async function submit() {
    if (!choice || busy || result || question.anulada) return;
    setBusy(true); setError('');
    try {
      const path = granEndpoint + '/pages/' + pageId + '/questions/' + question.id + '/answer';
      const correction = await api<GranAnswer>(path, 'POST', { choice });
      setResult(correction.status === 'corrected' && !options.some(option => option.key === correction.key)
        ? { status: 'pending' } : correction);
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }

  return <article className="panel">
    <p className="eyebrow">{[question.materia?.nome, question.topico?.nome].filter(Boolean).join(' → ') || 'Questão de concurso'}</p>
    {!!source.length && <p className="meta">{source.join(' · ')}</p>}
    {question.textoBase && <details className="callout"><summary>Texto de apoio</summary>
      <QuestionContent html={question.textoBase.texto} offline={false}/>
    </details>}
    <QuestionContent html={question.enunciado} offline={false}/>
    {options.length > 1 && !question.anulada && <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <fieldset className="options" disabled={busy || Boolean(result)} aria-label="Alternativas">
        {options.map(option => <label className={choice === option.key ? 'option selected' : 'option'} key={option.key}>
          <input type="radio" name={'online-answer-' + question.id} checked={choice === option.key} onChange={() => setChoice(option.key)}/>
          <strong>{option.label}</strong><QuestionContent html={option.text} offline={false}/>
        </label>)}
      </fieldset>
      {!result && <button className="button primary" disabled={!choice || busy}>{busy ? 'Corrigindo…' : 'Responder'}</button>}
    </form>}
    {(question.anulada || result?.status === 'annulled') && <p className="callout attention" role="status">Questão anulada pela banca.</p>}
    {(!question.anulada && options.length < 2) && <p className="callout attention">Alternativas indisponíveis.</p>}
    {result?.status === 'pending' && <p className="callout attention" role="status">Gabarito indisponível para esta questão.</p>}
    {result?.status === 'corrected' && <p className={'callout ' + (result.correct ? 'positive' : 'attention')} role="status">
      <strong>{result.correct ? 'Resposta correta' : 'Resposta incorreta'} · Gabarito {options.find(option =>
        option.key === result.key)?.label}</strong>
    </p>}
    {error && <p className="alert" role="alert">{error}</p>}
  </article>;
}

function GranResults({ results, busy, goToPage, toolbar }: {
  results: GranQuestionPage; busy: boolean; goToPage: (page: number) => void; toolbar: ReactNode;
}) {
  return <section aria-label="Questões encontradas">
    <div className="section-heading">
      <h2>{results.totalElements.toLocaleString('pt-BR')} {results.totalElements === 1 ? 'questão encontrada' : 'questões encontradas'}</h2>
      <span className="meta">Fonte <a href={gran} target="_blank" rel="noreferrer">Gran Questões</a></span>
    </div>
    {toolbar}
    {results.content.map(question => <GranQuestionCard key={question.id} question={question} pageId={results.pageId}/>)}
    {results.totalPages > 1 && <div className="toolbar wrap" aria-label="Páginas de questões">
      <button className="button secondary" disabled={busy || results.page === 0} onClick={() => goToPage(results.page - 1)}>Anterior</button>
      <span className="meta" aria-live="polite">Página {results.page + 1} de {results.totalPages}</span>
      <button className="button secondary" disabled={busy || results.page + 1 >= results.totalPages} onClick={() => goToPage(results.page + 1)}>Próxima</button>
    </div>}
  </section>;
}

export function OnlineQuestions({ changed }: { changed: () => Promise<void> }) {
  const [connected, setConnected] = useState<boolean>();
  const [results, setResults] = useState<GranQuestionPage>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let current = true;
    api<{ connected: boolean }>(granEndpoint + '/status')
      .then(status => { if (current) setConnected(status.connected); })
      .catch(error => { if (current) { setConnected(false); setError(message(error)); } });
    return () => { current = false; };
  }, []);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }

  function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run(async () => {
      const page = await api<GranQuestionPage>(granEndpoint + '/session', 'POST',
        { token: data.get('token'), clientId: data.get('clientId') });
      form.reset();
      setConnected(true);
      setResults(page);
    });
  }

  function search(page: number) {
    void run(async () => {
      try { setResults(await api<GranQuestionPage>(granEndpoint + '?page=' + (page + 1))); }
      catch (error) {
        const status = await api<{ connected: boolean }>(granEndpoint + '/status').catch(() => undefined);
        if (status?.connected === false) { setConnected(false); setResults(undefined); }
        throw error;
      }
    });
  }

  function disconnect() {
    void run(async () => {
      await api(granEndpoint + '/session', 'DELETE');
      setConnected(false);
      setResults(undefined);
    });
  }

  function savePage(pageId: string) {
    void run(async () => {
      const { saved } = await api<{ saved: number }>(granEndpoint + '/pages/' + pageId + '/save', 'POST');
      setNotice(saved === 0 ? 'As questões desta página já estão salvas.'
        : saved === 1 ? 'Uma questão salva para estudar offline.' : saved + ' questões salvas para estudar offline.');
      if (saved) await changed();
    });
  }

  return <>
    <section className="panel">
      <h2>Gran Questões</h2>
      <p className="meta">Raciocínio Lógico · IBFC</p>
      {connected === undefined && <p role="status">Verificando sessão do Gran…</p>}
      {connected === false && <form onSubmit={connect} autoComplete="off">
        <p className="muted">Use uma sessão ativa da sua conta no Gran para resolver aqui.</p>
        <fieldset className="bank-filter-fields" disabled={busy}>
          <div className="form-grid bank-filter-grid">
            <label>Token da sessão<input name="token" type="password" autoComplete="off" spellCheck={false} required maxLength={4096}/></label>
            <label>X-Client-ID<input name="clientId" type="password" autoComplete="off" spellCheck={false} required maxLength={128}/></label>
          </div>
          <div className="actions"><button className="button primary">{busy ? 'Conectando…' : 'Conectar e buscar'}</button></div>
        </fieldset>
      </form>}
      {connected && <div className="actions">
        {!results && <button className="button primary" disabled={busy} onClick={() => search(0)}>Buscar questões</button>}
        <button className="text-button" disabled={busy} onClick={disconnect}>Desconectar Gran</button>
      </div>}
      {busy && connected && <p role="status" className="meta">Aguarde…</p>}
      {error && <p className="alert" role="alert">{error}</p>}
      <details>
        <summary>Abrir no Gran Questões</summary>
        <div className="actions">
          <a className="text-button" href={gran + '?anulada=0&desatualizada=0&orgao=516'} target="_blank" rel="noreferrer">Polícia Científica do Paraná</a>
          <a className="text-button" href={gran + '?anulada=0&banca=277&desatualizada=0'} target="_blank" rel="noreferrer">Questões da IBFC</a>
          <a className="text-button" href={gran} target="_blank" rel="noreferrer">Todos os filtros</a>
        </div>
      </details>
    </section>
    {results && <GranResults key={results.pageId} results={results} busy={busy} goToPage={search}
      toolbar={results.content.length > 0 && <div className="toolbar wrap">
        <button type="button" className="button secondary" disabled={busy} onClick={() => savePage(results.pageId)}>Salvar página offline</button>
        {notice && <span className="meta" role="status">{notice}</span>}
      </div>}/>}
  </>;
}
