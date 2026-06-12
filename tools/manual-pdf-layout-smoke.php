<?php
declare(strict_types=1);

require_once __DIR__ . "/../vendor/autoload.php";

use Dompdf\Dompdf;
use Dompdf\Options;

$paragraph = "Dit is een voorbeeldtekst voor de handleiding. De tekst wordt automatisch afgebroken binnen de beschikbare breedte en gebruikt dezelfde eenvoudige indeling als de oorspronkelijke handleiding-PDF.";
$body = implode("\n\n", array_fill(0, 35, $paragraph));

$html = '<style>
@page{margin:17mm;size:A4 portrait}*{box-sizing:border-box}
body{margin:0;font-family:Helvetica,Arial,sans-serif;color:#000;font-size:12pt;line-height:14pt}
h1{margin:0 0 16pt;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:24pt;font-weight:normal;line-height:28pt}
.manual-text{white-space:pre-wrap;overflow-wrap:break-word}
</style>
<h1>Voorbeeld handleiding</h1>
<div class="manual-text">' . htmlspecialchars($body, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8") . '</div>';

$options = new Options();
$options->set("defaultFont", "Helvetica");
$dompdf = new Dompdf($options);
$dompdf->loadHtml($html, "UTF-8");
$dompdf->setPaper("A4", "portrait");
$dompdf->render();

$output = __DIR__ . "/../tmp/pdfs/manual-layout-smoke.pdf";
if (!is_dir(dirname($output))) mkdir(dirname($output), 0775, true);
file_put_contents($output, $dompdf->output());
echo $output . PHP_EOL;
