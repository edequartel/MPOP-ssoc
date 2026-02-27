<?php
header("Content-Type: text/plain; charset=utf-8");
$ff = __DIR__ . "/bin/ffmpeg";
echo "ffmpeg path: $ff\n";
echo "is_file: " . (is_file($ff) ? "yes" : "no") . "\n";
echo "is_executable: " . (is_executable($ff) ? "yes" : "no") . "\n\n";
echo shell_exec(escapeshellarg($ff) . " -version 2>&1") ?: "(no output)\n";