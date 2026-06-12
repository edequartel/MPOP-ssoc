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
  . "/rest/v1/mpop_items?select=id,title,handleiding_text&id=eq."
  . rawurlencode($id)
  . "&limit=1";
$items = supabase_get_json($itemUrl, $auth["jwt"]);
$item = $items[0] ?? null;
if (!is_array($item)) {
  json_out(404, ["ok" => false, "error" => "Item not found."]);
}

function manual_pdf_escape(string $value): string {
  return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8");
}

$title = trim((string)($item["title"] ?? "")) ?: "MPOP item";
$body = (string)($item["handleiding_text"] ?? "");

$html = '<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 17mm; size: A4 portrait; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Helvetica, Arial, sans-serif;
    color: #000;
    font-size: 12pt;
    line-height: 14pt;
  }
  h1 {
    margin: 0 0 16pt;
    text-align: center;
    font-family: Helvetica, Arial, sans-serif;
    font-size: 24pt;
    font-weight: normal;
    line-height: 28pt;
  }
  .manual-text {
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }
</style>
</head>
<body>
  <h1>' . manual_pdf_escape($title) . '</h1>
  <div class="manual-text">' . manual_pdf_escape($body) . '</div>
</body>
</html>';

$options = new Options();
$options->set("isHtml5ParserEnabled", true);
$options->set("defaultFont", "Helvetica");

$dompdf = new Dompdf($options);
$dompdf->loadHtml($html, "UTF-8");
$dompdf->setPaper("A4", "portrait");
$dompdf->render();

$safeTitle = preg_replace('/[^A-Za-z0-9_-]+/', '-', $title) ?: "item";
$safeTitle = trim($safeTitle, "-") ?: "item";

header("Content-Type: application/pdf");
header('Content-Disposition: inline; filename="mpop-manual-' . $safeTitle . '.pdf"');
header("Cache-Control: no-store");
echo $dompdf->output();
