import { createClient } from "@supabase/supabase-js";
import fontkit from "@pdf-lib/fontkit";
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
    .select("id,code,title,image1_path,image2_path,image3_path")
    .eq("id", id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!item) return res.status(404).json({ error: "Item not found" });

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const IMAGE_BASE_URL = "https://www.tastenbraille.com/braillestudio";
  const LOGO_URL =
    "https://www.tastenbraille.com/braillestudio/resources/assets/pen_dot.png";
  const EN_DOT_URL =
    "https://www.tastenbraille.com/braillestudio/resources/assets/en_dot.png";
  const BRAILLE_FONT_URL =
    "https://www.tastenbraille.com/braillestudio/resources/fonts/bartimeus6dotszwelpapier.ttf";
  const QR_SIZE = 40;
  const QR_GAP = 6;

  let logoImage = null;
  try {
    const logoResponse = await fetch(LOGO_URL);
    if (logoResponse.ok) {
      const logoBytes = await logoResponse.arrayBuffer();
      logoImage = await pdfDoc.embedPng(logoBytes);
    }
  } catch {
    // If logo fetch fails, continue without it.
  }

  let enDotImage = null;
  try {
    const enDotResponse = await fetch(EN_DOT_URL);
    if (enDotResponse.ok) {
      const enDotBytes = await enDotResponse.arrayBuffer();
      enDotImage = await pdfDoc.embedPng(enDotBytes);
    }
  } catch {
    // If en_dot fetch fails, continue without it.
  }

  let brailleFont = null;
  try {
    const brailleResponse = await fetch(BRAILLE_FONT_URL);
    if (brailleResponse.ok) {
      const brailleBytes = await brailleResponse.arrayBuffer();
      brailleFont = await pdfDoc.embedFont(brailleBytes);
    }
  } catch {
    // If font fetch fails, continue without it.
  }

  const codeText =
    item.code === null || item.code === undefined ? "" : String(item.code);
  const qrCache = new Map();
  const getQrImage = async (pageNumber) => {
    if (!codeText) return null;
    const cacheKey = String(pageNumber);
    if (qrCache.has(cacheKey)) return qrCache.get(cacheKey);
    const qrData = `M${codeText}${pageNumber}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
      qrData
    )}`;
    try {
      const qrResponse = await fetch(qrUrl);
      if (qrResponse.ok) {
        const qrBytes = await qrResponse.arrayBuffer();
        const qrImage = await pdfDoc.embedPng(qrBytes);
        qrCache.set(cacheKey, qrImage);
        return qrImage;
      }
    } catch {
      // If QR fetch fails, continue without it.
    }
    qrCache.set(cacheKey, null);
    return null;
  };

  const addImagePage = async (imagePath, pageTitle, showTitle, pageNumber) => {
    const page = pdfDoc.addPage([595, 842]);
    const qrImage = await getQrImage(pageNumber);
    if (showTitle) {
      const titleSize = 32;
      const titleWidth = font.widthOfTextAtSize(pageTitle, titleSize);
      const titleX = (595 - titleWidth) / 2;
      page.drawText(pageTitle, { x: titleX, y: 800, size: titleSize, font });

      if (brailleFont) {
        const brailleSize = 32;
        const brailleWidth = brailleFont.widthOfTextAtSize(
          pageTitle,
          brailleSize
        );
        const brailleX = (595 - brailleWidth) / 2;
        page.drawText(pageTitle, {
          x: brailleX,
          y: 760,
          size: brailleSize,
          font: brailleFont,
        });
      }
    }

    const pageNumberText = String(pageNumber);
    const pageNumberSize = 12;
    const pageNumberWidth = font.widthOfTextAtSize(
      pageNumberText,
      pageNumberSize
    );
    const rightMargin = 24;
    const topMargin = 24;
    const pageNumberY = 842 - topMargin - pageNumberSize;
    const braillePageText = `#${pageNumberText}  `;
    const braillePageSize = 32;
    const braillePageWidth = brailleFont
      ? brailleFont.widthOfTextAtSize(braillePageText, braillePageSize)
      : 0;
    const headerTextGap = brailleFont ? 8 : 0;
    const headerTextWidth = pageNumberWidth + headerTextGap + braillePageWidth;
    const pageNumberX = 595 - rightMargin - headerTextWidth;
    const braillePageX = pageNumberX + pageNumberWidth + headerTextGap;
    const braillePageY = pageNumberY;

    if (logoImage || enDotImage) {
      const maxLogoSize = 32;
      const topCornerImage = enDotImage || logoImage;
      const bottomLeftImage = logoImage || enDotImage;
      const bottomRightImage = enDotImage || logoImage;
      const bottomY = 48;
      const topCornerScale = Math.min(
        maxLogoSize / topCornerImage.width,
        maxLogoSize / topCornerImage.height,
        1
      );
      const topCornerWidth = topCornerImage.width * topCornerScale;
      const topCornerHeight = topCornerImage.height * topCornerScale;
      const topLeftX = 48;
      const topRightX = 595 - 48 - topCornerWidth;
      const topY = pageNumberY - 8 - topCornerHeight;

      const bottomLeftScale = Math.min(
        maxLogoSize / bottomLeftImage.width,
        maxLogoSize / bottomLeftImage.height,
        1
      );
      const bottomLeftWidth = bottomLeftImage.width * bottomLeftScale;
      const bottomLeftHeight = bottomLeftImage.height * bottomLeftScale;
      const bottomLeftX = 48;

      const bottomRightScale = Math.min(
        maxLogoSize / bottomRightImage.width,
        maxLogoSize / bottomRightImage.height,
        1
      );
      const bottomRightWidth = bottomRightImage.width * bottomRightScale;
      const bottomRightHeight = bottomRightImage.height * bottomRightScale;
      const bottomRightX = 595 - 48 - bottomRightWidth;

      page.drawImage(topCornerImage, {
        x: topLeftX,
        y: topY,
        width: topCornerWidth,
        height: topCornerHeight,
      });
      page.drawImage(topCornerImage, {
        x: topRightX,
        y: topY,
        width: topCornerWidth,
        height: topCornerHeight,
      });
      page.drawImage(bottomLeftImage, {
        x: bottomLeftX,
        y: bottomY,
        width: bottomLeftWidth,
        height: bottomLeftHeight,
      });
      page.drawImage(bottomRightImage, {
        x: bottomRightX,
        y: bottomY,
        width: bottomRightWidth,
        height: bottomRightHeight,
      });

      if (qrImage) {
        const qrX = bottomRightX + (bottomRightWidth - QR_SIZE) / 2;
        const qrY = bottomY + bottomRightHeight + QR_GAP;
        page.drawImage(qrImage, {
          x: qrX,
          y: qrY,
          width: QR_SIZE,
          height: QR_SIZE,
        });
      }
    } else if (qrImage) {
      const rightMargin = 48;
      const bottomMargin = 48;
      const fallbackLogoSize = 32;
      const qrX = 595 - rightMargin - QR_SIZE;
      const qrY = bottomMargin + fallbackLogoSize + QR_GAP;
      page.drawImage(qrImage, {
        x: qrX,
        y: qrY,
        width: QR_SIZE,
        height: QR_SIZE,
      });
    }

    page.drawText(pageNumberText, {
      x: pageNumberX,
      y: pageNumberY,
      size: pageNumberSize,
      font,
    });
    if (brailleFont) {
      page.drawText(braillePageText, {
        x: braillePageX,
        y: braillePageY,
        size: braillePageSize,
        font: brailleFont,
      });
    }

    const imageUrl = imagePath ? `${IMAGE_BASE_URL}${imagePath}` : "";
    if (!imageUrl) {
      const missingText = "Afbeelding bestaat niet";
      const missingSize = 12;
      const missingWidth = font.widthOfTextAtSize(missingText, missingSize);
      const missingX = (595 - missingWidth) / 2;
      const missingY = 842 / 2;
      page.drawText(missingText, {
        x: missingX,
        y: missingY,
        size: missingSize,
        font,
      });
      return;
    }

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        const missingText = "Afbeelding bestaat niet";
        const missingSize = 12;
        const missingWidth = font.widthOfTextAtSize(missingText, missingSize);
        const missingX = (595 - missingWidth) / 2;
        const missingY = 842 / 2;
        page.drawText(missingText, {
          x: missingX,
          y: missingY,
          size: missingSize,
          font,
        });
        return;
      }
      const imageBytes = await response.arrayBuffer();
      const isPng = imagePath.toLowerCase().endsWith(".png");
      const image = isPng
        ? await pdfDoc.embedPng(imageBytes)
        : await pdfDoc.embedJpg(imageBytes);

      const maxWidth = 500;
      const maxHeight = 680;
      const scale = Math.min(
        maxWidth / image.width,
        maxHeight / image.height,
        1
      );
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const pageWidth = 595;
      const pageHeight = 842;
      const centerX = (pageWidth - drawWidth) / 2;
      const centerY = (pageHeight - drawHeight) / 2;

      page.drawImage(image, {
        x: centerX,
        y: centerY,
        width: drawWidth,
        height: drawHeight,
      });
    } catch {
      const missingText = "Afbeelding bestaat niet";
      const missingSize = 12;
      const missingWidth = font.widthOfTextAtSize(missingText, missingSize);
      const missingX = (595 - missingWidth) / 2;
      const missingY = 842 / 2;
      page.drawText(missingText, {
        x: missingX,
        y: missingY,
        size: missingSize,
        font,
      });
    }
  };

  const titleText = item.title ?? "MPOP item";
  await addImagePage(item.image1_path ?? "", titleText, true, 1);
  await addImagePage(item.image2_path ?? "", titleText, false, 2);
  await addImagePage(item.image3_path ?? "", titleText, false, 3);

  const pdfBytes = await pdfDoc.save();

  const safeTitle = (item.title ?? "item")
    .toString()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="mpop-mm-${safeTitle}.pdf"`
  );
  res.send(Buffer.from(pdfBytes));
}
