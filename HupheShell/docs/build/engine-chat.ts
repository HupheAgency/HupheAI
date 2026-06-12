import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables')
    }

    // Initialize Supabase admin client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse request body
    const { conversationId, agentId, agentModel, message, history } = await req.json()
    if (!conversationId || !agentId || !agentModel || !message || !history) {
      return new Response(JSON.stringify({ error: 'Missing required fields in request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify that the conversation belongs to the user (RLS doesn't apply to service_role, so we check manually)
    const { data: convData, error: convError } = await supabase
      .from('engine_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single()
      
    if (convError || !convData) {
      return new Response(JSON.stringify({ error: 'Conversation not found or access denied' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Insert user message
    const { error: insertUserError } = await supabase
      .from('engine_messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: message
      })

    if (insertUserError) {
      throw new Error(`Failed to save user message: ${insertUserError.message}`)
    }

    // 2. Build messages array for OpenRouter
    const messages = [...history, { role: 'user', content: message }]

    // 3. Call OpenRouter
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!openRouterKey) {
      throw new Error('Missing OPENROUTER_API_KEY')
    }

    const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://hupheai.app',
        'X-Title': 'HupheAI Cloud',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: agentModel,
        messages: messages,
        stream: false
      }),
    })

    if (!openRouterRes.ok) {
      return new Response(JSON.stringify({ error: 'OpenRouter API failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const openRouterData = await openRouterRes.json()
    const assistantContent = openRouterData.choices?.[0]?.message?.content || ''

    // 4. Save assistant response
    const { data: assistantMsgData, error: insertAssistantError } = await supabase
      .from('engine_messages')
      .insert({
        conversation_id: conversationId,
        agent_id: agentId,
        role: 'assistant',
        content: assistantContent
      })
      .select('id')
      .single()

    if (insertAssistantError) {
      throw new Error(`Failed to save assistant message: ${insertAssistantError.message}`)
    }

    // 5. Log entry in agent_conversations
    await supabase
      .from('agent_conversations')
      .insert({
        engine_conversation_id: conversationId,
        from_agent_id: agentId,
        event_type: 'result',
        content: assistantContent
      })

    // Return success
    return new Response(
      JSON.stringify({
        ok: true,
        content: assistantContent,
        messageId: assistantMsgData.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge Function Error:', error)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
