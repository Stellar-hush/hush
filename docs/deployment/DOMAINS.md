# Beta Domains, DNS, TLS, CORS & Federation Setup Guide (BETA-090)

This guide documents the DNS records, TLS requirements, redirects, CORS configurations, and operator verification procedures for the Hush domain plan.

---

## 1. Approved Domain Layout

Stable HTTPS origins are assigned to the primary domain `stealth.me` and staging/preview configurations. No preview or dev URLs bleed into production.

### Production Environment (`stealth.me`)

| Subdomain / Host    | Service                   | Target / Routing                                                                                      | TLS Certificate          |
| :------------------ | :------------------------ | :---------------------------------------------------------------------------------------------------- | :----------------------- |
| `stealth.me`        | Root Domain / SEP-1 TOML  | Serves `/.well-known/stellar.toml` directly; redirects all other requests to `https://app.stealth.me` | Cloudflare Universal SSL |
| `www.stealth.me`    | Redirect Host             | Redirects all requests to `https://app.stealth.me`                                                    | Cloudflare Universal SSL |
| `app.stealth.me`    | Web Application (Start)   | Cloudflare Worker / Pages hosting the app shell                                                       | Cloudflare Universal SSL |
| `relay.stealth.me`  | API / Message Relay       | Cloudflare Worker api routing                                                                         | Cloudflare Universal SSL |
| `object.stealth.me` | CDN / Object Storage (R2) | Public custom domain mapped to `stealth-mail-object-store` bucket                                     | Cloudflare Universal SSL |

### Preview / Staging Environment

| Subdomain / Host            | Service                        | Target / Routing                                                          | TLS Certificate          |
| :-------------------------- | :----------------------------- | :------------------------------------------------------------------------ | :----------------------- |
| `app-preview.stealth.me`    | Web Application (Preview)      | Cloudflare Worker / Pages hosting preview shell                           | Cloudflare Universal SSL |
| `relay-preview.stealth.me`  | API / Relay (Preview)          | Cloudflare Worker preview api routing                                     | Cloudflare Universal SSL |
| `object-preview.stealth.me` | CDN / Object Storage (Preview) | Public custom domain mapped to `stealth-mail-object-store-preview` bucket | Cloudflare Universal SSL |

---

## 2. DNS Provider Records (Cloudflare)

Configure the following records in the DNS console for `stealth.me`.

> [!WARNING]
> Do NOT proxy object/R2 domains if you want to bypass Cloudflare edge cache completely for large attachment downloads, or configure Cache Rules accordingly.

```text
# Production
CNAME    app         stealth-mail.pages.dev                 Proxied
CNAME    relay       stealth-mail-relay.workers.dev         Proxied
CNAME    object      stealth-mail-object-store.r2.cloudfl... Proxied

# Preview / Staging
CNAME    app-preview  stealth-mail-preview.pages.dev         Proxied
CNAME    relay-preview stealth-mail-relay-preview.workers.dev Proxied
CNAME    object-preview stealth-mail-object-store-prev.r2.clo... Proxied

# Root Domain Redirect CNAMEs
CNAME    @           app.stealth.me                         Proxied
CNAME    www         app.stealth.me                         Proxied
```

---

## 3. Cloudflare TLS and Redirect Policies

1. **SSL/TLS Encryption Mode**: Set to **Full (Strict)**.
2. **Always Use HTTPS**: Enabled (redirects all port 80 HTTP requests to port 443 HTTPS).
3. **HTTP Strict Transport Security (HSTS)**:
   - Status: Enabled
   - Max Age: `31536000` (1 year)
   - Include subdomains: Enabled
   - Preload: Enabled

---

## 4. Operator Verification Commands

Run these repeatable validation commands against the live beta environment to confirm DNS, TLS, redirects, CORS, security headers, and the Stellar federation protocol are correctly configured.

### A. Verify DNS Resolution and CNAME Targets

Confirm that hosts resolve to the correct Cloudflare edge IP space.

```bash
nslookup app.stealth.me
nslookup relay.stealth.me
```

### B. Verify TLS Handshake and Security Headers

Verify TLS version (must be TLS 1.3 or 1.2 minimum) and HTTP response headers (must include `x-content-type-options: nosniff`).

```bash
openssl s_client -connect app.stealth.me:443 -tls1_3 < /dev/null
```

```bash
curl -I -s -S https://app.stealth.me/
```

Verify that the `Set-Cookie` header has `HttpOnly`, `Secure` flags, and `SameSite=Lax` without bleeding into cross-subdomain access.

### C. Verify HTTPS and Root Domain Redirects

Confirm that accessing HTTP redirects to HTTPS, and the root domain redirects to the `app.` subdomain.

```bash
# Expect: HTTP/1.1 301 Moved Permanently, Location: https://stealth.me/inbox
curl -I -s -S -H "x-forwarded-proto: http" http://stealth.me/inbox

# Expect: HTTP/1.1 301 Moved Permanently, Location: https://app.stealth.me/dashboard
curl -I -s -S https://stealth.me/dashboard
```

### D. Verify SEP-1 stellar.toml Endpoint

Confirm `stellar.toml` is served with the correct Content-Type, CORS wildcard, and points to the correct federation server.

```bash
# Expect: HTTP/1.1 200 OK, Access-Control-Allow-Origin: *
# Body containing FEDERATION_SERVER="https://app.stealth.me/api/v1/federation"
curl -i https://stealth.me/.well-known/stellar.toml
```

### E. Verify Stellar Federation Resolution (SEP-2)

Verify active address lookups resolve the G-address, and inactive/suspended addresses fail with `404 Not Found`.

**1. Address Lookup (`type=name`)**

```bash
# Expect: HTTP/1.1 200 OK, Access-Control-Allow-Origin: *
# Body: {"data":{"stellar_address":"alice*stealth.me","account_id":"GBRPYHIL..."}}
curl -i "https://app.stealth.me/api/v1/federation?type=name&q=alice*stealth.me"
```

**2. Reverse Lookup (`type=id`)**

```bash
# Expect: HTTP/1.1 200 OK, Access-Control-Allow-Origin: *
# Body: {"data":{"stellar_address":"alice*stealth.me","account_id":"GBRPYHIL..."}}
curl -i "https://app.stealth.me/api/v1/federation?type=id&q=GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXAA"
```

**3. Inactive/Suspended Query (Denied/404)**

```bash
# Expect: HTTP/1.1 404 Not Found
curl -i "https://app.stealth.me/api/v1/federation?type=name&q=bob*stealth.me"
```
