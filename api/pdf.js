import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: "Supabase env missing (SUPABASE_URL / SUPABASE_ANON_KEY)." });
  }

  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header." });
  }

  // Use the caller's JWT so RLS applies.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } }
  });

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const { data: item, error } = await supabase
    .from("mpop_items")
    .select("id,title,story_text,remarks_1")
    .eq("id", id)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText(item.title ?? "MPOP item", { x: 48, y: 800, size: 16, font });
  page.drawText(item.story_text ?? "", { x: 48, y: 760, size: 10, font, maxWidth: 500 });
  page.drawText(item.remarks_1 ?? "", { x: 48, y: 680, size: 10, font, maxWidth: 500 });

  const pdfBytes = await pdfDoc.save();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="mpop-${id}.pdf"`);
  res.send(Buffer.from(pdfBytes));
}
