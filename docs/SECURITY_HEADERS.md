# Security Headers Configuration

## Overview

This document describes the security headers implemented for recrubo.net to ensure secure HTTPS connections and prevent privacy warnings in browsers.

## Problem Addressed

The Japanese browser warning "この接続ではプライバシーが保護されません" (Your privacy is not protected in this connection) was appearing for users. This warning typically indicates:
- Mixed content issues (HTTPS pages loading HTTP resources)
- Insecure connection attempts
- Missing security headers

## Solution

We've implemented comprehensive security headers via Cloudflare Pages' `_headers` file located at `frontend/astro/public/_headers`.

### Security Headers Implemented

#### 1. HTTP Strict Transport Security (HSTS)
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```
- **Purpose**: Forces browsers to always use HTTPS for recrubo.net
- **max-age**: 1 year (31536000 seconds)
- **includeSubDomains**: Applies to all subdomains
- **preload**: Eligible for browser HSTS preload lists

#### 2. Content Security Policy (CSP)
```
Content-Security-Policy: upgrade-insecure-requests; ...
```
- **upgrade-insecure-requests**: Automatically upgrades all HTTP requests to HTTPS
- **default-src**: Restricts default sources to self and HTTPS only
- **script-src**: Allows scripts from trusted sources (Google reCAPTCHA, CDNs)
- **connect-src**: Allows API connections to api.recrubo.net, Google, Discord
- **img-src**: Allows images from HTTPS sources and data URIs
- **frame-src**: Restricts iframe embeds to trusted sources
- **object-src**: Blocks plugins
- **form-action**: Restricts form submissions to self and API

#### 3. Additional Security Headers

**X-Content-Type-Options**
```
X-Content-Type-Options: nosniff
```
Prevents MIME-type sniffing attacks

**X-Frame-Options**
```
X-Frame-Options: SAMEORIGIN
```
Prevents clickjacking by restricting iframe embedding

**X-XSS-Protection**
```
X-XSS-Protection: 1; mode=block
```
Enables XSS filtering in older browsers

**Referrer-Policy**
```
Referrer-Policy: strict-origin-when-cross-origin
```
Controls referrer information sent with requests

**Permissions-Policy**
```
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
```
Restricts browser feature access

## How It Works

1. The `_headers` file is placed in `frontend/astro/public/`
2. During the Astro build process, this file is copied to the `dist/` directory
3. When deployed to Cloudflare Pages, Cloudflare automatically reads the `_headers` file
4. All specified headers are applied to matching URL patterns (in this case, all routes via `/*`)
5. Browsers receive these headers and enforce the security policies

## Verification

After deployment, you can verify the headers are being sent using:

### Browser DevTools
1. Open DevTools (F12)
2. Go to Network tab
3. Reload the page
4. Click on the main document request
5. Check the Response Headers section

### Command Line
```bash
curl -I https://recrubo.net
```

You should see headers like:
- `strict-transport-security`
- `content-security-policy`
- `x-content-type-options`
- `x-frame-options`
- etc.

### Online Tools
- [Security Headers](https://securityheaders.com/)
- [Mozilla Observatory](https://observatory.mozilla.org/)

## Benefits

1. **HTTPS Enforcement**: All connections are forced to use HTTPS
2. **Mixed Content Prevention**: HTTP resources are automatically upgraded to HTTPS
3. **Privacy Protection**: Eliminates browser privacy warnings
4. **Security Hardening**: Multiple layers of protection against common web attacks
5. **SEO Benefits**: Search engines favor secure sites
6. **User Trust**: Green padlock and no security warnings build user confidence

## Maintenance

- The `_headers` file is version-controlled in the repository
- Any changes to security policies should be made in `frontend/astro/public/_headers`
- Test changes locally before deploying to production
- Monitor browser console for CSP violations after updating policies

## References

- [Cloudflare Pages Headers Documentation](https://developers.cloudflare.com/pages/configuration/headers/)
- [Content Security Policy Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [HSTS Preload](https://hstspreload.org/)
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
