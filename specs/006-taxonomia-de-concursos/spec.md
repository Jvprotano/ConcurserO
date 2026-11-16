# Taxonomia e contexto de concursos

## Objetivo
Usar a organização reconhecida nas plataformas de concursos para facilitar a busca, a leitura do edital e a decisão sobre o que estudar. O produto é 100% voltado à preparação para concursos e à melhora de desempenho com o tempo disponível.

## Requisitos

- **RF-01** Separar concurso/cargo/área, bloco da prova, disciplina, assunto e subassunto. Substituir agrupamentos técnicos usados como disciplinas por disciplinas reconhecíveis no mercado. Exemplos: Português → Sintaxe → Concordância; Segurança da Informação → Criptografia → Criptografia simétrica e assimétrica; Criminalística → Computação Forense → Aquisição e preservação de evidências.
- **RF-02** Rever o mapa editorial dos 410 itens com essa hierarquia. Vocabulário de QConcursos, Gran e Tec é referência; não supor uma classificação universal nem forçar o encaixe de questões para reproduzir os totais de outro serviço. Registrar diferenças e suas razões. Manter o subassunto específico para direcionar o estudo.
- **RF-03** Usar a mesma classificação normalizada na visão geral, nos filtros de Questões e nos rótulos dos itens. Permitir filtrar por disciplina e assunto; detalhes individuais ficam recolhidos. Vínculos de estudo pessoais e nomes originais continuam preservados, disponíveis como classificação pessoal.
- **RF-03a** Ao salvar uma questão revisada que ainda não tem vínculo pessoal, criar/reutilizar o tópico com a disciplina canônica e o subassunto conhecido. Vínculos existentes continuam prioritários; não migrar automaticamente a organização pessoal.
- **RF-04** Permitir consultar disciplinas ou assuntos mais cobrados e chegar ao subassunto, com números, denominadores e fontes rastreáveis. Uma questão tem uma classificação principal e conta uma vez em cada nível; não somar disciplinas e assuntos como se fossem itens distintos.
- **RF-05** Manter classificação por conteúdo revisado, cobertura, pendências, seleção de versão, gabaritos e histórico. Versionar a taxonomia sem invalidar assinaturas de extração quando o conteúdo da questão não mudou. Questões ainda sem classificação revisada não ganham assunto específico por aproximação do nome.
- **RF-06** Registrar duravelmente a orientação do usuário em AGENTS.md, constituição e visão do produto. O edital de destino define o conteúdo; incidência por banca/cargo/área e desempenho são sinais para priorização, e a interface deve distinguir o que já calcula do que ainda falta. Não recomendar corte de conteúdo apenas por baixa frequência ou ausência em amostra pequena.

## Aceites

1. Criptografia, malware, nuvem e vestígios digitais deixam de ser disciplinas independentes; Penal e Processual Penal ficam separados. Todos os 410 itens têm disciplina, assunto e subassunto válidos (RF-01/02).
2. Escolher Segurança da Informação → Criptografia restringe o ranking e as questões ao mesmo conjunto. Escolher Criminalística → Computação Forense mantém os detalhes como cadeia de custódia, aquisição e artefatos digitais (RF-03/04).
3. Agregar qualquer nível não altera os totais únicos, e a consulta não muda tópicos, tentativas, revisões nem gabaritos. Novas versões da taxonomia mantêm a classificação por assinatura das 320 questões já importadas (RF-04/05).
4. Fontes, data da consulta, convenções adotadas e divergências editoriais estão documentadas, com objetivos e limites de priorização explícitos (RF-02/06).
