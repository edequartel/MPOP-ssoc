<?php
header("Content-Type: text/plain; charset=utf-8");
echo shell_exec("uname -a 2>&1");