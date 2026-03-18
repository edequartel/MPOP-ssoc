import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

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

  const url = typeof body.url === "string" ? body.url.trim() : ""
  if (!url) return json(400, { error: "Missing url" })

  const allowedPrefix = "https://www.tastenbraille.com/braillestudio/"
  if (!url.startsWith(allowedPrefix)) {
    return json(400, { error: "Only braillestudio audio URLs are allowed" })
  }

  const upstream = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "audio/mpeg,application/octet-stream;q=0.9,*/*;q=0.8",
    },
  })

  const bytes = await upstream.arrayBuffer()
  if (!upstream.ok) {
    const detail = new TextDecoder().decode(bytes)
    return json(upstream.status, {
      error: "Audio fetch failed",
      details: detail || upstream.statusText,
    })
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "no-store",
    },
  })
})
