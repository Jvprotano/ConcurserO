# Recorte da IBFC pelas disciplinas do edital do Paraná

- **R1.** Por padrão, o script busca questões da IBFC nas disciplinas e nos assuntos legais associados ao edital de referência do Paraná de 2024, Área 3. A busca abrange todos os concursos, cargos, órgãos e anos da banca.
- **R2.** Usar os identificadores e os nomes do Gran, sem reclassificar as questões no plano do usuário. Considerar o identificador do assunto, sua disciplina raiz e seu pai quando o Gran os entregar. Recusar páginas com questões fora do recorte.
- **R3.** Manter a opção `-TodasDisciplinas` para a busca anterior por banca. Preservar a opção na retomada. Uma mudança de recorte recomeça na página 1.
- **R4.** Preservar a gravação offline, a deduplicação, a pausa configurável e a parada em HTTP 429.

## Aceite

1. O modo padrão envia a banca e os identificadores do edital em uma única busca paginada, sem parâmetros de cargo, órgão, ano, área ou prova (R1).
2. Duas questões de concursos diferentes e de disciplinas selecionadas podem ser salvas na mesma execução. A disciplina do Gran fica visível na prática offline (R1, R2).
3. Uma página de assunto diferente é recusada antes de gravar. `-TodasDisciplinas` omite o filtro de assunto (R2, R3).
4. A retomada usa o mesmo recorte, o mesmo tamanho e a mesma pausa (R3, R4).

## Referências

- [Edital 002/2024 da Polícia Científica do Paraná, Anexo IV](https://www.policiacientifica.pr.gov.br/sites/policia-cientifica/arquivos_restritos/files/documento/2024-09/edital_retificado.pdf)
- [Disciplinas do Gran](https://questoes.grancursosonline.com.br/disciplinas)
- [Legislação do Paraná no Gran](https://questoes.grancursosonline.com.br/questoes-de-concursos/legislacao-estadual-distrital-e-municipal-parana-pr-395526)
- [Leis federais no Gran](https://questoes.grancursosonline.com.br/legislacao-federal-2932)
