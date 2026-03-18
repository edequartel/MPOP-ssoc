import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const DEFAULT_MODEL_ID = "eleven_multilingual_v2"
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128"

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })
  if (req.method !== "POST") return json(405, { error: "Method not allowed. Use POST." })

  const authHeader = req.headers.get("authorization") ?? ""
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "Missing or invalid Authorization header (Supabase JWT required)" })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) {
    return json(401, { error: "Not authenticated", details: userErr?.message })
  }

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single()

  if (profErr || !profile) {
    return json(403, { error: "Profile lookup failed", details: profErr?.message })
  }

  const allowed = new Set(["admin", "editor", "soundcreator"])
  if (!allowed.has(profile.role)) {
    return json(403, { error: "Forbidden (admin/editor/soundcreator only)", role: profile.role })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json(400, { error: "Invalid JSON body" })
  }

  const text = typeof body.text === "string" ? body.text.trim() : ""
  const voiceId = typeof body.voiceId === "string" ? body.voiceId.trim() : ""
  const modelId = typeof body.modelId === "string" && body.modelId.trim()
    ? body.modelId.trim()
    : DEFAULT_MODEL_ID
  const outputFormat = typeof body.outputFormat === "string" && body.outputFormat.trim()
    ? body.outputFormat.trim()
    : DEFAULT_OUTPUT_FORMAT
  const voiceSettings = body.voice_settings

  if (!text) return json(400, { error: "Missing text" })
  if (!voiceId) return json(400, { error: "Missing voiceId" })

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY")
  if (!apiKey) return json(500, { error: "ELEVENLABS_API_KEY secret missing in Supabase" })

  const elevenLabsUrl = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`)
  if (outputFormat) {
    elevenLabsUrl.searchParams.set("output_format", outputFormat)
  }

  const payload: Record<string, unknown> = {
    text,
    model_id: modelId,
  }
  if (voiceSettings && typeof voiceSettings === "object") {
    payload.voice_settings = voiceSettings
  }

  const upstream = await fetch(elevenLabsUrl.toString(), {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify(payload),
  })

  const bytes = await upstream.arrayBuffer()
  if (!upstream.ok) {
    const detail = new TextDecoder().decode(bytes)
    return json(upstream.status, {
      error: "ElevenLabs request failed",
      details: detail || upstream.statusText,
    })
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  })
})
