# Tarefas

- [x] **T01** Revisar os 410 itens e criar a taxonomia e o mapa editorial com fontes.
- [x] **T02** Projetar temas no banco de questões por conteúdo, preservando dados e histórico.
- [x] **T03** Implementar agregação temática, prioridades, cobertura, filtros e versão principal.
- [x] **T04** Atualizar visão geral e histórico com foco por tema e detalhes recolhidos.
- [x] **T05** Verificar aceites e compilar; registrar evidência e limitações da conferência visual.
- [x] **T06** Atualizar metodologia e instruções de uso.

## Evidência

- 29 testes aprovados, incluindo seis cenários novos de integridade do catálogo, classificação por conteúdo, média e ausência entre provas, filtros, versão incompleta, publicação em lote e preservação de vínculos/tentativas. TypeScript e build Vite aprovados.
- Cópia consistente do banco real, criada com a API de backup SQLite a partir de conexão somente leitura: Paraná tem 80 itens únicos e 80 detalhados; PF tem 240 únicos e 240 detalhados. Paraná continua com suas 240 apresentações A/B/C no banco de questões e apenas A na incidência. Nenhuma gravação no banco original.
- Português da PF: nove temas, com seis itens de interpretação, quatro de reescrita, dois de concordância e dois de pontuação, além dos demais. Redação oficial é normalizada em área própria, preservando os vínculos pessoais originais.
- HTTP em instância isolada: interface e APIs PR/PF respondem 200; classificação acompanha os itens e o banco de questões continua sem expor gabaritos. A navegação até as questões usa filtro temático compartilhado e tem sua seleção verificada em teste de integração.
- Conferência visual e cliques de ponta a ponta **pendentes**: o host de navegador estava indisponível, e a alternativa de controle nativo encerrou a sessão por não conseguir determinar a URL do Chrome com segurança. Não foi possível confirmar o layout renderizado nem clicar em “Ver questões deste tema”.
- Novas provas e conteúdos editados exigem ampliação/revisão do catálogo temático. Paraná 2017 tem 90 temas e páginas no histórico; assinaturas para importar esses itens ainda dependem de extração compatível. Não há IA externa, migração de dados nem reclassificação automática de tópicos pessoais.
