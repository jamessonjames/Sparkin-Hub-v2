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
    return (suggestions ?? []) as DemandSuggestion[];
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
    return row as DemandSuggestion;
  });

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
      .from("demand_suggestions")
      .select("*")
      .eq("id", data.id)
      .single();

    if (fetchErr || !suggestion) throw new Error("Sugestão não encontrada");

    const finalTitle = data.title || suggestion.suggested_title;
    const finalDesc = data.description || suggestion.suggested_description || "";
    const finalHours = data.estimated_hours ?? Number(suggestion.estimated_hours || 1.0);

    if (suggestion.suggested_type === "AJUSTE_DEMANDA" && suggestion.target_demand_id) {
      // Move existing target demand to "com_ajustes" and append notes
      const { data: targetDemand } = await context.supabase
        .from("demands")
        .select("id, status, description, internal_notes")
        .eq("id", suggestion.target_demand_id)
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
      // Create new demand
      await context.supabase.from("demands").insert({
        client_id: suggestion.client_id,
        title: finalTitle,
        description: finalDesc,
        status: "nao_iniciado",
        priority: "medium",
        estimated_hours: finalHours,
        assignee_user_id: data.assignee_user_id || null,
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
    const { error } = await context.supabase.from("capture_settings").upsert(
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
    await context.supabase.from("capture_settings").upsert(
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
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { clientId, title, transcript = "" } = data;

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

    try {
      const rawApiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
      const apiKey = rawApiKey.replace(/^["']|["']$/g, "").trim();
      if (apiKey) {
        const promptText = `Você é um analista de projetos sênior em uma agência de marketing e tecnologia. Sua função é extrair o máximo de valor de reuniões com clientes.

Reunião entre: [${userName} (Eu/Agência)] e [${clientName} (Cliente)]
Título da reunião: ${title || "Não informado"}

DEMANDAS EXISTENTES DO CLIENTE (para referência):
${JSON.stringify(demandsContext, null, 2)}

TRANSCRIÇÃO COMPLETA DA REUNIÃO:
${transcript}

Com base na transcrição acima, gere uma análise completa no formato JSON abaixo.

REGRAS IMPORTANTES:
- Seja detalhista e específico. Extraia o máximo de informação possível da reunião.
- Se a transcrição for curta ou vaga, ainda assim extraia o que for possível.
- As sugestões devem ser acionáveis e específicas, não genéricas.

---

1. "summary": Um ARRAY de strings, cada string sendo um tópico ESTRUTURADO. Para cada tópico importante discutido na reunião, crie UM item no array contendo:
   - O assunto discutido
   - O que foi decidido ou alinhado
   - Próximos passos e quem é responsável

   Exemplo de formato para cada item:
   "🔹 **Redesign do Site** — Foi decidido focar no redesign da seção de portfólio. Próximo passo: [${userName}] enviar 3 propostas de layout até sexta. [${clientName}] vai levantar referências visuais."

   IMPORTANTE: O PRIMEIRO item do array DEVE ser uma seção "📋 **PRÓXIMAS AÇÕES (Eu)**" listando todas as tarefas que VOCÊ (${userName}) precisa executar após a reunião, em formato de checklist.

2. "suggestions": Array de objetos. Cada sugestão representa uma demanda NOVA ou AJUSTE em demanda existente que deve ser criada no sistema com base NA REUNIÃO. Seja criterioso: só crie sugestões quando houver conteúdo suficiente na reunião para justificar.

   Para cada sugestão, forneça:
   - suggested_type: "NOVA_DEMANDA" se for algo novo, "AJUSTE_DEMANDA" se for alteração em demanda existente
   - target_demand_id: ID da demanda existente se for ajuste, ou null
   - suggested_title: Título claro e profissional da demanda
   - suggested_description: BRIEFING COMPLETO E ESTRUTURADO contendo:
       * Contexto (o que foi discutido na reunião que gerou essa demanda)
       * Escopo (o que precisa ser feito, detalhado)
       * Requisitos (entregáveis esperados, prazos mencionados, etc.)
       * Observações (qualquer detalhe relevante da conversa)
   - estimated_hours: estimativa realista de horas (não coloque 2h sempre — analise a complexidade do que foi falado)

3. "diarized_transcript": A transcrição refeita com formatação limpa, identificando claramente quem falou o quê. Use os marcadores [${userName}]: e [${clientName}]:. Mantenha todo o conteúdo original, apenas reestruture para leitura clara.

Retorne APENAS o JSON abaixo, sem blocos markdown, sem texto extra:
{
  "diarized_transcript": "...",
  "summary": [
    "📋 **PRÓXIMAS AÇÕES (Eu)**: ...",
    "🔹 **...**: ...",
    "🔹 **...**: ..."
  ],
  "suggestions": [
    {
      "suggested_type": "NOVA_DEMANDA",
      "target_demand_id": null,
      "suggested_title": "Título da demanda",
      "suggested_description": "**Contexto:** ...\n**Escopo:** ...\n**Requisitos:** ...\n**Observações:** ...",
      "estimated_hours": 4.0
    }
  ]
}`;

        const parts = [{ text: promptText }];

        const candidateModels = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash-preview-04-17", "gemini-2.0-flash-lite"];
        let res: Response | null = null;
        const errors: string[] = [];

        for (const model of candidateModels) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            const tryRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts }] }),
                signal: controller.signal,
              }
            );
            clearTimeout(timeoutId);

            if (tryRes.ok) {
              res = tryRes;
              break;
            } else if (tryRes.status === 429) {
              errors.push(`Modelo ${model}: limite de requisições (429)`);
              await new Promise((r) => setTimeout(r, 1500));
            } else {
              const errText = await tryRes.text();
              errors.push(`Modelo ${model} erro ${tryRes.status}: ${errText.substring(0, 200)}`);
            }
          } catch (e: any) {
            if (e.name === "AbortError") {
              errors.push(`Modelo ${model}: timeout (15s)`);
            } else {
              errors.push(`Modelo ${model}: ${e.message}`);
            }
          }
        }

        if (res && res.ok) {
          const resData = await res.json();
          const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              aiSummary = parsed.summary || [];
              aiSuggestions = parsed.suggestions || [];
              if (parsed.diarized_transcript) {
                aiDiarizedTranscript = parsed.diarized_transcript;
              }
            } catch (e) {
              console.warn("[analyzeMeetingTranscript] Falha ao fazer parse do JSON da IA:", e);
            }
          }
        } else if (errors.length > 0) {
          console.warn("[analyzeMeetingTranscript] API Gemini indisponível. Usando fallback. Erros:", errors.join(" | "));
        } else {
          console.warn("[analyzeMeetingTranscript] Nenhum modelo Gemini respondeu (erros vazios). Usando fallback.");
        }
      } else {
        console.warn("[analyzeMeetingTranscript] GEMINI_API_KEY não configurada no servidor. Usando fallback.");
      }
    } catch (err: any) {
      console.error("[analyzeMeetingTranscript] Erro inesperado (usando fallback):", err.message);
    }

    // Heuristic fallback if AI key unavailable or error
    if (aiSummary.length === 0) {
      aiSummary = transcript
        ? ["📋 **PRÓXIMAS AÇÕES**: Reunião registrada no sistema — reveja a transcrição completa para extrair as ações manualmente."]
        : ["Nenhum conteúdo de reunião foi capturado para análise."];
    }

    if (aiSuggestions.length === 0 && transcript.trim()) {
      const isAdjustment = /ajustar|alterar|mudar|corrigir|refazer/i.test(transcript);
      const matchedDemand = demandsContext.find((d) =>
        transcript.toLowerCase().includes(d.title.toLowerCase())
      );

      aiSuggestions.push({
        suggested_type: matchedDemand || isAdjustment ? "AJUSTE_DEMANDA" : "NOVA_DEMANDA",
        target_demand_id: matchedDemand ? matchedDemand.id : null,
        suggested_title: matchedDemand
          ? `Ajuste solicitado em: ${matchedDemand.title}`
          : title || "Demanda da reunião",
        suggested_description: `**Contexto:** Reunião registrada no sistema.\n**Escopo:** Reveja a transcrição completa para detalhar o escopo.\n**Observações:** ${transcript.substring(0, 500)}`,
        estimated_hours: 2.0,
      });
    }

    // 3. Save generated suggestions into demand_suggestions table
    const insertedRecords: DemandSuggestion[] = [];
    for (const sug of aiSuggestions) {
      const { data: inserted, error } = await context.supabase
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

    return {
      summary: aiSummary,
      suggestions: insertedRecords,
      rawTranscript: aiDiarizedTranscript || transcript,
    };
  });


