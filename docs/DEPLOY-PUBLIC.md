# دسترسی از مرورگرِ گوشی — بدونِ تونل و بدونِ اپ

نتیجه: یک آدرسِ HTTPS مثلِ `https://1-2-3-4.sslip.io:8443` که در Safari باز می‌کنی و
با **Add to Home Screen** مثلِ یک اپ روی صفحه‌ی اصلیِ آیفون می‌نشیند.

- **دامنه لازم نیست:** `sslip.io` هر اسمی به شکلِ `IP-با-خط‌تیره.sslip.io` را به همان IP
  برمی‌گرداند، پس Caddy می‌تواند برایش گواهیِ واقعی بگیرد. رایگان و بدونِ ثبت‌نام.
- **Xray دست نمی‌خورد:** اپ روی ۸۴۴۳ است؛ ۴۴۳ مالِ VPN می‌ماند. پورتِ ۸۰ فقط برای
  گرفتن و تمدیدِ خودکارِ گواهی باز است.
- **چرا نه `http://IP:3000` ساده؟** بدونِ HTTPS، رمزِ ورود و همه‌ی اعدادِ مالی به‌صورتِ
  متنِ خوانا از شبکه‌ی اپراتور رد می‌شوند. HTTPS این‌جا هزینه‌ای ندارد.

## راه‌اندازی

این روی همان نصبِ `docker-compose.ghcr.yml` سوار می‌شود (`DEPLOY-PRIVATE.md`، «۱-ب»).

```bash
cd ~/financemanager-web
sudo ss -tlnp | grep -E ':(80|8443)\s'     # باید خالی باشد

IP=$(curl -4 -s https://ifconfig.me)
cat >> .env <<ENV
COMPOSE_FILE=docker-compose.ghcr.yml:docker-compose.public.yml
APP_DOMAIN=${IP//./-}.sslip.io
ENV
grep APP_DOMAIN .env

docker compose pull && docker compose up -d
docker compose logs -f caddy      # منتظرِ "certificate obtained successfully"؛ خروج با Ctrl+C
```

با `COMPOSE_FILE` در `.env`، از این به بعد `docker compose …` بدونِ `-f` هر دو فایل را
با هم اجرا می‌کند.

### آپدیت (هر بار)

```bash
cd ~/financemanager-web && git pull && docker compose pull && docker compose up -d && docker compose restart caddy && docker image prune -f
```

- `docker image prune -f` نسخه‌ی قبلیِ ایمیج را پاک می‌کند. بدونِ آن هر آپدیت یک نسخه‌ی
  کامل روی دیسک باقی می‌گذارد؛ روی دیسکِ ۲۴ گیگی بعد از یک روزِ پرآپدیت ۱۶ گیگ از این
  نسخه‌های مرده جمع شد و `pull` با `no space left on device` شکست خورد. به کانتینرهای
  در حالِ اجرا، دیتابیس و بکاپ‌ها دست نمی‌زند.
- `restart caddy` فقط وقتی لازم است که `Caddyfile.public` عوض شده باشد (فایلِ mount‌شده؛
  `up -d` آن را دوباره نمی‌خواند) — زدنش ضرری ندارد.
- پیامک‌هایی که در همان چند ثانیه‌ی ری‌استارت می‌رسند گم نمی‌شوند: Caddy در آن فاصله
  JSON ِ خطا برمی‌گرداند و شورتکات صف را نگه می‌دارد.

اگر سرور فایروال دارد (`ufw status` فعال است): `sudo ufw allow 80,8443/tcp`. داکر معمولاً
خودش از ufw رد می‌شود، ولی فایروالِ پنلِ ارائه‌دهنده‌ی سرور را هم چک کن.

## از داخلِ ایران: از راهِ VPN (راهی که واقعاً کار کرد)

روی این سرور، اتصالِ مستقیم از ایران به اپ **کار نمی‌کند**: پورتِ ۸۴۴۳ به IPهای خارجی
بسته است، و روی ۴۴۳ هم نامِ `sslip.io` فیلتر است. چیزی که کار می‌کند این است که اپ را
از داخلِ همان VPNی برسانیم که روی همین سرور است:

```
آیفون ─Wi-Fi─► روتر (Nikki/mihomo) ─تونلِ VLESS Reality─► sing-box ─► 127.0.0.1:8443 (Caddy) ─► اپ
```

سه تکه دارد:

**۱. sing-box روی سرور** — یک قانونِ مسیریابی، اولِ `route.rules`. درخواستی که از تونل
برای خودِ سرور روی ۴۴۳ می‌آید، مستقیم به Caddy می‌رود. بدونِ این، sing-box آن را دوباره
به پورتِ ۴۴۳ی خودش می‌فرستد، Reality آن را «کلاینتِ نامعتبر» می‌بیند و به سایتِ پوششی
(`addons.mozilla.org`) پاس می‌دهد — نتیجه: خطای گواهی و صفحه‌ی Fastly.

```json
{
  "ip_cidr": ["216.126.229.4/32"], "domain": ["216-126-229-4.sslip.io"], "port": [443],
  "action": "route", "outbound": "direct",
  "override_address": "127.0.0.1", "override_port": 8443
}
```

تنظیمِ Reality (`handshake`) **دست نمی‌خورد** — پوششِ VPN همان است که بود.
(یک مسیرِ SNI-router با HAProxy جلوی Reality هم امتحان شد؛ لازم نیست و برداشته شد.)

**۲. روتر (Nikki)** — کلاینتِ VPN ترافیکِ IPِ خودِ سرور را عمداً مستقیم می‌فرستد
(`IP-CIDR,<server-ip>/32,DIRECT`) تا تونل در خودش نپیچد. فقط پورتِ ۴۴۳ را از آن جدا
کن، **بالای** همان خط در `/etc/nikki/profiles/<profile>.yaml`:

```yaml
  - AND,((IP-CIDR,216.126.229.4/32,no-resolve),(DST-PORT,443)),PROXY
  - IP-CIDR,216.126.229.4/32,DIRECT
```

SSH و بقیه‌ی پورت‌ها همچنان مستقیم می‌روند. بعد: `/etc/init.d/nikki restart`.

**۳. بستنِ ۸۴۴۳ به روی اینترنت** — حالا که اپ فقط از راهِ VPN باز می‌شود، لازم نیست
پورت‌اش برای دنیا باز باشد. در `.env`:

```ini
HTTPS_BIND=127.0.0.1
```

پورتِ ۸۰ باز می‌ماند — Let's Encrypt برای تمدیدِ گواهی به آن سر می‌زند.

**عیب‌یابی:** از خودِ روتر، از همان مسیرِ گوشی:
```sh
AUTH=$(awk '/^authentication:/{getline; sub(/^ *- */,""); print}' /etc/nikki/run/config.yaml)
curl -sS -o /dev/null -w "%{http_code}\n" -x "socks5://$AUTH@127.0.0.1:7890" https://216-126-229-4.sslip.io/login
```
`200` یعنی مسیر سالم است. خطای «CN does not match» یعنی درخواست به Reality/موزیلا
رسیده — قانونِ sing-box (بالا) اعمال نشده.

## بستنِ ثبت‌نام (مهم)

اپ حالا روی اینترنت است و هر کسی آدرس را پیدا کند می‌تواند حساب بسازد. **بعد از اینکه
حساب‌های خودتان را ساختید:**

```bash
echo 'ALLOW_REGISTRATION=false' >> .env && docker compose up -d
```

عضوِ جدید اضافه کردن هنوز کار می‌کند: از صفحه‌ی «خانوار» ایمیلش را دعوت کن، و ثبت‌نام
برای همان ایمیل باز است.

## عیب‌یابی

| علامت | علت |
|---|---|
| لاگِ Caddy خطای `challenge` می‌دهد | پورتِ ۸۰ از بیرون بسته است (فایروالِ پنل) یا چیزِ دیگری رویش است |
| `port is already allocated` | ۸۰ یا ۸۴۴۳ را سرویسِ دیگری گرفته: `sudo ss -tlnp` |
| آدرس از ایران باز نمی‌شود ولی با VPN می‌شود | `sslip.io` یا پورت فیلتر است — بگو تا دامنه‌ی رایگانِ DuckDNS بگذاریم |
| ثبت‌نام می‌گوید «ثبت‌نام بسته است» | `ALLOW_REGISTRATION=false` است؛ اول دعوت کن، یا موقتاً `true` کن |
