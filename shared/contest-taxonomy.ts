// Public contest platforms inform the vocabulary; the item mapping is editorial.
// See docs/padroes-de-concursos.md for sources, scope and divergences.
export const contestDisciplines = {
  portuguese: 'Português', writing: 'Redação Oficial', logical: 'Raciocínio Lógico',
  computing: 'Noções de Informática', administrative: 'Direito Administrativo',
  constitutional: 'Direito Constitucional', criminal: 'Direito Penal', procedure: 'Direito Processual Penal',
  stateLaw: 'Legislação Estadual', federalLaw: 'Legislação Federal', publicSafety: 'Segurança Pública',
  socialSecurity: 'Direito Previdenciário', business: 'Direito Empresarial', traffic: 'Legislação de Trânsito',
  children: 'Direito da Criança e do Adolescente', humanRights: 'Direitos Humanos',
  criminalistics: 'Criminalística', legalMedicine: 'Medicina Legal', networks: 'Redes de Computadores',
  security: 'Segurança da Informação', systems: 'Sistemas Operacionais', architecture: 'Arquitetura de Computadores',
  database: 'Banco de Dados', programming: 'Programação', algorithms: 'Algoritmos e Estrutura de Dados',
  software: 'Engenharia de Software', digitalLaw: 'Direito Digital',
} as const;
export type ContestDiscipline = keyof typeof contestDisciplines;
export const taxonomyVersion = 'concursos-2';
const slug = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export interface ContestPath {
  disciplineId: ContestDiscipline;
  discipline: string;
  topicId: string;
  topic: string;
  id: string;
  label: string;
}

type Group = [ContestDiscipline, string, string[]];
const groups: Group[] = [
  ['portuguese', 'Interpretação de Textos', ['Interpretação e inferência textual', 'Tipologia e gêneros textuais', 'Coesão e relações de sentido', 'Reescrita e preservação de sentido']],
  ['portuguese', 'Ortografia', ['Ortografia e emprego dos porquês']],
  ['portuguese', 'Morfologia', ['Colocação pronominal']],
  ['portuguese', 'Sintaxe', ['Concordância verbal e nominal', 'Sintaxe e funções das orações', 'Pronomes relativos e regência']],
  ['portuguese', 'Pontuação', ['Pontuação']],
  ['writing', 'Documentos Oficiais', ['Documentos e comunicações oficiais']],
  ['writing', 'Características da Redação Oficial', ['Linguagem e atributos da redação oficial']],
  ['logical', 'Lógica Proposicional', ['Lógica proposicional e equivalências']],
  ['logical', 'Lógica de Argumentação', ['Silogismos e lógica de argumentação']],
  ['logical', 'Análise Combinatória e Probabilidade', ['Análise combinatória', 'Probabilidade']],
  ['logical', 'Sequências Lógicas', ['Sequências e padrões']],
  ['logical', 'Conjuntos e Problemas Matemáticos', ['Conjuntos e problemas aritméticos']],
  ['procedure', 'Provas no Processo Penal', ['Corpo de delito e prova pericial', 'Cadeia de custódia no CPP']],
  ['procedure', 'Sujeitos do Processo', ['Impedimento e suspeição de peritos']],
  ['procedure', 'Inquérito Policial', ['Inquérito policial e diligências']],
  ['procedure', 'Busca e Apreensão', ['Busca e apreensão']],
  ['procedure', 'Prisões', ['Prisão em flagrante']],
  ['criminal', 'Teoria do Crime', ['Infrações penais e teoria do crime', 'Aplicação da lei penal no tempo e no espaço']],
  ['criminal', 'Crimes contra a Administração da Justiça', ['Crimes contra a administração da justiça']],
  ['criminal', 'Crimes contra a Pessoa', ['Crimes contra a pessoa', 'Crimes informáticos']],
  ['criminal', 'Legislação Penal Especial', ['Abuso de autoridade', 'Execução penal e trabalho do preso', 'Lei de Drogas', 'Estatuto do Desarmamento']],
  ['administrative', 'Agentes Públicos', ['Agentes públicos e regime funcional']],
  ['administrative', 'Improbidade Administrativa', ['Improbidade administrativa']],
  ['administrative', 'Responsabilidade Civil do Estado', ['Responsabilidade civil do Estado']],
  ['administrative', 'Organização da Administração Pública', ['Organização administrativa e descentralização']],
  ['administrative', 'Licitações e Contratos Administrativos', ['Licitações e contratação direta']],
  ['constitutional', 'Direitos e Garantias Fundamentais', ['Direitos e garantias fundamentais', 'Nacionalidade e cargos privativos']],
  ['constitutional', 'Direitos Políticos', ['Direitos políticos e elegibilidade', 'Direitos políticos e partidos']],
  ['constitutional', 'Organização dos Poderes', ['Poder Executivo e presidencialismo']],
  ['constitutional', 'Defesa do Estado e das Instituições Democráticas', ['Estado de defesa e estado de sítio', 'Segurança pública na Constituição']],
  ['socialSecurity', 'Regime Próprio de Previdência Social', ['Previdência dos servidores públicos']],
  ['business', 'Propriedade Industrial', ['Patentes e propriedade industrial']],
  ['children', 'Estatuto da Criança e do Adolescente', ['ECA: direitos, adoção e medidas socioeducativas']],
  ['stateLaw', 'Legislação do Paraná', ['Carreira, direitos e deveres da Polícia Científica do PR', 'Organização e princípios da Polícia Científica do PR', 'Processo administrativo estadual']],
  ['federalLaw', 'Legislação das Perícias Oficiais', ['Autonomia das perícias oficiais']],
  ['federalLaw', 'Lei de Acesso à Informação', ['Lei de Acesso à Informação']],
  ['federalLaw', 'Controle de Produtos Químicos', ['Controle de produtos químicos']],
  ['publicSafety', 'Políticas de Segurança Pública', ['Políticas de segurança pública e SUSP']],
  ['humanRights', 'Proteção Internacional dos Direitos Humanos', ['Proteção internacional dos refugiados', 'Direitos humanos das mulheres', 'Tratamento de pessoas presas']],
  ['humanRights', 'Direitos Humanos no Ordenamento Nacional', ['Tratados de direitos humanos', 'Hierarquia dos tratados de direitos humanos']],
  ['humanRights', 'Sistema Interamericano de Direitos Humanos', ['Sistema interamericano de direitos humanos']],
  ['digitalLaw', 'Marco Civil da Internet', ['Marco Civil da Internet']],
  ['criminalistics', 'Vestígios de Interesse Forense', ['Vestígios e princípios da criminalística']],
  ['criminalistics', 'Fotografia Forense', ['Fotografia e representação de imagens']],
  ['criminalistics', 'Balística Forense', ['Balística e lesões por arma de fogo']],
  ['criminalistics', 'Locais de Crime', ['Local de crime: classificação e preservação']],
  ['criminalistics', 'Computação Forense', ['Cadeia de custódia e preservação digital', 'Recuperação de arquivos e file carving',
    'Aquisição, imagens forenses e integridade', 'Investigação de e-mails e páginas web', 'Logs, metadados e artefatos digitais',
    'Autenticidade e manipulação de imagens', 'Processamento digital de imagens', 'Representação de cores e imagens',
    'Identificação de conteúdo ilícito em imagens', 'Isolamento de dispositivos móveis', 'Aquisição e extração em dispositivos móveis',
    'Limites e fontes da extração de vestígios', 'Perícia e coleta de evidências em nuvem', 'Perícia em máquinas virtuais', 'Princípios da investigação digital']],
  ['legalMedicine', 'Traumatologia Forense', ['Traumatologia: lesões e instrumentos']],
  ['legalMedicine', 'Asfixiologia Forense', ['Asfixiologia forense']],
  ['computing', 'Inteligência Artificial', ['Inteligência artificial e aprendizado de máquina']],
  ['computing', 'Hardware e Software', ['Hardware, memória e firmware']],
  ['computing', 'Internet', ['Internet, intranet e navegadores', 'Computação e armazenamento em nuvem']],
  ['computing', 'Segurança da Informação', ['Segurança da informação e proteção contra ameaças', 'Malware e segurança de redes']],
  ['computing', 'Editores de Texto', ['Edição de textos no Word']],
  ['computing', 'Planilhas Eletrônicas', ['Planilhas e fórmulas no Excel']],
  ['computing', 'Sistemas Operacionais', ['Windows: arquivos e permissões', 'Linux: arquivos e comandos']],
  ['computing', 'Redes de Computadores', ['Redes locais e Wi-Fi']],
  ['architecture', 'Memórias e Processadores', ['Arquitetura, processadores e memória']],
  ['architecture', 'Dispositivos de Armazenamento', ['Discos, partições e desempenho de mídias']],
  ['systems', 'Sistemas de Arquivos', ['Sistemas de arquivos e organização de mídias', 'Sistemas de arquivos: NTFS, FAT, Ext e APFS']],
  ['systems', 'Linux', ['Linux: ferramentas e administração']],
  ['systems', 'Windows', ['Windows: registro e artefatos do sistema', 'Windows Server: serviços e segurança']],
  ['systems', 'Processos e Escalonamento', ['Processos e escalonamento']],
  ['systems', 'Virtualização', ['Virtualização, emulação e contêineres']],
  ['systems', 'Sistemas Embarcados', ['Sistemas embarcados e IoT']],
  ['systems', 'Sistemas Operacionais Móveis', ['Segurança de Android e iOS']],
  ['networks', 'Arquitetura TCP/IP', ['Camadas OSI/TCP-IP e protocolos de transporte']],
  ['networks', 'Protocolos de Rede', ['Correio eletrônico: SMTP, POP e IMAP', 'DHCP e configuração de redes', 'DNS e DNSSEC', 'SSH e acesso remoto', 'Análise de tráfego e protocolos']],
  ['networks', 'Endereçamento IP', ['Endereçamento IP, sub-redes e NAT']],
  ['networks', 'Redes Locais', ['Ethernet, topologias e comutação']],
  ['networks', 'Redes sem Fio', ['Redes sem fio e padrões IEEE 802.11', 'Telefonia móvel e tecnologias de acesso']],
  ['networks', 'Segurança de Redes', ['Redes privadas virtuais (VPN)', 'Segurança e ataques em redes Wi-Fi']],
  ['networks', 'Armazenamento de Dados em Redes', ['RAID e tolerância a falhas', 'Backup e redes de armazenamento SAN']],
  ['networks', 'Computação em Nuvem', ['Modelos de serviço e características da nuvem']],
  ['networks', 'Redes P2P', ['Redes P2P e tabelas distribuídas']],
  ['security', 'Criptografia', ['Criptografia simétrica e assimétrica', 'Troca de chaves, certificados e assinaturas', 'Esteganografia e ocultação de vestígios', 'Quebra e recuperação de senhas']],
  ['security', 'Ataques e Ameaças', ['Tipos de malware e vetores de infecção', 'Engenharia reversa e análise de malware', 'Sandbox e análise dinâmica', 'Antianálise e evasão de ambientes virtuais', 'Negação de serviço (DoS/DDoS)', 'Vulnerabilidades e ataques zero-day']],
  ['security', 'Segurança de Aplicações', ['Injeção SQL', 'Ataques a aplicações e sessões web']],
  ['security', 'Autenticação e Controle de Acesso', ['Autenticação, autorização e senhas']],
  ['security', 'Segurança de Redes', ['Firewalls, proxies e filtragem de pacotes', 'Detecção e prevenção de intrusões']],
  ['security', 'Blockchain', ['Aplicações descentralizadas e mineração']],
  ['database', 'Mineração de Dados', ['Mineração de dados e aprendizado de máquina']],
  ['database', 'Big Data', ['Big Data e conceitos de dados']],
  ['database', 'Modelagem de Dados', ['Modelagem relacional e chaves']],
  ['database', 'Normalização', ['Normalização de bancos de dados']],
  ['database', 'Bancos de Dados Multidimensionais', ['Dados multidimensionais e consultas analíticas']],
  ['database', 'Sistemas Gerenciadores de Bancos de Dados', ['SGBDs e controle de acesso']],
  ['database', 'Transações e Recuperação de Falhas', ['Transações, recuperação e propriedades ACID']],
  ['database', 'SQL', ['SQL: consultas, definição e manipulação']],
  ['database', 'NoSQL e Bancos Distribuídos', ['NoSQL e bancos distribuídos']],
  ['programming', 'Conceitos Básicos de Programação', ['Tipos de dados e estruturas básicas', 'Estruturas de controle e laços']],
  ['programming', 'Programação Orientada a Objetos', ['Orientação a objetos e herança']],
  ['programming', 'Linguagens de Programação', ['Java, JVM e portabilidade', 'Programação em R e Python', 'Expressões regulares']],
  ['programming', 'Desenvolvimento Web', ['JavaScript e desenvolvimento web', 'APIs REST e GraphQL']],
  ['algorithms', 'Estruturas de Dados', ['Pilhas, filas e recursão', 'Grafos: graus, ciclos e caminhos']],
  ['algorithms', 'Análise de Algoritmos', ['Complexidade de algoritmos']],
  ['software', 'Qualidade de Software', ['Qualidade de código e SonarQube']],
  ['software', 'Inteligência Artificial', ['IA generativa, deepfakes e modelos de linguagem']],
];
const paths = new Map<string, [ContestDiscipline, string]>();
for (const [discipline, topic, labels] of groups) for (const label of labels) {
  if (paths.has(label)) throw new Error('Subassunto duplicado na taxonomia: ' + label);
  paths.set(label, [discipline, topic]);
}

export function contestPath(label: string, examId: string, number: number): ContestPath | undefined {
  let path = paths.get(label);
  if (!path) return undefined;
  // The PR caderno assesses the technical items as forensic examinations. Preserve
  // that context instead of turning every forensic technique into a discipline.
  if (examId === 'pr-2024') {
    if (number >= 41 && number <= 77 && ![45, 58, 62].includes(number)) path = ['criminalistics', 'Computação Forense'];
    if (number === 25) path = ['criminalistics', 'A Perícia em Face da Legislação'];
    if (number === 12) path = ['traffic', 'Perícia em Acidentes de Trânsito'];
    if (number === 58) path = ['systems', 'Sistemas Operacionais Móveis'];
    if (number === 33) path = ['federalLaw', 'Sistema Único de Segurança Pública'];
    if (number === 12) label = 'Perícia em acidentes de trânsito e tacógrafos';
    if (number === 25) label = 'Prerrogativas dos peritos oficiais';
    if (number === 58) label = 'Aquisição forense em iOS';
  }
  if (examId === 'pf-2025') {
    if (number === 17) path = ['security', 'Segurança de Redes'];
    if (number === 53) path = ['systems', 'Gerência de Memória'];
    if (number === 110) path = ['computing', 'Internet'];
    if (number === 111) path = ['computing', 'Computação em Nuvem'];
    if (number === 82) { path = ['database', 'SQL']; label = 'Interpretação de consultas SQL em cenário de injeção'; }
    if (number === 89) { path = ['security', 'Criptografia']; label = 'Assinatura de chaves no DNSSEC'; }
    if (number === 90) label = 'Assinatura de registros no DNSSEC';
    if (number === 95) { path = ['networks', 'Segurança de Redes']; label = 'DNS sobre HTTPS (DoH)'; }
    if (number === 52) label = 'Memória flash';
    if (number === 53) label = 'Paginação e memória virtual';
    if (number === 110) label = 'Logs e registros de impressão';
    if (number === 111) label = 'Arquivos de configuração em nuvem';
  }
  if (examId === 'pr-2017' && number >= 62 && number <= 64) path = ['computing', 'Computação Gráfica'];
  const [disciplineId, topic] = path;
  const topicId = disciplineId + '/' + slug(topic);
  return { disciplineId, discipline: contestDisciplines[disciplineId], topicId, topic,
    id: topicId + '/' + slug(label), label };
}

const aliases = new Map(Object.values(contestDisciplines).map(label => [slug(label), label]));
for (const [alias, canonical] of [
  ['Língua Portuguesa', 'Português'], ['Informática', 'Noções de Informática'],
  ['Direito Empresarial (Comercial)', 'Direito Empresarial'],
  ['Raciocínio lógico e científico', 'Raciocínio Lógico'], ['Banco de dados', 'Banco de Dados'],
] as const) aliases.set(slug(alias), canonical);

export const normalizeDisciplineName = (value: string): string => aliases.get(slug(value)) ?? value;
