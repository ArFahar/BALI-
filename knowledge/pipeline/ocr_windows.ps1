<#
  Stage 1 helper: OCR scanned PDFs with the OCR engine built into Windows 10/11.
  No extra software is needed. Each page is rendered with Windows.Data.Pdf at 2x scale and
  recognised with Windows.Media.Ocr. Pages are separated by a form feed (\f), same as pdftotext.

  Usage (Windows PowerShell 5.1):
    powershell -ExecutionPolicy Bypass -File ocr_windows.ps1 -Pdf <in.pdf> -Out <out.txt> [-Lang en-US] [-Scale 2]

  Limitation: only the OCR languages installed in Windows are available (here en-US / en-GB).
  The English engine reads Indonesian Latin-script text reasonably well, but output must be reviewed.
#>
param(
  [Parameter(Mandatory = $true)][string]$Pdf,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Lang = 'en-US',
  [double]$Scale = 2.0
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$ext = [System.WindowsRuntimeSystemExtensions].GetMethods()
$asTaskOp = $ext | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$asTaskAction = $ext | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1

function Await($op, [Type]$type) {
  $task = $asTaskOp.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}
function AwaitAction($action) {
  $task = $asTaskAction.Invoke($null, @($action))
  $task.Wait(-1) | Out-Null
}

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($Lang))
if (-not $engine) { throw "OCR language $Lang is not installed" }

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $Pdf).Path)) ([Windows.Storage.StorageFile])
$doc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
$max = [Windows.Media.Ocr.OcrEngine]::MaxImageDimension

$pages = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $doc.PageCount; $i++) {
  $page = $doc.GetPage($i)
  $opts = [Windows.Data.Pdf.PdfPageRenderOptions]::new()
  $w = [Math]::Min([uint32]($page.Size.Width * $Scale), [uint32]$max)
  $h = [Math]::Min([uint32]($page.Size.Height * $Scale), [uint32]$max)
  $opts.DestinationWidth = $w
  $opts.DestinationHeight = $h
  $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
  AwaitAction ($page.RenderToStreamAsync($stream, $opts))
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $pages.Add((($result.Lines | ForEach-Object { $_.Text }) -join "`n"))
  $bitmap.Dispose(); $stream.Dispose(); $page.Dispose()
  Write-Host ("  page {0}/{1}" -f ($i + 1), $doc.PageCount)
}

[System.IO.File]::WriteAllText($Out, ($pages -join "`f"), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "OCR done: $Out ($($doc.PageCount) pages)"
