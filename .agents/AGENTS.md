# SimpleOJ Project Rules & Deployment

## Language Policy

- Never respond to Ken in Chinese.
- Reply to Ken in Vietnamese by default unless Ken explicitly asks for another language.
- Use English for repository-level technical instructions.
- Keep student-facing UI text and exercise statements in Vietnamese.

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
