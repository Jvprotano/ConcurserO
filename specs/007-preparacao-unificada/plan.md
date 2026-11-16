# Plano

1. Migração SQLite aditiva: concursos acompanhados/prioridade, marcação de assuntos do edital e vínculos explícitos. Classificar demonstrações e assuntos automáticos de provas separadamente; preservar dados originais. Manter activeTrail somente como compatibilidade de API antiga.
2. Projeção pura compartilhada em shared: identidade conservadora de assunto, leitura/prática distintas, última tentativa por questão, cartões deduplicados e lacunas por edital ativo. Plano único usa a mesma correspondência, sem replicar eventos. RF-08: classificar conteúdo revisado da tentativa original e oferecer questões atuais pelo mesmo caminho canônico, sem regravar o vínculo pessoal.
3. API de cadastro/pausa/prioridade e vínculos; banco de questões sem parâmetro reúne concursos, com metadados de procedência. Parâmetro antigo continua suportado para análise de incidência e integrações existentes.
4. Remover seletor global. Hoje mostra cards de objetivos e atividades únicas; Concursos gerencia objetivos; edital/acervo/incidência possuem seletor local. Erros, cartões, questões e configurações globais. Equivalências ficam em detalhes dos assuntos.
5. Validar fluxo por API, projeções e migração em cópia do banco local; executar testes relevantes e build uma vez após conjunto de mudanças. Conferir interface em navegador se disponível.

Cobertura: T01 → RF-01/02/04/07; T02 → RF-03/04/05/06; T03 → RF-01/02/03/04/06/07; T04 → aceites 1–6.
