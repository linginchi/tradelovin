# Mainland Access Runbook (Aliyun HK Reverse Proxy)

This runbook helps Mainland teammates access TradeLovin for testing by using an Aliyun Hong Kong server as HTTPS reverse proxy.

## When to use

- `tradelovin.com` is blocked/intermittent from Mainland networks.
- You want minimum migration effort and keep Cloudflare Workers deployment unchanged.
- You already own an Aliyun `.com` domain and can create an HK ECS/Lighthouse instance.

## Architecture

MainlandUser -> AliyunHKNginx -> CloudflareWorker -> Supabase

## Prerequisites

1. A Linux server in Aliyun Hong Kong.
2. A `.com` domain managed in Aliyun DNS.
3. Open ports on the server security group:
   - `22/tcp` (SSH)
   - `80/tcp` (certbot challenge)
   - `443/tcp` (HTTPS)
4. Existing Worker hostname, e.g. `tradelovin.mark-377.workers.dev`.

## Step 1: DNS in Aliyun

Create these DNS records for your new test domain:

- `A @ -> <HK_SERVER_PUBLIC_IP>`
- `A www -> <HK_SERVER_PUBLIC_IP>`

Wait for propagation before issuing certificates.
You can copy from [`dns-records-example.md`](dns-records-example.md).

## Step 2: bootstrap Nginx proxy

Upload this folder to the server and run:

```bash
chmod +x setup-hk-proxy.sh verify-mainland-proxy.sh
./setup-hk-proxy.sh <your-domain.com> <worker-host>
```

Example:

```bash
./setup-hk-proxy.sh tradelovin-hk.com tradelovin.mark-377.workers.dev
```

The script will:

1. Install `nginx`, `certbot`.
2. Render `nginx-tradelovin.conf.template`.
3. Enable Nginx site.
4. Request and install Let's Encrypt certificate.
5. Force HTTPS redirect.

## Step 3: verify

```bash
./verify-mainland-proxy.sh <your-domain.com> <worker-host>
```

If status is 200 and page features are normal, share the new domain with Mainland testers.
Message template: [`tester-notification-template.md`](tester-notification-template.md).

## Troubleshooting

- `certbot` fails:
  - confirm DNS resolved to HK server
  - confirm inbound `80/443` allowed
- 502/504:
  - verify worker host is reachable from server
  - check nginx error log: `/var/log/nginx/error.log`
- static assets fail:
  - check `/_next/static/*` response headers and status

## Notes

- This is a testing-entry strategy, not full Mainland compliance hosting.
- If you need production-grade Mainland acceleration/compliance later, evaluate:
  - China mainland ICP + domestic CDN
  - dual-origin architecture (Mainland + Global)
