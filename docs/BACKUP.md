> **Before anything else: back up `TOKEN_ENCRYPTION_KEY` separately.**
> It lives in `.env`, NOT in the database, so a database dump does not contain
> it — and without it every encrypted field (descriptions, notes, bank
> messages, Plaid tokens) is unrecoverable. A restore onto a server with the
> wrong key fails loudly rather than silently blanking the fields. See
> [ENCRYPTION.md](ENCRYPTION.md).

# بکاپ و بازگردانی

دادهٔ مالی‌ات فقط روی یک سرور است. بدونِ بکاپ، یک دیسکِ خراب یا یک `docker compose
down -v` اشتباهی یعنی همه‌چیز رفته.

---

## نصب (یک‌بار، ~۲ دقیقه)

```bash
cd ~/financemanager-web
git pull origin main
chmod +x deploy/backup.sh deploy/restore.sh

# یک‌بار دستی اجرا کن تا مطمئن شوی کار می‌کند
./deploy/backup.sh
ls -lh ~/backups/
```

باید یک فایلِ `fm-<تاریخ>.sql.gz` ببینی و خطِ آخرِ خروجی `done: 1 backup(s) on disk` باشد.

سپس زمان‌بندی کن:
```bash
crontab -e
```
این خط را اضافه کن (هر شب ۳:۳۰ بامداد UTC):
```cron
30 3 * * * /bin/bash $HOME/financemanager-web/deploy/backup.sh >/dev/null 2>&1
```

> `$HOME` را در crontab بعضی سیستم‌ها بسط نمی‌دهند. اگر مطمئن نیستی، مسیرِ کامل بنویس:
> `/root/financemanager-web/deploy/backup.sh`

تمام. لاگ در `~/backups/backup.log` می‌ماند.

---

## چرا یک اسکریپت، نه یک خطِ crontab

شکلِ رایجی که همه‌جا توصیه می‌شود این است:

```bash
pg_dump ... | gzip > out.sql.gz && find ... -mtime +14 -delete
```

و یک نقصِ جدی دارد: اگر `pg_dump` شکست بخورد (دیتابیس بالا نیست، رمز عوض شده،
دیسک پر است)، `gzip` همچنان **یک آرشیوِ معتبرِ خالی** می‌سازد، `&&` موفق حساب می‌شود،
و مرحله‌ی حذف **بکاپ‌های سالمِ قدیمی را پاک می‌کند**. دو هفته که بگذرد، همه‌ی بکاپ‌هایت
فایل‌های خالی‌اند — و دقیقاً روزی می‌فهمی که به آن‌ها نیاز داری.

`deploy/backup.sh` این را این‌طور می‌بندد:

| محافظ | کار |
|---|---|
| `set -o pipefail` | شکستِ `pg_dump` را می‌بیند، نه فقط خروجیِ `gzip` را |
| نوشتن در `.partial` سپس `mv` | هیچ‌وقت فایلِ نیمه‌نوشته به‌عنوان بکاپ جا نمی‌زند |
| `gzip -t` | سالم‌بودنِ آرشیو |
| جستجوی هدرِ `PostgreSQL database dump` | مطمئن می‌شود واقعاً SQL است، نه پیامِ خطا |
| حداقلِ حجمِ **غیرفشرده** | SQL ده‌ها برابر فشرده می‌شود؛ سنجشِ حجمِ فشرده بکاپ‌های سالم را رد می‌کرد |
| حذف فقط **بعد از** بکاپِ تأییدشده | یک شکست هرگز به از‌دست‌رفتنِ نسخه‌های سالم ختم نمی‌شود |

هر چهار حالت (موفق / شکستِ pg_dump / خروجیِ خالی / خروجیِ نامعتبر) تست شده‌اند.

---

## تنظیمات

با متغیرِ محیطی قابلِ تغییرند:

| متغیر | پیش‌فرض | معنی |
|---|---|---|
| `BACKUP_DIR` | `~/backups` | محلِ ذخیره |
| `RETENTION_DAYS` | `14` | چند روز نگه‌داشتن |
| `COMPOSE_FILE` | `docker-compose.ghcr.yml` | اگر از `docker-compose.private.yml` استفاده می‌کنی عوضش کن |
| `MIN_BYTES` | `2048` | کفِ حجمِ غیرفشرده |

مثال — نگه‌داشتن ۳۰ روز:
```cron
30 3 * * * RETENTION_DAYS=30 /bin/bash /root/financemanager-web/deploy/backup.sh >/dev/null 2>&1
```

---

## بازگردانی

```bash
./deploy/restore.sh ~/backups/fm-2026-08-12_0330.sql.gz
```

اسکریپت قبل از هر کاری:
1. سالم‌بودنِ آرشیو را چک می‌کند
2. **از وضعیتِ فعلی یک اسنپ‌شات می‌گیرد** (اگر بازگردانی اشتباه بود، راهِ برگشت داری)
3. تأییدِ تایپیِ کلمه‌ی `restore` می‌خواهد
4. اپ را متوقف می‌کند تا وسطِ کار چیزی ننویسد
5. بازگردانی می‌کند و دوباره اپ را بالا می‌آورد

> ⚠️ بازگردانی **جایگزین** می‌شود، نه ادغام. هرچه الان در دیتابیس هست از بین می‌رود.

---

## 🔴 مهم‌ترین نکته: بکاپِ تست‌نشده بکاپ نیست

یک‌بار — همین حالا، نه وقتی که لازم شد — بازگردانی را تست کن:

```bash
./deploy/backup.sh                                   # یک بکاپ بگیر
./deploy/restore.sh ~/backups/fm-<آخرین>.sql.gz      # همان را برگردان
```
بعد اپ را باز کن و ببین داده‌ها سرِ جایشان‌اند. حالا می‌دانی زنجیره واقعاً کار می‌کند.

## نسخه‌ی بیرون از سرور (توصیه‌شده)

بکاپی که روی همان سروری است که ممکن است بمیرد، نصفِ بکاپ است. هر از گاهی یک نسخه
را جای دیگری ببر:

```bash
# روی کامپیوترِ خودت
scp root@216.126.229.4:'~/backups/fm-*.sql.gz' ~/fm-backups/
```

## بررسیِ سلامت

```bash
tail -20 ~/backups/backup.log      # آخرین اجراها
ls -lht ~/backups/ | head          # تازه‌ترین فایل‌ها و حجمشان
```

اگر جدیدترین فایل مالِ چند روز پیش است، کران اجرا نشده — با `grep CRON /var/log/syslog`
دنبالش بگرد.
