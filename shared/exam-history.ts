import type { HistoricalExam } from './overview.ts';

export const subjects = {
  portuguese: 'Língua Portuguesa',
  writing: 'Redação oficial',
  logical: 'Raciocínio lógico e científico',
  computing: 'Noções de informática',
  law: 'Direito aplicado',
  administrative: 'Direito administrativo',
  constitutional: 'Direito constitucional',
  criminal: 'Direito penal e processual penal',
  legislation: 'Legislação especial',
  techLaw: 'Legislação aplicada à informática e à perícia',
  humanRights: 'Direitos humanos',
  criminalistics: 'Criminalística e medicina legal',
  networks: 'Redes e protocolos',
  security: 'Segurança de sistemas, redes e aplicações',
  storage: 'Armazenamento, RAID e sistemas de arquivos',
  systems: 'Sistemas operacionais, arquitetura e virtualização',
  evidence: 'Vestígios digitais, cadeia de custódia e exames forenses',
  cryptography: 'Criptografia, esteganografia e técnicas antiforenses',
  cloud: 'Computação em nuvem',
  malware: 'Malware e análise de código',
  database: 'Banco de dados',
  programming: 'Programação, algoritmos e estruturas de dados',
  image: 'Imagem, áudio e análise de conteúdo',
  mobile: 'Dispositivos móveis',
  blockchain: 'Blockchain e criptoativos',
  ai: 'Inteligência artificial',
} as const;

const pfArchive = 'https://www.gov.br/pf/pt-br/acesso-a-informacao/servidores/concursos/provas-e-gabaritos-de-concursos-anteriores/';
const pf2018 = pfArchive + 'concurso-carreira-policial-2018/perito/';
const pf2025 = pfArchive + 'concurso-carreira-policial-2025/provas-objetivas/cadernos-de-prova/';

export const historicalExams: HistoricalExam[] = [
  {
    id: 'pr-2024', trail: 'pr', year: 2024, label: 'Área 3 · Informática · IBFC', basic: 40, total: 80,
    sources: [
      { label: 'Caderno A (espelho)', url: 'https://arquivos.qconcursos.com/prova/arquivo_prova/115505/ibfc-2024-policia-cientifica-pr-perito-oficial-criminal-area-3-prova.pdf' },
      { label: 'Edital e publicações', url: 'https://www.policiacientifica.pr.gov.br/Pagina/Concurso-Publico-2024-Perito-Oficial-Criminal' },
    ],
    groups: {
      portuguese: '1-4', law: '5-13', logical: '14-18', computing: '19-23', legislation: '24-35', criminalistics: '36-40',
      evidence: '41-42 47 50 75', storage: '43-44 69-70', networks: '45-46 49 64', security: '48 54',
      systems: '51 55 65-66', image: '52-53 71-72', mobile: '56-58', cloud: '59-60',
      cryptography: '61-62 76-77', malware: '63', database: '67-68', blockchain: '73-74', techLaw: '78-80',
    },
  },
  {
    id: 'pr-2017', trail: 'pr', year: 2017, label: 'Área 1 · Computação · IBFC', basic: 35, total: 90,
    sources: [
      { label: 'Caderno (espelho)', url: 'https://arquivos.qconcursos.com/prova/arquivo_prova/53511/ibfc-2017-policia-cientifica-pr-perito-criminal-area-1-prova.pdf' },
      { label: 'Edital e publicações', url: 'https://www.policiacientifica.pr.gov.br/Pagina/Concurso-Publico-2017' },
    ],
    groups: {
      portuguese: '1-7', criminal: '8-14', administrative: '15-21', legislation: '22-28', criminalistics: '29-35',
      storage: '36-37 76', networks: '38-40 43-48 51-52 58-59 61 78-80', security: '41-42 49-50 53-57 60 67',
      image: '62-64', mobile: '65-66', cloud: '68', cryptography: '69-71', malware: '72-73',
      database: '74-75', systems: '77', techLaw: '81-90',
    },
  },
  {
    id: 'pf-2025', trail: 'pf', year: 2025, label: 'Área 3 · Informática Forense · Cebraspe', basic: 50, total: 120,
    sources: [
      { label: 'Caderno básico', url: pf2025 + 'prova-objetiva-2013-conhecimentos-basicos-para-todos-os-cargos-de-perito-criminal-federal.pdf' },
      { label: 'Caderno específico', url: pf2025 + 'prova-objetiva-2013-conhecimentos-especificos-2013-cargo-4.pdf' },
      { label: 'Edital atualizado', url: 'https://www.gov.br/pf/pt-br/acesso-a-informacao/servidores/concursos/edital/carreira-policial-2025/editais/edital-no-01_2025-dfp-pf-atualizado.pdf' },
    ],
    groups: {
      portuguese: '1-8', writing: '9-12', computing: '13-20', administrative: '21-24', constitutional: '25-28',
      criminal: '29-33', criminalistics: '34-39', humanRights: '40-45', logical: '46-50',
      systems: '51-53 95-101', storage: '54-56', database: '57-64', malware: '65-68', programming: '69-78',
      networks: '79-80 87-90', security: '81-84 91-92', cryptography: '85-86 93-94', techLaw: '102-103',
      ai: '104-105', evidence: '106-110 114-120', cloud: '111-113',
    },
  },
  {
    id: 'pf-2018', trail: 'pf', year: 2018, label: 'Área 3 · Informática · Cebraspe', basic: 50, total: 120,
    sources: [
      { label: 'Caderno básico', url: pf2018 + 'conhecimento-basico-cargo-2-todas-as-areas.pdf' },
      { label: 'Caderno específico', url: pf2018 + 'conhecimento-especifico-cargo-4-area-3.pdf' },
      { label: 'Edital de abertura', url: 'https://cdn.cebraspe.org.br/concursos/pf_18/arquivos/ED_1_DPF_2018___ABT.PDF' },
    ],
    groups: {
      portuguese: '1-12', administrative: '13-16', constitutional: '17-20', criminal: '21-25',
      legislation: '26-28', computing: '29-44', logical: '45-50',
      database: '51-60', storage: '61-64 66 97-99 109-111', systems: '65 67-68 70-73', evidence: '69',
      programming: '74-87', cloud: '88-89', networks: '90-96', malware: '100-102 112-114',
      security: '103-105 115-117', cryptography: '106-108 118-120',
    },
  },
];
