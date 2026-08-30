# دیپلوی روی یک VPSِ تازه در ایران

بقیه‌ی راهنماها فرض می‌کنند سرور می‌تواند ایمیجِ آماده را از GHCR بکشد.
**از روی IPِ ایران این کار ممکن نیست** — هم رجیستریِ گیت‌هاب و هم Docker Hub
آدرس‌های ایران را رد می‌کنند. همه‌ی تصمیم‌های این سند از همین یک واقعیت
می‌آید، پس این را قبل از `docs/DOCKER.md` و `docs/DEPLOY-PRIVATE.md` بخوان.

بقیه‌ی پروژه از ایران بی‌مشکل کار می‌کند. فقط همین کشیدنِ ایمیج است که
می‌شکند.

---

## ۰. اول تصمیم بگیر روی کدام مسیری

کلِ طراحیِ «CI بیلد می‌کند، سرور فقط pull می‌کند» به این دلیل وجود دارد که
سرورِ اصلی (۱ vCPU / ۹۶۱ مگابایت) نمی‌توانست بیلدِ Next.js را تمام کند. از
ایران، pull را از دست می‌دهی، پس باید ایمیج را جورِ دیگری به سرور برسانی.

| | مسیر A — بیلد روی سرور | مسیر B — بیلد جای دیگر، کپیِ ایمیج | مسیر C — پراکسی برای سرور |
| --- | --- | --- | --- |
| رمِ لازم | **۴ گیگ به بالا** (یا ۲ گیگ + swap، کُند) | ۱ گیگ هم بس است | ۱ گیگ هم بس است |
| Docker Hub روی سرور لازم است؟ | بله (ایمیجِ پایه) | نه | بله، از راهِ پراکسی |
| GHCR روی سرور لازم است؟ | نه | نه | بله، از راهِ پراکسی |
| قطعه‌ی اضافه | هیچ | یک لپ‌تاپِ بازداشته + `scp` | یک پراکسیِ خروجیِ سالم |

**اگر سرورت ۴ گیگ یا بیشتر رم دارد، مسیر A را برو.** کمترین قطعه‌ی متحرک را
دارد. **اگر سرورِ کوچکی است، مسیر B را برو** — روی مکَ خودت بیلد کن و نتیجه را
کپی کن. مسیر C در درازمدت بهترین است، ولی فقط اگر همین حالا یک پراکسیِ خروجیِ
قابل‌اتکا روی آن ماشین داری.

اجرا کردنِ اپ در هر حالت ارزان است — حدودِ **۵۳۰ مگابایت** برای وب + API +
پستگرس. فقط **بیلد** گران است.

---

## ۱. آماده‌سازیِ پایه (برای هر سه مسیر)

```bash
# با کاربر root روی سرورِ تازه
apt update && apt upgrade -y
apt install -y ca-certificates curl git ufw

# یک کاربرِ غیرِ root برای اجرای کارها
adduser --disabled-password --gecos "" fm
usermod -aG sudo fm

# فایروال: فقط SSH. اپ روی اینترنت باز نمی‌شود — مرحله‌ی ۶ را ببین.
ufw allow OpenSSH
ufw --force enable

timedatectl set-timezone Asia/Tehran
```

اگر کمتر از ۴ گیگ رم داری، swap اضافه کن. بیلدِ Next.js بدونِ آن را OOM killer
می‌کُشد، و روی سرورِ اصلی همین کار sshd را هم با خودش پایین کشید:

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### داکر

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker fm
```

اگر `get.docker.com` باز نشد، به‌جایش `docker.io` و `docker-compose-plugin` را
از مخزنِ خودِ اوبونتو نصب کن — داکرِ کمی قدیمی‌تر اینجا مشکلی ندارد.

---

## ۲. ردشدن از بلاکِ رجیستری

### مسیر A یا C: میرورِ Docker Hub

ایمیجِ پایه‌ی Dockerfile یعنی `node:22-bookworm-slim` از Docker Hub می‌آید.
داکر را به میروری که سرویس‌دهنده‌ات می‌دهد وصل کن:

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'JSON'
{ "registry-mirrors": ["https://<mirror-from-your-provider>"] }
JSON
sudo systemctl restart docker
docker pull node:22-bookworm-slim   # قبل از ادامه باید موفق شود
```

> ⚠️ آدرسِ میرور را از **سرویس‌دهنده‌ی خودت** بگیر، نه از یک پستِ وبلاگ.
> میرورهای داکرِ ایران بارها آمده‌اند و رفته‌اند، و یکی که از کار افتاده باشد
> خطایی می‌دهد که شبیهِ مشکلِ عمومیِ شبکه به نظر می‌رسد.

### مسیر C: پراکسی برای دیمنِ داکر

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/proxy.conf >/dev/null <<'CONF'
[Service]
Environment="HTTP_PROXY=http://127.0.0.1:PORT"
Environment="HTTPS_PROXY=http://127.0.0.1:PORT"
Environment="NO_PROXY=localhost,127.0.0.1"
CONF
sudo systemctl daemon-reload && sudo systemctl restart docker
```

آن پراکسی باید یک **خروجی (outbound)** روی همین ماشین باشد. یک سرورِ
Xray/Reality که برای گوشیِ تو گوش می‌دهد، پراکسیِ خروجی **نیست** — آن اتصال
می‌پذیرد، اتصال برقرار نمی‌کند. به یک کلاینتِ خروجی نیاز داری (Xray در حالتِ
client، یا تونلِ `ssh -D` به ماشینی در خارج) که یک پورتِ محلیِ HTTP/SOCKS
بدهد.

### رجیستریِ npm

`registry.npmjs.org` معمولاً از ایران باز است، ولی می‌تواند کُند یا ناپایدار
باشد. اگر نصب گیر کرد، فقط برای بیلد pnpm را به یک میرور وصل کن:

```bash
pnpm config set registry https://<npm-mirror>
```

---

## ۳. گرفتنِ کد

```bash
su - fm
git clone https://github.com/nariman7596/financemanager-web.git
cd financemanager-web
```

**کدام برنچ؟** روی سرورِ **تازه** دیتابیس خالی است، پس آن مایگریشنی که معمولاً
اول بکاپ می‌خواهد چیزی برای از دست دادن ندارد. کلِ برنچ را دیپلوی کن تا API و
رمزنگاری و sync را هم داشته باشی:

```bash
git checkout claude/personal-finance-app-9s8mrr
```

(اگر ترجیح می‌دهی فعلاً فقط اپِ وب را داشته باشی، روی `main` بمان. بعداً هم
می‌توانی به برنچ بروی — ولی از آن به بعد قانونِ بکاپ در مرحله‌ی ۷ اعمال
می‌شود، چون تا آن موقع دیتابیس دادهٔ واقعیِ تو را دارد.)

---

## ۴. رمزها

```bash
cp .env.docker.example .env
nano .env
```

هرکدام را با `openssl rand -base64 32` بساز و پر کن:

```
DB_PASSWORD=...
AUTH_SECRET=...
CRON_SECRET=...
TOKEN_ENCRYPTION_KEY=...
COOKIE_SECURE=false        # see step 6 / مرحله‌ی ۶
```

> ⚠️ **`TOKEN_ENCRYPTION_KEY` داخلِ دیتابیس نیست.** این کلید توضیحاتِ تراکنش،
> یادداشت‌ها و پیامک‌های بانکی را رمز می‌کند. بکاپِ دیتابیس آن را **در خود
> ندارد**، و گم‌شدنش یعنی آن فیلدها برای همیشه رفته‌اند — مبلغ و تاریخ می‌مانند،
> متن نه. **همین حالا**، پیش از واردکردنِ هر دادهٔ واقعی، در یک password
> manager نگهش دار. `docs/ENCRYPTION.md` را ببین.

---

## ۵. بیلد و بالا آوردن

### مسیر A — بیلد روی سرور

```bash
docker compose -f docker-compose.private.yml up -d --build
```

بیلدِ اول روی سرورِ کوچک ۱۰ تا ۲۵ دقیقه طول می‌کشد. به‌جای رها کردنش، نگاهش
کن — اگر بی‌صدا مُرد یعنی OOM killer، و باید swap بیشتری بدهی.

> 💡 بیلد را داخلِ `tmux` اجرا کن تا اگر SSH قطع شد کار نیمه‌کاره نماند:
> `tmux new -s build` … خروج با `Ctrl+B` سپس `D` … بازگشت با `tmux attach -t build`

### مسیر B — بیلد روی لپ‌تاپ، کپیِ ایمیج

روی ماشینی که دسترسی دارد (مکِ خودت):

```bash
git clone https://github.com/nariman7596/financemanager-web.git
cd financemanager-web && git checkout claude/personal-finance-app-9s8mrr

docker build --target runner     -t fm-web:latest .
docker build --target api-runner -t fm-api:latest .

docker save fm-web:latest fm-api:latest | gzip > fm-images.tar.gz
scp fm-images.tar.gz fm@YOUR_SERVER:~/
```

سوئیچِ `--target` مهم است: بدونِ آن داکر **آخرین** استیجِ Dockerfile را بیلد
می‌کند و در هر دو ایمیج، API را می‌گیری.

روی سرور:

```bash
gunzip -c ~/fm-images.tar.gz | docker load
```

بعد سرویس‌ها را به همان ایمیج‌ها وصل کن. اگر ایمیج از قبل روی ماشین باشد،
کامپوز از خودش استفاده می‌کند، پس فقط نام‌گذاری کافی است:

```bash
cat > ~/financemanager-web/docker-compose.override.yml <<'YAML'
services:
  app:
    image: fm-web:latest
  api:
    image: fm-api:latest
YAML
cd ~/financemanager-web
docker compose -f docker-compose.private.yml up -d --no-build
```

`--no-build` حکمِ بند و کمربند را دارد: اگر کامپوز به هر دلیلی تصمیم گرفت بیلد
کند، به‌جای اینکه بی‌صدا یک بیلدِ بیست‌دقیقه‌ای را روی سرورِ ناتوان شروع کند،
با خطا می‌ایستد.

`postgres:16-alpine` را هم لازم داری که آن هم روی Docker Hub است — یا از میرور
(مرحله‌ی ۲) بگیر یا در همان تاربال بگذار:
`docker pull postgres:16-alpine && docker save postgres:16-alpine | gzip > pg.tar.gz`.

### بررسیِ اینکه بالا آمده

```bash
docker compose -f docker-compose.private.yml ps
docker compose -f docker-compose.private.yml logs -f app | head -40
```

دنبالِ `Applying database schema…` و بعدش `Starting FinanceManager on :3000`
بگرد. کانتینرِ اپ مایگریشن‌ها را موقعِ استارت اجرا می‌کند، پس اسکیما خودش
ساخته می‌شود.

اگر می‌خواهی دادهٔ نمایشی هم داشته باشی:

```bash
docker compose -f docker-compose.private.yml exec app \
  sh -c 'cd /app/packages/db && ./node_modules/.bin/tsx prisma/seed.ts'
```

---

## ۶. دسترسی به اپ

فایلِ کامپوز عمداً روی `127.0.0.1:3000` بایند می‌کند — این پورت روی اینترفیسِ
عمومی اصلاً وجود ندارد. حواست باشد داکر پورت‌های منتشرشده را **از فایروال رد
می‌کند** (زنجیره‌ی iptablesِ خودش را می‌نویسد)، پس همان پیشوندِ `127.0.0.1:`
تنها چیزی است که واقعاً درِ اپ را بسته نگه می‌دارد.

**با تونلِ SSH شروع کن.** نه دامنه، نه گواهی، نه هیچ چیزِ بازی:

```bash
# از روی لپ‌تاپ
ssh -N -L 3000:127.0.0.1:3000 fm@YOUR_SERVER
# بعد باز کن: http://localhost:3000
```

`http://localhost` از نظرِ مرورگر یک secure context حساب می‌شود، پس کوکیِ نشست
روی تونل کار می‌کند، حتی با `COOKIE_SECURE=false`.

برای گوشی هم همان تونل با هر اپِ SSH کار می‌کند، یا WireGuard راه بینداز و در
`.env` مقدارِ `APP_BIND=10.66.66.1` را بگذار — یک peer که روی `wg0` می‌آید
نمی‌تواند به سوکتی که روی loopback بایند شده برسد.

اگر بعداً دامنه و HTTPSِ واقعی خواستی، `docs/DOCKER.md` سراغِ Caddy می‌رود و
`docs/DEPLOY-BEHIND-XRAY.md` حالتی را پوشش می‌دهد که VPN پورتِ ۴۴۳ را گرفته
باشد. ولی بدان که یک هاستنیمِ عمومی که به IPِ ایران اشاره کند، آن نام را در
لاگ‌های Certificate Transparency ثبت می‌کند — یعنی دقیقاً برعکسِ همان حالتِ
خصوصی‌ای که این دیپلوی حولِ آن طراحی شده.

---

## ۷. بکاپ

```bash
crontab -e
# 0 3 * * * /home/fm/financemanager-web/deploy/backup.sh
```

`deploy/backup.sh` هر دامپ را قبل از پاک‌کردنِ قدیمی‌ها بررسی می‌کند، چون آن
دستورِ یک‌خطیِ معروف وقتی `pg_dump` شکست بخورد بکاپ‌های سالم را پاک می‌کند.
همین حالا که چیزی مهم نیست، یک‌بار restore را امتحان کن: `deploy/restore.sh`.

**و `TOKEN_ENCRYPTION_KEY` را جایی غیر از همین سرور نگه دار.** این تنها چیزی
است که بکاپِ دیتابیس نمی‌تواند برت گرداند.

---

## ۸. به‌روزرسانی در آینده

مسیر A:

```bash
cd ~/financemanager-web && git pull
docker compose -f docker-compose.private.yml up -d --build
```

مسیر B: دوباره بیلد کن، ایمیج‌ها را کپی کن، بعد `up -d`.

در هر دو حالت، وقتی دادهٔ واقعی داشتی اول بکاپ بگیر — کانتینر موقعِ استارت
مایگریشن اجرا می‌کند، پس یک آپدیت می‌تواند اسکیما را عوض کند.

---

## چیزهایی که اگر ندانی وقتت را می‌گیرند

- **بیلدِ شکست‌خورده، کانتینرِ قبلی را زنده نگه می‌دارد.** اپ همان نسخه‌ی قبلی
  را سرو می‌کند و هیچ‌کس خبر نمی‌دهد که چیزی شکسته. همیشه خروجیِ بیلد را تا
  آخر بخوان.
- **`docker compose build` بدونِ `--target` یعنی API.** فایل‌های کامپوزِ این
  ریپو حالا این را pin کرده‌اند؛ اگر خودت فایلی نوشتی، فراموشش نکن.
- **OOM killer بی‌صداست.** بیلدی که روی سرورِ کوچک «هنگ می‌کند» و بعد می‌میرد،
  تقریباً همیشه حافظه است. `dmesg | tail` نشانش می‌دهد.
- **دادهٔ پستگرس در یک volumeِ داکر است**، نه در پوشه‌ی ریپو. `git pull` و بیلدِ
  دوباره کاری به آن ندارند؛ ولی `docker compose down -v` نابودش می‌کند.
