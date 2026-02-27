<?php
header("Content-Type: text/plain; charset=utf-8");

$disabled = ini_get('disable_functions') ?: '';
echo "disable_functions = $disabled\n\n";

$tests = ["shell_exec", "exec", "proc_open", "popen"];
foreach ($tests as $fn) {
  echo $fn . " exists=" . (function_exists($fn) ? "yes" : "no") . "\n";
}

echo "\ncommand -v ffmpeg:\n";
if (function_exists("shell_exec")) {
  echo shell_exec("command -v ffmpeg 2>&1") ?: "(none)\n";
} else {
  echo "(shell_exec disabled)\n";
}