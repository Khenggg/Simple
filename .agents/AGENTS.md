# SimpleOJ Project Rules & Deployment

## Auto-Deploy Hook URL
When pushing changes to the repository, trigger the Render auto-deploy webhook by executing an HTTP GET request to this URL:
`https://api.render.com/deploy/srv-d8qor4flk1mc73aun7jg?key=agsshFp9xhU`

Example command (PowerShell):
```powershell
Invoke-RestMethod -Uri "https://api.render.com/deploy/srv-d8qor4flk1mc73aun7jg?key=agsshFp9xhU" -Method Get
```

Example command (cURL):
```bash
curl -X GET "https://api.render.com/deploy/srv-d8qor4flk1mc73aun7jg?key=agsshFp9xhU"
```
