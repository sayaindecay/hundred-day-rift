# 백일의 틈 — 배포 전 캐시 갱신 스탬프
# index.html의 css/js/content 링크 뒤에 ?v=<시각>을 붙인다.
# GitHub Pages는 파일을 10분간 캐시하므로, 주소를 바꿔야 새로고침 한 번에 새 버전이 적용된다.
# 사용: powershell -ExecutionPolicy Bypass -File tools\stamp.ps1
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$file = Join-Path $root 'index.html'
$stamp = Get-Date -Format 'yyyyMMddHHmm'
$html = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8)
$re = '((?:href|src)="(?:css|js|content)/[^"?]+)(\?v=[^"]*)?"'
$count = ([regex]::Matches($html, $re)).Count
$html = [regex]::Replace($html, $re, ('$1?v=' + $stamp + '"'))
[IO.File]::WriteAllText($file, $html, (New-Object Text.UTF8Encoding($false)))
Write-Host "stamped $count links with v=$stamp"
