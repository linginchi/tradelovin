$names = @("VOLC_ACCESS_KEY","VOLC_SECRET_KEY","DOUBAO_TTS_ACCESS_TOKEN","NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","DEEPSEEK_API_KEY")
foreach ($n in $names) {
  $v = [Environment]::GetEnvironmentVariable($n, "Process")
  if ($v) { Write-Host "$n = SET" } else { Write-Host "$n = NOT SET" }
}
