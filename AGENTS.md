# ConcurserO

- Produto 100% voltado a concursos: facilitar o estudo e aumentar o desempenho com o tempo disponível. Usar convenções reconhecidas em plataformas de concursos, pesquisando referências antes de criar categorias ou fluxos próprios.
- Taxonomia: disciplina → assunto → subassunto. Concurso/cargo/área e bloco da prova são dimensões separadas. Seguir nomenclatura familiar do mercado, aceitar aliases e preservar nomes originais; não promover um assunto técnico a disciplina nem copiar classificações externas sem conferir o conteúdo e o contexto.
- O edital de destino é a base do plano. Priorizar com evidência de incidência da banca/cargo/área, pesos do edital e lacunas de desempenho quando esses dados estiverem disponíveis. Explicitar amostra e cobertura; baixa frequência histórica não autoriza excluir conteúdo do edital. Não apresentar incidência isolada como previsão ou otimização completa do estudo.

- UI/UX segue KISS e minimalismo: cada tela deve deixar claro o objetivo, a ação principal e o próximo passo, com o mínimo de texto e controles. Detalhes de extração, OCR e edição individual ficam em opções recolhidas.
- Importar um caderno significa disponibilizar suas questões e incluí-las nas análises. Sem gabarito, as questões continuam visíveis com pendência explícita, sem correção ou nota.
- Com gabarito, oferecer “Salvar todas as questões”. Classificação e vínculo aos assuntos devem ser automáticos quando conhecidos; falta de classificação não deve exigir trabalho item a item para começar.
- Ao pedir edital, explicar em uma frase que ele define os assuntos do plano e qual é o próximo passo após importar.
- Preservar procedência, versões e histórico; permitir correção com o gabarito preliminar da própria prova, identificado como preliminar, sem confirmação extra. Nunca aplicar gabarito de outra prova nem apresentar preliminar como definitivo. Conteúdo não corrigível continua visível com sua pendência.
- Antes do código, atualizar especificação, plano e tarefas conforme `.specify/memory/constitution.md`.

- Aplicar KISS ao código e às funcionalidades. Reutilizar componentes e fluxos existentes quando fizer sentido. Agrupar ações relacionadas e evitar criar uma nova área na tela para cada funcionalidade.
- Conteúdo adicionado deve oferecer remoção por unidade e em lote. Usar a mesma seleção e confirmação nas coleções, preservando o histórico aplicável.
