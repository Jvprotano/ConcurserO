# Plano

- Consultar no SQLite os identificadores e títulos ativos pelo `topicId` persistido no documento do resumo, ordenados pela atualização. Reutilizar os dados e o formato atuais.
- Mostrar links junto ao atalho de criação na sessão, respeitando o momento de consulta das referências. Atualizar a lista na abertura, no foco da janela e ao receber aviso de mudança da biblioteca por `BroadcastChannel`.
- Abrir pelo identificador na tela Resumos, reaproveitando a biblioteca e o editor existentes.
- Validar filtro pela API em banco isolado e percorrer o fluxo de estudo e retorno em Chromium.
