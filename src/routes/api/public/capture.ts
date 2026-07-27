import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const captureSchema = z.object({
  source: z.enum(['whatsapp', 'email']).default('whatsapp'),
  clientName: z.string(),
  content: z.string(),
  metadata: z.record(z.any()).optional(),
  timestamp: z.string().optional(),
})

export const Route = createFileRoute('/api/public/capture')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const data = captureSchema.parse(body)

          // 1. Try to find the client by name or slug
          // We use supabaseAdmin because this is a public endpoint
          const { data: client } = await supabaseAdmin
            .from('clients')
            .select('id')
            .ilike('name', `%${data.clientName}%`)
            .maybeSingle()

          if (!client) {
            return new Response(JSON.stringify({ error: 'Client not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            })
          }

          // 2. Insert as a pending suggestion
          const { error } = await supabaseAdmin.from('demand_suggestions').insert({
            client_id: client.id,
            source: data.source,
            raw_content: JSON.stringify({
              text: data.content,
              metadata: data.metadata,
              captured_at: data.timestamp || new Date().toISOString()
            }),
            suggested_title: `Captura automática: ${data.clientName}`,
            suggested_type: 'NOVA_DEMANDA',
            status: 'pending'
          })

          if (error) throw error

          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          console.error('[Capture API Error]:', error)
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
    }
  }
})
