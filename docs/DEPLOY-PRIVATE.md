# دیپلوی خصوصی — اپ روی اینترنت باز نمی‌شود

برای وقتی که سرورت کارِ دیگری هم می‌کند (مثلاً VPN روی ۴۴۳) و **نمی‌خواهی دادهٔ مالی‌ات
هیچ دری به اینترنت داشته باشد.**

اپ فقط روی `127.0.0.1:3000` سرورگوش می‌دهد. نه دامنه، نه رکوردِ DNS، نه گواهی در
لاگ‌های عمومیِ Certificate Transparency، نه پورتِ باز. Postgres هم مثل همیشه روی
شبکه‌ی داخلیِ داکر می‌ماند و اصلاً منتشر نمی‌شود.

---

## ۰. اول این را بخوان: سرورت چقدر رم دارد؟

```bash
free -h && nproc
```

| رم | مسیرِ درست |
|---|---|
| **< ۲ گیگ** یا **۱ هسته** | ⚠️ **روی سرور build نکن** — برو بخشِ «۱-ب» |
| ۴ گیگ به بالا | می‌توانی روی خودِ سرور build کنی — بخشِ «۱-الف» |

**چرا:** بیلدِ پروداکشنِ Next.js چند گیگ رم می‌خواهد. روی یک VPS با ۱ گیگ رم و
یک هسته، بیلد تمام نمی‌شود؛ سیستم شروع می‌کند به swap-زدن و در نهایت OOM killer
حتی SSH را هم می‌کُشد. **اجرا کردنِ اپ اما ارزان است** (~۲۵۰ مگ) — فقط ساختنش سنگین است.

### ⚙️ در هر دو حالت: swap اضافه کن
سرورهای کوچک معمولاً swap ندارند. این کار یک شبکه‌ی ایمنی می‌سازد که جلوی
کشته‌شدنِ ناگهانیِ سرویس‌ها را بگیرد:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

---

## ۱-الف. بالا آوردن با build روی سرور (فقط سرورِ ≥۴ گیگ)

```bash
git clone https://github.com/nariman7596/financemanager-web.git
cd financemanager-web
cp .env.docker.example .env
nano .env          # DB_PASSWORD / AUTH_SECRET / CRON_SECRET

docker compose -f docker-compose.private.yml up -d --build
```

> 💡 بیلد را داخلِ `tmux` اجرا کن تا اگر SSH قطع شد کار نیمه‌کاره نماند:
> `tmux new -s build` … خروج با `Ctrl+B` سپس `D` … بازگشت با `tmux attach -t build`

---

## ۱-ب. بالا آوردن با ایمیجِ آماده — **توصیه‌شده برای سرورِ کوچک**

بیلد روی رانرهای گیت‌هاب انجام می‌شود (۴ هسته، ۱۶ گیگ رم) و سرور فقط ایمیجِ
آماده را `pull` می‌کند: چند ثانیه، بدونِ فشار روی رم.

**یک‌بار روی گیت‌هاب:**
1. فایلِ `.github/workflows/build-image.yml` از قبل در ریپو هست. با اولین push
   به `main` خودش اجرا می‌شود — یا از تبِ **Actions** دستی اجرایش کن
   (**Build and publish image** → *Run workflow*).
2. صبر کن تا سبز شود (~۵–۱۰ دقیقه). ایمیج می‌رود به
   `ghcr.io/nariman7596/financemanager-web:latest`.
3. **دسترسیِ ایمیج:** اگر بسته (package) خصوصی باشد، سرور برای pull باید لاگین کند.
   ساده‌ترین راه: در صفحه‌ی **Packages** ریپو، بسته را روی **Public** بگذار.
   یا اگر می‌خواهی خصوصی بماند، روی سرور:
   ```bash
   echo "GHCR_PAT" | docker login ghcr.io -u nariman7596 --password-stdin
   ```
   (توکن با دسترسیِ `read:packages` از github.com/settings/tokens)

**روی سرور:**
```bash
git clone https://github.com/nariman7596/financemanager-web.git
cd financemanager-web
cp .env.docker.example .env
nano .env          # DB_PASSWORD / AUTH_SECRET / CRON_SECRET

docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

**بروزرسانی از این به بعد** (به‌جای یک ساعت بیلد):
```bash
git pull
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

> در ادامه‌ی این سند هر جا `docker-compose.private.yml` دیدی، اگر مسیرِ «۱-ب» را
> رفته‌ای همان دستور را با `docker-compose.ghcr.yml` بزن.

بررسی:
```bash
docker compose -f docker-compose.private.yml ps
curl -I http://127.0.0.1:3000/login        # انتظار: HTTP 200
sudo ss -tlnp | grep 3000                  # باید 127.0.0.1:3000 باشد، نه 0.0.0.0
```

> ⚠️ اگر خروجی `0.0.0.0:3000` بود یعنی فایلِ اشتباهی را اجرا کرده‌ای. داکر پورت‌های
> منتشرشده را **از فایروال رد می‌کند** (روی زنجیره‌ی `DOCKER` در iptables می‌نشیند)،
> پس `ufw deny 3000` جلویش را نمی‌گیرد. پیشوندِ `127.0.0.1:` تنها چیزی است که کار می‌کند.

**هیچ پورتی در فایروال باز نکن.** فقط SSH.

---

## 🍪 نکته‌ی مهم: کوکیِ نشست و HTTPS

اپ کوکیِ نشست را با فلگِ `Secure` می‌فرستد، و مرورگر کوکیِ Secure را روی `http://`
معمولی **نمی‌فرستد** — یعنی لاگین می‌کنی ولی بلافاصله به صفحه‌ی ورود برمی‌گردی، بی‌آنکه
خطایی ببینی.

استثنا: مرورگرها **`localhost` را «امن» حساب می‌کنند.**

| روشِ دسترسی | آدرس | کوکی کار می‌کند؟ |
|---|---|---|
| تونلِ SSH | `http://localhost:3000` | ✅ بله (بدونِ هیچ تنظیمی) |
| WireGuard / تیل‌اسکیل | `http://10.8.0.1:3000` | ❌ نه — مگر `COOKIE_SECURE=false` |

برای حالتِ دوم، در `.env` این را اضافه کن و کانتینر را ری‌استارت کن:
```ini
COOKIE_SECURE=false
```
```bash
docker compose -f docker-compose.private.yml up -d
```

> 🔒 **این فقط برای همین سناریو بی‌خطر است**، چون اپ اصلاً روی اینترنت نیست و ترافیک
> داخلِ تونلِ رمزنگاری‌شده‌ی خودت جابه‌جا می‌شود. **روی نسخه‌ی عمومی هرگز این را نگذار** —
> توکنِ نشست به‌صورتِ متنِ ساده منتقل می‌شود.

---

## ۲. راه‌های دسترسی

### الف) تونلِ SSH — ساده‌ترین و مطمئن‌ترین (لپ‌تاپ)

هیچ تنظیمی روی سرور نمی‌خواهد. روی کامپیوترِ خودت:

```bash
ssh -N -L 3000:127.0.0.1:3000 root@216.126.229.4
```

بعد در مرورگر: **<http://localhost:3000>** — کوکی هم بدونِ دردسر کار می‌کند.

میان‌بر: در `~/.ssh/config` بگذار
```
Host fm
    HostName 216.126.229.4
    User root
    LocalForward 3000 127.0.0.1:3000
```
از این به بعد فقط `ssh -N fm`.

### ب) WireGuard — برای گوشی (توصیه‌شده)

Xray تو **TCP/443** است؛ WireGuard روی **UDP** کار می‌کند، پس **هیچ تداخلی با VPN فعلی‌ات
ندارد** و می‌توانند کنار هم باشند.

```bash
# روی سرور
curl -O https://raw.githubusercontent.com/angristan/wireguard-install/master/wireguard-install.sh
chmod +x wireguard-install.sh && sudo ./wireguard-install.sh
# پورتِ پیشنهادی: مثلاً 51820/udp — و در فایروال بازش کن:
sudo ufw allow 51820/udp
```

اسکریپت برایت QR می‌سازد؛ با اپِ WireGuard روی گوشی اسکنش کن. بعد از اتصال، سرور
معمولاً `10.66.66.1` می‌شود:

```
http://10.66.66.1:3000
```

و چون این `localhost` نیست، حتماً `COOKIE_SECURE=false` را ست کن (بالا).

> ℹ️ WireGuard در ایران گاهی مسدود می‌شود. اگر وصل نشد، همان تونلِ SSH (الف) یا یک
> کلاینتِ SSH موبایل مثلِ Termius با port-forwarding جواب می‌دهد.

### ج) تیل‌اسکیل — بی‌دردسرترین، ولی وابسته به سرویسِ ثالث
`curl -fsSL https://tailscale.com/install.sh | sh` روی سرور و گوشی، بعد
`http://<tailscale-ip>:3000`. نیازی به بازکردنِ هیچ پورتی نیست.
⚠️ نیازمندِ حسابِ تیل‌اسکیل است و ممکن است از ایران در دسترس نباشد.

---

## ۳. بکاپ (این را جدی بگیر)

دادهٔ مالی‌ات فقط روی همین سرور است.

```bash
mkdir -p ~/backups
crontab -e
```
اضافه کن:
```cron
30 3 * * * docker exec financemanager-db-1 pg_dump -U fm financemanager | gzip > ~/backups/fm-$(date +\%F).sql.gz && find ~/backups -name '*.sql.gz' -mtime +14 -delete
```

بازگردانی:
```bash
gunzip -c ~/backups/fm-2026-08-11.sql.gz | docker exec -i financemanager-db-1 psql -U fm financemanager
```

> نامِ دقیقِ کانتینر را با `docker ps --format '{{.Names}}'` چک کن.

---

## ۴. دستورهای روزمره

```bash
cd ~/financemanager-web
C="docker compose -f docker-compose.private.yml"

$C ps                    # وضعیت
$C logs -f app           # لاگِ اپ
$C logs app | grep -i migrat   # آیا مایگریشن‌ها اجرا شدند؟
$C restart app           # ری‌استارت
git pull && $C up -d --build   # بروزرسانی
```

## عیب‌یابی

| علامت | علت |
|---|---|
| لاگین می‌کنم ولی برمی‌گردم به صفحه‌ی ورود | کوکیِ Secure. یا از `localhost` وارد شو یا `COOKIE_SECURE=false` بگذار |
| `curl` روی ۳۰۰۰ جواب نمی‌دهد | `$C ps` — احتمالاً اپ بالا نیامده؛ لاگ را ببین |
| `ss` می‌گوید `0.0.0.0:3000` | فایلِ اشتباه اجرا شده؛ باید `docker-compose.private.yml` باشد |
| صفحات خطای دیتابیس می‌دهند | مایگریشن اجرا نشده: `$C logs app \| grep -i migrat` |
| بعد از ری‌استارتِ سرور بالا نیامد | `restart: unless-stopped` هست؛ چک کن داکر خودش enable باشد: `sudo systemctl enable docker` |

## اگر بعداً خواستی عمومی‌اش کنی
`docs/DEPLOY-BEHIND-XRAY.md` (پورتِ ۸۴۴۳ کنارِ VPN) یا `docs/DOCKER.md` (دامنه‌ی
اختصاصی با Caddy) — و یادت باشد `COOKIE_SECURE` را بردار.
