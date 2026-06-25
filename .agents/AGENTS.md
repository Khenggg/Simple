# SimpleOJ Project Rules & Deployment

## Auto-Deploy Hook URL

Set this in local/private environment only:
`RENDER_DEPLOY_HOOK_URL=...`

Do not include the actual key or URL in this file.

Example command (PowerShell):
```powershell
Invoke-RestMethod -Uri $env:RENDER_DEPLOY_HOOK_URL -Method Get
```

Example command (cURL):
```bash
curl -X GET "$RENDER_DEPLOY_HOOK_URL"
```
