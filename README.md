# 🏡 Nest — our money

Shared expense tracker, monthly budgets, stats, house-savings log and a savings / home-loan calculator.
Plain HTML + JavaScript + Supabase. Installable as an app (PWA). Free to host on GitHub Pages.

## Setup (about 15 minutes)

### 1. Supabase (database + logins)
1. Go to supabase.com → **New project** (your 2nd free project). Pick region **Frankfurt (eu-central-1)**.
2. Open **SQL Editor → New query**, paste the whole of `schema.sql`, press **Run**.
3. Open **Project Settings → API** and copy:
   - **Project URL**
   - **anon / publishable key** (NOT the `service_role` / secret key)
4. Paste both into `config.js`.

### 2. GitHub Pages (hosting)
1. Create a new **public** repo, e.g. `nest`.
2. **Add file → Upload files** and upload everything, keeping the `icons` folder.
3. **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
4. After ~1 minute your app is at `https://YOUR-USERNAME.github.io/nest/`.

### 3. Tell Supabase where the app lives
Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://YOUR-USERNAME.github.io/nest/`
- **Redirect URLs**: add the same URL.

This makes the email confirmation link open your app.

### 4. Start using it
1. Open the link → **Create account** → confirm your email → sign in.
2. **Create a household** → go to **More** and copy the **invite code**.
3. Your boyfriend creates his own account with his email → **Join your partner** → enters the code.
4. **Lock it:** Supabase → **Authentication → Sign In / Providers** → turn off **Allow new users to sign up**. Now only your two accounts can ever log in.
5. Both: in **More**, add your take-home pay. Set the savings goal and date.
6. In **Savings**, add a deposit for the money you already have (e.g. the €51k gift once it arrives).

### 5. Install on your phones
- **iPhone (Safari):** Share → **Add to Home Screen**
- **Android (Chrome):** ⋮ menu → **Install app**

## What's inside
| Tab | What it does |
|---|---|
| 🏠 Home | What you spent vs your budget, per day, days left · folders: Budgets (with warnings) / Expenses |
| ➕ | Add an expense in a few taps (amount, category, note, who paid) |
| 📊 Stats | Your last 6 months, changes vs last month, you and your partner, your biggest expenses |
| 🐷 Savings | Just me / Together switch · progress to goal · folders: Calculator / Who saved / History |
| ⚙️ More | Folders: Budgets (an amount for each of you per category) / You / Household |

Each of you logs in with your own email. You share the same categories, but each of you sets your **own monthly budget per category** (same or different amounts). Home and Stats show what *you* paid against *your* budgets. Savings are shared. Changes sync live between both phones.

## Updating the app later
Edit the files on GitHub, then change `nest-v1` → `nest-v2` in `sw.js` so phones pick up the new version.

## Notes
- The repo is public, so anyone can see the code, but **not your data**: the database rules only let the two of you read it.
- Supabase free projects pause after about a week with no use; opening the app regularly keeps it awake.
- You need internet to load and save data.
