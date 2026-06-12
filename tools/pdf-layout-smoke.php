<?php
declare(strict_types=1);

require_once __DIR__ . "/../vendor/autoload.php";

use Dompdf\Dompdf;
use Dompdf\Options;

$logoBytes = file_get_contents(__DIR__ . "/../media/logo.png") ?: "";
$logo = "data:image/png;base64," . base64_encode($logoBytes);
$pages = "";
for ($page = 1; $page <= 3; $page++) {
  $pages .= '
    <div class="pdf-page' . ($page > 1 ? ' page-break' : '') . '">
      <div class="page-number">' . $page . '<span class="braille-page">#' . $page . '&nbsp;&nbsp;</span></div>
      ' . ($page === 1 ? '<div class="title">Voorbeeld multimodaal</div><div class="braille-title">Voorbeeld multimodaal</div>' : '') . '
      <div class="marker top-left"><img src="' . $logo . '"></div>
      <div class="marker top-right"><img src="' . $logo . '"></div>
      <div class="marker bottom-left"><img src="' . $logo . '"></div>
      <div class="marker bottom-right"><img src="' . $logo . '"></div>
      <div class="image-area image-area-' . $page . '"><div class="image-cell"><img class="main-image" src="' . $logo . '"></div></div>
    </div>';
}

$html = '<style>
@page{margin:0;size:A4 portrait}*{box-sizing:border-box}body{margin:0;font-family:DejaVu Sans,sans-serif}
.pdf-page{position:relative;width:210mm;height:296mm;overflow:hidden}.page-break{page-break-before:always}
.title,.braille-title{position:absolute;left:18mm;right:18mm;text-align:center;font-size:32pt;line-height:1}.title{top:12mm}.braille-title{top:27mm}
.page-number{position:absolute;top:6mm;right:3mm;font-size:12pt;white-space:nowrap}.braille-page{margin-left:3mm;font-size:32pt;vertical-align:middle}
.marker{position:absolute;width:11.3mm;height:11.3mm}.marker img{width:11.3mm;height:11.3mm}.top-left{top:27mm;left:17mm}.top-right{top:27mm;right:17mm}.bottom-left{bottom:17mm;left:17mm}.bottom-right{bottom:17mm;right:17mm}
.image-area{position:absolute;left:17mm;right:17mm;bottom:34mm;display:table;width:176mm;text-align:center}.image-area-1{top:47mm;height:216mm}.image-area-2,.image-area-3{top:43mm;height:220mm}
.image-cell{display:table-cell;width:176mm;height:100%;vertical-align:middle;text-align:center}.main-image{max-width:150mm;max-height:180mm}
</style>' . $pages;

$options = new Options();
$options->set("isRemoteEnabled", true);
$options->set("isHtml5ParserEnabled", true);
$dompdf = new Dompdf($options);
$dompdf->loadHtml($html, "UTF-8");
$dompdf->setPaper("A4", "portrait");
$dompdf->render();

$output = __DIR__ . "/../tmp/pdfs/multimodal-layout-smoke.pdf";
if (!is_dir(dirname($output))) mkdir(dirname($output), 0775, true);
file_put_contents($output, $dompdf->output());
file_put_contents(__DIR__ . "/../tmp/pdfs/multimodal-layout-smoke.html", $html);
echo $output . PHP_EOL;
