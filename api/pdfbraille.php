<?php
declare(strict_types=1);

ini_set("display_errors", "0");

require_once __DIR__ . "/server_auth.php";
require_once __DIR__ . "/../vendor/autoload.php";

use Dompdf\Dompdf;
use Dompdf\Options;

cors_preflight("GET, OPTIONS");
if ($_SERVER["REQUEST_METHOD"] !== "GET") {
  json_out(405, ["ok" => false, "error" => "Method not allowed."]);
}

$auth = require_allowed_role(["admin", "editor", "soundcreator"]);
$id = trim((string)($_GET["id"] ?? ""));
if ($id === "" || $id === "undefined" || $id === "null") {
  json_out(400, ["ok" => false, "error" => "Missing id."]);
}

$itemUrl = rtrim($SUPABASE_URL, "/")
  . "/rest/v1/mpop_items?select=id,code,title&id=eq."
  . rawurlencode($id)
  . "&limit=1";
$items = supabase_get_json($itemUrl, $auth["jwt"]);
$item = $items[0] ?? null;
if (!is_array($item)) {
  json_out(404, ["ok" => false, "error" => "Item not found."]);
}

$pagesUrl = rtrim($SUPABASE_URL, "/")
  . "/rest/v1/mpop_pages?select=page_no,title_letters,text,remarks,interlinie_on&mpop_item_id=eq."
  . rawurlencode($id)
  . "&order=page_no.asc";
$pages = supabase_get_json($pagesUrl, $auth["jwt"]);

function braille_pdf_escape(string $value): string {
  return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8");
}

function braille_pdf_fetch_data_uri(string $url): string {
  if ($url === "" || !function_exists("curl_init")) return "";

  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_USERAGENT => "MPOP-Braille-Dompdf/1.0",
  ]);
  $body = curl_exec($ch);
  $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  $contentType = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

  if (!is_string($body) || $body === "" || $status < 200 || $status >= 300) {
    return "";
  }

  $mime = strtolower(trim(explode(";", $contentType)[0] ?? ""));
  if (!str_starts_with($mime, "image/")) return "";
  return "data:" . $mime . ";base64," . base64_encode($body);
}

$code = trim((string)($item["code"] ?? ""));
$htmlPages = "";
$pageIndex = 0;
foreach ($pages as $page) {
  if (!is_array($page)) continue;
  $pageIndex += 1;
  $pageNo = (int)($page["page_no"] ?? $pageIndex);
  $titleLetters = trim((string)($page["title_letters"] ?? ""));
  $text = (string)($page["text"] ?? "");
  $remarks = (string)($page["remarks"] ?? "");
  $qr = $code === ""
    ? ""
    : braille_pdf_fetch_data_uri(
        "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data="
        . rawurlencode("B" . $code . str_pad((string)$pageNo, 4, "0", STR_PAD_LEFT))
      );
  $qrMarkup = $qr !== ""
    ? '<img class="qr" src="' . braille_pdf_escape($qr) . '" alt="" />'
    : "";
  $titleMarkup = $titleLetters !== ""
    ? '<div class="title-letters">' . nl2br(braille_pdf_escape($titleLetters)) . '</div>'
    : "";
  $contentClass = $titleLetters !== "" ? "content-block content-with-title" : "content-block";

  $htmlPages .= '
    <div class="braille-page' . ($pageIndex > 1 ? ' page-break' : '') . '">
      <div class="page-number">#' . $pageNo . '</div>
      ' . $titleMarkup . '
      <div class="' . $contentClass . '">
        <div class="content">' . nl2br(braille_pdf_escape($text)) . '</div>
        <div class="remarks">' . nl2br(braille_pdf_escape($remarks)) . '</div>
      </div>
      <div class="qr-wrap">' . $qrMarkup . '</div>
    </div>';
}

if ($htmlPages === "") {
  $htmlPages = '<div class="braille-page"><div class="page-number">#1</div><div class="content">Geen braillepagina&apos;s ingesteld.</div></div>';
}

$html = '<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0; size: A4 portrait; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Courier New", Courier, monospace; color: #000; }
  .braille-page {
    position: relative;
    width: 210mm;
    height: 296mm;
    overflow: hidden;
  }
  .page-break { page-break-before: always; }
  .page-number {
    position: absolute;
    top: 17mm;
    right: 17mm;
    font-family: "Courier New", Courier, monospace;
    font-size: 12pt;
    font-weight: bold;
  }
  .title-letters {
    position: absolute;
    top: 22mm;
    left: 17mm;
    right: 30mm;
    font-size: 18pt;
    line-height: 16pt;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }
  .content-block {
    position: absolute;
    top: 22mm;
    left: 17mm;
    right: 30mm;
    bottom: 42mm;
    overflow: hidden;
  }
  .content-with-title { top: 51mm; }
  .content {
    font-size: 18pt;
    line-height: 16pt;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }
  .remarks {
    margin-top: 4pt;
    font-size: 12pt;
    line-height: 16pt;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }
  .qr-wrap {
    position: absolute;
    right: 17mm;
    bottom: 17mm;
    width: 14mm;
    height: 14mm;
  }
  .qr { width: 14mm; height: 14mm; }
</style>
</head>
<body>' . $htmlPages . '</body>
</html>';

$options = new Options();
$options->set("isRemoteEnabled", true);
$options->set("isHtml5ParserEnabled", true);
$options->set("defaultFont", "Courier");

$dompdf = new Dompdf($options);
$dompdf->loadHtml($html, "UTF-8");
$dompdf->setPaper("A4", "portrait");
$dompdf->render();

$safeTitle = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)($item["title"] ?? "")) ?: $id;
$safeTitle = trim($safeTitle, "-") ?: $id;

header("Content-Type: application/pdf");
header('Content-Disposition: inline; filename="mpop-' . $safeTitle . '-braille.pdf"');
header("Cache-Control: no-store");
echo $dompdf->output();
