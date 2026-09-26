/**
 * Sparkin Hub - Intelligent Free Meeting Analyzer
 *
 * Runs 100% client-side or server-side without external API keys or paid AI tokens.
 * Extracts:
 *  - 📌 Tema e Resumo Executivo
 *  - 💬 Tópicos Principais Discutidos
 *  - 👤 O que fica a cargo do Cliente
 *  - 🛠️ O que fica a cargo da Equipe / Meu Cargo
 *  - 📋 Sugestões de Demandas acionáveis com briefing estruturado completo
 */

export interface MeetingAnalysisResult {
  title: string;
  summary_markdown: string;
  summary_lines: string[];
  topics: string[];
  client_action_items: string[];
  team_action_items: string[];
  suggestions: Array<{
    suggested_title: string;
    suggested_description: string;
    suggested_type: "NOVA_DEMANDA" | "AJUSTE_DEMANDA";
    estimated_hours: number;
    target_demand_id?: string | null;
  }>;
}

export function generateStructuredMeetingAnalysis(
  rawTranscript: string,
  options?: {
    title?: string;
    clientName?: string;
    userName?: string;
  }
): MeetingAnalysisResult {
  const text = (rawTranscript || "").trim();
  const clientName = options?.clientName || "Cliente";
  const userName = options?.userName || "Equipe";
  const baseTitle = options?.title?.trim() || "Alinhamento de Reunião";

  if (!text) {
    return {
      title: baseTitle,
      summary_markdown: `# 📌 Tema: ${baseTitle}\n\n*Nenhum áudio ou transcrição registrada para esta reunião.*`,
      summary_lines: ["Nenhum áudio gravado."],
      topics: [],
      client_action_items: [],
      team_action_items: [],
      suggestions: [],
    };
  }

  // Split into lines/sentences
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Group sentences for analysis
  const allSentences: string[] = [];
  for (const line of lines) {
    // Strip speaker labels like "[Eu]:" or "[Cliente]:" for sentence splitting if present
    const cleaned = line.replace(/^\[[^\]]+\]:\s*/, "");
    const parts = cleaned.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter((p) => p.length > 10);
    if (parts.length > 0) {
      allSentences.push(...parts);
    } else if (cleaned.length > 5) {
      allSentences.push(cleaned);
    }
  }

  // 1. Detect Topics
  const topicKeywords: Record<string, string[]> = {
    "Design & Identidade Visual": ["design", "logo", "marca", "cor", "paleta", "layout", "visual", "artes", "banner", "criativo", "post", "feed", "carrossel"],
    "Landing Page & Desenvolvimento Web": ["landing page", "site", "página", "web", "layout", "wordpress", "elementor", "botão", "responsivo", "carregamento", "hospedagem", "domínio"],
    "Tráfego Pago & Campanhas": ["tráfego", "campanha", "anúncio", "meta ads", "google ads", "orçamento", "verba", "cpa", "cpc", "pixel", "leads", "conversão"],
    "Automação & CRM": ["automação", "crm", "funil", "whatsapp", "disparo", "e-mail", "lead", "integração", "webhook", "tag"],
    "Conteúdo & Redes Sociais": ["conteúdo", "roteiro", "vídeo", "reels", "stories", "tiktok", "copy", "redação", "legenda", "calendário"],
    "Estratégia & Metas Comerciais": ["estratégia", "vendas", "meta", "faturamento", "cliente", "onboarding", "reunião", "proposta", "contrato"],
  };

  const detectedTopicNames = new Set<string>();
  const lowerText = text.toLowerCase();

  for (const [topicName, keywords] of Object.entries(topicKeywords)) {
    const matched = keywords.filter((k) => lowerText.includes(k));
    if (matched.length >= 2 || (matched.length >= 1 && lowerText.split(matched[0]).length > 2)) {
      detectedTopicNames.add(topicName);
    }
  }

  if (detectedTopicNames.size === 0) {
    detectedTopicNames.add("Alinhamento Geral de Projeto");
  }

  const topicsList = Array.from(detectedTopicNames);

  // 2. Detect Action Items: Client vs Team
  const clientActionItems: string[] = [];
  const teamActionItems: string[] = [];

  const clientTriggers = [
    "cliente", "você me envia", "você envia", "me mandar", "mandar o", "mandar a", "enviar o", "enviar a",
    "aprovar", "validação", "feedback", "acesso", "senha", "link do", "material", "fotos", "vídeos do cliente",
    "aguardo seu", "aguardo sua", "você vai ver", "você vai falar com", "autorizar"
  ];

  const teamTriggers = [
    "vou fazer", "vou criar", "vamos fazer", "vamos criar", "vou ajustar", "vamos ajustar", "vou enviar",
    "vamos enviar", "minha parte", "nossa parte", "desenvolver", "implementar", "programar", "configurar",
    "entregar até", "vou subir", "vamos rodar", "vou revisar", "vou montar", "preparar a apresentação"
  ];

  for (const sentence of allSentences) {
    const sLower = sentence.toLowerCase();
    const isClient = clientTriggers.some((t) => sLower.includes(t));
    const isTeam = teamTriggers.some((t) => sLower.includes(t));

    if (isClient && !clientActionItems.includes(sentence) && clientActionItems.length < 6) {
      clientActionItems.push(sentence);
    } else if (isTeam && !teamActionItems.includes(sentence) && teamActionItems.length < 8) {
      teamActionItems.push(sentence);
    }
  }

  // Fallbacks if not enough explicit triggers were found in raw speech
  if (clientActionItems.length === 0) {
    clientActionItems.push(
      `Enviar materiais, acessos e referências pendentes para a continuidade das entregas.`,
      `Validar e aprovar os alinhamentos e prazos discutidos nesta reunião.`
    );
  }

  if (teamActionItems.length === 0) {
    teamActionItems.push(
      `Estruturar e executar os pontos alinhados com foco nas prioridades discutidas.`,
      `Acompanhar o cronograma de entrega e manter o ${clientName} atualizado.`
    );
  }

  // 3. Generate Structured Demand Suggestions with Rich Briefing
  const suggestions: MeetingAnalysisResult["suggestions"] = [];

  // Create suggestions based on topics or specific team action items
  topicsList.forEach((topic, idx) => {
    let demandTitle = "";
    let estimatedHours = 3.0;
    let scopeItems: string[] = [];
    let objective = "";
    let visualDirection = "Manter alinhamento com a identidade visual da marca e referências aprovadas.";
    let technicalReqs = "Garantir compatibilidade e revisão antes da apresentação.";

    if (topic.includes("Design")) {
      demandTitle = `Desenvolvimento de Peças Visuais & Design - ${clientName}`;
      estimatedHours = 4.0;
      objective = `Criar os materiais de design e criativos alinhados na reunião para fortalecer o posicionamento do cliente.`;
      scopeItems = [
        "Definição da linha visual e paleta de cores",
        "Desenvolvimento dos criativos/peças principais",
        "Exportação nos formatos adequados para os canais oficiais",
      ];
    } else if (topic.includes("Landing Page") || topic.includes("Desenvolvimento")) {
      demandTitle = `Estruturação & Ajustes de Landing Page - ${clientName}`;
      estimatedHours = 6.0;
      objective = `Construir ou otimizar a página de conversão com layout focado em alta taxa de conversão e responsividade.`;
      scopeItems = [
        "Revisão de seções da página e hierarquia visual",
        "Implementação de chamadas para ação (CTAs) estratégicas",
        "Otimização de velocidade e testes em dispositivos móveis",
      ];
      technicalReqs = "Integração com analytics, tags de conversão e formulários ativos.";
    } else if (topic.includes("Tráfego")) {
      demandTitle = `Configuração & Gestão de Campanhas de Tráfego - ${clientName}`;
      estimatedHours = 3.5;
      objective = `Configurar e veicular as campanhas de anúncios com foco nos objetivos de captação e conversão alinhados.`;
      scopeItems = [
        "Configuração dos públicos-alvo e segmentação",
        "Subida dos anúncios com copies e criativos aprovados",
        "Definição de metas de conversão e acompanhamento de métricas",
      ];
    } else if (topic.includes("Automação")) {
      demandTitle = `Implementação de Automação & Fluxos - ${clientName}`;
      estimatedHours = 4.0;
      objective = `Desenvolver a automação de mensagens e comunicação integrada com a base de leads.`;
      scopeItems = [
        "Mapeamento das etapas do funil de atendimento",
        "Configuração dos gatilhos de envio de mensagens",
        "Testes de validação de fluxo e resposta",
      ];
    } else if (topic.includes("Conteúdo")) {
      demandTitle = `Produção de Conteúdos & Roteiros - ${clientName}`;
      estimatedHours = 3.0;
      objective = `Elaborar o cronograma de conteúdo e roteiros estratégicos alinhados na reunião.`;
      scopeItems = [
        "Pesquisa de tópicos de interesse e ganchos de retenção",
        "Redação dos roteiros e orientações de gravação",
        "Revisão e envio para aprovação prévia",
      ];
    } else {
      demandTitle = `Execução de Alinhamentos da Reunião - ${clientName}`;
      estimatedHours = 2.5;
      objective = `Executar os pontos acordados durante a reunião com o cliente.`;
      scopeItems = [
        "Mapeamento de tarefas prioritárias",
        "Execução dos entregáveis combinados",
        "Envio de feedback e status de conclusão",
      ];
    }

    // Attach any specific team action item if available
    const specificItem = teamActionItems[idx] || teamActionItems[0];
    if (specificItem && !scopeItems.includes(specificItem)) {
      scopeItems.push(specificItem);
    }

    const descriptionMarkdown = [
      `### 🎯 Objetivo & Assunto Geral`,
      `${objective}`,
      ``,
      `### 📦 Escopo & Entregáveis`,
      ...scopeItems.map((item) => `- ${item}`),
      ``,
      `### 🎨 Direção Visual & Referências`,
      `${visualDirection}`,
      ``,
      `### ⚙️ Requisitos Técnicos & Observações`,
      `${technicalReqs}`,
      ``,
      `### 📅 Prazo Sugerido`,
      `Definir conforme cronograma de prioridades do cliente (estimativa: ~${estimatedHours}h úteis).`,
    ].join("\n");

    suggestions.push({
      suggested_title: demandTitle,
      suggested_description: descriptionMarkdown,
      suggested_type: "NOVA_DEMANDA",
      estimated_hours: estimatedHours,
    });
  });

  // 4. Build Rich Executive Markdown Minutes (Ata de Reunião)
  const summaryMarkdown = [
    `# 📌 Tema: ${baseTitle}`,
    ``,
    `### 📑 Resumo Executivo`,
    `Reunião realizada com foco em **${topicsList.join(", ")}**. Foram estabelecidas as prioridades imediatas entre **${userName}** e **${clientName}**, definindo as responsabilidades de cada parte para garantir o fluxo contínuo do projeto sem impedimentos.`,
    ``,
    `### 💬 Tópicos Principais Discutidos`,
    ...topicsList.map((topic) => `- **${topic}**: Alinhamento de escopo, expectativas e entregas necessárias para os próximos ciclos.`),
    ``,
    `### 👤 O que fica a cargo do Cliente (${clientName})`,
    ...clientActionItems.map((item) => `- 📋 ${item}`),
    ``,
    `### 🛠️ O que fica a cargo da Equipe (${userName})`,
    ...teamActionItems.map((item) => `- 🚀 ${item}`),
    ``,
    `### 🎯 Decisões & Alinhamentos Chave`,
    `- As ações acordadas seguem o cronograma de entregas estabelecido.`,
    `- Quaisquer dúvidas ou bloqueios serão reportados imediatamente para rápido destravamento.`,
  ].join("\n");

  const summaryLines = [
    `📌 Tema: ${baseTitle}`,
    `📑 Resumo: ${topicsList.join(", ")}`,
    `👤 A cargo do Cliente: ${clientActionItems.length} itens identificados`,
    `🛠️ A cargo da Equipe: ${teamActionItems.length} itens identificados`,
  ];

  return {
    title: baseTitle,
    summary_markdown: summaryMarkdown,
    summary_lines: summaryLines,
    topics: topicsList,
    client_action_items: clientActionItems,
    team_action_items: teamActionItems,
    suggestions,
  };
}
