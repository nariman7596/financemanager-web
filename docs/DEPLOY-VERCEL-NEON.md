# دیپلوی روی Vercel + Neon (رایگان، بدونِ سرور)

راهنمای قدم‌به‌قدم برای بالا آوردنِ FinanceManager روی یک آدرسِ خصوصی که از گوشی هم
باز می‌شود. حدودِ **۳۰ تا ۴۵ دقیقه**، بدونِ هزینه، و بدونِ نیاز به کامپیوترِ خودت.

---

## پیش‌نیاز
- حسابِ [Neon](https://neon.tech) (رایگان) — دیتابیس
- حسابِ [Vercel](https://vercel.com) (رایگان) — اپ

با گیت‌هاب در هر دو ثبت‌نام کن؛ ساده‌تر است.

---

## گامِ ۱ — دیتابیس روی Neon

1. [neon.tech](https://neon.tech) → **Sign up with GitHub**
2. **Create Project** → نام: `financemanager` → منطقه‌ی نزدیک (مثلاً Frankfurt) → Create
3. صفحه‌ی **Connection string** باز می‌شود. **دو تا رشته لازم داری:**

   | متغیر | کدام رشته |
   |---|---|
   | `DATABASE_URL` | با تیکِ **«Pooled connection»** (شاملِ `-pooler` در هاست) |
   | `DIRECT_URL` | **بدونِ** تیکِ pooled (اتصالِ مستقیم) |

   هر دو را کپی کن و کنار بگذار.

> ℹ️ **چرا دو تا؟** رانتایمِ سرورلسِ Vercel به اتصالِ pooled نیاز دارد (تعدادِ زیادی
> اتصالِ کوتاه)، ولی مایگریشن‌ها باید روی اتصالِ مستقیم اجرا شوند. `schema.prisma`
> هر دو را می‌خواهد و **اگر `DIRECT_URL` را نگذاری، بیلد متوقف می‌شود.**

---

## گامِ ۲ — دیپلوی روی Vercel

1. [vercel.com/new](https://vercel.com/new) → با گیت‌هاب وارد شو
2. ریپوی **`financemanager-web`** را **Import** کن
3. Vercel خودش Next.js را تشخیص می‌دهد. **Build Command را دست نزن** —
   `vercel.json` خودش `prisma generate && prisma migrate deploy && next build` را اجرا
   می‌کند، که جدول‌ها را هم می‌سازد.
4. بخشِ **Environment Variables** را باز کن و این‌ها را اضافه کن:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | رشته‌ی **pooled** از Neon |
   | `DIRECT_URL` | رشته‌ی **مستقیم** از Neon |
   | `AUTH_SECRET` | یک رشته‌ی تصادفیِ بلند (پایین) |
   | `CRON_SECRET` | یک رشته‌ی تصادفیِ بلند (اختیاری ولی توصیه‌شده) |

   ساختِ رشته‌ی تصادفی: `openssl rand -base64 32`

5. **Deploy** را بزن.

---

## گامِ ۳ — اولین ورود

1. بعد از چند دقیقه Vercel آدرسی مثلِ `https://financemanager-web-xxx.vercel.app` می‌دهد
2. بازش کن → صفحه‌ی **ثبت‌نام (`/register`)** → حسابِ خودت را بساز
3. اولین کاربر، خانوارِ (household) خودش را می‌سازد و مالکِ آن است

> 🌱 **دادهٔ نمونه لازم نداری** — اپ صفحه‌ی ثبت‌نام دارد. اگر بخواهی می‌توانی محلی
> `pnpm db:seed` بزنی، ولی برای استفاده‌ی واقعی لازم نیست.

### نصب روی گوشی
آدرس را در مرورگرِ گوشی باز کن → منو → **Add to Home Screen**. حالا مثلِ یک اپِ واقعی است.

---

## گامِ ۴ — کران‌جاب‌ها (خودکار)

`vercel.json` دو کارِ زمان‌بندی‌شده دارد که Vercel خودش اجرا می‌کند:

| مسیر | زمان | کار |
|---|---|---|
| `/api/cron/recurring` | هر روز ۶ صبح | ثبتِ تراکنش‌های تکرارشونده |
| `/api/cron/refresh` | هر ساعت | به‌روزرسانیِ نرخِ ارز و قیمتِ دارایی‌ها |

اگر `CRON_SECRET` را ست کرده باشی، این مسیرها محافظت‌شده‌اند.

> ⚠️ پلنِ رایگانِ Vercel محدودیتِ تعدادِ کران دارد. اگر خطا دیدی، `crons` را در
> `vercel.json` به یکی کم کن.

---

## 🔧 عیب‌یابی

| علامت | علت و راه‌حل |
|---|---|
| بیلد: `Environment variable not found: DIRECT_URL` | `DIRECT_URL` را در Vercel ست نکرده‌ای. گامِ ۲.۴ |
| بیلد: خطای `migrate deploy` | معمولاً `DIRECT_URL` اشتباه است (رشته‌ی pooled را گذاشته‌ای). باید **مستقیم** باشد |
| اپ بالا می‌آید ولی هر صفحه خطا می‌دهد | جدول‌ها ساخته نشده‌اند. لاگِ بیلد را ببین: باید `0_init` اجرا شده باشد |
| `too many connections` | `DATABASE_URL` باید **pooled** باشد. اگر باز هم بود: `?sslmode=require&pgbouncer=true&connection_limit=1` را به آخرش اضافه کن |
| لاگین بعد از رفرش می‌پرد | `AUTH_SECRET` بینِ دیپلوی‌ها عوض شده. یک مقدارِ ثابت بگذار |

---

## 📝 تغییراتی که برای این دیپلوی لازم بود

دو مانع در ریپو بود که برطرف شد:

1. **پوشه‌ی `migrations` وجود نداشت** — ولی `vercel.json` دستورِ `prisma migrate deploy`
   را اجرا می‌کرد. نتیجه: دیپلوی «موفق» می‌شد ولی **دیتابیس خالی می‌ماند** و اپ سرِ
   اولین کوئری می‌ترکید. حالا `apps/web/prisma/migrations/0_init/` با کلِ اسکیما (۱۲ جدول،
   ۲۰ کلیدِ خارجی، ۲۳ ایندکس) ساخته شده.
2. **`directUrl` در اسکیما نبود** — که برای Postgresِ pooled (Neon) لازم است. اضافه شد،
   و `.env.example` هم به‌روز شد که `DIRECT_URL` **الزامی** است.

## محلی اجرا کردن (اختیاری)

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm install
cp .env.example .env        # DIRECT_URL را هم پر کن (همان DATABASE_URL کافی است)
pnpm db:migrate:deploy   # جدول‌ها را می‌سازد
pnpm dev
```
