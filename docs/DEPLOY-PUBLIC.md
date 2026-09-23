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

اگر سرور فایروال دارد (`ufw status` فعال است): `sudo ufw allow 80,8443/tcp`. داکر معمولاً
خودش از ufw رد می‌شود، ولی فایروالِ پنلِ ارائه‌دهنده‌ی سرور را هم چک کن.

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
