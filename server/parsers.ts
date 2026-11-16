import type { DraftKey, DraftQuestion, DraftTopic, PageText } from '../shared/types.ts';

export type ExtractedPage = PageText & { table?: string; topics?: DraftTopic[] };
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
export const isPreliminary = (value: string) => /GABARITOS?\s+(?:OFICIA(?:L|IS)\s+)?PRELIMINAR(?:ES)?\b/.test(normalize(value));
const booleanOptions = [{ key: 'C', text: 'Certo' }, { key: 'E', text: 'Errado' }];
export const blockFor = (trail: string, number: number) => number <= (trail === 'pr' ? 40 : 50) ? 'basico' : 'especifico';

// Older drafts joined spaced markers ("c )") to the preceding alternative.
// Recover only a complete, ordered set using text already present in the draft.
export function repairQuestionOptions(row: DraftQuestion): DraftQuestion {
  if (row.type !== 'choice' || row.options.map(option => option.key).join('') === 'ABCDE') return row;
  const known = new Set(row.options.map(option => option.key));
  const options = row.options.flatMap(option => {
    const markers = [...option.text.matchAll(/(?:^|\s)([a-eA-E])\s+\)\s*/g)]
      .filter(match => !known.has(match[1].toUpperCase()));
    if (!markers.length) return [option];
    return [{ key: option.key, text: option.text.slice(0, markers[0].index).trim() },
      ...markers.map((match, index) => ({ key: match[1].toUpperCase(),
        text: option.text.slice(match.index + match[0].length, markers[index + 1]?.index ?? option.text.length).trim() }))];
  });
  return options.map(option => option.key).join('') === 'ABCDE' && options.every(option => option.text)
    ? { ...row, options } : row;
}

function versionMarker(text: string) {
  const header = normalize(text);
  return header.match(/\bAREA\s+0?3\s*[-–]\s*(?:IBFC[_ ]?0?3\s*[-–]\s*)?VERSAO\s+([ABC])\b/)?.[1] ??
    header.match(/IBFC[_ ]?0?3\s*[-–]?\s*VERSAO\s+([ABC])\b/)?.[1];
}

export function suggestTopics(pages: ExtractedPage[], trail: string): DraftTopic[] {
  if (trail === 'pr') {
    const generalHeadings = new Set([
      'LINGUA PORTUGUESA', 'DIREITO APLICADO', 'RACIOCINIO LOGICO E CIENTIFICO', 'INFORMATICA',
      'LEGISLACAO ESPECIAL', 'NOCOES DE CRIMINALISTICA E MEDICINA LEGAL',
    ]);
    return uniqueTopics(pages.flatMap(page => page.topics ?? []).filter(topic =>
      topic.discipline !== 'Conhecimentos gerais' || generalHeadings.has(normalize(topic.title))));
  }
  const result: DraftTopic[] = [];
  let section: 'basic' | 'specific' | undefined;
  let discipline = '';
  for (const { page, text } of pages) {
    for (const raw of text.split('\n')) {
      let line = raw.trim();
      const upper = normalize(line);
      if (/^CONHECIMENTOS BASICOS PARA TODAS AS AREAS DO CARGO DE PERITO CRIMINAL FEDERAL/.test(upper)) {
        section = 'basic'; continue;
      }
      if (/^CONHECIMENTOS ESPECIFICOS\s*$/.test(upper)) { section = undefined; continue; }
      const cargo = upper.match(/^CARGO\s+(\d+):/);
      if (cargo) {
        section = Number(cargo[1]) === 4 && /INFORMATICA FORENSE/.test(upper) && page > 50 ? 'specific' : undefined;
        discipline = section ? 'Informática Forense' : '';
        continue;
      }
      if (!section) continue;
      if (section === 'basic') {
        const header = line.match(/^([\p{Lu}][\p{Lu} /-]{4,}):\s*(.*)$/u);
        if (header) {
          discipline = header[1].toLocaleLowerCase('pt-BR');
          discipline = discipline[0].toLocaleUpperCase('pt-BR') + discipline.slice(1);
          line = header[2];
        }
      }
      if (!discipline) continue;
      for (const match of line.matchAll(/(?:^|[.;]\s+)(\d{1,2})\s+([\p{Lu}][^.;\d]{3,180})/gu)) {
        const title = match[2].trim().replace(/[,;:]$/, '');
        if (title.length >= 4) result.push({ page, discipline, title });
      }
    }
  }
  return uniqueTopics(result);
}

function uniqueTopics(rows: DraftTopic[]) {
  return rows.filter((topic, i) => rows.findIndex(other =>
    normalize(other.title) === normalize(topic.title) && other.discipline === topic.discipline) === i);
}

export function suggestQuestions(pages: PageText[], trail: string, pair?: string | null): DraftQuestion[] {
  const isPr = trail === 'pr';
  const expectedBlock = pair?.split(':').at(-1);
  const result: DraftQuestion[] = [];
  let current: DraftQuestion | undefined;
  let option = -1;
  let context = '';
  let collectingContext = false;
  let activeVersion = isPr ? '' : 'Única';
  for (const { page, text } of pages) {
    const marker = versionMarker(text);
    if (marker && marker !== activeVersion) {
      activeVersion = marker; current = undefined; context = '';
    }
    // In the 2018 basic booklet the reading passage has numbered lines before item 1.
    const objectiveText = pair === 'pf-2018:basico' && page === 1
      ? text.slice(Math.max(0, text.search(/^No que se refere aos sentidos do texto CB1A1AAA/m))) : text;
    for (const raw of objectiveText.split('\n')) {
      const line = raw.trim().replace(/\s+/g, ' ');
      const upper = normalize(line);
      if (!line || /^(IBFC[_ ]|CEBRASPE|CESPE\s*\||MATRIZ_408_|ESPACO LIVRE$|POLICIA CIENTIFICA DO PARANA|SECRETARIA DE ESTADO|CONCURSO PUBLICO|\d+\s*$)/.test(upper)) continue;
      if (/^(?:PROVA DISCURSIVA|REDAÇÃO|REDACAO)/.test(upper)) { current = undefined; context = ''; break; }
      if (isPr && /^(?:TEXTO\s+(?:\d|PARA|I\b)|LEIA O TEXTO)/.test(upper) ||
        !isPr && (/^(?:JULGUE|A RESPEITO|ACERCA|CONSIDERE|NO QUE SE REFERE|COM RELACAO|COM BASE|NO QUE DIZ RESPEITO)/.test(upper)
        && /ITENS|JULGUE|SEGUINTES/.test(upper) || pair?.startsWith('pf-2018:') &&
          /^(?:CONSIDERANDO|TENDO COMO REFERENCIA|COM REFERENCIA|EM CADA UM DOS ITENS)\b/.test(upper))) {
        current = undefined; context = line; collectingContext = true; continue;
      }
      const match = isPr ? line.match(/^(\d{1,2})\)\s*(.+)$/) : line.match(/^(\d{1,3})\s+([\p{L}(].*)$/u);
      if (match) {
        const number = Number(match[1]);
        if (number < 1 || number > (isPr ? 80 : 120) || (isPr && !activeVersion)) continue;
        const itemBlock = blockFor(trail, number);
        if (expectedBlock && itemBlock !== expectedBlock) {
          if (pair === 'pf-2018:especifico') current = undefined;
          continue;
        }
        current = {
          page, number, version: activeVersion, block: itemBlock,
          prompt: match[2], context, options: isPr ? [] : booleanOptions, type: isPr ? 'choice' : 'boolean',
        };
        result.push(current);
        if (pair === 'pf-2018:basico' && number <= 12) {
          current.needsSupport = true;
          current.supportPages = [1];
        }
        if (pair === 'pf-2018:basico' && ([13, 14, 17, 18].includes(number) || (number >= 21 && number <= 25))) {
          current.needsSupport = true;
          current.supportPages = [page];
        }
        if (pair === 'pf-2018:especifico' && ((number >= 51 && number <= 56) ||
            (number >= 74 && number <= 76) || (number >= 80 && number <= 87) || (number >= 97 && number <= 99))) {
          current.needsSupport = true;
          current.supportPages = [page];
        }
        option = -1;
        collectingContext = false;
        continue;
      }
      if (!current) {
        if (collectingContext) context += '\n' + line;
        continue;
      }
      const alternatives = isPr && /^[a-eA-E]\s*\)/.test(line)
        ? [...line.matchAll(/(?:^|\s)([a-eA-E])\s*\)\s*/g)] : [];
      if (alternatives.length) {
        for (const [index, match] of alternatives.entries()) {
          const start = match.index + match[0].length;
          const end = alternatives[index + 1]?.index ?? line.length;
          current.options.push({ key: match[1].toUpperCase(), text: line.slice(start, end).trim() });
        }
        option = current.options.length - 1;
      } else if (option >= 0) {
        current.options[option].text += ' ' + line;
      } else if (!/^(CONHECIMENTOS|INFORMATICA$|LINGUA PORTUGUESA$)/.test(upper)) {
        current.prompt += ' ' + line;
      }
    }
  }
  return result.filter((question, i) => result.findIndex(other =>
    other.number === question.number && other.version === question.version && other.block === question.block) === i);
}

export function suggestKeys(pages: ExtractedPage[], trail: string): DraftKey[] {
  const isPr = trail === 'pr';
  const max = isPr ? 80 : 120;
  const result: DraftKey[] = [];
  for (const { page, text, table } of pages) {
    const version = isPr ? versionMarker(text + '\n' + table) : 'Única';
    if (!version) continue;
    const lines = (table ?? text).split('\n');
    let numbers: number[] = [];
    for (const line of lines) {
      const digits = line.match(/\b\d{1,3}\b/g) ?? [];
      const tokens = normalize(line).split(/\s+/).filter(token => /^[A-EX*0–-]$/.test(token));
      const isNumberRow = digits.length > 1 && digits.every(n => Number(n) <= max) &&
        digits.filter(n => Number(n) > 0).every((n, index, list) => !index || Number(n) === Number(list[index - 1]) + 1);
      if (isNumberRow && digits.some(n => Number(n) > 0)) { numbers = digits.map(Number); continue; }
      if (numbers.length && numbers.length === tokens.length) {
        for (const [index, number] of numbers.entries()) {
          if (!number || tokens[index] === '0') continue;
          const raw = tokens[index];
          const key = /^[X*–-]$/.test(raw) ? 'X' : raw;
          if ((isPr ? /^[A-EX]$/ : /^[CEX]$/).test(key)) result.push({ page, number, version, block: blockFor(trail, number), key });
        }
        numbers = [];
      }
    }
  }
  return result;
}
