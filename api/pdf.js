import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

  const titleText = item.title ?? "MPOP item";
  const titleSize = 16;
  const titleX = 48;
  const titleY = 800;
  const titlePaddingX = 10;
  const titlePaddingY = 6;
  const titleWidth = font.widthOfTextAtSize(titleText, titleSize);
  const titleHeight = titleSize;
  page.drawRectangle({
    x: titleX - titlePaddingX,
    y: titleY - titlePaddingY,
    width: titleWidth + titlePaddingX * 2,
    height: titleHeight + titlePaddingY * 2,
    borderColor: rgb(0, 0, 0),
    borderWidth: 2,
    borderRadius: 12
  });
  page.drawText(titleText, { x: titleX, y: titleY, size: titleSize, font });
  page.drawText(item.story_text ?? "", { x: 48, y: 760, size: 10, font, maxWidth: 500 });
  page.drawText(item.remarks_1 ?? "", { x: 48, y: 680, size: 10, font, maxWidth: 500 });

  const pdfBytes = await pdfDoc.save();

  const safeTitle = String(titleText).replace(/["\\]/g, "").trim();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="mpop-${safeTitle}.pdf"`);
  res.send(Buffer.from(pdfBytes));
}
