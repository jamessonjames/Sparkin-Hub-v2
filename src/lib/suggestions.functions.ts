import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createDemand, updateDemand } from "./demands.functions";

export type DemandSuggestionStatus = "pending" | "approved" | "dismissed";
export type SuggestionSource = "whatsapp" | "meeting" | "email";
export type SuggestedType = "NOVA_DEMANDA" | "AJUSTE_DEMANDA";

export interface DemandSuggestion {
  id: string;
  client_id: string;
  source: SuggestionSource;
  suggested_type: SuggestedType;
  target_demand_id?: string | null;
  suggested_title: string;
  suggested_description?: string | null;
  ai_summary?: string | null;
  raw_content?: string | null;
  audio_url?: string | null;
  estimated_hours?: number | null;
  status: DemandSuggestionStatus;
  created_at: string;
  updated_at: string;
  clients?: {
    id: string;
    name: string;
  } | null;
}

export interface CaptureSettings {
  id?: string;
  key?: string;
  scan_frequency: "manual" | "30m" | "1h" | "3h" | "daily";
  max_messages: number;
  ai_provider: "gemini" | "deepseek" | "ollama";
  api_key?: string | null;
  ollama_url?: string | null;
  enabled_clients: string[];
  last_scan_at?: string | null;
}

/**
 * Safely parses JSON strings returned by LLMs, repairing unescaped control characters inside string literals (e.g. raw newlines in markdown fields)
 */
function safeParseJSON(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    let inString = false;
    let isEscaped = false;
    let result = "";

    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      if (inString) {
        if (isEscaped) {
          result += char;
          isEscaped = false;
        } else if (char === "\\") {
          result += char;
          isEscaped = true;
        } else if (char === '"') {
          result += char;
          inString = false;
        } else if (char === "\n") {
          result += "\\n";
        } else if (char === "\r") {
          result += "\\r";
        } else if (char === "\t") {
          result += "\\t";
        } else {
          result += char;
        }
      } else {
        if (char === '"') {
          inString = true;
        }
        result += char;
      }
    }

    return JSON.parse(result);
  }
}

export const listSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(["pending", "approved", "dismissed"]).optional().default("pending"),
        clientId: z.string().uuid().optional(),
      })
      .optional()
      .parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("demand_suggestions")
      .select("*, clients(id, name)")
      .order("created_at", { ascending: false });

    if (data?.status) {
      query = query.eq("status", data.status);
    }
    if (data?.clientId) {
      query = query.eq("client_id", data.clientId);
    }

    const { data: suggestions, error } = await query;
    if (error) throw new Error(error.message);
    return (suggestions as any[] ?? []) as DemandSuggestion[];
  });

export const createSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        client_id: z.string().uuid(),
        source: z.enum(["whatsapp", "meeting", "email"]).default("whatsapp"),
        suggested_type: z.enum(["NOVA_DEMANDA", "AJUSTE_DEMANDA"]).default("NOVA_DEMANDA"),
        target_demand_id: z.string().uuid().optional().nullable(),
        suggested_title: z.string().min(1),
        suggested_description: z.string().optional().nullable(),
        ai_summary: z.string().optional().nullable(),
        raw_content: z.string().optional().nullable(),
        audio_url: z.string().optional().nullable(),
        estimated_hours: z.number().optional().default(1.0),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("demand_suggestions")
      .insert({
        client_id: data.client_id,
        source: data.source,
        suggested_type: data.suggested_type,
        target_demand_id: data.target_demand_id || null,
        suggested_title: data.suggested_title,
        suggested_description: data.suggested_description || null,
        ai_summary: data.ai_summary || null,
        raw_content: data.raw_content || null,
        audio_url: data.audio_url || null,
        estimated_hours: data.estimated_hours ?? 1.0,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return row as any as DemandSuggestion;
  });

export function markdownToHtml(markdown: string): string {
  if (!markdown) return "";

  // If already full HTML without markdown symbols, return as is
  if (/<(p|h1|h2|h3|h4|ul|ol|li|blockquote|div)[^>]*>/i.test(markdown) && !markdown.includes("###") && !markdown.includes("**")) {
    return markdown;
  }

  // Pre-process: split inline concatenated section markers like "🎯 **Objetivo:** text 📦 **Escopo:**" into separate lines
  let text = markdown
    .replace(/(🎯|📦|🎨|⚙️|📅|📌|📑|💬|📋)\s*\*\*/g, "\n\n$1 **")
    .replace(/(🎯|📦|🎨|⚙️|📅|📌|📑|💬|📋)\s*###/g, "\n\n### $1")
    .replace(/(🎯|📦|🎨|⚙️|📅|📌|📑|💬|📋)\s*<strong>/g, "\n\n$1 <strong>");

  const lines = text.split("\n");
  let htmlResult = "";
  let inList = false;

  for (let rawLine of lines) {
    let line = rawLine.trim();

    if (!line) {
      if (inList) {
        htmlResult += "</ul>";
        inList = false;
      }
      continue;
    }

    // Convert bold **text** to <strong>text</strong>
    line = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    // Convert italic *text* to <em>text</em>
    line = line.replace(/\*(.*?)\*/g, "<em>$1</em>");

    // Check for Heading syntax: ### Heading or ## Heading or # Heading
    if (line.startsWith("### ")) {
      if (inList) { htmlResult += "</ul>"; inList = false; }
      htmlResult += `<h3>${line.replace(/^###\s+/, "")}</h3>`;
    } else if (line.startsWith("## ")) {
      if (inList) { htmlResult += "</ul>"; inList = false; }
      htmlResult += `<h2>${line.replace(/^##\s+/, "")}</h2>`;
    } else if (line.startsWith("# ")) {
      if (inList) { htmlResult += "</ul>"; inList = false; }
      htmlResult += `<h1>${line.replace(/^#\s+/, "")}</h1>`;
    }
    // Check if line starts with an emoji or label like "🎯 <strong>Objetivo:</strong> ..."
    else if (/^(🎯|📦|🎨|⚙️|📅|📌|📑|💬|📋)\s*<strong>(.*?):?<\/strong>(.*)$/i.test(line)) {
      if (inList) { htmlResult += "</ul>"; inList = false; }
      const match = line.match(/^(🎯|📦|🎨|⚙️|📅|📌|📑|💬|📋)\s*<strong>(.*?):?<\/strong>(.*)$/i);
      if (match) {
        const emoji = match[1];
        const title = match[2].trim();
        const rest = match[3].trim();
        htmlResult += `<h3>${emoji} ${title}</h3>`;
        if (rest) {
          if (rest.startsWith("- ") || rest.startsWith("* ")) {
            htmlResult += `<ul><li>${rest.replace(/^[-*]\s+/, "")}</li></ul>`;
          } else {
            htmlResult += `<p>${rest}</p>`;
          }
        }
      } else {
        htmlResult += `<p>${line}</p>`;
      }
    }
    // Check for List item syntax: - Item or * Item
    else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        htmlResult += "<ul>";
        inList = true;
      }
      htmlResult += `<li>${line.replace(/^[-*]\s+/, "")}</li>`;
    }
    // Otherwise standard paragraph
    else {
      if (inList) {
        htmlResult += "</ul>";
        inList = false;
      }
      htmlResult += `<p>${line}</p>`;
    }
  }

  if (inList) {
    htmlResult += "</ul>";
  }

  return htmlResult;
}

export const approveSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().optional(),
        description: z.string().optional(),
        estimated_hours: z.number().optional(),
        assignee_user_id: z.string().uuid().optional().nullable(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    // 1. Fetch suggestion
    const { data: suggestion, error: fetchErr } = await context.supabase
      .from("demand_suggestions" as any)
      .select("*")
      .eq("id", data.id)
      .single();

    if (fetchErr || !(suggestion as any)) throw new Error("Sugestão não encontrada");

    const finalTitle = data.title || (suggestion as any).suggested_title;
    const rawDesc = data.description || (suggestion as any).suggested_description || "";
    const finalDesc = markdownToHtml(rawDesc);
    const finalHours = data.estimated_hours ?? Number((suggestion as any).estimated_hours || 1.0);

    if ((suggestion as any).suggested_type === "AJUSTE_DEMANDA" && (suggestion as any).target_demand_id) {
      // Move existing target demand to "com_ajustes" and append notes
      const { data: targetDemand } = await context.supabase
        .from("demands")
        .select("id, status, description, internal_notes")
        .eq("id", (suggestion as any).target_demand_id)
        .single();

      if (targetDemand) {
        const updatedNotes = `${targetDemand.internal_notes ? targetDemand.internal_notes + "\n\n" : ""}[Ajuste do WhatsApp/E-mail em ${new Date().toLocaleDateString("pt-BR")}]: ${finalDesc}`;
        
        await context.supabase
          .from("demands")
          .update({
            status: "com_ajustes",
            internal_notes: updatedNotes,
            is_manually_scheduled: false,
          })
          .eq("id", targetDemand.id);
      }
    } else {
      // Create new demand as rascunho (draft) for review
      await context.supabase.from("demands").insert({
        client_id: (suggestion as any).client_id,
        title: finalTitle,
        description: finalDesc,
        status: "rascunho",
        priority: "medium",
        estimated_hours: finalHours,
        assignee_user_id: data.assignee_user_id || context.userId,
        created_by_user_id: context.userId,
      });
    }

    // Mark suggestion as approved
    const { error: updateErr } = await context.supabase
      .from("demand_suggestions")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", data.id);

    if (updateErr) throw new Error(updateErr.message);
    return { ok: true };
  });

export const dismissSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("demand_suggestions")
      .update({ status: "dismissed", updated_at: new Date().toISOString() })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSuggestionPermanently = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("demand_suggestions")
      .delete()
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearAllDismissedSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { clientId?: string }) =>
    z.object({ clientId: z.string().uuid().optional() }).optional().parse(input)
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("demand_suggestions")
      .delete()
      .eq("status", "dismissed");

    if (data?.clientId) {
      query = query.eq("client_id", data.clientId);
    }

    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCaptureSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: row } = await context.supabase
      .from("capture_settings")
      .select("*")
      .eq("key", "global")
      .maybeSingle();

    if (!row) {
      const defaultSettings: CaptureSettings = {
        scan_frequency: "1h",
        max_messages: 30,
        ai_provider: "gemini",
        enabled_clients: [],
      };
      return defaultSettings;
    }

    return {
      ...row,
      enabled_clients: Array.isArray(row.enabled_clients) ? row.enabled_clients : [],
    } as CaptureSettings;
  });

export const updateCaptureSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        scan_frequency: z.enum(["manual", "30m", "1h", "3h", "daily"]).default("1h"),
        max_messages: z.number().int().min(5).max(100).default(30),
        ai_provider: z.enum(["gemini", "deepseek", "ollama"]).default("gemini"),
        api_key: z.string().optional().nullable(),
        ollama_url: z.string().optional().nullable(),
        enabled_clients: z.array(z.string()).default([]),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("capture_settings" as any).upsert(
      {
        key: "global",
        scan_frequency: data.scan_frequency,
        max_messages: data.max_messages,
        ai_provider: data.ai_provider,
        api_key: data.api_key || null,
        ollama_url: data.ollama_url || null,
        enabled_clients: data.enabled_clients,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const triggerWhatsAppScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const nowISO = new Date().toISOString();
    await context.supabase.from("capture_settings" as any).upsert(
      {
        key: "global",
        last_scan_at: nowISO,
        updated_at: nowISO,
      },
      { onConflict: "key" }
    );

    return { ok: true, timestamp: nowISO };
  });

export const analyzeMeetingTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        title: z.string().optional(),
        transcript: z.string().optional(),
        clientApiKey: z.string().optional(),
        existingSuggestionId: z.string().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { clientId, title, transcript = "", clientApiKey, existingSuggestionId } = data;

    // 1. Fetch active demands for this client to match existing items vs new ones
    const { data: existingDemands } = await context.supabase
      .from("demands")
      .select("id, title, description, status")
      .eq("client_id", clientId)
      .neq("status", "concluido");

    const demandsContext = (existingDemands || []).map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description || "",
      status: d.status,
    }));

    // Fetch client name for diarization
    const { data: clientData } = await context.supabase
      .from("clients")
      .select("name")
      .eq("id", clientId)
      .maybeSingle();
    const clientName = clientData?.name || "Cliente";

    // Fetch user profile name for diarization
    const { data: profileData } = await context.supabase
      .from("profiles")
      .select("name")
      .eq("id", context.userId)
      .maybeSingle();
    const userName = profileData?.name || "Eu";

    // 2. Perform AI analysis using Gemini 1.5 Flash (Audio + Text Multimodal)
    let aiSummary: string[] = [];
    let aiDiarizedTranscript = "";
    let aiSuggestions: Array<{
      suggested_type: "NOVA_DEMANDA" | "AJUSTE_DEMANDA";
      target_demand_id?: string | null;
      suggested_title: string;
      suggested_description: string;
      estimated_hours: number;
    }> = [];

    let apiErrors: string[] = [];
    try {
      const rawApiKey = process.env.GEMINI_API_KEY || clientApiKey || "";
      const apiKey = rawApiKey.replace(/^["']|["']$/g, "").trim();
      if (apiKey) {
        const promptText = `Você é um analista de projetos sênior e gerente de produto em uma agência de tecnologia e marketing. Sua função é analisar detalhadamente reuniões com clientes e produzir:
1. Uma **Ata de Reunião Profissional e Completa** (Resumo Executivo).
2. **Sugestões de Demandas Estruturadas** com briefings detalhados e acionáveis.

Reunião entre: [${userName} (Eu/Agência)] e [${clientName} (Cliente)]
Título da reunião: ${title || "Alinhamento de Projeto"}

DEMANDAS EXISTENTES DO CLIENTE (para referência):
${JSON.stringify(demandsContext, null, 2)}

TRANSCRIÇÃO COMPLETA DA REUNIÃO:
${transcript}

Com base na transcrição acima, gere uma análise no formato JSON exato abaixo.

---

### INSTRUÇÕES DE FORMATAÇÃO DO SUMMARY (ATA DA REUNIÃO):
Gere um texto corrido em Markdown extremamente rico, profissional, dividido em seções bem claras com emojis e títulos. O resumo DEVE seguir exatamente a estrutura abaixo:

# 📌 Tema: [Assunto Principal da Reunião]

### 📑 Resumo Executivo
[Um texto descritivo detalhando o contexto geral da reunião, o estado do projeto e os objetivos alinhados]

### 💬 Tópicos Discutidos
- **[Tópico 1]**: [Detalhamento do que foi discutido, argumentos, dúvidas trazidas e explicações]
- **[Tópico 2]**: [Detalhamento de outro ponto relevante discutido]
- **[Tópico N]**: [...]

### 🎯 Decisões Chave
- [Decisão 1 tomada na reunião]
- [Decisão 2 alinhada entre as partes]

### 📋 Próximos Passos (Action Items)
- **[Nome do Responsável]**: [Ação específica a ser realizada] — *Prazo: [Data ou período se mencionado, ex: 29/07/2026]*
- **[Outro Responsável]**: [Outra ação] — *Prazo: [Prazo]*

---

### INSTRUÇÕES PARA SUGESTÕES DE DEMANDAS (suggestions):
Analise a transcrição completa e identifique TODAS as tarefas, entregáveis ou ações práticas necessárias faladas na reunião.
regras OBRIGATÓRIAS:
1. Todas as sugestões DEVEM ter o tipo "suggested_type": "NOVA_DEMANDA" e "target_demand_id": null.
2. Se a reunião abordou mais de um assunto ou um projeto grande com entregas distintas, DIVIDA em múltiplas novas demandas independentes.
3. Cada sugestão DEVE ter um 'suggested_description' em Markdown com um **BRIEFING DETALHADO E ESTRUTURADO** usando títulos '###' e pulando linhas entre seções:
   ### 🎯 Objetivo & Assunto Geral
   Contexto e objetivo principal da entrega.

   ### 📦 Escopo & Entregáveis
   - Lista detalhada do que deve ser entregue.
   - Ponto 2.

   ### 🎨 Direção Visual & Referências
   Instruções de design, estilo ou referências mencionadas.

   ### ⚙️ Requisitos Técnicos & Observações
   Regras de negócio ou detalhes técnicos.

   ### 📅 Prazo de Entrega
   Data limite especificada ou sugerida com base na reunião.

Retorne APENAS o JSON abaixo, sem blocos markdown extras de código (retorne raw json):
{
  "diarized_transcript": "...",
  "summary_markdown": "# 📌 Tema: ...\n\n### 📑 Resumo Executivo\n...\n\n### 💬 Tópicos Discutidos\n- ...\n\n### 🎯 Decisões Chave\n- ...\n\n### 📋 Próximos Passos (Action Items)\n- ...",
  "summary": [
    "📌 Tema: ...",
    "📑 Resumo Executivo: ...",
    "💬 Tópicos Discutidos: ...",
    "🎯 Decisões Chave: ...",
    "📋 Próximos Passos: ..."
  ],
  "suggestions": [
    {
      "suggested_type": "NOVA_DEMANDA",
      "target_demand_id": null,
      "suggested_title": "Título claro e profissional da nova demanda",
      "suggested_description": "### 🎯 Objetivo & Assunto Geral\n...\n\n### 📦 Escopo & Entregáveis\n- ...\n- ...\n\n### 🎨 Direção Visual & Referências\n...\n\n### ⚙️ Requisitos Técnicos\n...\n\n### 📅 Prazo de Entrega\n10 dias úteis",
      "estimated_hours": 4.0
    }
  ]
}`;

        const parts = [{ text: promptText }];

        const candidateModels = [
          "gemini-flash-latest",
          "gemini-flash-lite-latest",
          "gemini-pro-latest",
          "gemini-2.0-flash",
          "gemini-2.0-flash-lite",
        ];
        let res: Response | null = null;

        for (const model of candidateModels) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);
            const tryRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts }],
                  generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 8192,
                    response_mime_type: "application/json",
                  },
                }),
                signal: controller.signal,
              }
            );
            clearTimeout(timeoutId);

            if (tryRes.ok) {
              res = tryRes;
              break;
            } else if (tryRes.status === 429) {
              apiErrors.push(`Modelo ${model}: limite de requisições (429)`);
              await new Promise((r) => setTimeout(r, 1500));
            } else {
              const errText = await tryRes.text();
              apiErrors.push(`Modelo ${model} erro ${tryRes.status}: ${errText.substring(0, 200)}`);
            }
          } catch (e: any) {
            if (e.name === "AbortError") {
              apiErrors.push(`Modelo ${model}: timeout (45s)`);
            } else {
              apiErrors.push(`Modelo ${model}: ${e.message}`);
            }
          }
        }

        if (res && res.ok) {
          const resData = await res.json();
          const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          
          let cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
          const firstBrace = cleaned.indexOf("{");
          const lastBrace = cleaned.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
          }

          try {
            const parsed = safeParseJSON(cleaned);
            if (parsed.summary_markdown) {
              aiSummary = [parsed.summary_markdown];
            } else if (Array.isArray(parsed.summary)) {
              aiSummary = parsed.summary;
            } else if (typeof parsed.summary === "string") {
              aiSummary = [parsed.summary];
            }
            aiSuggestions = parsed.suggestions || [];
            if (parsed.diarized_transcript) {
              aiDiarizedTranscript = parsed.diarized_transcript;
            }
          } catch (e: any) {
            apiErrors.push(`Falha ao fazer parse do JSON da IA: ${e.message || e}`);
            console.warn("[analyzeMeetingTranscript] Falha ao fazer parse do JSON da IA:", e);
          }
        } else if (apiErrors.length > 0) {
          console.warn("[analyzeMeetingTranscript] API Gemini indisponível. Usando fallback. Erros:", apiErrors.join(" | "));
        } else {
          console.warn("[analyzeMeetingTranscript] Nenhum modelo Gemini respondeu (erros vazios). Usando fallback.");
        }
      } else {
        console.warn("[analyzeMeetingTranscript] GEMINI_API_KEY não configurada no servidor. Usando fallback.");
      }
    } catch (err: any) {
      console.error("[analyzeMeetingTranscript] Erro inesperado (usando fallback):", err.message);
    }

    if (aiSummary.length === 0) {
      const hasKey = !!(process.env.GEMINI_API_KEY || clientApiKey);
      const errMsg = apiErrors.length > 0 ? apiErrors.join(" | ") : "";
      aiSummary = transcript
        ? [
            `# 📌 Tema: ${title || "Alinhamento de Reunião"}\n\n### 📑 Resumo Executivo\nReunião registrada no sistema. Transcrição gravada com sucesso.\n\n${
              errMsg ? `> ⚠️ **Aviso de Processamento IA:** ${errMsg}\n\n` : ""
            }### 💬 Tópicos Discutidos\n- **Transcrição**: O áudio da reunião foi capturado com sucesso.\n\n### 📋 Próximos Passos (Action Items)\n- **Equipe**: Reveja a transcrição bruta para extrair as ações necessárias.`,
          ]
        : ["Ata indisponível."];
    }

    // 3. Save or update generated suggestions into demand_suggestions table
    const insertedRecords: DemandSuggestion[] = [];

    if (existingSuggestionId) {
      // Re-analysis mode: Update existing record in place (DO NOT create a new triage box)
      const newSummaryStr = aiSummary.join("\n");
      const newRawTranscript = aiDiarizedTranscript || transcript;

      const { data: updatedRecord } = await context.supabase
        .from("demand_suggestions")
        .update({
          ai_summary: newSummaryStr,
          raw_content: newRawTranscript,
          suggested_title: aiSuggestions[0]?.suggested_title || title || "Reunião de Alinhamento",
          suggested_description: aiSuggestions[0]?.suggested_description || "",
        })
        .eq("id", existingSuggestionId)
        .select("*, clients(id, name)")
        .single();

      if (updatedRecord) {
        insertedRecords.push(updatedRecord as DemandSuggestion);
      }

      // Also update any sibling suggestions from the same meeting session
      if (updatedRecord?.raw_content) {
        await context.supabase
          .from("demand_suggestions")
          .update({
            ai_summary: newSummaryStr,
            raw_content: newRawTranscript,
          })
          .eq("raw_content", updatedRecord.raw_content)
          .neq("id", existingSuggestionId);
      }
    } else {
      // New recording mode: Insert new records into demand_suggestions table
      for (const sug of aiSuggestions) {
        const { data: inserted } = await context.supabase
          .from("demand_suggestions")
          .insert({
            client_id: clientId,
            source: "meeting",
            suggested_type: sug.suggested_type,
            target_demand_id: sug.target_demand_id || null,
            suggested_title: sug.suggested_title,
            suggested_description: sug.suggested_description,
            ai_summary: aiSummary.join("\n"),
            raw_content: aiDiarizedTranscript || transcript,
            estimated_hours: sug.estimated_hours || 2.0,
            status: "pending",
          })
          .select("*, clients(id, name)")
          .single();

        if (inserted) {
          insertedRecords.push(inserted as DemandSuggestion);
        }
      }

      // If no suggestions inserted by AI, create one fallback record
      if (insertedRecords.length === 0) {
        const { data: fallbackRecord } = await context.supabase
          .from("demand_suggestions")
          .insert({
            client_id: clientId,
            source: "meeting",
            suggested_type: "NOVA_DEMANDA",
            suggested_title: title || "Reunião de Alinhamento",
            suggested_description: `**Contexto:** Reunião registrada.\n\n**Ata:**\n${aiSummary.join("\n")}`,
            ai_summary: aiSummary.join("\n"),
            raw_content: aiDiarizedTranscript || transcript,
            estimated_hours: 2.0,
            status: "pending",
          })
          .select("*, clients(id, name)")
          .single();

        if (fallbackRecord) {
          insertedRecords.push(fallbackRecord as DemandSuggestion);
        }
      }
    }

    return {
      summary: aiSummary,
      rawTranscript: aiDiarizedTranscript || transcript,
      suggestions: insertedRecords,
    };
  });

export const transcribeAudioChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        audioBase64: z.string(),
        mimeType: z.string().optional(),
        clientApiKey: z.string().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const rawApiKey = process.env.GEMINI_API_KEY || data.clientApiKey || "";
    const apiKey = rawApiKey.replace(/^["']|["']$/g, "").trim();

    if (!apiKey || !data.audioBase64) {
      console.warn("[transcribeAudioChunk] API Key ou áudio ausente.");
      return { text: "" };
    }

    const cleanMimeType = (data.mimeType || "audio/webm").split(";")[0];
    const candidateModels = [
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
      "gemini-pro-latest",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
    ];
    const promptText =
      "Transcreva literalmente TODO o conteúdo falado neste áudio em português brasileiro. Retorne APENAS o texto transcrito, sem comentários, sem saudações, sem introduções. Se houver música ou sons sem fala, escreva [MÚSICA] ou [SOM].";

    const parts = [
      { text: promptText },
      {
        inlineData: {
          mimeType: cleanMimeType,
          data: data.audioBase64,
        },
      },
    ];

    for (const model of candidateModels) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts }] }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
          const resData = await res.json();
          const text = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          return { text: text.trim() };
        } else if (res.status === 429) {
          console.warn(`[transcribeAudioChunk] ${model} 429 — tentando próximo...`);
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (err: any) {
        console.warn(`[transcribeAudioChunk] ${model} falhou:`, err.message);
      }
    }

    return { text: "" };
  });

export const reanalyzeMeetingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        suggestionId: z.string(),
        clientApiKey: z.string().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: suggestion, error: fetchErr } = await context.supabase
      .from("demand_suggestions")
      .select("*, clients(id, name)")
      .eq("id", data.suggestionId)
      .single();

    if (fetchErr || !suggestion) {
      throw new Error("Sugestão não encontrada.");
    }

    const transcript = suggestion.raw_content || "";
    if (!transcript.trim()) {
      throw new Error("Nenhuma transcrição gravada nesta reunião para refazer o resumo.");
    }

    const rawApiKey = process.env.GEMINI_API_KEY || data.clientApiKey || "";
    const apiKey = rawApiKey.replace(/^["']|["']$/g, "").trim();

    if (!apiKey) {
      throw new Error("API Key do Gemini não configurada.");
    }

    const clientName = suggestion.clients?.name || "Cliente";
    const promptText = `Você é um analista de projetos sênior. Sua função é gerar APENAS a Ata de Reunião Estruturada da transcrição abaixo.

Cliente: [${clientName}]
Título: ${suggestion.suggested_title || "Reunião de Alinhamento"}

TRANSCRIÇÃO COMPLETA DA REUNIÃO:
${transcript}

ESTRUTURA OBRIGATÓRIA DA ATA (em Markdown rico):
# 📌 Tema: [Assunto Principal]

### 📑 Resumo Executivo
[Resumo geral e objetivos alinhados]

### 💬 Tópicos Discutidos
- **[Tópico 1]**: [Detalhamento]
- **[Tópico 2]**: [Detalhamento]

### 🎯 Decisões Chave
- [Decisão 1]
- [Decisão 2]

### 📋 Próximos Passos (Action Items)
- **[Responsável]**: [Ação] — *Prazo: [Prazo]*

Retorne APENAS o JSON no formato:
{
  "summary_markdown": "# 📌 Tema: ..."
}`;

    const candidateModels = [
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
      "gemini-pro-latest",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
    ];

    let newSummaryMarkdown = "";

    for (const model of candidateModels) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
              generationConfig: { response_mime_type: "application/json" },
            }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
          const resData = await res.json();
          const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          let cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
          const firstBrace = cleaned.indexOf("{");
          const lastBrace = cleaned.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
          }
          const parsed = safeParseJSON(cleaned);
          if (parsed.summary_markdown) {
            newSummaryMarkdown = parsed.summary_markdown;
            break;
          }
        }
      } catch (e: any) {
        console.warn(`[reanalyzeMeetingSummary] ${model} falhou:`, e.message);
      }
    }

    if (!newSummaryMarkdown) {
      throw new Error("Não foi possível regerar o resumo com a IA. Tente novamente.");
    }

    // Update ONLY ai_summary in Supabase
    await context.supabase
      .from("demand_suggestions")
      .update({ ai_summary: newSummaryMarkdown })
      .eq("id", data.suggestionId);

    if (suggestion.raw_content) {
      await context.supabase
        .from("demand_suggestions")
        .update({ ai_summary: newSummaryMarkdown })
        .eq("raw_content", suggestion.raw_content)
        .ne("id", data.suggestionId);
    }

    return { summary_markdown: newSummaryMarkdown };
  });

export const reanalyzeMeetingSuggestionsList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        suggestionId: z.string(),
        clientApiKey: z.string().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: suggestion, error: fetchErr } = await context.supabase
      .from("demand_suggestions")
      .select("*, clients(id, name)")
      .eq("id", data.suggestionId)
      .single();

    if (fetchErr || !suggestion) {
      throw new Error("Sugestão não encontrada.");
    }

    const transcript = suggestion.raw_content || "";
    if (!transcript.trim()) {
      throw new Error("Nenhuma transcrição gravada nesta reunião para refazer as sugestões.");
    }

    const rawApiKey = process.env.GEMINI_API_KEY || data.clientApiKey || "";
    const apiKey = rawApiKey.replace(/^["']|["']$/g, "").trim();

    if (!apiKey) {
      throw new Error("API Key do Gemini não configurada.");
    }

    const clientName = suggestion.clients?.name || "Cliente";
    const promptText = `Você é um gerente de produto sênior. Sua função é analisar a transcrição da reunião e gerar APENAS as Sugestões de Novas Demandas Estruturadas (briefings).

Cliente: [${clientName}]
Reunião: ${suggestion.suggested_title || "Alinhamento"}

TRANSCRIÇÃO COMPLETA DA REUNIÃO:
${transcript}

REGRAS:
1. Identifique todas as tarefas / entregáveis da reunião.
2. Todas as sugestões DEVEM ter o tipo "NOVA_DEMANDA" e "target_demand_id": null.
3. Se houver mais de um assunto ou entrega, divida em demandas separadas.
4. Cada sugestão DEVE ter um "suggested_description" em Markdown com briefing detalhado usando títulos '###' e pulando linhas entre seções.

Retorne APENAS o JSON no formato:
{
  "suggestions": [
    {
      "suggested_type": "NOVA_DEMANDA",
      "target_demand_id": null,
      "suggested_title": "Título da demanda",
      "suggested_description": "### 🎯 Objetivo & Assunto Geral\n...\n\n### 📦 Escopo & Entregáveis\n- ...\n- ...\n\n### 🎨 Direção Visual & Referências\n...\n\n### ⚙️ Requisitos Técnicos\n...\n\n### 📅 Prazo de Entrega\n10 dias úteis",
      "estimated_hours": 4.0
    }
  ]
}`;

    const candidateModels = [
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
      "gemini-pro-latest",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
    ];

    let newSuggestions: Array<{
      suggested_type: "NOVA_DEMANDA";
      target_demand_id: null;
      suggested_title: string;
      suggested_description: string;
      estimated_hours: number;
    }> = [];

    for (const model of candidateModels) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
              generationConfig: { response_mime_type: "application/json" },
            }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
          const resData = await res.json();
          const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          let cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
          const firstBrace = cleaned.indexOf("{");
          const lastBrace = cleaned.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
          }
          const parsed = safeParseJSON(cleaned);
          if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
            newSuggestions = parsed.suggestions;
            break;
          }
        }
      } catch (e: any) {
        console.warn(`[reanalyzeMeetingSuggestionsList] ${model} falhou:`, e.message);
      }
    }

    if (newSuggestions.length === 0) {
      throw new Error("Não foi possível regerar as sugestões com a IA. Tente novamente.");
    }

    // Update ONLY the suggestion briefings / titles of existing suggestion (DO NOT TOUCH ai_summary!)
    const firstSug = newSuggestions[0];
    await context.supabase
      .from("demand_suggestions")
      .update({
        suggested_title: firstSug.suggested_title,
        suggested_description: firstSug.suggested_description,
        estimated_hours: firstSug.estimated_hours || 2.0,
      })
      .eq("id", data.suggestionId);

    return { suggestions: newSuggestions };
  });

export const reanalyzeMeetingSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        suggestionId: z.string(),
        clientApiKey: z.string().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: suggestion, error: fetchErr } = await context.supabase
      .from("demand_suggestions")
      .select("*, clients(id, name)")
      .eq("id", data.suggestionId)
      .single();

    if (fetchErr || !suggestion) {
      throw new Error("Sugestão não encontrada.");
    }

    const transcript = suggestion.raw_content || "";
    if (!transcript.trim()) {
      throw new Error("Nenhuma transcrição gravada nesta reunião para refazer.");
    }

    const result = await analyzeMeetingTranscript({
      data: {
        clientId: suggestion.client_id,
        title: suggestion.suggested_title,
        transcript,
        clientApiKey: data.clientApiKey,
        existingSuggestionId: data.suggestionId,
      },
    });

    await context.supabase
      .from("demand_suggestions")
      .update({
        ai_summary: result.summary.join("\n"),
        raw_content: result.rawTranscript || transcript,
        suggested_description: result.suggestions[0]?.suggested_description || suggestion.suggested_description,
        suggested_title: result.suggestions[0]?.suggested_title || suggestion.suggested_title,
      })
      .eq("id", data.suggestionId);

    return result;
  });
