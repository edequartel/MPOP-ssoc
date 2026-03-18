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
    { global: { headers: { Authorization: authHeader } } }
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

  let body: any
  try {
    body = await req.json()
  } catch {
    return json(400, { error: "Invalid JSON body" })
  }

  if (typeof body?.outputDir !== "string") return json(400, { error: "Missing outputDir" })
  if (!Array.isArray(body?.sources) || body.sources.length < 1) {
    return json(400, { error: "sources[] must have at least 1 item" })
  }

  const uploadToken = Deno.env.get("UPLOAD_TOKEN")
  if (!uploadToken) return json(500, { error: "UPLOAD_TOKEN secret missing in Supabase" })

  const phpUrl = Deno.env.get("BLUEHOST_MERGE_URL")
  if (!phpUrl) return json(500, { error: "BLUEHOST_MERGE_URL secret missing in Supabase" })

  const upstream = await fetch(phpUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${uploadToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  })

  const text = await upstream.text()

  try {
    const parsed = JSON.parse(text)
    return new Response(JSON.stringify(parsed), {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    })
  } catch {
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
      },
    })
  }
})
