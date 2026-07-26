$ErrorActionPreference = 'Stop'
$SQ  = [char]39
$src = 'C:\Users\akote\OneDrive - Streamline\Clients\Woodlands\farmers_market_import.sql'
$out = 'C:\Users\akote\Dev\woodlands\scripts\data-ops\2026-07-26_fm_holders_import.sql'

# Split a VALUES tuple body on top-level commas, respecting '' escaping.
function Split-Fields([string]$s) {
  $f = New-Object System.Collections.Generic.List[string]
  $cur = New-Object System.Text.StringBuilder
  $inQ = $false
  for ($i = 0; $i -lt $s.Length; $i++) {
    $c = $s[$i]
    if ($inQ) {
      if ($c -eq $SQ) {
        if ($i + 1 -lt $s.Length -and $s[$i+1] -eq $SQ) { [void]$cur.Append($SQ); [void]$cur.Append($SQ); $i++ }
        else { $inQ = $false; [void]$cur.Append($SQ) }
      } else { [void]$cur.Append($c) }
    } else {
      if ($c -eq $SQ) { $inQ = $true; [void]$cur.Append($SQ) }
      elseif ($c -eq ',') { $f.Add($cur.ToString().Trim()); [void]$cur.Clear() }
      else { [void]$cur.Append($c) }
    }
  }
  $f.Add($cur.ToString().Trim())
  return $f
}

# Read as UTF-8 explicitly — the source has no BOM, and PowerShell 5.1's
# Get-Content would otherwise decode it as Windows-1252 and mangle every em-dash
# and curly apostrophe in the register.
$rows = ([System.IO.File]::ReadAllText($src, [System.Text.Encoding]::UTF8) -split "`r?`n") |
          Where-Object { $_ -match '^\s*\(\s*\d+\s*,' }
Write-Output ("source value rows: " + $rows.Count)

$kept          = New-Object System.Collections.Generic.List[string]
$keptStall     = New-Object System.Collections.Generic.List[int]
$keptName      = New-Object System.Collections.Generic.List[string]
$skipNullPhone = New-Object System.Collections.Generic.List[string]
$skipDuplicate = New-Object System.Collections.Generic.List[string]
$malformed     = 0

foreach ($r in $rows) {
  $body = $r.Trim().TrimEnd(';').TrimEnd(',')
  $body = $body.Substring(1, $body.Length - 2)
  $f = Split-Fields $body
  if ($f.Count -ne 8) {
    $malformed++
    Write-Output ("  MALFORMED (" + $f.Count + " fields): " + $r.Substring(0, [Math]::Min(70, $r.Length)))
    continue
  }

  $stallInt = [int]$f[0]
  $nameRaw  = $f[1]
  $plain    = $nameRaw.Trim($SQ)
  $phone    = $f[3]

  # Decision 3 — phone is NOT NULL in the live schema; skip, no placeholder.
  if ($phone -eq 'NULL') {
    $skipNullPhone.Add("stall " + $stallInt + " - " + $plain)
    continue
  }

  # Decision 6 — stall_number becomes zero-padded, A-prefixed text.
  # Decision 2 — stall_type 'Other' (NOT NULL, 5-value CHECK, absent from source).
  $stall = "'A{0:D3}'" -f $stallInt
  $line = "  (" + $stall + ", " + $nameRaw + ", " + $f[2] + ", 'Other', " + $phone +
          ", " + $f[4] + ", " + $f[5] + ", " + $f[6] + ", " + $f[7] + ")"
  $kept.Add($line)
  $keptStall.Add($stallInt)
  $keptName.Add($plain)
}

# Decision 4 — duplicate stall numbers: keep the LAST occurrence.
$lastIndexOf = @{}
for ($i = 0; $i -lt $keptStall.Count; $i++) { $lastIndexOf[$keptStall[$i]] = $i }
$final = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $kept.Count; $i++) {
  if ($lastIndexOf[$keptStall[$i]] -ne $i) {
    $skipDuplicate.Add("stall " + $keptStall[$i] + " - " + $keptName[$i] + " (earlier of two, dropped)")
  } else {
    $final.Add($kept[$i])
  }
}

Write-Output ""
Write-Output ("malformed rows       : " + $malformed)
Write-Output ("skipped (NULL phone) : " + $skipNullPhone.Count)
foreach ($s in $skipNullPhone) { Write-Output ("    " + $s) }
Write-Output ("skipped (duplicate)  : " + $skipDuplicate.Count)
foreach ($s in $skipDuplicate) { Write-Output ("    " + $s) }
Write-Output ("FINAL ROW COUNT      : " + $final.Count)

$hdr = @"
-- Farmers Market import - real stallholders from the Feb 2026 register
-- Source: Stallholders_Database.xlsx sheet 'FEB 2026', via Aman's pipeline.
-- Transformed from farmers_market_import.sql to match the live fm_holders
-- schema. Data only - deliberately NOT in supabase/migrations, since migrations
-- are replayed to rebuild the schema and must not carry client rows.
--
-- TRANSFORMS (all six decided by Aman after the Task 0 schema diff):
--   1. name -> full_name        the live column is full_name; 'name' does not exist
--   2. stall_type 'Other'       NOT NULL with a 5-value CHECK, absent from source.
--                               Reclassify from products post-meeting.
--   3. NULL-phone rows skipped  phone is NOT NULL. No placeholder, constraint left
--                               intact. $($skipNullPhone.Count) rows deferred for Rose to collect numbers.
--   4. duplicate stall 226      earlier occurrence dropped, later kept
--   5. products                 new column added by migration 029
--   6. stall_number 'A%03d'     integer 1 -> 'A001'; the column is text and UNIQUE
--
-- Row arithmetic: 319 register stalls
--                  -1  stall 205, no holder name (excluded upstream)
--                  -1  duplicate stall 226
--                  -$($skipNullPhone.Count) rows with no phone number
--                  = $($final.Count) imported
--
-- Parsed with a quote-aware field splitter rather than a comma regex: several
-- product strings contain internal commas, so a naive split would have shifted
-- every later column on those rows.
BEGIN;

INSERT INTO public.fm_holders
  (stall_number, full_name, business_name, stall_type, phone, email, products, notes, status)
VALUES
"@

$sql = $hdr + ($final -join (',' + "`n")) + ";" + "`n`n" + "COMMIT;" + "`n"
[System.IO.File]::WriteAllText($out, $sql, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ""
Write-Output ("written: " + $out)
