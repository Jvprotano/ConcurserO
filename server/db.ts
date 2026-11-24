import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';

export function localDate(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, i) => String(part).padStart(i ? 2 : 4, '0')).join('-');
}

export function nextDate(days: number, date = new Date()) {
  return localDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12));
}

export class Problem extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Problem(message, 404);
  return value;
}

export class Store {
  db: DatabaseSync;
  directory: string;

  constructor(directory = resolve(process.env.CONCURSERO_DATA ?? 'data'), { recoverImports = true } = {}) {
    this.directory = directory;
    mkdirSync(join(directory, 'pdf'), { recursive: true });
    this.db = new DatabaseSync(join(directory, 'concursero.sqlite'));
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
    if (this.get<{ user_version: number }>('PRAGMA user_version')?.user_version === 0) {
      this.transaction(() => {
        this.db.exec(schema);
        this.seed();
        this.db.exec('PRAGMA user_version = 1');
      });
    }
    if ((this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0) < 2) {
      this.transaction(() => {
        if (!this.all<{ name: string }>('PRAGMA table_info(pages)').some(column => column.name === 'topics')) {
          this.db.exec('ALTER TABLE pages ADD COLUMN topics TEXT');
        }
        this.db.exec("ALTER TABLE question_revisions ADD COLUMN support TEXT NOT NULL DEFAULT '[]'; DROP VIEW current_questions;" + currentQuestions + ' PRAGMA user_version = 2');
      });
    }
    if ((this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0) < 3) {
      this.transaction(() => this.db.exec(`ALTER TABLE imports ADD COLUMN exam TEXT;
        ALTER TABLE imports ADD COLUMN pair TEXT;
        ALTER TABLE imports ADD COLUMN source_url TEXT;
        PRAGMA user_version = 3;`));
    }
    if ((this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0) < 4) {
      this.transaction(() => this.db.exec(`
        ALTER TABLE trails ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE trails ADD COLUMN priority INTEGER NOT NULL DEFAULT 2;
        ALTER TABLE topics ADD COLUMN syllabus INTEGER NOT NULL DEFAULT 1;
        UPDATE topics SET syllabus=0 WHERE discipline LIKE '%demonstração%'
          OR (source_id IS NULL AND material='' AND summary='' AND EXISTS
            (SELECT 1 FROM current_questions q WHERE q.topic_id=topics.id AND q.source_id IS NOT NULL));
        CREATE TABLE topic_links (
          source_id TEXT NOT NULL REFERENCES topics(id), target_id TEXT NOT NULL REFERENCES topics(id),
          PRIMARY KEY(source_id,target_id), CHECK(source_id < target_id)
        );
        PRAGMA user_version = 4;
      `));
    }
    if ((this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0) < 5) {
      this.transaction(() => this.db.exec(`
        CREATE TABLE removed_items (kind TEXT NOT NULL, id TEXT NOT NULL, removed TEXT NOT NULL, PRIMARY KEY(kind,id));
        CREATE VIEW active_trails AS SELECT *,rowid AS _order FROM trails t
          WHERE NOT EXISTS (SELECT 1 FROM removed_items d WHERE d.kind='trail' AND d.id=t.id);
        CREATE VIEW active_editions AS SELECT *,rowid AS _order FROM editions e
          WHERE trail_id IN (SELECT id FROM active_trails)
          AND NOT EXISTS (SELECT 1 FROM removed_items d WHERE d.kind='edition' AND d.id=e.id);
        CREATE VIEW active_imports AS SELECT *,rowid AS _order FROM imports i
          WHERE trail_id IN (SELECT id FROM active_trails)
          AND NOT EXISTS (SELECT 1 FROM removed_items d WHERE d.kind='import' AND d.id=i.id);
        CREATE VIEW active_topics AS SELECT *,rowid AS _order FROM topics p
          WHERE edition_id IN (SELECT id FROM active_editions)
          AND (source_id IS NULL OR source_id IN (SELECT id FROM active_imports))
          AND NOT EXISTS (SELECT 1 FROM removed_items d WHERE d.kind='topic' AND d.id=p.id);
        CREATE VIEW active_materials AS SELECT *,rowid AS _order FROM materials m
          WHERE NOT EXISTS (SELECT 1 FROM removed_items d WHERE d.kind='material' AND d.id=m.id);
        CREATE VIEW active_cards AS SELECT *,rowid AS _order FROM cards c WHERE archived=0
          AND EXISTS (SELECT 1 FROM card_topics ct JOIN active_topics p ON p.id=ct.topic_id WHERE ct.card_id=c.id)
          AND NOT EXISTS (SELECT 1 FROM removed_items d WHERE d.kind='card' AND d.id=c.id);
        DROP VIEW current_questions;
        CREATE VIEW current_questions AS SELECT q.*,r.revision,r.topic_id,r.prompt,r.context,r.options,r.type,
          CASE WHEN r.key_source_id IS NOT NULL AND r.key_source_id NOT IN (SELECT id FROM active_imports)
            THEN 'pending' ELSE r.status END AS status,
          r.key,r.comment,r.source_id,r.source_page,r.key_source_id,r.key_page,r.support
          FROM questions q JOIN question_revisions r ON r.question_id=q.id
          WHERE r.revision=(SELECT max(revision) FROM question_revisions WHERE question_id=q.id)
          AND q.trail_id IN (SELECT id FROM active_trails) AND r.topic_id IN (SELECT id FROM active_topics)
          AND (r.source_id IS NULL OR r.source_id IN (SELECT id FROM active_imports));
        PRAGMA user_version = 5;
      `));
    }
    if ((this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0) < 6) {
      this.transaction(() => {
        if (!this.all<{ name: string }>('PRAGMA table_info(question_revisions)').some(column => column.name === 'key_preliminary')) {
          this.db.exec('ALTER TABLE question_revisions ADD COLUMN key_preliminary INTEGER NOT NULL DEFAULT 0 CHECK(key_preliminary IN (0,1))');
        }
        this.db.exec(`DROP VIEW current_questions;
          CREATE VIEW current_questions AS SELECT q.*,r.revision,r.topic_id,r.prompt,r.context,r.options,r.type,
            CASE WHEN r.key_source_id IS NOT NULL AND r.key_source_id NOT IN (SELECT id FROM active_imports)
              THEN 'pending' ELSE r.status END AS status,
            r.key,r.comment,r.source_id,r.source_page,r.key_source_id,r.key_page,r.support,r.key_preliminary
            FROM questions q JOIN question_revisions r ON r.question_id=q.id
            WHERE r.revision=(SELECT max(revision) FROM question_revisions WHERE question_id=q.id)
            AND q.trail_id IN (SELECT id FROM active_trails) AND r.topic_id IN (SELECT id FROM active_topics)
            AND (r.source_id IS NULL OR r.source_id IN (SELECT id FROM active_imports));
          PRAGMA user_version = 6;`);
      });
    }
    if ((this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0) < 7) {
      this.transaction(() => this.db.exec(`
        CREATE TABLE study_pdfs (
          material_id TEXT PRIMARY KEY REFERENCES materials(id),
          hash TEXT NOT NULL UNIQUE, filename TEXT NOT NULL, origin TEXT NOT NULL,
          category TEXT NOT NULL, version INTEGER NOT NULL
        );
        CREATE TABLE study_pdf_links (
          material_id TEXT NOT NULL, topic_id TEXT NOT NULL, first_page INTEGER, last_page INTEGER,
          section TEXT, prompt TEXT, answer TEXT,
          PRIMARY KEY(material_id,topic_id),
          FOREIGN KEY(material_id,topic_id) REFERENCES material_topics(material_id,topic_id) ON DELETE CASCADE
        );
        CREATE TABLE study_cycles (
          topic_id TEXT PRIMARY KEY REFERENCES topics(id), due TEXT NOT NULL, stage INTEGER NOT NULL, revision INTEGER NOT NULL
        );
        CREATE TABLE study_sessions (
          id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id), title TEXT NOT NULL,
          study_day TEXT NOT NULL, created TEXT NOT NULL, kind TEXT NOT NULL,
          minutes INTEGER NOT NULL, estimated INTEGER NOT NULL,
          rating TEXT, old_due TEXT, next_due TEXT, rule INTEGER,
          material_id TEXT REFERENCES materials(id), material_title TEXT, recall TEXT,
          attempt_id TEXT UNIQUE REFERENCES attempts(id), card_review_id TEXT UNIQUE REFERENCES reviews(id)
        );
        PRAGMA user_version = 7;
      `));
    }
    if ((this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0) < 8) {
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE summaries (id TEXT PRIMARY KEY, document TEXT NOT NULL);
          PRAGMA user_version = 8;
        `);
        this.setSetting('summaryBackup', { installation: randomUUID(), directory: '', savedAt: null, error: '' });
      });
    }
    if ((this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0) < 9) {
      this.transaction(() => this.db.exec(`
        CREATE TABLE gran_saved_questions (id TEXT PRIMARY KEY, document TEXT NOT NULL, answer_key TEXT);
        PRAGMA user_version = 9;
      `));
    }
    if ((this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0) < 10) {
      this.transaction(() => {
        if ((this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0) >= 10) return;
        this.db.exec(`
          CREATE TABLE gran_attempts (
            id TEXT PRIMARY KEY, question_id TEXT NOT NULL REFERENCES gran_saved_questions(id),
            topic_id TEXT REFERENCES topics(id), answer TEXT NOT NULL, answer_key TEXT NOT NULL,
            correct INTEGER NOT NULL, guess INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '',
            created TEXT NOT NULL, study_day TEXT NOT NULL
          );
          CREATE INDEX gran_attempts_question ON gran_attempts(question_id);
          ALTER TABLE cards ADD COLUMN gran_attempt_id TEXT REFERENCES gran_attempts(id);
          ALTER TABLE study_sessions ADD COLUMN gran_attempt_id TEXT REFERENCES gran_attempts(id);
          CREATE UNIQUE INDEX study_sessions_gran_attempt ON study_sessions(gran_attempt_id);
          PRAGMA user_version = 10;
        `);
      });
    }
    if (recoverImports) this.run("UPDATE imports SET status = 'failed', message = 'Processamento interrompido. Retome o rascunho ou tente novamente.' WHERE status IN ('queued', 'processing')");
  }

  run(sql: string, ...values: SQLInputValue[]) { return this.db.prepare(sql).run(...values); }
  get<T>(sql: string, ...values: SQLInputValue[]) { return this.db.prepare(sql).get(...values) as T | undefined; }
  all<T>(sql: string, ...values: SQLInputValue[]) { return this.db.prepare(sql).all(...values) as T[]; }

  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  setting<T>(key: string): T {
    return JSON.parse(required(this.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key), 'Configuração ausente.').value) as T;
  }
  setSetting(key: string, value: unknown) {
    this.run('INSERT INTO settings VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  }

  seed() {
    for (const trail of [
      ['pr', 'Polícia Científica do Paraná', 'IBFC', 'Edital de referência · 2024'],
      ['pf', 'Polícia Federal', 'Cebraspe', 'Edital de referência · 2025'],
    ]) {
      const [id, title, board, edition] = trail;
      const editionId = id + '-referencia';
      this.run('INSERT INTO trails (id,title,board,active_edition) VALUES (?,?,?,?)', id, title, board, editionId);
      this.run('INSERT INTO editions (id,trail_id,title) VALUES (?,?,?)', editionId, id, edition);
    }
    this.setSetting('activeTrail', 'pr');
    this.setSetting('schedule', [0, 30, 30, 30, 30, 30, 30]);

    for (const trail of ['pr', 'pf']) {
      for (const [index, title, material, summary] of [
        [0, 'Vestígios digitais e cadeia de custódia', 'A cadeia de custódia documenta a trajetória do vestígio e permite verificar quem o manuseou, quando e em quais condições. Uma função hash ajuda a comparar a integridade de arquivos ou imagens forenses. O registro de custódia inclui também os eventos e responsáveis.', 'Tente lembrar a diferença entre verificar a integridade dos dados e documentar a custódia.'],
        [1, 'Mídias de armazenamento', 'Uma imagem forense registra os dados da mídia para exame posterior. O analista documenta o método utilizado e os resultados de verificação da cópia.', 'Explique por que a análise é feita sobre uma cópia de trabalho.'],
        [2, 'Redes e sistemas operacionais', 'Registros de eventos e tráfego podem ajudar a reconstruir uma sequência de ações. Antes de correlacionar horários, confira fuso, formato e sincronização do relógio da fonte.', 'Ao comparar eventos de duas fontes, verifique se seus relógios são comparáveis.'],
      ] as const) {
        const id = trail + '-demo-' + index;
        this.run('INSERT INTO topics (id,edition_id,discipline,title,priority,material,summary,position) VALUES (?,?,?,?,?,?,?,?)',
          id, trail + '-referencia', 'Informática · demonstração', title, index === 0 ? 3 : 2, material, summary, index);
      }
      const question = randomUUID();
      const isPf = trail === 'pf';
      const options = isPf
        ? [{ key: 'C', text: 'Certo' }, { key: 'E', text: 'Errado' }]
        : [{ key: 'A', text: 'Comparar valores de hash.' }, { key: 'B', text: 'Alterar o nome da cópia.' },
           { key: 'C', text: 'Copiar a data do original.' }, { key: 'D', text: 'Conferir apenas o tamanho.' },
           { key: 'E', text: 'Registrar apenas a extensão.' }];
      this.run('INSERT INTO questions VALUES (?,?,?,?,?,?)', question, trail, 'demo', 'Demonstração', 'Amostra autoral', 1);
      this.run(`INSERT INTO question_revisions
        (question_id,revision,topic_id,prompt,context,options,type,status,key,comment)
        VALUES (?,1,?,?, '', ?,?,'ready',?,?)`, question, trail + '-demo-0',
      isPf ? 'A igualdade de hashes calculados com o mesmo algoritmo pode ajudar a verificar a integridade de uma cópia.' : 'Qual procedimento ajuda a verificar a integridade de uma cópia forense?',
      JSON.stringify(options), isPf ? 'boolean' : 'choice', isPf ? 'C' : 'A',
      'O valor de hash pode ser comparado com o da fonte. O registro de custódia documenta os eventos e responsáveis.');
    }
    const card = randomUUID();
    this.run('INSERT INTO cards (id,front,back,due,stage) VALUES (?,?,?,?,?)', card,
      'O que a cadeia de custódia documenta?', 'A trajetória do vestígio, com seus eventos, responsáveis e condições de manuseio.', localDate(), -1);
    for (const trail of ['pr', 'pf']) this.run('INSERT INTO card_topics VALUES (?,?)', card, trail + '-demo-0');
  }
}

const currentQuestions = `CREATE VIEW current_questions AS SELECT q.*, r.revision,r.topic_id,r.prompt,r.context,r.options,r.type,r.status,r.key,r.comment,
  r.source_id,r.source_page,r.key_source_id,r.key_page,r.support FROM questions q JOIN question_revisions r ON r.question_id = q.id
  WHERE r.revision = (SELECT max(revision) FROM question_revisions WHERE question_id = q.id);`;

const schema = `
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE trails (id TEXT PRIMARY KEY, title TEXT NOT NULL, board TEXT NOT NULL, exam_date TEXT, active_edition TEXT NOT NULL);
CREATE TABLE editions (id TEXT PRIMARY KEY, trail_id TEXT NOT NULL REFERENCES trails(id), title TEXT NOT NULL);
CREATE TABLE imports (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, trail_id TEXT NOT NULL REFERENCES trails(id),
  hash TEXT NOT NULL, status TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '', draft TEXT, created TEXT NOT NULL, UNIQUE(kind,trail_id,hash)
);
CREATE TABLE pages (import_id TEXT NOT NULL REFERENCES imports(id), page INTEGER NOT NULL, text TEXT NOT NULL,
  needs_ocr INTEGER NOT NULL, topics TEXT, PRIMARY KEY(import_id,page));
CREATE TABLE topics (
  id TEXT PRIMARY KEY, edition_id TEXT NOT NULL REFERENCES editions(id), discipline TEXT NOT NULL, title TEXT NOT NULL,
  priority INTEGER NOT NULL, material TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL,
  source_id TEXT REFERENCES imports(id), source_page INTEGER, UNIQUE(edition_id,discipline,title)
);
CREATE TABLE materials (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, summary TEXT NOT NULL);
CREATE TABLE material_topics (material_id TEXT NOT NULL REFERENCES materials(id), topic_id TEXT NOT NULL REFERENCES topics(id),
  PRIMARY KEY(material_id,topic_id));
CREATE TABLE questions (
  id TEXT PRIMARY KEY, trail_id TEXT NOT NULL REFERENCES trails(id), exam TEXT NOT NULL, block TEXT NOT NULL,
  version TEXT NOT NULL, number INTEGER NOT NULL, UNIQUE(trail_id,exam,block,version,number)
);
CREATE TABLE question_revisions (
  question_id TEXT NOT NULL REFERENCES questions(id), revision INTEGER NOT NULL, topic_id TEXT NOT NULL REFERENCES topics(id),
  prompt TEXT NOT NULL, context TEXT NOT NULL, options TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL,
  key TEXT NOT NULL, comment TEXT NOT NULL, source_id TEXT REFERENCES imports(id), source_page INTEGER,
  key_source_id TEXT REFERENCES imports(id), key_page INTEGER, PRIMARY KEY(question_id,revision)
);
CREATE TABLE attempts (
  id TEXT PRIMARY KEY, question_id TEXT NOT NULL, revision INTEGER NOT NULL, answer TEXT NOT NULL, correct INTEGER NOT NULL,
  guess INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, study_day TEXT NOT NULL,
  FOREIGN KEY(question_id,revision) REFERENCES question_revisions(question_id,revision)
);
CREATE TABLE cards (
  id TEXT PRIMARY KEY, front TEXT NOT NULL, back TEXT NOT NULL, due TEXT NOT NULL, stage INTEGER NOT NULL,
  attempt_id TEXT REFERENCES attempts(id), archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE card_topics (card_id TEXT NOT NULL REFERENCES cards(id), topic_id TEXT NOT NULL REFERENCES topics(id),
  PRIMARY KEY(card_id,topic_id));
CREATE TABLE reviews (
  id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id), remembered INTEGER NOT NULL, old_due TEXT NOT NULL,
  new_due TEXT NOT NULL, stage INTEGER NOT NULL, rule INTEGER NOT NULL, created TEXT NOT NULL, study_day TEXT NOT NULL
);
CREATE TABLE reading (topic_id TEXT NOT NULL REFERENCES topics(id), study_day TEXT NOT NULL, PRIMARY KEY(topic_id,study_day));
CREATE TABLE publications (id TEXT PRIMARY KEY, result TEXT NOT NULL);
CREATE VIEW current_questions AS SELECT q.*, r.revision,r.topic_id,r.prompt,r.context,r.options,r.type,r.status,r.key,r.comment,
  r.source_id,r.source_page,r.key_source_id,r.key_page FROM questions q JOIN question_revisions r ON r.question_id = q.id
  WHERE r.revision = (SELECT max(revision) FROM question_revisions WHERE question_id = q.id);
`;
