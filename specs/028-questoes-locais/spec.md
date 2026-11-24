# Questões locais

- **R1.** Confirmar as questões, os gabaritos e as pendências no banco usado pelo aplicativo. Disponibilizar na entrada Questões as cópias do Gran e as questões dos cadernos, com procedência, texto de apoio e opções. Manter Provas como atalho para o conjunto dos cadernos.
- **R2.** Permitir busca, paginação e filtros de disciplina, assunto, banca, origem e resposta. Mostrar anulação e gabarito ausente sem atribuir nota. Figuras externas mantêm link para consulta.
- **R3.** Corrigir pela alternativa da questão salva, após uma tentativa. Gravar acertos, erros, chutes e anotações localmente e integrar caderno de erros, flashcards e tempo de estudo. Reenvios preservam a tentativa original.
- **R4.** Incluir questões locais com disciplina e assunto compatíveis no treino de edital, nas revisões e nas lacunas de desempenho. Conservar os rótulos do Gran e usar apenas vínculos compatíveis com a taxonomia. A incidência por prova continua usando a amostra documentada de cadernos.
- **R5.** Usar a remoção reversível em unidade e lote para as cópias do Gran e manter suas tentativas anteriores. Deixar consulta online e importação de cadernos acessíveis.

## Aceite

1. A aplicação lista a coleção SQLite existente sem nova importação ou sessão do Gran (R1).
2. O navegador recebe uma página por vez, filtra pelo catálogo local e não recebe o gabarito antes da tentativa (R2, R3).
3. A mesma tentativa sobrevive à atualização da página, aparece no caderno de erros, permite anotar e pode originar um cartão. Uma questão sem gabarito ou anulada não gera tentativa corrigida (R3).
4. Match por disciplina e assunto oferece a questão em uma sessão do edital e registra desempenho sem atribuir a origem a outro concurso (R4).
5. Remoção esconde a questão da prática e restauração a recoloca com o histórico preservado (R5).

## Referências

- [Gran Questões — Questões, Provas e Desempenho](https://grancursosonline.zendesk.com/hc/pt-br/articles/21167529168795-Conhe%C3%A7a-as-funcionalidades-do-menu-principal-da-plataforma-do-Gran-Quest%C3%B5es)
- [Qconcursos — filtros de questões](https://suporte.qconcursos.com/pt-BR/articles/12118570-como-usar-os-filtros-de-questoes)
