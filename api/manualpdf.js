import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const idRaw = req.query.id;
  const id = Array.isArray(idRaw) ? idRaw[0] : idRaw;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Missing id" });
  }
  if (id === "undefined" || id === "null") {
    return res.status(400).json({ error: "Missing id" });
  }

  const authHeader = req.headers?.authorization || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseKey = serviceKey || anonKey;
  if (!process.env.SUPABASE_URL || !supabaseKey) {
    return res.status(500).json({ error: "Supabase env not configured" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    supabaseKey,
    authHeader
      ? { global: { headers: { Authorization: authHeader } } }
      : undefined
  );

  const { data: item, error } = await supabase
    .from("mpop_items")
    .select("id,title,handleiding_text")
    .eq("id", id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!item) return res.status(404).json({ error: "Item not found" });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const titleText = (item.title ?? "MPOP item").toString();
  const titleSize = 24;
  const titleWidth = font.widthOfTextAtSize(titleText, titleSize);
  const titleX = (595 - titleWidth) / 2;
  const titleY = 800;

  page.drawText(titleText, { x: titleX, y: titleY, size: titleSize, font });

  const bodyText = (item.handleiding_text ?? "").toString();
  const bodySize = 12;
  const lineHeight = 14;
  const margin = 48;
  const maxWidth = 595 - margin * 2;
  let y = titleY - titleSize - 16;

  const lines = bodyText.split(/\r?\n/);
  for (const lineText of lines) {
    if (!lineText) {
      y -= lineHeight;
      continue;
    }
    const words = lineText.split(/\s+/);
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const w = font.widthOfTextAtSize(test, bodySize);
      if (w <= maxWidth) {
        line = test;
      } else {
        if (y < margin) break;
        page.drawText(line, { x: margin, y, size: bodySize, font });
        y -= lineHeight;
        line = word;
      }
    }
    if (line && y >= margin) {
      page.drawText(line, { x: margin, y, size: bodySize, font });
      y -= lineHeight;
    }
    if (y < margin) break;
  }

  const pdfBytes = await pdfDoc.save();

  const safeTitle = titleText
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="mpop-manual-${safeTitle || "item"}.pdf"`
  );
  res.send(Buffer.from(pdfBytes));
}
