import { historicalExams } from './exam-history.ts';
import { itemNumbers } from './overview.ts';
import type { Subject } from './overview.ts';
import { contestPath, taxonomyVersion, type ContestPath } from './contest-taxonomy.ts';

export const analysisVersion = taxonomyVersion;
// Content fingerprints do not change when the editorial hierarchy is revised.
export const fingerprintVersion = 'temas-1';
export interface ThemeClassification extends ContestPath {
  subject: Subject;
  area: string;
  version: string;
  reference: { examId: string; number: number };
}

// One principal study theme per item, reviewed against the local source cadernos.
// Ranges refer only to version A (PR 2024) or the unique version of the exam.
// These are subjects of historical questions, not assertions of current legal rules.
export const examThemes: Record<string, [theme: string, items: string][]> = {
  'pr-2024': [
    ['Ortografia e emprego dos porquês', '1'], ['Interpretação e inferência textual', '2'],
    ['Documentos e comunicações oficiais', '3'], ['Colocação pronominal', '4'],
    ['Corpo de delito e prova pericial', '5 12'], ['Cadeia de custódia no CPP', '6'],
    ['Impedimento e suspeição de peritos', '7'], ['Crimes contra a administração da justiça', '8'],
    ['Previdência dos servidores públicos', '9'], ['Execução penal e trabalho do preso', '10'],
    ['Patentes e propriedade industrial', '11'], ['Abuso de autoridade', '13'],
    ['Lógica proposicional e equivalências', '14-15'], ['Análise combinatória', '16'],
    ['Sequências e padrões', '17'], ['Silogismos e lógica de argumentação', '18'],
    ['Inteligência artificial e aprendizado de máquina', '19'], ['Hardware, memória e firmware', '20'],
    ['Internet, intranet e navegadores', '21'], ['Computação e armazenamento em nuvem', '22'],
    ['Segurança da informação e proteção contra ameaças', '23'],
    ['Carreira, direitos e deveres da Polícia Científica do PR', '24-26 29 35'],
    ['Organização e princípios da Polícia Científica do PR', '27-28 31'],
    ['Processo administrativo estadual', '30'], ['Autonomia das perícias oficiais', '32'],
    ['Políticas de segurança pública e SUSP', '33-34'],
    ['Fotografia e representação de imagens', '36-37'], ['Vestígios e princípios da criminalística', '38'],
    ['Local de crime: classificação e preservação', '39'], ['Traumatologia: lesões e instrumentos', '40'],
    ['Cadeia de custódia e preservação digital', '41-42'], ['Recuperação de arquivos e file carving', '43-44'],
    ['Camadas OSI/TCP-IP e protocolos de transporte', '45'], ['DNS e DNSSEC', '46'],
    ['Investigação de e-mails e páginas web', '47'], ['Injeção SQL', '48'], ['Análise de tráfego e protocolos', '49'],
    ['Logs, metadados e artefatos digitais', '50'], ['Linux: ferramentas e administração', '51'],
    ['Autenticidade e manipulação de imagens', '52'], ['Processamento digital de imagens', '53'],
    ['Ataques a aplicações e sessões web', '54'], ['Sistemas embarcados e IoT', '55'],
    ['Isolamento de dispositivos móveis', '56'], ['Aquisição e extração em dispositivos móveis', '57-58'],
    ['Perícia e coleta de evidências em nuvem', '59'], ['Modelos de serviço e características da nuvem', '60'],
    ['Criptografia simétrica e assimétrica', '61'], ['Quebra e recuperação de senhas', '62'],
    ['Tipos de malware e vetores de infecção', '63'], ['Antianálise e evasão de ambientes virtuais', '64'],
    ['Virtualização, emulação e contêineres', '65-66'], ['Modelagem relacional e chaves', '67'],
    ['SQL: consultas, definição e manipulação', '68'], ['Sistemas de arquivos e organização de mídias', '69-70'],
    ['Identificação de conteúdo ilícito em imagens', '71-72'], ['Aplicações descentralizadas e mineração', '73-74'],
    ['Princípios da investigação digital', '75'], ['Esteganografia e ocultação de vestígios', '76-77'],
    ['Lei de Acesso à Informação', '78'], ['Crimes informáticos', '79'], ['Marco Civil da Internet', '80'],
  ],
  'pr-2017': [
    ['Interpretação e inferência textual', '1-3 7'], ['Sintaxe e funções das orações', '4'],
    ['Coesão e relações de sentido', '5'], ['Pronomes relativos e regência', '6'],
    ['Infrações penais e teoria do crime', '8-11'], ['Crimes contra a pessoa', '12'],
    ['Crimes contra a administração da justiça', '13'], ['Inquérito policial e diligências', '14'],
    ['Agentes públicos e regime funcional', '15 20-21'], ['Improbidade administrativa', '16-18'],
    ['Responsabilidade civil do Estado', '19'], ['Direitos e garantias fundamentais', '22'],
    ['Tratados de direitos humanos', '23'], ['Direitos políticos e elegibilidade', '24'],
    ['ECA: direitos, adoção e medidas socioeducativas', '25-28'],
    ['Traumatologia: lesões e instrumentos', '29-32'], ['Asfixiologia forense', '33-35'],
    ['RAID e tolerância a falhas', '36'], ['Discos, partições e desempenho de mídias', '37 76'],
    ['Endereçamento IP, sub-redes e NAT', '38 47 80'], ['Correio eletrônico: SMTP, POP e IMAP', '39 46'],
    ['DNS e DNSSEC', '40 52'], ['Firewalls, proxies e filtragem de pacotes', '41 50 53-54'],
    ['Redes privadas virtuais (VPN)', '42'], ['Ethernet, topologias e comutação', '43 48 58'],
    ['Camadas OSI/TCP-IP e protocolos de transporte', '44-45 79'],
    ['Autenticação, autorização e senhas', '49 67'], ['DHCP e configuração de redes', '51'],
    ['Detecção e prevenção de intrusões', '55'], ['Negação de serviço (DoS/DDoS)', '56'], ['Injeção SQL', '57'],
    ['Redes sem fio e padrões IEEE 802.11', '59 78'], ['Segurança e ataques em redes Wi-Fi', '60'],
    ['Análise de tráfego e protocolos', '61'], ['Representação de cores e imagens', '62'],
    ['Processamento digital de imagens', '63-64'], ['Telefonia móvel e tecnologias de acesso', '65'],
    ['Isolamento de dispositivos móveis', '66'], ['Modelos de serviço e características da nuvem', '68'],
    ['Criptografia simétrica e assimétrica', '69 71'], ['Quebra e recuperação de senhas', '70'],
    ['Tipos de malware e vetores de infecção', '72-73'], ['Modelagem relacional e chaves', '74'],
    ['Normalização de bancos de dados', '75'], ['Linux: ferramentas e administração', '77'],
    ['Lei de Acesso à Informação', '81-84'], ['Marco Civil da Internet', '85-88'], ['Crimes informáticos', '89-90'],
  ],
  'pf-2025': [
    ['Tipologia e gêneros textuais', '1'], ['Interpretação e inferência textual', '2 5'],
    ['Concordância verbal e nominal', '3'], ['Sintaxe e funções das orações', '4'],
    ['Coesão e relações de sentido', '6'], ['Pontuação', '7'], ['Reescrita e preservação de sentido', '8'],
    ['Documentos e comunicações oficiais', '9-11'], ['Linguagem e atributos da redação oficial', '12'],
    ['Windows: arquivos e permissões', '13'], ['Planilhas e fórmulas no Excel', '14'],
    ['Mineração de dados e aprendizado de máquina', '15'], ['Big Data e conceitos de dados', '16'],
    ['Segurança da informação e proteção contra ameaças', '17'], ['Vulnerabilidades e ataques zero-day', '18'],
    ['Normalização de bancos de dados', '19'], ['Modelagem relacional e chaves', '20'],
    ['Organização administrativa e descentralização', '21-22'], ['Licitações e contratação direta', '23-24'],
    ['Segurança pública na Constituição', '25'], ['Direitos políticos e partidos', '26'],
    ['Direitos e garantias fundamentais', '27'], ['Poder Executivo e presidencialismo', '28'],
    ['Aplicação da lei penal no tempo e no espaço', '29-30'], ['Inquérito policial e diligências', '31'],
    ['Corpo de delito e prova pericial', '32'], ['Busca e apreensão', '33'],
    ['Cadeia de custódia no CPP', '34'], ['Vestígios e princípios da criminalística', '35-36'],
    ['Fotografia e representação de imagens', '37'], ['Balística e lesões por arma de fogo', '38'],
    ['Local de crime: classificação e preservação', '39'], ['Proteção internacional dos refugiados', '40'],
    ['Tratamento de pessoas presas', '41'], ['Hierarquia dos tratados de direitos humanos', '42'],
    ['Direitos humanos das mulheres', '43'], ['Sistema interamericano de direitos humanos', '44-45'],
    ['Conjuntos e problemas aritméticos', '46'], ['Silogismos e lógica de argumentação', '47-48 50'],
    ['Lógica proposicional e equivalências', '49'], ['Virtualização, emulação e contêineres', '51'],
    ['Arquitetura, processadores e memória', '52-53'], ['Sistemas de arquivos: NTFS, FAT, Ext e APFS', '54-55'],
    ['RAID e tolerância a falhas', '56'], ['Dados multidimensionais e consultas analíticas', '57'],
    ['Modelagem relacional e chaves', '58'], ['SGBDs e controle de acesso', '59'],
    ['Transações, recuperação e propriedades ACID', '60'], ['SQL: consultas, definição e manipulação', '61'],
    ['NoSQL e bancos distribuídos', '62-64'], ['Engenharia reversa e análise de malware', '65-66 68'],
    ['Sandbox e análise dinâmica', '67'], ['Tipos de dados e estruturas básicas', '69 71'],
    ['Orientação a objetos e herança', '70'], ['Java, JVM e portabilidade', '72'],
    ['JavaScript e desenvolvimento web', '73'], ['APIs REST e GraphQL', '74-75'],
    ['Pilhas, filas e recursão', '76'], ['Qualidade de código e SonarQube', '77'], ['Complexidade de algoritmos', '78'],
    ['Camadas OSI/TCP-IP e protocolos de transporte', '79'], ['SSH e acesso remoto', '80'],
    ['Injeção SQL', '81-82'], ['Autenticação, autorização e senhas', '83-84'],
    ['Esteganografia e ocultação de vestígios', '85-86'], ['Endereçamento IP, sub-redes e NAT', '87-88'],
    ['DNS e DNSSEC', '89-90'], ['Segurança e ataques em redes Wi-Fi', '91-92'],
    ['Troca de chaves, certificados e assinaturas', '93'], ['Criptografia simétrica e assimétrica', '94'],
    ['Windows Server: serviços e segurança', '95-96'], ['Linux: ferramentas e administração', '97-99'],
    ['Segurança de Android e iOS', '100-101'], ['Licitações e contratação direta', '102'],
    ['Marco Civil da Internet', '103'], ['IA generativa, deepfakes e modelos de linguagem', '104-105'],
    ['Limites e fontes da extração de vestígios', '106 116'], ['Cadeia de custódia e preservação digital', '107-108 118'],
    ['Logs, metadados e artefatos digitais', '109-110 114-115 117'],
    ['Perícia e coleta de evidências em nuvem', '111-113'], ['Aquisição, imagens forenses e integridade', '119'],
    ['Perícia em máquinas virtuais', '120'],
  ],
  'pf-2018': [
    ['Interpretação e inferência textual', '1-4'], ['Documentos e comunicações oficiais', '5'],
    ['Colocação pronominal', '6'], ['Concordância verbal e nominal', '7'],
    ['Reescrita e preservação de sentido', '8-10'], ['Pontuação', '11'], ['Pronomes relativos e regência', '12'],
    ['Responsabilidade civil do Estado', '13-14'], ['Licitações e contratação direta', '15-16'],
    ['Estado de defesa e estado de sítio', '17-18'], ['Direitos e garantias fundamentais', '19'],
    ['Nacionalidade e cargos privativos', '20'], ['Infrações penais e teoria do crime', '21-22'],
    ['Busca e apreensão', '23'], ['Corpo de delito e prova pericial', '24'], ['Prisão em flagrante', '25'],
    ['Lei de Drogas', '26'], ['Estatuto do Desarmamento', '27'], ['Controle de produtos químicos', '28'],
    ['Linux: arquivos e comandos', '29'], ['Windows: arquivos e permissões', '30'],
    ['Internet, intranet e navegadores', '31-32'], ['Edição de textos no Word', '33'],
    ['Planilhas e fórmulas no Excel', '34'], ['Redes locais e Wi-Fi', '35'],
    ['Malware e segurança de redes', '36-37'], ['Computação e armazenamento em nuvem', '38'],
    ['Big Data e conceitos de dados', '39'], ['Modelagem relacional e chaves', '40'],
    ['Mineração de dados e aprendizado de máquina', '41-42'], ['Programação em R e Python', '43-44'],
    ['Silogismos e lógica de argumentação', '45-47'], ['Probabilidade', '48'],
    ['Conjuntos e problemas aritméticos', '49'], ['Análise combinatória', '50'],
    ['Normalização de bancos de dados', '51'], ['Modelagem relacional e chaves', '52 57'],
    ['SQL: consultas, definição e manipulação', '53-54'], ['Transações, recuperação e propriedades ACID', '55-56'],
    ['NoSQL e bancos distribuídos', '58-60'], ['Sistemas de arquivos: NTFS, FAT, Ext e APFS', '61-64'],
    ['Arquitetura, processadores e memória', '65 67-68'], ['Discos, partições e desempenho de mídias', '66'],
    ['Recuperação de arquivos e file carving', '69'], ['Windows: registro e artefatos do sistema', '70'],
    ['Virtualização, emulação e contêineres', '71 73'], ['Processos e escalonamento', '72'],
    ['Grafos: graus, ciclos e caminhos', '74-76'], ['Estruturas de controle e laços', '77-79'],
    ['Complexidade de algoritmos', '80-83'], ['Expressões regulares', '84-87'],
    ['Modelos de serviço e características da nuvem', '88-89'], ['Redes P2P e tabelas distribuídas', '90-92'],
    ['DNS e DNSSEC', '93-96'], ['Backup e redes de armazenamento SAN', '97-99'],
    ['Engenharia reversa e análise de malware', '100-102'], ['Injeção SQL', '103'],
    ['Ataques a aplicações e sessões web', '104-105'], ['Troca de chaves, certificados e assinaturas', '106-108'],
    ['RAID e tolerância a falhas', '109-111'], ['Tipos de malware e vetores de infecção', '112-114'],
    ['Segurança e ataques em redes Wi-Fi', '115-117'], ['Criptografia simétrica e assimétrica', '118-120'],
  ],
};

export function referenceTheme(examId: string, number: number): ThemeClassification | undefined {
  const exam = historicalExams.find(row => row.id === examId);
  const originalSubject = Object.entries(exam?.groups ?? {}).find(([, range]) => itemNumbers(range!).includes(number))?.[0] as Subject | undefined;
  const label = examThemes[examId]?.find(([, range]) => itemNumbers(range).includes(number))?.[0];
  const path = label ? contestPath(label, examId, number) : undefined;
  if (!originalSubject || !path) return undefined;
  return { ...path, subject: originalSubject, area: path.discipline, version: analysisVersion,
    reference: { examId, number } };
}
