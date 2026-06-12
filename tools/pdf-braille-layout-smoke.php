<?php
declare(strict_types=1);

require_once __DIR__ . "/../vendor/autoload.php";

use Dompdf\Dompdf;
use Dompdf\Options;

$samplePages = [
  [
    "page_no" => 1,
    "title_letters" => "b a l",
    "text" => "bal\n\nDit is een voorbeeldtekst voor de eerste braillepagina.",
    "remarks" => "Opmerking bij pagina 1.",
  ],
  [
    "page_no" => 2,
    "title_letters" => "",
    "text" => "Tweede pagina zonder titelletters.\nDe tekst begint hoger op de pagina.",
    "remarks" => "Opmerking bij pagina 2.",
  ],
];

$htmlPages = "";
foreach ($samplePages as $index => $page) {
  $hasTitle = $page["title_letters"] !== "";
  $htmlPages .= '
    <div class="braille-page' . ($index > 0 ? ' page-break' : '') . '">
      <div class="page-number">#' . $page["page_no"] . '</div>
      ' . ($hasTitle ? '<div class="title-letters">' . nl2br(htmlspecialchars($page["title_letters"])) . '</div>' : '') . '
      <div class="content-block' . ($hasTitle ? ' content-with-title' : '') . '">
        <div class="content">' . nl2br(htmlspecialchars($page["text"])) . '</div>
        <div class="remarks">' . nl2br(htmlspecialchars($page["remarks"])) . '</div>
      </div>
      <div class="qr-wrap"></div>
    </div>';
}

$html = '<style>
@page{margin:0;size:A4 portrait}*{box-sizing:border-box}body{margin:0;font-family:"Courier New",Courier,monospace}
.braille-page{position:relative;width:210mm;height:296mm;overflow:hidden}.page-break{page-break-before:always}
.page-number{position:absolute;top:17mm;right:17mm;font-size:12pt;font-weight:bold}
.title-letters{position:absolute;top:22mm;left:17mm;right:30mm;font-size:18pt;line-height:16pt;white-space:pre-wrap;overflow-wrap:break-word}
.content-block{position:absolute;top:22mm;left:17mm;right:30mm;bottom:42mm;overflow:hidden}.content-with-title{top:51mm}
.content{font-size:18pt;line-height:16pt;white-space:pre-wrap;overflow-wrap:break-word}.remarks{margin-top:4pt;font-size:12pt;line-height:16pt;white-space:pre-wrap;overflow-wrap:break-word}
.qr-wrap{position:absolute;right:17mm;bottom:17mm;width:14mm;height:14mm;border:1px solid #777}
</style>' . $htmlPages;

$options = new Options();
$options->set("defaultFont", "Courier");
$dompdf = new Dompdf($options);
$dompdf->loadHtml($html, "UTF-8");
$dompdf->setPaper("A4", "portrait");
$dompdf->render();

$output = __DIR__ . "/../tmp/pdfs/braille-layout-smoke.pdf";
if (!is_dir(dirname($output))) mkdir(dirname($output), 0775, true);
file_put_contents($output, $dompdf->output());
echo $output . PHP_EOL;
