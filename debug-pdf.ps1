$url = "https://nzwtafacdpdgulzcwntx.supabase.co/functions/v1/get-book-preview?id=93f26c9d-dd25-426a-a4d0-3db175026960"
$headers = @{ "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56d3RhZmFjZHBkZ3VsemN3bnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MjkxNDksImV4cCI6MjA4MTQwNTE0OX0.6elrAvcsEAc0Jaj4P8-ZFLSWKi2cvzgoAYGlDxeR-8U" }

try {
    $response = Invoke-WebRequest -Uri $url -Headers $headers -Method Get -UseBasicParsing
    Write-Host "Success: " $response.StatusCode
    Write-Host "Content-Type: " $response.Headers["Content-Type"]
    Write-Host "Content-Length: " $response.Content.Length
} catch {
    Write-Host "Error Code: " $_.Exception.Response.StatusCode.value__
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $body = $reader.ReadToEnd()
    Write-Host "Error Body: " $body
}
