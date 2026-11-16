import type { ImportKind } from './types.ts';
import { historicalExams } from './exam-history.ts';

type PackFile = { kind: Exclude<ImportKind, 'edital'>; name: string; url: string; sha256: string };
type PackBlock = { id: 'basico' | 'especifico'; label: string; proof: PackFile; key: PackFile };
type ExamPack = { id: string; trailId: string; exam: string; title: string; description: string; blocks: PackBlock[] };

const archive = 'https://www.gov.br/pf/pt-br/acesso-a-informacao/servidores/concursos/provas-e-gabaritos-de-concursos-anteriores/';
const keys25 = archive + 'concurso-carreira-policial-2025/provas-objetivas/gabaritos/gabaritos-definitivos/';
const keys18 = 'https://cdn.cebraspe.org.br/concursos/PF_18/arquivos/';
const source = (exam: string, label: string) => historicalExams.find(item => item.id === exam)!.sources.find(item => item.label === label)!.url;

function block(exam: string, id: PackBlock['id'], proofHash: string, keyUrl: string, keyHash: string): PackBlock {
  const label = id === 'basico' ? 'Conhecimentos básicos' : 'Informática Forense';
  return {
    id, label,
    proof: { kind: 'prova', name: `PF ${exam.slice(3)} · Caderno · ${label}.pdf`,
      url: source(exam, id === 'basico' ? 'Caderno básico' : 'Caderno específico'), sha256: proofHash },
    key: { kind: 'gabarito', name: `PF ${exam.slice(3)} · Gabarito definitivo · ${label}.pdf`, url: keyUrl, sha256: keyHash },
  };
}

export const examPacks: ExamPack[] = [
  {
    id: 'pf-2025', trailId: 'pf', exam: '01/2025', title: 'PF 2025 · Perito Criminal Federal · Área 3',
    description: 'Prova de referência da trilha: 50 itens básicos e 70 específicos, com gabaritos definitivos.',
    blocks: [
      block('pf-2025', 'basico', '08574b971d557f9eba566567bab3dc48594ca9b86647530e6576cf5bd1d172bb',
        keys25 + 'gabarito-definitivo-conhecimentos-basicos-cargos-02-a-14.pdf', 'ff75dc45f1bf683e5708d18fe943d227bc25f231076a27c6d73b4b1254e80c49'),
      block('pf-2025', 'especifico', '8b3b0e8fd407ec24bcf37985518c9bcff14882416befb61faa3448cfac8f1f97',
        keys25 + 'gabarito-definitivo-conhecimentos-especificos-cargo-04.pdf', 'a91c5f0a69f19c8179855b78112368b038b7a0b2595e5ac449b3b06de7f7f182'),
    ],
  },
  {
    id: 'pf-2018', trailId: 'pf', exam: '01/2018', title: 'PF 2018 · Perito Criminal Federal · Área 3',
    description: 'Prova relacionada do mesmo cargo, área e banca: 50 itens básicos e 70 específicos. Priorize temas que ainda constam do edital de estudo.',
    blocks: [
      block('pf-2018', 'basico', '2ad0e11becb8ac952ba15ac931e290396051e0dc08e33c476fe17310643d7a97',
        keys18 + 'GAB_DEFINITIVO_408_DGPPFCB1__PAG_4.PDF', 'f6a000ef54fed66dc395b44d1623df73035f183235b26be71e97944a0bc38c4d'),
      block('pf-2018', 'especifico', '20ab0219fc2cf088f610a725c392813cda000abe48b3a12c49a73ef931584a59',
        keys18 + 'GAB_DEFINITIVO_408_DGPPF004_ATUALIZADO.PDF', '0f1a83fc6bd083dded33ad1c175aa7b35996d422a1151c51bf3dc867df2abfc5'),
    ],
  },
];
