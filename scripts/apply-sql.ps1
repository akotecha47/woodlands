# scripts/apply-sql.ps1
#
# Runs a .sql file against a Supabase project through the Management API query
# endpoint. This is the project's standing route for migrations and data-ops:
# Docker is not installed on the build machine, so `supabase db reset` and the
# local stack are unavailable, and everything from 021 onward has been applied
# this way.
#
# ── WHY THIS SCRIPT EXISTS AT ALL ───────────────────────────────────────────
# Because the ad-hoc version of it corrupted production, twice, in the same way.
#
# PowerShell 5.1's `Get-Content` decodes files using the ANSI codepage
# (Windows-1252 here), NOT UTF-8. A migration file containing box-drawing
# characters or an em-dash is therefore read as mojibake and sent as mojibake.
# Migration 059 was applied that way on 17 August 2026: production's stored
# post_bar_count body carries 92 x U+00E2 where the file has 92 x U+2500, and
# set_stock_quantity carries 1 x U+00E2 where the file has an em-dash. Two
# COMMENT ON texts went the same way, one of them back in the Sprint C era.
# Caught by rebuild proof run 7 — the FILES were correct throughout; only
# production was wrong, which is the one direction a production-only probe can
# never see.
#
# standards.md section 4 already carried the rule
# ("decode explicitly ... never bare Get-Content") from the Farmers Market
# import incident. It was followed in the import path and not in the apply path.
# Hence a script, rather than a rule nobody re-reads at 1am.
#
# Two guards, both cheap:
#   1. The file is read as UTF-8 explicitly.
#   2. The decoded text is REFUSED if it still contains U+00C3 / U+00E2, the
#      signature of UTF-8 misread as Latin-1. That catches a file that was
#      already saved corrupt, which guard 1 cannot.
#
# ── USAGE ───────────────────────────────────────────────────────────────────
#   .\scripts\apply-sql.ps1 -File supabase\migrations\060_x.sql
#   .\scripts\apply-sql.ps1 -File probe.sql -ReadOnly        # diagnosis
#   .\scripts\apply-sql.ps1 -File x.sql -ProjectRef <ref>    # e.g. a throwaway
#
# -ReadOnly refuses anything that is not a SELECT/WITH read. Use it for ALL
# diagnosis against production. Note the endpoint connects as `postgres`
# (rolbypassrls = true), so a statement succeeding here proves NOTHING about
# what anon/authenticated/department_head may do — prove access as the role,
# with SET LOCAL ROLE, rolled back.
#
# The access token lives in Windows Credential Manager under the generic target
# `Supabase CLI:supabase`. Its blob is UTF-8, not UTF-16 — decoding it with the
# usual CredentialBlobSize/2 idiom yields mojibake.

param(
  [Parameter(Mandatory=$true)][string]$File,
  [string]$ProjectRef = 'gttsjmxltrxxfplqjans',   # woodlands production
  [switch]$ReadOnly
)

$ErrorActionPreference = 'Stop'

if (-not ('WoodlandsCredMan' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WoodlandsCredMan {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags; public uint Type; public IntPtr TargetName; public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;
    public uint AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName;
  }
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr cred);
  public static string Get(string target) {
    IntPtr p;
    if (!CredRead(target, 1, 0, out p)) throw new Exception("CredRead failed for " + target);
    var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
    byte[] b = new byte[c.CredentialBlobSize];
    Marshal.Copy(c.CredentialBlob, b, 0, (int)c.CredentialBlobSize);
    CredFree(p);
    return System.Text.Encoding.UTF8.GetString(b);
  }
}
'@
}

$token = [WoodlandsCredMan]::Get('Supabase CLI:supabase')
if (-not $token) { throw 'No Supabase access token found in Credential Manager.' }

# ── guard 1: read as UTF-8, never the ANSI codepage ─────────────────────────
$sql = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $File), [System.Text.Encoding]::UTF8)

# ── guard 2: refuse text that still looks double-encoded ────────────────────
$moj = [regex]::Matches($sql, "[$([char]0x00C3)$([char]0x00E2)]").Count
if ($moj -gt 0) {
  throw "REFUSED: decoded SQL contains $moj mojibake marker(s) (U+00C3 / U+00E2). The FILE is probably already corrupt - fix it at source, do not send it."
}

# ── optional read-only guard, for diagnosis against live ────────────────────
if ($ReadOnly) {
  $stripped = ($sql -split "`n" | Where-Object { $_ -notmatch '^\s*--' }) -join "`n"
  if ($stripped.TrimStart() -notmatch '^(?i)(select|with)\b') {
    throw 'REFUSED: -ReadOnly requires the statement to begin with SELECT or WITH.'
  }
  if ($stripped -match '(?i)\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|call|do)\b') {
    throw 'REFUSED: -ReadOnly and a mutating keyword is present.'
  }
}

$body = @{ query = $sql } | ConvertTo-Json -Depth 3 -Compress

try {
  $resp = Invoke-RestMethod -Method Post `
    -Uri "https://api.supabase.com/v1/projects/$ProjectRef/database/query" `
    -Headers @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' } `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
  $resp | ConvertTo-Json -Depth 10
} catch {
  $r = $_.Exception.Response
  if ($r) {
    $sr = New-Object System.IO.StreamReader($r.GetResponseStream())
    Write-Output ('ERROR-BODY: ' + $sr.ReadToEnd())
  }
  throw
}
