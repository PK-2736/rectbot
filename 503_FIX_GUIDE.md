# 503 Error Fix Guide

## Quick Fix Steps

### Step 1: Restart Services
```bash
# Restart Cloudflare Tunnel
sudo systemctl restart cloudflared

# Restart Express Server
cd ~/rectbot/bot
pm2 restart rectbot-server

# Wait and check
sleep 3
pm2 list
```

### Step 2: Verify Tunnel URL
```bash
# Get tunnel URL
cloudflared tunnel list

# Expected output format:
# ID   NAME   CREATED   CONNECTIONS
# xxx  rectbot  2024-...  https://xxxx.cfargotunnel.com

# The URL should be: https://[ID].cfargotunnel.com
```

### Step 3: Update Worker Environment Variable
```bash
# Set VPS_EXPRESS_URL in Cloudflare Worker
# Go to: Cloudflare Dashboard → Workers → rectbot-backend → Settings → Variables

# Add/Update:
# VPS_EXPRESS_URL = https://[your-tunnel-id].cfargotunnel.com
```

### Step 4: Verify SERVICE_TOKEN
```bash
# Check token in server config
cd ~/rectbot/bot
grep SERVICE_TOKEN .env

# Should be: SERVICE_TOKEN=rectbot-service-token-2024

# Also check in Worker Secrets:
# Cloudflare Dashboard → Workers → rectbot-backend → Settings → Variables → Secrets
# SERVICE_TOKEN should be set to: rectbot-service-token-2024
```

### Step 5: Test Connection
```bash
# Local test
curl http://localhost:3000/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024"

# Tunnel test
TUNNEL_URL=$(cloudflared tunnel list | tail -1 | awk '{print $NF}')
curl $TUNNEL_URL/api/recruitment/list \
  -H "x-service-token: rectbot-service-token-2024"
```

## Common Issues

### Issue 1: cloudflared not running
```bash
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
sudo systemctl status cloudflared
```

### Issue 2: Express server not responding
```bash
cd ~/rectbot/bot
pm2 logs rectbot-server --lines 20
pm2 restart rectbot-server
```

### Issue 3: Port 3000 already in use
```bash
sudo lsof -i :3000
# Kill the process if needed
sudo kill -9 <PID>
pm2 restart rectbot-server
```

### Issue 4: Tunnel URL mismatch
1. Get current tunnel URL: `cloudflared tunnel list`
2. Update Worker variable `VPS_EXPRESS_URL`
3. Redeploy Worker or wait for cache expiration

## Debug Commands

```bash
# Full diagnosis
cd ~/rectbot
bash diagnose_503.sh

# Check all services
sudo systemctl status cloudflared
pm2 list
netstat -tuln | grep 3000

# Check logs
pm2 logs rectbot-server --lines 50
sudo journalctl -u cloudflared -n 50
```

## Expected Behavior

When working correctly:
1. `cloudflared` service is `active (running)`
2. `pm2 list` shows `rectbot-server` as `online`
3. `netstat` shows port 3000 is `LISTEN`
4. Local curl returns JSON with recruitment data
5. Tunnel curl returns the same data

## Contact

If issues persist after following these steps, provide:
1. Output of `diagnose_503.sh`
2. PM2 logs: `pm2 logs --lines 50`
3. Cloudflared status: `sudo systemctl status cloudflared`