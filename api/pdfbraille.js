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
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!item) return res.status(404).json({ error: "Item not found" });

  const { data: pages, error: pagesError } = await supabase
    .from("mpop_pages")
    .select("page_no,title_letters,text,remarks,interlinie_on")
    .eq("mpop_item_id", id)
    .order("page_no", { ascending: true });

  if (pagesError) return res.status(500).json({ error: pagesError.message });

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Courier);
  const fontBold = await pdfDoc.embedFont(StandardFonts.CourierBold);
  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN = 48;
  const LINE_HEIGHT = 14;
  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  const ensureSpace = (lines = 1) => {
    if (y - lines * LINE_HEIGHT < MARGIN) newPage();
  };

  const drawLine = (text, size = 10, usedFont = font, x = MARGIN) => {
    ensureSpace(1);
    page.drawText(text ?? "", { x, y, size, font: usedFont });
    y -= LINE_HEIGHT;
  };

  const drawWrapped = (text, size = 10, usedFont = font, indent = 0) => {
    const raw = (text ?? "").toString();
    const maxWidth = PAGE_W - MARGIN * 2 - indent;
    if (!raw) {
      drawLine("", size, usedFont, MARGIN + indent);
      return;
    }
    const lines = raw.split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx += 1) {
      const lineText = lines[idx];
      if (!lineText) {
        drawLine("", size, usedFont, MARGIN + indent);
        continue;
      }
      const words = lineText.split(/\s+/);
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        const w = usedFont.widthOfTextAtSize(test, size);
        if (w <= maxWidth) {
          line = test;
        } else {
          drawLine(line, size, usedFont, MARGIN + indent);
          line = word;
        }
      }
      if (line) drawLine(line, size, usedFont, MARGIN + indent);
    }
  };

  const drawTopRight = (text, size = 10, usedFont = fontBold) => {
    const content = text ?? "";
    const w = usedFont.widthOfTextAtSize(content, size);
    const x = PAGE_W - MARGIN - w;
    const yTop = PAGE_H - MARGIN;
    page.drawText(content, { x, y: yTop, size, font: usedFont });
  };

  const pageList = pages || [];
  for (let i = 0; i < pageList.length; i += 1) {
    if (i > 0) newPage();
    const p = pageList[i];
    const pageNo = Number(p.page_no);
    drawTopRight(String(pageNo));
    drawWrapped(p.title_letters || "");
    y -= 4;
    drawWrapped(p.text || "");
    y -= 4;
    drawWrapped(p.remarks || "");
    y -= 4;
  }

  const pdfBytes = await pdfDoc.save();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="mpop-${id}.pdf"`);
  res.send(Buffer.from(pdfBytes));
}
