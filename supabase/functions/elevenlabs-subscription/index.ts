import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })
  if (req.method !== "GET") return json(405, { error: "Method not allowed. Use GET." })

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

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY")
  if (!apiKey) return json(500, { error: "ELEVENLABS_API_KEY secret missing in Supabase" })

  const upstream = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
    method: "GET",
    headers: {
      "xi-api-key": apiKey,
      "Accept": "application/json",
    },
  })

  const text = await upstream.text()
  let body: Record<string, unknown> | null = null
  try { body = text ? JSON.parse(text) : null } catch {}

  if (!upstream.ok) {
    const details = body?.detail ?? body?.message ?? text ?? upstream.statusText
    return json(upstream.status, {
      error: "ElevenLabs request failed",
      details,
    })
  }

  return json(200, {
    ok: true,
    tier: body?.tier ?? null,
    status: body?.status ?? null,
    character_count: body?.character_count ?? null,
    character_limit: body?.character_limit ?? null,
    next_character_count_reset_unix: body?.next_character_count_reset_unix ?? null,
  })
})
