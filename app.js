'use strict';
/* Nest — shared expense tracker, budgets & house-savings calculator.
   Plain JavaScript + Supabase. No build step: upload the files to GitHub Pages. */

const CFG = window.APP_CONFIG || {};
const app = document.getElementById('app');
const sheet = document.getElementById('sheet');

/* ───────────── Helpers ───────────── */
function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function addMonths(key, n) { const [y, m] = key.split('-').map(Number); return monthKey(new Date(y, m - 1 + n, 1)); }
function daysInMonth(key) { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function monthLabel(key, short) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', short ? { month: 'short' } : { month: 'long', year: 'numeric' });
}
function todayStr() { const d = new Date(); return monthKey(d) + '-' + String(d.getDate()).padStart(2, '0'); }
function fmtDate(s) { return new Date(s + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
function fmtMonthOf(d) { return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); }
function monthsUntil(dateStr) { const [y, m] = dateStr.split('-').map(Number); const n = new Date(); return (y - n.getFullYear()) * 12 + (m - 1 - n.getMonth()); }

const fmt2 = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const eur = n => { const v = Math.round((+n || 0) * 100) / 100; return (Number.isInteger(v) ? fmt0 : fmt2).format(v); };
const eur0 = n => fmt0.format(Math.round(+n || 0));
const kfmt = v => Math.abs(v) >= 10000 ? '€' + Math.round(v / 1000) + 'k' : Math.abs(v) >= 1000 ? '€' + (v / 1000).toFixed(1).replace('.0', '') + 'k' : '€' + Math.round(v);
// Reads amounts typed the Greek way ("2.400,50") or the English way ("2400.50").
function num(v) {
  let t = String(v ?? '').replace(/[\s€]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');        // 2.400,50 → 2400.50
  else if ((t.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(t)) t = t.replace(/\./g, ''); // 2.400 → 2400
  return parseFloat(t);
}
// Shows an amount in an input box with a thousands dot: 2400 → "2.400" (cents only if there are any)
const moneyIn = n => (n === '' || n == null || isNaN(+n)) ? '' : (+n).toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: true });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeColor = c => /^#[0-9a-f]{3,8}$/i.test(c || '') || /^var\(--[a-z0-9-]+\)$/.test(c || '') ? c : 'var(--brand)';
const sum = (arr, f = x => x.amount) => arr.reduce((a, x) => a + (+f(x) || 0), 0);
const pctTxt = p => Math.round(p * 100) + '%';

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}
async function q(promise) {
  const { data, error } = await promise;
  if (error) { console.error(error); toast(error.message); throw error; }
  return data;
}
function bar(p, marker, color) {
  const cls = p > 1 ? 'over' : p > 0.85 ? 'warn' : '';
  const style = color ? `;background:${safeColor(color)}` : '';
  return `<div class="bar ${color ? '' : cls}"><i style="width:${Math.max(0, Math.min(100, p * 100)).toFixed(1)}%${style}"></i>${marker != null ? `<b style="left:${(marker * 100).toFixed(1)}%"></b>` : ''}</div>`;
}

/* ───────────── Icons (thin line icons, no emoji) ───────────── */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.7 12.2a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6"/>',
  utensils: '<path d="M5 2v8a2 2 0 0 0 4 0V2"/><path d="M7 12v10"/><path d="M18 2c-2.2 1.5-3.5 4-3.5 7.5V13H18v9"/>',
  paw: '<circle cx="5.5" cy="11" r="1.8"/><circle cx="9" cy="6.5" r="1.8"/><circle cx="15" cy="6.5" r="1.8"/><circle cx="18.5" cy="11" r="1.8"/><path d="M12 12c-2.8 0-5 3-5 5.5 0 1.7 1.3 2.5 2.8 2.5 1 0 1.5-.5 2.2-.5s1.2.5 2.2.5c1.5 0 2.8-.8 2.8-2.5C17 15 14.8 12 12 12z"/>',
  car: '<path d="M3 13l2-6h14l2 6v5H3z"/><path d="M3 13h18"/><path d="M5 18v2M19 18v2"/><circle cx="7.5" cy="15.5" r=".6"/><circle cx="16.5" cy="15.5" r=".6"/>',
  wine: '<path d="M8 2h8l-.5 6a3.5 3.5 0 0 1-7 0z"/><path d="M12 11.5V21"/><path d="M8 21h8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5"/><path d="M12 12v9"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9"/><path d="M12 8v13"/><path d="M12 8C10 4.5 6.5 4.5 7.5 7c.4 1 2.5 1 4.5 1zM12 8c2-3.5 5.5-3.5 4.5-1-.4 1-2.5 1-4.5 1z"/>',
  heart: '<path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/>',
  shirt: '<path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
  plane: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  book: '<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>',
  dumbbell: '<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>',
  coffee: '<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2v3M12 2v3"/>',
  game: '<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="16" cy="11.5" r=".7"/><circle cx="18" cy="13.5" r=".7"/>',
  health: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  // interface
  chart: '<path d="M4 20V11M10 20V4M16 20v-7M21 20H3"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/><path d="M3 7h16a2 2 0 0 1 2 2v2h-5a2 2 0 0 0 0 4h5"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  calc: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18.5h.01M12 18.5h.01M15.5 18.5h.01"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .6 3.5 2.8 3.5 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  tree: '<path d="M12 2 6 10h3l-4 6h14l-4-6h3z"/><path d="M12 16v5"/>',
  egg: '<path d="M12 3c-3.5 0-6.5 6-6.5 10a6.5 6.5 0 0 0 13 0c0-4-3-10-6.5-10z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  down: '<path d="M12 4v14M6 12l6 6 6-6"/>',
  up: '<path d="M12 20V6M6 12l6-6 6 6"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  logo: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><circle cx="12" cy="15" r="2.5"/>',
  tv: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M8 2l4 4 4-4"/>',
  wifi: '<path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5 12.6a10 10 0 0 1 14 0"/><path d="M8.5 16.3a5 5 0 0 1 7 0"/><path d="M12 20h.01"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="1.5"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  pill: '<path d="M10.5 20.5a5 5 0 0 1-7-7l10-10a5 5 0 0 1 7 7z"/><path d="M8.5 8.5l7 7"/>',
  droplet: '<path d="M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0z"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 2-2 3-4 3 0-2-1-4-2-6-2 3-4 6-4 10s3 9 7 9z"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  film: '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 9h5M2 15h5M17 9h5M17 15h5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
};
// Icons offered for categories (tap the icon in More → Budgets to change it)
const CAT_ICONS = ['home', 'bolt', 'cart', 'utensils', 'paw', 'car', 'wine', 'user', 'box', 'gift', 'heart', 'shirt', 'plane', 'phone', 'book', 'dumbbell', 'coffee', 'game', 'health', 'card'];
// Icons offered for recurring bills
const REC_ICONS = ['home', 'building', 'bolt', 'droplet', 'flame', 'wifi', 'tv', 'phone', 'music', 'film', 'pill', 'paw', 'health', 'shield', 'car', 'card', 'dumbbell', 'book', 'box', 'heart'];
const ic = (name, size = 18) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.box}</svg>`;
// Category icon: a line icon if it's one of ours, otherwise whatever text was saved
const catIc = (c, size = 16) => ICONS[c.icon] ? ic(c.icon, size) : `<span>${esc(c.icon || '')}</span>`;
const catBadge = c => `<span class="cicon" style="--c:${safeColor(c.color)}">${catIc(c)}</span>`;

/* ───────────── State ───────────── */
const S = {
  session: null, household: null, members: [], cats: [], budgets: [], exp: [], sav: [], recurring: [], paydays: [], period: 0,
  tab: 'home', month: monthKey(new Date()), channel: null, lastCat: null, f: {}, calc: null, savMode: 'together'
};
const uid = () => S.session?.user?.id;

// Remember the screen, open tabs, savings mode, month and scroll position across refreshes.
const UI_KEY = 'nest-ui';
(function restoreUI() {
  try {
    const u = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
    if (['home', 'stats', 'savings', 'settings'].includes(u.tab)) S.tab = u.tab;
    if (u.f && typeof u.f === 'object') S.f = u.f;
    if (u.savMode === 'me' || u.savMode === 'together') S.savMode = u.savMode;
    if ([0, 1, 2].includes(u.bPage)) S.bPage = u.bPage;
    if (/^\d{4}-\d{2}$/.test(u.month || '') && u.month <= monthKey(new Date())) S.month = u.month;
    S.restoreScroll = { y: +u.y || 0, inner: +u.inner || 0 };
  } catch {}
})();
function saveUI() {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ tab: S.tab, f: S.f, savMode: S.savMode, month: S.month, bPage: S.bPage || 0,
      y: window.scrollY, inner: document.querySelector('.view-home .fbody')?.scrollTop || 0 }));
  } catch {}
}
let saveUITimer;
const saveUISoon = () => { clearTimeout(saveUITimer); saveUITimer = setTimeout(saveUI, 250); };
window.addEventListener('scroll', saveUISoon, { passive: true });
document.addEventListener('scroll', e => { if (e.target.classList?.contains('fbody')) saveUISoon(); }, { capture: true, passive: true });
window.addEventListener('pagehide', saveUI);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveUI(); });
const memberName = id => S.members.find(m => m.user_id === id)?.display_name || '—';
const catOf = id => S.cats.find(c => c.id === id) || { name: 'Uncategorised', icon: 'box', color: '#8b93a3' };
// Each person has their own budget amount per category.
const budgetOf = (catId, userId = uid()) => +(S.budgets.find(b => b.category_id === catId && b.user_id === userId)?.amount || 0);
// Budgets can be marked as savings (e.g. "Savings", "Household savings"): they don't count as spending.
// A savings budget is either "personal" (filled by your deposits to your own account, not the child one)
// or "joint" (filled by the joint account's deposits). Neither can be picked when adding an expense.
// Budgets marked as savings before the personal/joint choice existed: guess from the name.
const savingKind = c => c?.saving_kind || (c?.is_saving ? (/household|joint|κοιν|σπιτ/i.test(c.name || '') ? 'joint' : 'personal') : null);
const isSavingCat = c => !!savingKind(c);
/* Pay periods: each of you taps "Got paid" on payday, and that's where your new month starts.
   Until the first "Got paid", periods are calendar months. */
const addDays = (str, n) => { const d = new Date(str + 'T00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const addMonthDate = (str, n) => { const d = new Date(str + 'T00:00'), day = d.getDate(); const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); return ymd(t); };
const myPaydays = (userId = uid()) => [...new Set(S.paydays.filter(p => p.user_id === userId && p.paid_on <= todayStr()).map(p => p.paid_on))]
  .sort().reverse().filter(d => !S.loadedFrom || d >= S.loadedFrom);
// i = 0 is the current period, 1 the one before, …
function payPeriod(i = 0) {
  const days = myPaydays();
  if (!days.length) return null;
  i = Math.max(0, Math.min(i, days.length - 1));
  const from = days[i], to = i === 0 ? null : addDays(days[i - 1], -1);
  return { i, count: days.length, from, to, end: to || addDays(addMonthDate(from, 1), -1) };
}
// The dates Home is showing: your current pay period, or a calendar month if you haven't used "Got paid" yet
function homeRange() {
  const today = todayStr(), P = payPeriod(S.period || 0);
  if (P) {
    const isNow = P.i === 0, total = daysBetween(P.from, P.end) + 1, elapsed = Math.min(total, daysBetween(P.from, today) + 1);
    return { P, from: P.from, to: P.to || today, isNow, pace: isNow ? elapsed / total : 1,
      daysLeft: isNow ? Math.max(1, daysBetween(today, P.end) + 1) : 0,
      label: `${fmtDate(P.from)} – ${P.to ? fmtDate(P.to) : 'today'}` };
  }
  const isNow = S.month === monthKey(new Date()), dim = daysInMonth(S.month), day = new Date().getDate();
  return { P: null, from: S.month + '-01', to: S.month + '-' + String(dim).padStart(2, '0'), isNow,
    pace: isNow ? day / dim : 1, daysLeft: isNow ? dim - day + 1 : 0, label: monthLabel(S.month) };
}
const currentFrom = () => payPeriod(0)?.from || monthKey(new Date()) + '-01';

function savedInto(c, from = currentFrom(), to = todayStr(), userId = uid()) {
  const inMonth = S.sav.filter(s => s.saved_on >= from && s.saved_on <= to);
  return savingKind(c) === 'joint'
    ? sum(inMonth.filter(isJoint)) / Math.max(1, S.members.length)   // your half of the joint deposits
    : sum(inMonth.filter(s => s.account === 'personal' && s.saved_by === userId));
}
const spendOnly = list => list.filter(e => !isSavingCat(catOf(e.category_id)));
const catBudgetTotal = (userId = uid()) => sum(S.cats.filter(c => !isSavingCat(c)), c => budgetOf(c.id, userId));
// Spending budget = your category budgets + your share of recurring bills
const myBudgetTotal = (userId = uid()) => catBudgetTotal(userId) + recurringMonthly(userId);
const mySavingBudget = (userId = uid()) => sum(S.cats.filter(isSavingCat), c => budgetOf(c.id, userId));
// Income for budgeting = salary + extras (e.g. a supermarket card). Bonuses only use the salary.
const incomeOf = m => (+m?.monthly_income || 0) + (+m?.extra_income || 0);
// By default only what *I* paid; pass all = true for both of us.
const monthExp = (key = S.month, all = false) => S.exp.filter(e => e.spent_on.startsWith(key) && (all || e.paid_by === uid()));
const isTyping = () => { const a = document.activeElement; return a && app.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName); };

/* ───────────── Startup ───────────── */
if (!CFG.url || CFG.url.includes('YOUR-PROJECT')) {
  app.innerHTML = `<div class="card center"><div class="logo">${ic('logo', 28)}</div><h1>Almost there</h1>
    <p class="muted">Open <code>config.js</code> and paste your Supabase project URL and anon key.</p></div>`;
  throw new Error('Missing Supabase config');
}
const sb = supabase.createClient(CFG.url, CFG.key);

async function init() {
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  sb.auth.onAuthStateChange((_ev, session) => {
    const changed = session?.user?.id !== S.session?.user?.id;
    S.session = session;
    if (changed) setTimeout(boot, 0); // never await Supabase inside this callback
  });
  boot();
}

async function boot() {
  try {
    if (!S.session) return renderAuth();
    await loadHousehold();
    if (!S.household) return renderJoin();
    await loadData();
    subscribe();
    render();
    if (S.restoreScroll) {   // put you back where you were
      const r = S.restoreScroll; S.restoreScroll = null;
      requestAnimationFrame(() => {
        window.scrollTo(0, r.y);
        const fb = document.querySelector('.view-home .fbody'); if (fb) fb.scrollTop = r.inner;
      });
    }
  } catch (e) {
    app.innerHTML = `<div class="card center"><p>Couldn't load: ${esc(e.message)}</p>
      <p class="muted">Check your internet connection.</p><button class="btn primary" onclick="location.reload()">Try again</button></div>`;
  }
}

async function loadHousehold() {
  const mine = await q(sb.from('members').select('household_id').eq('user_id', uid()).limit(1));
  if (!mine.length) { S.household = null; return; }
  const hid = mine[0].household_id;
  S.household = await q(sb.from('households').select('*').eq('id', hid).single());
  S.members = await q(sb.from('members').select('*').eq('household_id', hid).order('joined_at'));
}

// Loads 6 months ending with the month on screen (enough for the stats trend).
async function loadData() {
  const hid = S.household.id;
  const from = addMonths(S.month, -5) + '-01', to = addMonths(S.month, 1) + '-01';
  S.loadedFrom = from;
  const [cats, budgets, exp, sav, members, recurring, paydays] = await Promise.all([
    q(sb.from('categories').select('*').eq('household_id', hid).order('sort').order('name')),
    q(sb.from('budgets').select('*').eq('household_id', hid)),
    q(sb.from('expenses').select('*').eq('household_id', hid).gte('spent_on', from).lt('spent_on', to)
      .order('spent_on', { ascending: false }).order('created_at', { ascending: false })),
    q(sb.from('savings').select('*').eq('household_id', hid).order('saved_on', { ascending: false }).order('created_at', { ascending: false })),
    q(sb.from('members').select('*').eq('household_id', hid).order('joined_at')),
    q(sb.from('recurring').select('*').eq('household_id', hid).order('next_due')),
    q(sb.from('paydays').select('*').eq('household_id', hid).order('paid_on', { ascending: false }).limit(60))
  ]);
  Object.assign(S, { cats, budgets, exp, sav, members, recurring, paydays });
}

let reloadTimer;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    try { await loadData(); if (!isTyping() && !S.budgetsDirty) render(); } catch {}
  }, 500);
}
function subscribe() {
  if (S.channel) sb.removeChannel(S.channel);
  S.channel = sb.channel('nest-' + S.household.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'savings' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring' }, scheduleReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'paydays' }, scheduleReload)
    .subscribe();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.household) scheduleReload();
});

/* ───────────── Auth & joining ───────────── */
function renderAuth() {
  app.innerHTML = `<div class="card center">
    <div class="logo">${ic('logo', 28)}</div><h1>Nest</h1>
    <p class="muted">Track spending and save for our home, together.</p>
    <form data-form="auth" class="stack" style="margin-top:16px">
      <input name="email" type="email" placeholder="Email" autocomplete="email" required>
      <input name="password" type="password" placeholder="Password (min 6 characters)" autocomplete="current-password" minlength="6" required>
      <button class="btn primary" name="mode" value="in">Sign in</button>
      <button class="btn" name="mode" value="up">Create account</button>
    </form>
    <p class="muted" id="authmsg"></p>
  </div>`;
}
function renderJoin() {
  const tab = S.joinTab || 'create';
  const t = (id, icon, label) => `<button class="ftab ${tab === id ? 'on' : ''}" data-act="joinTab" data-id="${id}">${ic(icon, 14)} ${label}</button>`;
  const body = tab === 'create'
    ? `<p class="muted" style="margin-top:0">Start your shared space. You'll get an invite code to send to your partner.</p>
       <form data-form="create" class="stack">
         <input name="name" placeholder="Your name" required autocomplete="given-name">
         <input name="hname" placeholder="Household name" value="Our home">
         <button class="btn primary">${ic('home', 16)} Create household</button>
       </form>`
    : `<p class="muted" style="margin-top:0">Your partner already created it? Enter the invite code they see in More → Household.</p>
       <form data-form="join" class="stack">
         <input name="name" placeholder="Your name" required autocomplete="given-name">
         <input name="code" placeholder="Invite code (e.g. A1B2C3)" autocapitalize="characters" autocomplete="off" required>
         <button class="btn primary">${ic('users', 16)} Join household</button>
       </form>`;
  app.innerHTML = `<div class="view join">
    <div class="logo">${ic('logo', 28)}</div>
    <h1 style="text-align:center">Welcome</h1>
    <p class="muted" style="text-align:center;margin-bottom:18px">One of you creates the household, the other joins with the invite code.</p>
    <div class="folders"><div class="fhead"><div class="ftabs">${t('create', 'plus', 'Create')}${t('join', 'users', 'Join')}</div></div>
      <div class="fbody">${body}</div></div>
    <button class="btn" data-act="signout" style="margin-top:14px">Sign out</button>
  </div>`;
}

/* ───────────── Recurring bills ───────────── */
// A recurring bill repeats every month (on a day of the month) or every N days.
// Fixed-price bills are added automatically when they're due; bills that vary (like κοινόχρηστα)
// wait for you to tap "Pay" and enter the real amount.
// split = { user_id: share between 0 and 1 } says who pays how much of each bill.
const ymd = d => monthKey(d) + '-' + String(d.getDate()).padStart(2, '0');
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / 864e5);
const isFixed = r => r.amount != null && +r.amount > 0;
const newId = () => (window.crypto?.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

function nextDue(r, fromStr) {
  const d = new Date(fromStr + 'T00:00');
  if (r.repeat === 'days') { d.setDate(d.getDate() + Math.max(1, +r.every_days || 30)); return ymd(d); }
  const day = +r.day_of_month || d.getDate();
  const y = d.getFullYear(), m = d.getMonth() + 1;          // next month
  const dim = new Date(y, m + 1, 0).getDate();
  return ymd(new Date(y, m, Math.min(day, dim)));
}

// Turn a split into euro amounts per person (rounded so the parts add up exactly).
function splitShares(split, amount) {
  const ids = S.members.map(m => m.user_id);
  let fr = ids.map(id => +(split?.[id] ?? 0));
  const tot = fr.reduce((a, b) => a + b, 0);
  fr = tot > 0 ? fr.map(f => f / tot) : ids.map(() => 1 / ids.length);
  let left = Math.round(amount * 100);
  return ids.map((id, i) => {
    const cents = i === ids.length - 1 ? left : Math.round(amount * 100 * fr[i]);
    left -= cents;
    return { user_id: id, amount: cents / 100 };
  }).filter(s => s.amount > 0);
}
const fractionOf = (r, userId) => (splitShares(r.split, 100).find(s => s.user_id === userId)?.amount || 0) / 100;
const myFraction = r => fractionOf(r, uid());
// What a bill costs per month on average (a bill every 45 days ≈ 0,68 times a month; one that varies = middle of its range)
const monthlyOf = r => (isFixed(r) ? +r.amount : ((+r.min_amount || 0) + (+r.max_amount || 0)) / 2)
  * (r.repeat === 'days' ? 30.44 / Math.max(1, +r.every_days || 30) : 1);
// Each person's monthly share of all recurring bills: counted as its own line in the budget
const recurringMonthly = (userId = uid()) => sum(S.recurring, r => monthlyOf(r) * fractionOf(r, userId));

// One expense per person; split halves share a split_id so they can be deleted together.
async function addSplitExpenses({ amount, category_id, note, spent_on, shares, recurring_id = null }) {
  const split_id = shares.length > 1 ? newId() : null;
  const rows = shares.map(s => ({ household_id: S.household.id, amount: s.amount, category_id, note, spent_on, paid_by: s.user_id, split_id, recurring_id }));
  if (rows.length) await q(sb.from('expenses').insert(rows));
}

// Add any fixed bills that have come due. Safe if both phones do it at once:
// a bill is only added by whoever moves its date forward first.
async function processRecurring() {
  const today = todayStr();
  let added = 0;
  for (const r of S.recurring.filter(isFixed)) {
    let due = r.next_due, guard = 0;
    while (due <= today && guard++ < 12) {
      const nxt = nextDue(r, due);
      const claimed = await q(sb.from('recurring').update({ next_due: nxt }).eq('id', r.id).eq('next_due', due).select());
      if (!claimed?.length) break;
      await addSplitExpenses({ amount: +r.amount, category_id: r.category_id, note: r.name, spent_on: due, shares: splitShares(r.split, +r.amount), recurring_id: r.id });
      r.next_due = due = nxt;
      added++;
    }
  }
  return added;
}

// A bill's own icon (falls back to its category's icon)
const recBadge = r => catBadge({ icon: r.icon || (r.category_id ? catOf(r.category_id).icon : 'home'), color: 'var(--brand)' });
// Expenses that already paid this bill for the current period (this month, or the last X days)
function paidNow(r) {
  const list = S.exp.filter(e => e.recurring_id === r.id);
  if (r.repeat === 'days') {
    const last = list.map(e => e.spent_on).sort().pop();
    return last && daysBetween(last, todayStr()) < Math.max(1, +r.every_days || 30) ? list.filter(e => e.spent_on === last) : [];
  }
  return list.filter(e => e.spent_on >= currentFrom());   // paid in this pay period
}
function recItem(r) {
  const freq = r.repeat === 'days' ? `Every ${r.every_days} days` : 'Monthly';
  const mine = myFraction(r), paid = paidNow(r);
  const paidMine = sum(paid.filter(e => e.paid_by === uid())), paidTotal = sum(paid);
  const typical = isFixed(r) ? eur(+r.amount * mine) : `${eur0((+r.min_amount || 0) * mine)}–${eur0((+r.max_amount || 0) * mine)}`;
  const right = paid.length
    ? (paidMine ? `<div class="amt">${eur(paidMine)}</div><div class="paidtag">${ic('check', 12)} Paid</div>`
      : `<div class="paidtag">${ic('check', 12)} ${esc(memberName(paid[0].paid_by))} paid</div>`)
    : `<button class="btn small primary" data-act="${isFixed(r) ? 'markPaid' : 'payRecurring'}" data-id="${r.id}">Paid</button>`;
  const sub = `${freq} · ${paid.length ? (mine < 0.999 ? `of ${eur(paidTotal)}` : 'this month') : mine < 0.001 ? `${esc(memberName(splitShares(r.split, 100)[0]?.user_id))} pays` : `you ${typical}`}`;
  return `<div class="item" data-act="editRecurring" data-id="${r.id}">${recBadge(r)}
    <div class="grow"><div class="ellipsis">${esc(r.name)}</div><div class="muted">${sub}</div></div>
    <div class="recamt">${right}</div></div>`;
}

function recurringBody() {
  const today = todayStr();
  const list = [...S.recurring].sort((a, b) => monthlyOf(b) - monthlyOf(a));
  return `<div class="list">${list.length ? list.map(r => recItem(r)).join('') : '<div class="empty">No recurring bills yet. Add rent, internet, TV…</div>'}</div>
    <button class="btn" data-act="addRecurring">${ic('plus', 16)} Add recurring bill</button>`;
}
const recurringDue = () => false;   // no reminders: recurring bills are just tracked

function recurringForm(r = {}) {
  const cats = S.cats.filter(c => !isSavingCat(c));
  const fixed = r.id ? isFixed(r) : true, rep = r.repeat || 'monthly';
  const sel = r.category_id || cats[0]?.id;
  const fr = S.members.map(m => r.id ? (splitShares(r.split, 1).find(s => s.user_id === m.user_id)?.amount || 0) : 1 / S.members.length);
  const spVal = i => fixed ? (r.id ? moneyIn(Math.round(fr[i] * r.amount * 100) / 100) : '') : String(Math.round(fr[i] * 100));
  return `<form data-form="recurring" class="stack ${fixed ? 'is-fixed' : 'is-varies'} rep-${rep}">
    <div class="sheet-head"><h3>${r.id ? 'Edit recurring bill' : 'New recurring bill'}</h3><button type="button" class="x" data-act="close">${ic('x', 16)}</button></div>
    <input type="hidden" name="id" value="${r.id || ''}">
    <input name="name" placeholder="Name (e.g. Rent, Internet, Cat vitamins)" value="${esc(r.name || '')}" required maxlength="60" ${r.id ? '' : 'autofocus'}>
    <label class="f">Icon</label>
    <div class="iconpick">${REC_ICONS.map(k => `<label><input type="radio" name="icon" value="${k}" ${(r.icon || (r.category_id ? catOf(r.category_id).icon : 'home')) === k ? 'checked' : ''}><span>${ic(k, 18)}</span></label>`).join('')}</div>
    <div class="seg"><label><input type="radio" name="kind" value="fixed" ${fixed ? 'checked' : ''}><span>Fixed price</span></label>
      <label><input type="radio" name="kind" value="varies" ${fixed ? '' : 'checked'}><span>Varies</span></label></div>
    <div class="only-fixed"><input name="amount" class="money" inputmode="decimal" autocomplete="off" placeholder="Amount (€)" value="${isFixed(r) ? moneyIn(r.amount) : ''}"></div>
    <div class="only-varies grid2"><input name="min_amount" class="money" inputmode="decimal" autocomplete="off" placeholder="From (€)" value="${r.min_amount != null ? moneyIn(r.min_amount) : ''}">
      <input name="max_amount" class="money" inputmode="decimal" autocomplete="off" placeholder="To (€)" value="${r.max_amount != null ? moneyIn(r.max_amount) : ''}"></div>
    <div class="seg"><label><input type="radio" name="repeat" value="monthly" ${rep === 'monthly' ? 'checked' : ''}><span>Every month</span></label>
      <label><input type="radio" name="repeat" value="days" ${rep === 'days' ? 'checked' : ''}><span>Every X days</span></label></div>
    <div class="only-days"><input name="every_days" inputmode="numeric" placeholder="Every how many days? (e.g. 45)" value="${r.every_days || ''}"></div>
    ${S.members.length > 1 ? `<label class="f">Who pays <span class="only-fixed">(€)</span><span class="only-varies">(%)</span></label>
    <div class="grid2">${S.members.map((m, i) => `<label class="spl"><small>${esc(m.user_id === uid() ? 'You' : m.display_name)}</small>
      <input name="sp_${m.user_id}" data-i="${i}" class="splitin" inputmode="decimal" autocomplete="off" value="${spVal(i)}"></label>`).join('')}</div>
    <div class="row" style="flex-wrap:wrap;gap:6px">
      <button type="button" class="btn small" data-act="recSplit" data-who="half">50/50</button>
      ${S.members.map(m => `<button type="button" class="btn small" data-act="recSplit" data-who="${m.user_id}">All ${esc(m.user_id === uid() ? 'me' : m.display_name)}</button>`).join('')}
    </div>` : ''}
    <button class="btn primary">${r.id ? 'Save' : 'Add recurring bill'}</button>
    ${r.id ? `<button type="button" class="btn danger" data-act="delRecurring" data-id="${r.id}">Delete</button>` : ''}
  </form>`;
}

// Keep the recurring form's fields in step: fixed ↔ varies, monthly ↔ days, and the split adding up.
function recFormFractions(form) {
  const fixed = form.classList.contains('is-fixed');
  const ins = [...form.querySelectorAll('.splitin')];
  const vals = ins.map(i => num(i.value) || 0), tot = vals.reduce((a, b) => a + b, 0);
  return tot > 0 ? vals.map(v => v / tot) : ins.map(() => 1 / ins.length);
}
function setRecSplit(form, fr) {
  const fixed = form.classList.contains('is-fixed'), amount = num(form.querySelector('[name=amount]').value) || 0;
  form.querySelectorAll('.splitin').forEach((inp, i) => {
    inp.value = fixed ? (amount ? moneyIn(Math.round(fr[i] * amount * 100) / 100) : '') : String(Math.round(fr[i] * 100));
  });
}
function syncRecurringForm(form, changed) {
  if (changed?.name === 'kind') {
    const fr = form._fr || recFormFractions(form);
    form._fr = fr;
    form.classList.toggle('is-fixed', changed.value === 'fixed');
    form.classList.toggle('is-varies', changed.value === 'varies');
    setRecSplit(form, fr);
  }
  if (changed?.name === 'repeat') {
    form.classList.toggle('rep-monthly', changed.value === 'monthly');
    form.classList.toggle('rep-days', changed.value === 'days');
  }
  if (changed?.name === 'amount' && form.classList.contains('is-fixed')) setRecSplit(form, form._fr || recFormFractions(form));
  if (changed?.classList?.contains('splitin')) {
    const ins = [...form.querySelectorAll('.splitin')];
    if (ins.length === 2) {   // typing one person's part fills in the other
      const fixed = form.classList.contains('is-fixed');
      const whole = fixed ? (num(form.querySelector('[name=amount]').value) || 0) : 100;
      const other = ins[1 - +changed.dataset.i];
      const rest = Math.max(0, whole - (num(changed.value) || 0));
      if (whole) other.value = fixed ? moneyIn(Math.round(rest * 100) / 100) : String(Math.round(rest));
    }
    form._fr = recFormFractions(form);
  }
}

function gotPaidForm() {
  const mine = S.paydays.filter(p => p.user_id === uid()).sort((a, b) => b.paid_on.localeCompare(a.paid_on)).slice(0, 4);
  return `<form data-form="payday" class="stack">
    <div class="sheet-head"><h3>Got paid</h3><button type="button" class="x" data-act="close">${ic('x', 16)}</button></div>
    <p class="muted" style="margin:0">Your new month starts on this day.</p>
    <input type="date" name="paid_on" value="${todayStr()}" max="${todayStr()}" required>
    <button class="btn primary">${ic('check', 16)} Start my new month</button>
    ${mine.length ? `<label class="f">Your last paydays</label><div class="list">${mine.map(p => `<div class="item">
      <span class="cicon" style="--c:var(--brand)">${ic('wallet', 16)}</span><div class="grow">${fmtDate(p.paid_on)}</div>
      <button type="button" class="iconbtn" data-act="delPayday" data-id="${p.id}" title="Remove">${ic('trash', 15)}</button></div>`).join('')}</div>` : ''}
  </form>`;
}

function payForm(r) {
  return `<form data-form="payRec" class="stack">
    <div class="sheet-head"><h3>${esc(r.name)}</h3><button type="button" class="x" data-act="close">${ic('x', 16)}</button></div>
    <input type="hidden" name="id" value="${r.id}">
    <input class="amount money" name="amount" inputmode="decimal" placeholder="${eur0(r.min_amount || 0)}–${eur0(r.max_amount || 0)}" required autofocus autocomplete="off">
    <input type="date" name="spent_on" value="${todayStr()}" required>
    <p class="muted" style="margin:0">${splitShares(r.split, 100).map(s => `${esc(s.user_id === uid() ? 'You' : memberName(s.user_id))} ${Math.round(s.amount)}%`).join(' · ')}</p>
    <button class="btn primary">Add expense</button>
  </form>`;
}

/* ───────────── Main render ───────────── */
const TABS = [['home', 'home', 'Home'], ['stats', 'chart', 'Stats'], ['add'], ['savings', 'wallet', 'Savings'], ['settings', 'more', 'More']];
function render() {
  const view = { home: viewHome, stats: viewStats, savings: viewSavings, settings: viewSettings }[S.tab]();
  const budgetsScreen = S.tab === 'settings' && (S.f.settings || 'budgets') === 'budgets';
  app.innerHTML = `<main class="view view-${S.tab}${budgetsScreen ? ' view-budgets' : ''}">${view}</main>
    <nav class="tabs">${TABS.map(([k, i, l]) => k === 'add'
      ? `<button class="tab add" data-act="add" aria-label="Add expense">${ic('plus', 24)}</button>`
      : `<button class="tab ${S.tab === k ? 'on' : ''}" data-tab="${k}">${ic(i, 21)}<small>${l}</small></button>`).join('')}</nav>`;
  updateCalc();
  updateBudgetLeft();
  showBudgetPage();
  saveUISoon();
}

function monthNav() {
  const now = monthKey(new Date());
  return `<div class="monthnav"><button data-act="prevMonth" aria-label="Previous month">${ic('left')}</button>
    <h1>${monthLabel(S.month)}</h1>
    <button data-act="nextMonth" aria-label="Next month" ${S.month >= now ? 'disabled' : ''}>${ic('right')}</button></div>`;
}

function catTotals(ex) {
  const t = {};
  ex.forEach(e => { const k = e.category_id || 'none'; t[k] = (t[k] || 0) + (+e.amount); });
  return t;
}

function expItem(e) {
  const bill = e.recurring_id && S.recurring.find(r => r.id === e.recurring_id);
  const c = e.recurring_id ? { name: 'Recurring bill', icon: bill ? (bill.icon || (bill.category_id ? catOf(bill.category_id).icon : 'home')) : 'clock', color: 'var(--brand)' } : catOf(e.category_id);
  return `<div class="item" data-act="edit" data-id="${e.id}">
    ${catBadge(c)}
    <div class="grow"><div class="ellipsis">${esc(e.note || c.name)}</div>
      <div class="muted">${fmtDate(e.spent_on)} · ${esc(memberName(e.paid_by))}${e.note ? ' · ' + esc(c.name) : ''}${!e.recurring_id && e.split_id ? ' · Split' : ''}</div></div>
    <div class="amt">${eur(e.amount)}</div></div>`;
}

/* ───────────── Folder tabs ───────────── */
// Each screen's sections live in notebook-style folder tabs, so there's less scrolling.
// items: [{ id, label, color, dot?, body: () => html }]
function folders(page, items, title) {
  let cur = S.f[page];
  if (!items.some(i => i.id === cur)) cur = S.f[page] = items[0].id;
  const it = items.find(i => i.id === cur);
  return `<div class="folders ${title ? 'titled' : ''}"><div class="fhead">${title ? `<h1>${title}</h1>` : ''}<div class="ftabs">${items.map(i =>
      `<button class="ftab ${i.id === cur ? 'on' : ''}" style="--c:${i.color}" data-act="folder" data-page="${page}" data-id="${i.id}">${i.label}${i.dot ? `<i class="dot ${i.dot}"></i>` : ''}</button>`).join('')}</div></div>
    <div class="fbody">${it.body()}</div></div>`;
}


/* ───────────── Home ───────────── */
function homeNav(Rg) {
  if (!Rg.P) return monthNav();
  return `<div class="monthnav"><button data-act="prevPeriod" aria-label="Previous period" ${Rg.P.i >= Rg.P.count - 1 ? 'disabled' : ''}>${ic('left')}</button>
    <h1>${Rg.label}</h1>
    <button data-act="nextPeriod" aria-label="Next period" ${Rg.P.i === 0 ? 'disabled' : ''}>${ic('right')}</button></div>`;
}

function viewHome() {
  const Rg = homeRange(), isNow = Rg.isNow, daysLeft = Rg.daysLeft, pace = Rg.pace;
  const ex = S.exp.filter(e => e.paid_by === uid() && e.spent_on >= Rg.from && e.spent_on <= Rg.to), spendEx = spendOnly(ex);
  const t = catTotals(ex.filter(e => !e.recurring_id));   // categories don't include recurring bills
  const spent = sum(spendEx), budget = myBudgetTotal(), left = budget - spent;
  const savedPlan = mySavingBudget();
  const perDay = isNow ? Math.max(0, left) / daysLeft : null;

  const rows = S.cats.map(c => ({ c, spent: isSavingCat(c) ? savedInto(c, Rg.from, Rg.to) : (t[c.id] || 0), budget: budgetOf(c.id) })).filter(r => r.budget || r.spent);
  const savedNow = sum(rows.filter(r => isSavingCat(r.c)), r => r.spent);
  if (t.none) rows.push({ c: catOf(null), spent: t.none, budget: 0 });
  const recBudget = recurringMonthly(), recSpent = sum(ex.filter(e => e.recurring_id));
  if (recBudget || recSpent) rows.push({ rec: true, c: { name: 'Recurring bills', icon: 'clock', color: 'var(--brand)' }, spent: recSpent, budget: recBudget });
  const ratio = r => r.budget ? r.spent / r.budget : (r.spent ? 9 : 0);
  rows.sort((a, b) => ratio(b) - ratio(a));

  const over = rows.filter(r => !r.rec && !isSavingCat(r.c) && r.budget && r.spent > r.budget);
  const fast = isNow ? rows.filter(r => !r.rec && !isSavingCat(r.c) && r.budget && r.spent < r.budget && r.spent / r.budget > 0.5 && r.spent / r.budget > pace + 0.2) : [];

  const budgetsBody = () => rows.length ? rows.map(r => {
      const sav = isSavingCat(r.c);
      const isOver = !sav && !r.rec && (r.budget ? r.spent > r.budget : r.spent > 0);
      const isFast = fast.includes(r);
      // Compact warnings: a small tag on the same line instead of a separate box
      const warn = isOver ? `<span class="tag over" title="Over budget">${r.budget ? `${eur0(r.spent - r.budget)} over` : 'no budget'}</span>`
        : isFast ? `<span class="tag fast" title="${daysLeft} days to go">${eur0(r.budget - r.spent)} left</span>` : '';
      return `<div class="cat">
        <div class="row between"><span class="cname">${catIc(r.c)} <span class="nm">${esc(r.c.name)}</span>${sav ? ` <span class="tag sav">${savingKind(r.c) === 'joint' ? 'Joint' : 'Savings'}</span>` : ''}${warn}</span>
          <span class="amt">${eur0(r.spent)}<span class="muted"> / ${r.budget ? eur0(r.budget) : '—'}</span></span></div>
        ${bar(r.budget ? r.spent / r.budget : 1, null, isOver ? 'var(--bad)' : isFast ? 'var(--warn)' : sav ? 'var(--ok)' : 'var(--brand)')}</div>`;
    }).join('')
    : '<div class="empty">You have no budgets yet. Set them in More → Budgets.</div>';

  const expensesBody = () => `<div class="list">${spendEx.length ? spendEx.map(expItem).join('') : '<div class="empty">Nothing yet. Tap + to add an expense.</div>'}</div>`;

  return `${homeNav(Rg)}
  <div class="card">
    <div class="row between"><span class="muted">You spent · budget ${eur0(budget)}</span>
      <button class="btn small paidbtn" data-act="gotPaid">${ic('wallet', 14)} Got paid</button></div>
    <div class="big">${eur(spent)}</div>
    ${bar(budget ? spent / budget : 0)}
    <div class="grid3">
      <div class="stat"><b class="${left < 0 ? 'neg' : ''}">${eur0(left)}</b><span>${left < 0 ? 'Over budget' : 'Left to spend'}</span></div>
      <div class="stat"><b>${perDay != null ? eur0(perDay) : '—'}</b><span>Can spend / day</span></div>
      <div class="stat"><b>${isNow ? daysLeft : '—'}</b><span>${isNow ? (daysLeft === 1 ? 'Day left' : 'Days left') : 'Period ended'}</span></div>
    </div>
    ${savedPlan ? `<p class="muted" style="margin:8px 0 0">Saved ${eur0(savedNow)} of ${eur0(savedPlan)} so far</p>` : ''}
  </div>
  ${folders('home', [
    { id: 'budgets', label: `${ic('target', 14)} Budgets`, color: 'var(--brand)', dot: over.length ? 'over' : fast.length ? 'warn' : '', body: budgetsBody },
    { id: 'recurring', label: `${ic('clock', 14)} Recurring`, color: 'var(--brand)', dot: recurringDue() ? 'warn' : '', body: recurringBody },
    { id: 'expenses', label: `${ic('list', 14)} Expenses`, color: 'var(--brand)', body: expensesBody }
  ])}`;
}

/* ───────────── Stats ───────────── */
function vbars(items, line) {
  const W = 320, H = 140, L = 6;
  const max = Math.max(line || 0, ...items.map(i => i.value), 1) * 1.12;
  const bw = (W - L) / items.length;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H + 18}">`;
  items.forEach((it, i) => {
    const h = it.value / max * H, x = L + i * bw + bw * 0.15, cx = x + bw * 0.35;
    s += `<rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="4" class="${it.hi ? 'hi' : ''}"/>
      <text x="${cx.toFixed(1)}" y="${H + 13}" text-anchor="middle">${esc(it.label)}</text>
      ${it.value ? `<text class="v" x="${cx.toFixed(1)}" y="${(H - h - 4).toFixed(1)}" text-anchor="middle">${kfmt(it.value)}</text>` : ''}`;
  });
  if (line) { const y = (H - line / max * H).toFixed(1); s += `<line class="budget" x1="${L}" x2="${W}" y1="${y}" y2="${y}"/>`; }
  return s + '</svg>';
}

function viewStats() {
  const ex = spendOnly(monthExp()), prevKey = addMonths(S.month, -1), prev = spendOnly(monthExp(prevKey));
  const spent = sum(ex), prevSpent = sum(prev), budget = myBudgetTotal();
  const t = catTotals(ex), tp = catTotals(prev);
  const isNow = S.month === monthKey(new Date());
  const days = isNow ? new Date().getDate() : daysInMonth(S.month);
  const diffTotal = spent - prevSpent;

  const trendBody = () => {
    const months = [...Array(6)].map((_, i) => addMonths(S.month, i - 5));
    const trend = months.map(k => ({ label: monthLabel(k, true), value: sum(spendOnly(monthExp(k))), hi: k === S.month }));
    const withData = trend.filter(x => x.value);
    const avg = withData.length ? sum(withData, x => x.value) / withData.length : 0;
    return `${vbars(trend, budget)}<p class="muted">Average ${eur0(avg)} a month. The dashed line is your monthly budget (${eur0(budget)}).</p>`;
  };

  const compareBody = () => {
    const changes = S.cats.filter(c => !isSavingCat(c)).map(c => ({ c, now: t[c.id] || 0, prev: tp[c.id] || 0 }))
      .map(x => ({ ...x, d: x.now - x.prev })).filter(x => Math.abs(x.d) >= 1)
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    return `<p class="muted" style="margin-top:0">${monthLabel(S.month, true)} compared with ${monthLabel(prevKey, true)}</p>` +
      (changes.length ? changes.map(x => `<div class="row between cat"><span class="cname">${catIc(x.c)} ${esc(x.c.name)}</span>
        <span class="amt ${x.d > 0 ? 'neg' : 'pos'}">${x.d > 0 ? ic('up', 13) + ' +' : ic('down', 13) + ' '}${eur0(x.d)}</span></div>`).join('') : '<div class="empty">No change yet</div>');
  };

  const whoBody = () => {
    const all = spendOnly(monthExp(S.month, true)), total = sum(all);
    const people = S.members.map(m => ({ m, v: sum(all.filter(e => e.paid_by === m.user_id)), b: myBudgetTotal(m.user_id) }));
    return `<p class="muted" style="margin-top:0">Together ${eur0(total)} this month</p>
      ${people.map(p => `<div class="cat"><div class="row between"><span>${esc(p.m.display_name)}</span>
        <span class="amt">${eur0(p.v)} <span class="muted">/ ${eur0(p.b)}</span></span></div>
        ${bar(p.b ? p.v / p.b : 0)}</div>`).join('')}`;
  };

  const topBody = () => {
    const top = [...ex].sort((a, b) => b.amount - a.amount).slice(0, 6);
    return `<div class="list">${top.length ? top.map(expItem).join('') : '<div class="empty">—</div>'}</div>`;
  };

  return `${monthNav()}
  <div class="card"><div class="grid3" style="margin-top:0">
    <div class="stat"><b>${eur0(spent)}</b><span>Spent</span></div>
    <div class="stat"><b>${eur0(spent / days)}</b><span>Per day</span></div>
    <div class="stat"><b class="${diffTotal > 0 ? 'neg' : 'pos'}">${prevSpent ? (diffTotal > 0 ? '+' : '') + eur0(diffTotal) : '—'}</b><span>vs last month</span></div>
  </div></div>
  <div class="card"><h2>Last 6 months</h2>${trendBody()}</div>
  <div class="card"><h2>Compared with last month</h2>${compareBody()}</div>
  <div class="card"><h2>You and your partner</h2>${whoBody()}</div>
  <div class="card"><h2>Biggest expenses</h2>${topBody()}</div>`;
}

/* ───────────── Savings + calculator ───────────── */
// The "Just me / Together" toggle changes the whole Savings screen, calculator included.
// Savings accounts: the joint account (shared), each person's own account, and an optional
// child savings account (money from parents) that only its owner can add to.
const isJoint = s => s.account === 'joint';
const isChild = s => s.account === 'child';
const canEditSaving = s => isJoint(s) || s.saved_by === uid();
const meMember = () => S.members.find(m => m.user_id === uid()) || {};
const hasChild = (userId = uid()) => !!S.members.find(m => m.user_id === userId)?.child_account;
const accountName = s => isJoint(s) ? 'Joint account' : isChild(s) ? `${memberName(s.saved_by)} · child savings` : memberName(s.saved_by);

function savingsView() {
  const me = S.savMode === 'me';
  const mine = S.sav.filter(s => !isJoint(s) && s.saved_by === uid());   // my account + my child savings
  const joint = S.sav.filter(isJoint);
  const list = me ? mine : S.sav;                       // Together = all accounts
  const meRow = S.members.find(m => m.user_id === uid()) || {};
  const goal = me ? +meRow.savings_goal || 0 : +S.household.savings_goal || 0;
  const goalDate = me ? (meRow.goal_date || S.household.goal_date) : S.household.goal_date;
  const myOwn = sum(mine.filter(s => !isChild(s))), myChild = sum(mine.filter(isChild));
  // Your personal goal counts only your own account, not the child savings.
  const goalBase = me ? myOwn : sum(list);
  return { me, list, total: sum(list), jointTotal: sum(joint), myOwn, myChild, goal, goalDate, goalBase };
}

function viewSavings() {
  const v = savingsView();
  const thisMonth = sum(v.list.filter(s => s.saved_on.startsWith(monthKey(new Date()))));
  const ml = v.goalDate ? monthsUntil(v.goalDate) : null;
  const need = v.goal && ml > 0 ? Math.max(0, v.goal - v.goalBase) / ml : null;

  const whoBody = () => {
    const rows = [{ name: 'Joint account', v: v.jointTotal }];
    S.members.forEach(m => {
      const own = m.user_id === uid();
      rows.push({ name: own ? 'Your account' : `${m.display_name}'s account`, v: sum(S.sav.filter(s => s.account === 'personal' && s.saved_by === m.user_id)) });
      if (hasChild(m.user_id)) rows.push({ name: own ? 'Your child savings' : `${m.display_name}'s child savings`, v: sum(S.sav.filter(s => isChild(s) && s.saved_by === m.user_id)) });
    });
    return rows.map(r => `<div class="cat"><div class="row between"><span>${esc(r.name)}</span><span class="amt">${eur0(r.v)}</span></div>
      ${bar(v.total > 0 ? r.v / v.total : 0, null, 'var(--brand)')}</div>`).join('')
      + `<div class="row between cat"><b>All accounts</b><b class="amt">${eur0(v.total)}</b></div>`;
  };
  const historyBody = () => `<div class="list">${v.list.length ? v.list.slice(0, 60).map(s => `<div class="item" ${canEditSaving(s) ? `data-act="editSaving" data-id="${s.id}"` : ''}>
      <span class="cicon" style="--c:${s.amount > 0 ? 'var(--ok)' : 'var(--bad)'}">${ic(s.amount > 0 ? 'down' : 'up', 16)}</span>
      <div class="grow"><div class="ellipsis">${esc(s.note || (s.amount > 0 ? 'Deposit' : 'Withdrawal'))}</div>
        <div class="muted">${fmtDate(s.saved_on)} · ${esc(accountName(s))}</div></div>
      <div class="amt ${s.amount > 0 ? 'pos' : 'neg'}">${s.amount > 0 ? '+' : ''}${eur(s.amount)}</div></div>`).join('')
    : '<div class="empty">Log what you put aside each month, and your starting savings.</div>'}</div>`;

  const tabs = [{ id: 'calc', label: `${ic('calc', 14)} Calculator`, color: 'var(--brand)', body: calcBody }];
  if (!v.me) tabs.push({ id: 'who', label: `${ic('users', 14)} Who saved`, color: 'var(--brand)', body: whoBody });
  tabs.push({ id: 'history', label: `${ic('clock', 14)} History`, color: 'var(--brand)', body: historyBody });

  const amounts = v.me
    ? (hasChild()
      ? `<div class="duo"><div><div class="muted">My account</div><div class="big">${eur0(v.myOwn)}</div></div>
           <div><div class="muted">Child savings</div><div class="big">${eur0(v.myChild)}</div></div></div>
         <p class="muted" style="margin:0 0 8px">Total: <b>${eur0(v.total)}</b></p>`
      : `<div class="muted">Your account</div><div class="big">${eur(v.total)}</div>`)
    : `<div class="duo"><div><div class="muted">Joint account</div><div class="big">${eur0(v.jointTotal)}</div></div>
         <div><div class="muted">All our accounts</div><div class="big">${eur0(v.total)}</div></div></div>`;

  return `<div class="titlerow"><h1>Savings</h1>
    <div class="seg compact">
      <label data-act="savMode" data-mode="me"><input type="radio" name="savmode" ${v.me ? 'checked' : ''}><span>${ic('user', 14)} Just me</span></label>
      <label data-act="savMode" data-mode="together"><input type="radio" name="savmode" ${v.me ? '' : 'checked'}><span>${ic('users', 14)} Together</span></label>
    </div></div>
  <div class="card">
    ${amounts}
    ${v.goal ? `${bar(v.goalBase / v.goal, null, 'var(--brand)')}
      <div class="row between muted" style="margin-top:6px"><span>${pctTxt(v.goalBase / v.goal)} of ${eur0(v.goal)}${v.me && hasChild() ? ' (my account)' : ''}</span>
      <span>${v.goalDate ? 'by ' + fmtMonthOf(new Date(v.goalDate + 'T00:00')) : ''}</span></div>`
      : `<p class="muted">${v.me ? 'Set your own goal in More → You.' : 'Set a goal and date in More → Household.'}</p>`}
    <div class="grid3">
      <div class="stat"><b>${eur0(thisMonth)}</b><span>This month</span></div>
      <div class="stat"><b>${need != null ? eur0(need) : '—'}</b><span>Needed / month</span></div>
      <div class="stat"><b>${ml != null ? Math.max(0, ml) : '—'}</b><span>Months left</span></div>
    </div>
    <div class="grid2"><button class="btn primary" data-act="addSaving" data-kind="in">${ic('plus', 16)} Deposit</button>
      <button class="btn" data-act="addSaving" data-kind="out">Withdraw</button></div>
  </div>
  ${folders('savings', tabs)}`;
}

// Separate calculator settings for "Just me" and "Together". "Saved now" always starts from the real savings.
const CALC_DEFAULTS = {
  me: { monthly: 1400, child: 0, includeChild: false, xmas: true, easter: true, summer: true },
  together: { monthly: 2000, child: 0, includeChild: false, xmas: true, easter: true, summer: true }
};
function calcValues() {
  const mode = S.savMode, v = savingsView();
  S.calc = S.calc || {};
  if (!S.calc[mode]) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('nest-calc-' + mode) || '{}'); } catch {}
    // Default "save per month": Just me = my personal-savings budget; Together = both our household-savings budgets
    const kind = mode === 'me' ? 'personal' : 'joint';
    const people = mode === 'me' ? S.members.filter(m => m.user_id === uid()) : S.members;
    const fromBudgets = sum(people, m => sum(S.cats.filter(c => savingKind(c) === kind), c => budgetOf(c.id, m.user_id)));
    const { monthly: _m, target: _t, ...rest } = saved;   // older saved values for these are ignored
    S.calc[mode] = { ...CALC_DEFAULTS[mode], ...rest, target: v.goal || 100000 };
    if (fromBudgets > 0) S.calc[mode].monthly = fromBudgets;
  }
  // Always the real amount (not editable); child savings only if switched on
  const childNow = sum(S.sav.filter(s => isChild(s) && (mode === 'together' || s.saved_by === uid())));
  S.calc[mode].start = Math.round(v.total - (S.calc[mode].includeChild ? 0 : childNow));
  return S.calc[mode];
}
const calcField = (k, label) => `<div><label class="f">${label}</label><input name="${k}" class="money" inputmode="decimal" autocomplete="off" value="${moneyIn(calcValues()[k])}"></div>`;

// Monthly income of whoever the Savings screen is showing (you, or both of you).
const calcSalary = () => sum(S.savMode === 'me' ? S.members.filter(m => m.user_id === uid()) : S.members, m => m.monthly_income);

function calcBody() {
  const p = calcValues(), sal = calcSalary();
  const row = (k, icon, label, x) => `<label class="bonusrow"><span class="bi">${icon}</span>
      <span class="grow">${label}<small>${x === 1 ? 'One full salary' : 'Half a salary'}</small></span>
      <span class="amt">${sal ? eur0(sal * x) : ''}</span>
      <input type="checkbox" class="switch" name="${k}" ${p[k] ? 'checked' : ''}></label>`;
  const childHere = S.savMode === 'me' ? hasChild() : S.members.some(m => m.child_account);
  return `<div id="calc">
    ${childHere ? `<label class="bonusrow" style="background:var(--card2);border-radius:10px;margin-bottom:8px"><span class="bi">${ic('heart', 18)}</span>
      <span class="grow">Include child savings</span>
      <input type="checkbox" class="switch" name="includeChild" ${p.includeChild ? 'checked' : ''}></label>` : ''}
    <div class="havenow"><span class="muted">${S.savMode === 'me' ? 'You have now' : 'You have now, all accounts'}</span><b class="amt">${eur0(p.start)}</b></div>
    <div class="grid2">
      ${calcField('monthly', 'Save per month (€)')}${calcField('target', 'Goal (€)')}
      ${childHere && p.includeChild ? calcField('child', 'Into child savings / month (€)') : ''}
    </div>
    <label class="f">Bonuses we'll save</label>
    <div class="bonuses">${row('xmas', ic('tree', 18), 'Christmas', 1)}${row('easter', ic('egg', 18), 'Easter', 0.5)}${row('summer', ic('sun', 18), 'Summer', 0.5)}</div>
    ${sal ? '' : '<p class="muted">Add your income in More → You to count bonuses.</p>'}
    <button type="button" class="btn small" data-act="calcReset" style="margin-top:12px">Reset</button>
    <div id="calc-out"></div></div>`;
}

// Month-by-month projection. Greek bonuses: a full salary at Christmas (Dec), half at Easter (Apr), half in summer (Jun).
function simulate(p, months) {
  const now = new Date();
  let bal = +p.start, added = 0, hit = (p.target > 0 && bal >= p.target) ? 0 : null;
  const pts = [{ bal, d: null }];
  for (let i = 1; i <= months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1), mo = d.getMonth();
    const sal = p.salary || 0;
    const bonus = (mo === 11 && p.xmas ? sal : 0) + (mo === 3 && p.easter ? sal / 2 : 0) + (mo === 5 && p.summer ? sal / 2 : 0);
    const childIn = p.includeChild ? (+p.child || 0) : 0;
    added += p.monthly + childIn + bonus;
    bal += p.monthly + childIn + bonus;
    pts.push({ bal, d });
    if (hit == null && p.target > 0 && bal >= p.target) hit = i;
  }
  return { bal, pts, added, hit };
}

function lineChart(pts, target) {
  const W = 320, H = 160, L = 40, B = 18, T = 8;
  const maxY = Math.max(target || 0, ...pts.map(p => p.bal)) * 1.05 || 1;
  const n = pts.length - 1 || 1;
  const x = i => L + (W - L - 8) * i / n, y = v => T + (H - T - B) * (1 - v / maxY);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.bal).toFixed(1)}`).join('');
  const area = `${d}L${x(pts.length - 1).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z`;
  let g = '';
  [0, 0.5, 1].forEach(f => { const v = maxY / 1.05 * f, yy = y(v).toFixed(1);
    g += `<line class="grid" x1="${L}" x2="${W}" y1="${yy}" y2="${yy}"/><text x="${L - 4}" y="${(+yy + 3).toFixed(1)}" text-anchor="end">${kfmt(v)}</text>`; });
  const idx = [...new Set([0, Math.round(n / 2), pts.length - 1])];
  const labels = idx.map(i => `<text x="${x(i).toFixed(1)}" y="${H - 3}" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}">${pts[i].d ? fmtMonthOf(pts[i].d) : 'Now'}</text>`).join('');
  const tl = target > 0 ? `<line class="target" x1="${L}" x2="${W}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}"/>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}<path class="area" d="${area}"/><path class="line" d="${d}"/>${tl}${labels}</svg>`;
}

// Suggested monthly saving: take-home pay − what you really spend (your budgets, or your
// actual average if that's higher) − 10% of pay kept free as spending money.
function suggestSaving() {
  const me = S.savMode === 'me';
  const people = me ? S.members.filter(m => m.user_id === uid()) : S.members;
  const income = sum(people, incomeOf);
  const budget = sum(people, m => myBudgetTotal(m.user_id));
  const nowKey = monthKey(new Date());
  const past = [1, 2, 3].map(i => addMonths(nowKey, -i)).map(k => sum(spendOnly(monthExp(k, !me))));
  const withData = past.filter(v => v > 0);
  const actual = withData.length ? sum(withData, v => v) / withData.length : 0;
  const spend = Math.max(budget, actual);
  const buffer = Math.round(income * 0.10 / 10) * 10;
  // Just me: your share going into the joint account is already spoken for.
  // Together: what you each put into your own accounts is already spoken for.
  const otherKind = me ? 'joint' : 'personal';
  const otherSaving = sum(people, m => sum(S.cats.filter(c => savingKind(c) === otherKind), c => budgetOf(c.id, m.user_id)));
  const save = Math.max(0, Math.floor((income - spend - otherSaving - buffer) / 50) * 50);
  return { income, budget, actual, spend, buffer, save, otherSaving, months: withData.length };
}

function updateCalc() {
  const box = document.getElementById('calc'), out = document.getElementById('calc-out');
  if (!box || !out) return;
  const p = calcValues();
  box.querySelectorAll('input').forEach(i => { p[i.name] = i.type === 'checkbox' ? i.checked : (num(i.value) || 0); });
  p.salary = calcSalary();
  const { start, salary, monthly, target, ...keep } = p;   // "save per month" and the goal always start from your budgets and goals
  try { localStorage.setItem('nest-calc-' + S.savMode, JSON.stringify(keep)); } catch {}

  // Run until the goal is reached, then chart up to that point (a little past it)
  const full = simulate(p, 600);
  const reach = p.target > 0 ? full.hit : null;
  const span = reach ? Math.max(6, reach + 2) : 60;
  const sim = simulate(p, span);
  const reachDate = reach ? fmtMonthOf(new Date(new Date().getFullYear(), new Date().getMonth() + reach, 1)) : '';
  const yrs = n => n < 12 ? `${n} month${n === 1 ? '' : 's'}` : `${Math.floor(n / 12)} yr${n >= 24 ? 's' : ''}${n % 12 ? ` ${n % 12} mo` : ''}`;
  const sg = suggestSaving();
  const suggestion = !sg.income ? `<p class="note">Add your income in More → You to get a saving tip.</p>`
    : p.monthly >= sg.save ? '' : `<div class="note" style="margin-top:12px">
      <span class="tiprow">${ic('bulb', 16)}<b>You could save about ${eur0(sg.save)}/month.</b></span>
      <div class="muted" style="margin-top:2px">That's your income minus your ${sg.actual > sg.budget ? 'usual spending' : 'budgets'}${sg.otherSaving ? (S.savMode === 'me' ? ' and your joint account savings' : ' and your personal savings') : ''}, keeping ${eur0(sg.buffer)} spare.</div>
      ${sg.save > 0 ? `<button type="button" class="btn small" data-act="useSuggest" data-v="${sg.save}" style="margin-top:8px">Use ${eur0(sg.save)}</button>` : ''}
    </div>`;
  out.innerHTML = `
    <div class="grid2" style="margin-top:14px">
      <div class="stat"><b>${reach === 0 ? 'Done' : reach ? yrs(reach) : '—'}</b><span>To reach ${eur0(p.target)}</span></div>
      <div class="stat"><b>${reach === 0 ? 'Now' : reach ? reachDate : 'Not in 50 yrs'}</b><span>Goal date</span></div>
    </div>
    ${lineChart(sim.pts, p.target)}
    ${reach === 0 ? '<p class="muted">You already have your goal.</p>' : reach ? '' : '<p class="muted">At this rate you won\'t reach the goal. Try saving more per month.</p>'}
` + suggestion;
}

/* ───────────── Settings ───────────── */
function catRow(c) {
  return `<form data-form="cat" class="catedit">
    <input type="hidden" name="id" value="${c.id || ''}">
    <div class="r1">
      <input type="hidden" name="icon" value="${esc(c.icon || 'box')}">
      <button type="button" class="iconbtn pick" data-act="nextIcon" title="Change icon" style="--c:${safeColor(c.color || '#8b93a3')}">${catIc({ icon: c.icon || 'box' }, 18)}</button>
      <input name="name" value="${esc(c.name || '')}" placeholder="${c.id ? '' : 'New category (optional)'}" ${c.id ? 'required' : ''} aria-label="Name">
      <input type="hidden" name="saving_kind" value="${savingKind(c) || ''}">
      <button type="button" class="iconbtn savmark ${savingKind(c) ? 'on' : ''}" data-act="toggleSavCat" title="Not savings → Personal savings → Joint savings">${ic(savingKind(c) === 'joint' ? 'users' : 'wallet', 15)}</button>
      ${c.id ? `<button type="button" class="iconbtn" data-act="delCat" data-id="${c.id}" title="Delete">${ic('trash', 16)}</button>` : '<span></span>'}
    </div>
    <div class="r2">
      ${S.members.map(m => `<label><small>${esc(m.user_id === uid() ? 'You' : m.display_name)}</small>
        <input name="b_${m.user_id}" class="money" inputmode="decimal" autocomplete="off" value="${c.id ? moneyIn(budgetOf(c.id, m.user_id)) : ''}" placeholder="€/mo"></label>`).join('')}
    </div>
  </form>`;
}
// Budgets are edited freely and saved together with one button.
function markBudgetsDirty() {
  if (S.budgetsDirty) return;
  S.budgetsDirty = true;
  const bar = document.querySelector('.savebar');
  if (bar) { bar.classList.add('dirty'); bar.querySelector('.sb-text').textContent = 'Unsaved changes'; bar.querySelector('button').disabled = false; }
}
// Ask before throwing away unsaved budget changes. Returns true if it's OK to continue.
function okToLeave() {
  if (!S.budgetsDirty) return true;
  if (!confirm('You have unsaved budget changes. Leave without saving?')) return false;
  S.budgetsDirty = false;
  return true;
}
window.addEventListener('beforeunload', e => { if (S.budgetsDirty) { e.preventDefault(); e.returnValue = ''; } });

// Income minus budgets, per person, updated live while typing.
function updateBudgetLeft() {
  if (!document.querySelector('.paygrid [id^=left-]')) return;   // totals are now drawn straight from saved budgets
  S.members.forEach(m => {
    const pay = incomeOf(m);
    let acc = 0, sav = 0;
    document.querySelectorAll('form.catedit').forEach(f => {
      if (!f.querySelector('input[name=id]').value) return;
      const v = num(f.querySelector(`input[name="b_${m.user_id}"]`)?.value) || 0;
      if (f.querySelector('input[name=saving_kind]').value) sav += v; else acc += v;
    });
    document.getElementById('bud-' + m.user_id).textContent = eur0(acc);
    document.getElementById('sav-' + m.user_id).textContent = eur0(sav);
    acc += sav + recurringMonthly(m.user_id);
    const l = document.getElementById('left-' + m.user_id);
    l.textContent = pay ? eur0(pay - acc) : 'Add income';
    l.classList.toggle('neg', pay - acc < 0);
  });
}

// A budget list row, same look as the recurring bills: icon, name, each person's amount, total
function catList(cats) {
  return `<div class="list">${cats.length ? cats.map(c => `<div class="item" data-act="editCat" data-id="${c.id}">
      ${catBadge(c)}
      <div class="grow"><div class="ellipsis">${esc(c.name)}${savingKind(c) === 'joint' ? ' <span class="tag sav">Joint account</span>' : ''}</div>
        <div class="muted">${S.members.map(m => `${esc(m.user_id === uid() ? 'You' : m.display_name)} ${eur0(budgetOf(c.id, m.user_id))}`).join(' · ')}</div></div>
      <div class="amt">${eur0(sum(S.members, m => budgetOf(c.id, m.user_id)))}</div></div>`).join('')
    : '<div class="empty">Nothing here yet.</div>'}</div>`;
}
// Add / edit a budget in a panel
function catForm(c = {}) {
  const kind = savingKind(c) || '';
  return `<form data-form="catEdit" class="stack">
    <div class="sheet-head"><h3>${c.id ? 'Edit budget' : kind ? 'New savings budget' : 'New spending category'}</h3><button type="button" class="x" data-act="close">${ic('x', 16)}</button></div>
    <input type="hidden" name="id" value="${c.id || ''}">
    <input name="name" placeholder="Name (e.g. ${kind ? 'Holiday fund' : 'Supermarket'})" value="${esc(c.name || '')}" required maxlength="40" ${c.id ? '' : 'autofocus'}>
    <label class="f">Icon</label>
    <div class="iconpick">${CAT_ICONS.map(k => `<label><input type="radio" name="icon" value="${k}" ${(c.icon || 'box') === k ? 'checked' : ''}><span>${ic(k, 18)}</span></label>`).join('')}</div>
    ${kind ? `<label class="f">Type</label>
    <div class="seg typeseg"><label><input type="radio" name="saving_kind" value="personal" ${kind === 'personal' ? 'checked' : ''}><span>My savings</span></label>
      <label><input type="radio" name="saving_kind" value="joint" ${kind === 'joint' ? 'checked' : ''}><span>Joint savings</span></label></div>`
      : '<input type="hidden" name="saving_kind" value="">'}
    <div class="grid2">${S.members.map(m => `<label class="spl"><small>${esc(m.user_id === uid() ? 'You' : m.display_name)} per month</small>
      <input name="b_${m.user_id}" class="money" inputmode="decimal" autocomplete="off" placeholder="0" value="${c.id && budgetOf(c.id, m.user_id) ? moneyIn(budgetOf(c.id, m.user_id)) : ''}"></label>`).join('')}</div>
    <button class="btn primary">${c.id ? 'Save' : 'Add'}</button>
    ${c.id ? `<button type="button" class="btn danger" data-act="delCat" data-id="${c.id}">Delete</button>` : ''}
  </form>`;
}

// Page title with a small "+ Add" button at the other end of the row
const ptitle = (title, act, kind) => `<div class="ptitle-row"><p class="ptitle">${title}</p>
  <button type="button" class="btn small addbtn" data-act="${act}"${kind != null ? ` data-kind="${kind}"` : ''}>${ic('plus', 14)} Add</button></div>`;

// More → Budgets: three pages you swipe between (Spending, Recurring, Savings)
function budgetPages() {
  const spendCats = S.cats.filter(c => !isSavingCat(c)), savCats = S.cats.filter(isSavingCat);
  const pages = [
    ['Spending', `${ptitle('Spending', 'addCat', '')}${catList(spendCats)}`],
    ['Recurring', `${ptitle('Recurring bills', 'addRecurring')}
    <div class="list">${S.recurring.length ? [...S.recurring].sort((a, b) => monthlyOf(b) - monthlyOf(a)).map(r => `<div class="item" data-act="editRecurring" data-id="${r.id}">
        ${recBadge(r)}
        <div class="grow"><div class="ellipsis">${esc(r.name)}</div>
          <div class="muted">${S.members.map(m => `${esc(m.user_id === uid() ? 'You' : m.display_name)} ${eur0(monthlyOf(r) * fractionOf(r, m.user_id))}`).join(' · ')}</div></div>
        <div class="amt">${isFixed(r) && r.repeat !== 'days' ? eur(r.amount) : '≈ ' + eur0(monthlyOf(r))}</div></div>`).join('')
      : '<div class="empty">No recurring bills yet.</div>'}</div>`],
    ['Savings', `${ptitle('Savings', 'addCat', 'personal')}${catList(savCats)}`]
  ];
  const cur = Math.min(S.bPage || 0, 2);
  return `<div class="pager" id="bpager">${pages.map(pg => `<section class="page">${pg[1]}</section>`).join('')}</div>
    <div class="dots">${pages.map((pg, i) => `<button type="button" class="pdot ${i === cur ? 'on' : ''}" data-act="budgetPage" data-i="${i}" aria-label="${pg[0]}"></button>`).join('')}</div>`;
}
// Swipe left/right between the budget pages.
let swipe = null;
document.addEventListener('touchstart', e => {
  const pager = e.target.closest?.('#bpager');
  if (!pager || e.touches.length !== 1) { swipe = null; return; }
  swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, page: S.bPage || 0, t: Date.now() };
}, { passive: true });
document.addEventListener('touchend', e => {
  if (!swipe) return;
  const dx = e.changedTouches[0].clientX - swipe.x, dy = e.changedTouches[0].clientY - swipe.y;
  const start = swipe.page; swipe = null;
  if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.3) return;   // not a sideways swipe
  const to = Math.max(0, Math.min(2, start + (dx < 0 ? 1 : -1)));
  ACTIONS.budgetPage({ i: to });
}, { passive: true });

// Keep the page you were on, and keep the dots in step while swiping.
function showBudgetPage() {
  const pager = document.getElementById('bpager');
  if (pager) pager.scrollLeft = (S.bPage || 0) * pager.clientWidth;
}
document.addEventListener('scroll', e => {
  if (e.target.id !== 'bpager') return;
  const pager = e.target, i = Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth));
  if (i !== S.bPage) {
    S.bPage = i;
    document.querySelectorAll('.dots .pdot').forEach((b, j) => b.classList.toggle('on', j === i));
    saveUISoon();
  }
}, { capture: true, passive: true });

function viewSettings() {
  const me = S.members.find(m => m.user_id === uid()) || {}, h = S.household;
  const youBody = () => `<form data-form="profile">
      <label class="f">Name</label><input name="display_name" value="${esc(me.display_name)}" required>
      <div class="grid2 pair">
        <div><label class="f">Income / month</label>
          <input name="monthly_income" class="money" inputmode="decimal" autocomplete="off" placeholder="after tax" value="${+me.monthly_income ? moneyIn(me.monthly_income) : ''}"></div>
        <div><label class="f">Extras / month</label>
          <input name="extra_income" class="money" inputmode="decimal" autocomplete="off" placeholder="e.g. supermarket card" value="${+me.extra_income ? moneyIn(me.extra_income) : ''}"></div>
      </div>
      <div class="grid2 pair">
        <div><label class="f">My savings goal</label>
          <input name="savings_goal" class="money" inputmode="decimal" autocomplete="off" value="${+me.savings_goal ? moneyIn(me.savings_goal) : ''}" placeholder="e.g. 60.000"></div>
        <div><label class="f">Goal date</label><input name="goal_date" type="date" value="${me.goal_date || ''}"></div>
      </div>
      <label class="bonusrow" style="background:var(--card2);border-radius:10px;margin-top:10px"><span class="bi">${ic('heart', 18)}</span>
        <span class="grow">Child savings account<small>Money from my parents. Only I can add to it.</small></span>
        <input type="checkbox" class="switch" name="child_account" ${me.child_account ? 'checked' : ''}></label>
      <button class="btn primary">Save</button>
    </form>
    <p class="muted">Signed in as ${esc(S.session.user.email)}</p>
    <button class="btn danger" data-act="signout">Sign out</button>`;
  const homeBody = () => `<form data-form="household">
      <label class="f">Name</label><input name="name" value="${esc(h.name)}" required>
      <div class="grid2 pair">
        <div><label class="f">Savings goal together</label>
          <input name="savings_goal" class="money" inputmode="decimal" autocomplete="off" value="${+h.savings_goal ? moneyIn(h.savings_goal) : ''}" placeholder="e.g. 100.000"></div>
        <div><label class="f">Goal date</label><input name="goal_date" type="date" value="${h.goal_date || ''}"></div>
      </div>
      <button class="btn primary">Save</button>
    </form>
    <label class="f">Invite code: your partner enters this after creating an account</label>
    <div class="row between"><span class="code">${esc(h.invite_code)}</span><button class="btn small" data-act="copyCode">Copy</button></div>
    <p class="muted">Members: ${S.members.map(m => esc(m.display_name)).join(', ')}</p>
    <button class="btn" data-act="export">Export expenses (CSV, last 6 months)</button>`;
  const budgetsBody = () => `<div class="paygrid">${S.members.map(m => `<div class="paybox">
        <div class="t1">${esc(m.user_id === uid() ? 'You' : m.display_name)}</div>
        <div class="row between"><span>Income</span><span class="amt">${+m.monthly_income ? eur0(m.monthly_income) : '—'}</span></div>
        ${+m.extra_income ? `<div class="row between"><span>Extras</span><span class="amt">${eur0(m.extra_income)}</span></div>` : ''}
        <div class="row between"><span>Spending</span><span class="amt">${eur0(catBudgetTotal(m.user_id))}</span></div>
        <div class="row between"><span>Recurring</span><span class="amt">${eur0(recurringMonthly(m.user_id))}</span></div>
        <div class="row between"><span>Savings</span><span class="amt">${eur0(mySavingBudget(m.user_id))}</span></div>
        ${(() => { const left = incomeOf(m) - catBudgetTotal(m.user_id) - recurringMonthly(m.user_id) - mySavingBudget(m.user_id);
          return `<div class="row between left"><span>Left</span><span class="amt ${left < 0 ? 'neg' : ''}">${incomeOf(m) ? eur0(left) : 'Add income'}</span></div>`; })()}
      </div>`).join('')}</div>
    ${budgetPages()}
`;

  return `${folders('settings', [
    { id: 'budgets', label: `${ic('target', 14)} Budgets`, color: 'var(--brand)', body: budgetsBody },
    { id: 'you', label: `${ic('user', 14)} You`, color: 'var(--brand)', body: youBody },
    { id: 'home', label: `${ic('home', 14)} Household`, color: 'var(--brand)', body: homeBody }
  ], 'More')}`;
}

/* ───────────── Sheets (forms that slide up) ───────────── */
// Freeze the page behind a form so it can't scroll (works on iPhone too).
function lockPage() {
  if (document.body.classList.contains('locked')) return;
  lockPage.y = window.scrollY;
  document.body.style.top = `-${lockPage.y}px`;
  document.body.classList.add('locked');
}
function unlockPage() {
  if (!document.body.classList.contains('locked')) return;
  document.body.classList.remove('locked');
  document.body.style.top = '';
  window.scrollTo(0, lockPage.y || 0);
}

// Keep the form inside the part of the screen the keyboard doesn't cover.
function fitToKeyboard() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--vvh', h + 'px');
}
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitToKeyboard);
window.addEventListener('resize', fitToKeyboard);
fitToKeyboard();

function openSheet(html) {
  lockPage();
  sheet.innerHTML = `<div class="backdrop" data-act="close"></div><div class="panel">${html}</div>`;
  sheet.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
  setTimeout(() => sheet.querySelector('[autofocus]')?.focus(), 80);
}
function closeSheet() {
  sheet.classList.remove('open');
  unlockPage();
  setTimeout(() => { sheet.classList.add('hidden'); sheet.innerHTML = ''; }, 250);
}
// One-tap toggle for who paid / who saved. The signed-in person comes first and is preselected.
const whoToggle = (name, sel = uid()) => `<div class="seg">${[...S.members].sort((a, b) => (b.user_id === uid()) - (a.user_id === uid())).map(m =>
  `<label><input type="radio" name="${name}" value="${m.user_id}" ${m.user_id === sel ? 'checked' : ''}><span>${m.user_id === uid() ? 'Me' : esc(m.display_name)}</span></label>`).join('')}</div>`;

const partnerOf = () => S.members.find(m => m.user_id !== uid());
// Split a new expense: typing one part fills in the other; untouched, it's half each.
function syncExpenseSplit(form, changed) {
  const row = form.querySelector('.splitrow');
  if (!row) return;
  const split = form.querySelector('[name=mode]:checked')?.value === 'split';
  row.classList.toggle('hidden', !split);
  const total = num(form.querySelector('[name=amount]').value) || 0;
  const mine = form.querySelector('[name=my_share]'), theirs = form.querySelector('[name=their_share]');
  if (changed === mine || changed === theirs) {
    form._touched = true;
    const other = changed === mine ? theirs : mine;
    other.value = total ? moneyIn(Math.max(0, Math.round((total - (num(changed.value) || 0)) * 100) / 100)) : '';
  } else if (split && (!form._touched || changed?.name === 'amount')) {
    const m = form._touched && total ? Math.min(total, num(mine.value) || 0) : Math.round(total * 50) / 100;
    mine.value = total ? moneyIn(m) : '';
    theirs.value = total ? moneyIn(Math.round((total - m) * 100) / 100) : '';
  }
}
function expenseForm(e = {}) {
  const cats = S.cats.filter(c => !isSavingCat(c) || c.id === e.category_id);
  const sel = e.category_id || (cats.some(c => c.id === S.lastCat) ? S.lastCat : cats[0]?.id);
  return `<form data-form="expense" class="stack">
    <div class="sheet-head"><h3>${e.id ? 'Edit expense' : 'New expense'}</h3><button type="button" class="x" data-act="close">${ic('x', 16)}</button></div>
    <input type="hidden" name="id" value="${e.id || ''}">
    <input class="amount money" name="amount" inputmode="decimal" placeholder="0 €" value="${e.amount != null ? moneyIn(e.amount) : ''}" required autofocus autocomplete="off">
    ${e.recurring_id ? '<input type="hidden" name="category_id" value="">'
      : `<div class="chips">${cats.map(c => `<label class="chip"><input type="radio" name="category_id" value="${c.id}" ${c.id === sel ? 'checked' : ''}><span>${catIc(c, 14)} ${esc(c.name)}</span></label>`).join('')}</div>`}
    <input name="note" placeholder="Note (e.g. souvlaki, Lidl)" value="${esc(e.note || '')}" maxlength="120">
    <input type="date" name="spent_on" value="${e.spent_on || todayStr()}" required>
    <input type="hidden" name="paid_by" value="${e.paid_by || uid()}">
    ${!e.id && partnerOf() ? `<div class="seg"><label><input type="radio" name="mode" value="mine" checked><span>${ic('user', 14)} Mine</span></label>
      <label><input type="radio" name="mode" value="split"><span>${ic('users', 14)} Split</span></label></div>
    <div class="splitrow hidden"><div class="grid2">
      <label class="spl"><small>You pay</small><input name="my_share" class="money" inputmode="decimal" autocomplete="off"></label>
      <label class="spl"><small>${esc(partnerOf().display_name)} pays</small><input name="their_share" class="money" inputmode="decimal" autocomplete="off"></label></div></div>` : ''}
    ${e.id && e.split_id ? `<p class="muted" style="margin:0">Split expense. Deleting removes both parts.</p>` : ''}
    <button class="btn primary">${e.id ? 'Save' : 'Add expense'}</button>
    ${e.id ? `<button type="button" class="btn danger" data-act="delExpense" data-id="${e.id}">Delete</button>` : ''}
  </form>`;
}
function savingForm(s = {}, kind = 'in') {
  const k = s.amount != null ? (s.amount < 0 ? 'out' : 'in') : kind;
  const acc = s.id ? (s.account || 'personal') : (S.savMode === 'me' ? 'personal' : 'joint');
  return `<form data-form="saving" class="stack">
    <div class="sheet-head"><h3>${s.id ? 'Edit' : k === 'in' ? 'Add to savings' : 'Take from savings'}</h3><button type="button" class="x" data-act="close">${ic('x', 16)}</button></div>
    <input type="hidden" name="id" value="${s.id || ''}">
    <div class="seg"><label><input type="radio" name="kind" value="in" ${k === 'in' ? 'checked' : ''}><span>Deposit</span></label>
      <label><input type="radio" name="kind" value="out" ${k === 'out' ? 'checked' : ''}><span>Withdraw</span></label></div>
    <div class="seg"><label><input type="radio" name="account" value="joint" ${acc === 'joint' ? 'checked' : ''}><span>${ic('users', 14)} Joint</span></label>
      <label><input type="radio" name="account" value="personal" ${acc === 'personal' ? 'checked' : ''}><span>${ic('user', 14)} Mine</span></label>
      ${hasChild() ? `<label><input type="radio" name="account" value="child" ${acc === 'child' ? 'checked' : ''}><span>${ic('heart', 14)} Child</span></label>` : ''}</div>
    <input class="amount money" name="amount" inputmode="decimal" placeholder="0 €" value="${s.amount != null ? moneyIn(Math.abs(s.amount)) : ''}" required autofocus autocomplete="off">
    <input name="note" placeholder="Note (e.g. November savings, Christmas bonus)" value="${esc(s.note || '')}" maxlength="120">
    <input type="date" name="saved_on" value="${s.saved_on || todayStr()}" required>
    <button class="btn primary">Save</button>
    ${s.id ? `<button type="button" class="btn danger" data-act="delSaving" data-id="${s.id}">Delete</button>` : ''}
  </form>`;
}

/* ───────────── Actions (taps) ───────────── */
async function refresh(msg) { await loadData(); render(); if (msg) toast(msg); }
const PALETTE = ['#7a3e65', '#c28a2c', '#3f7d5a', '#c0573e', '#a07b3b', '#8e4a7a', '#b05a7a', '#5f7a6e', '#7d6e63'];

const ACTIONS = {
  add: () => openSheet(expenseForm()),
  folder: d => { if (d.page === 'settings' && S.f.settings !== d.id && !okToLeave()) return; S.f[d.page] = d.id; render(); document.querySelector('.ftab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); },
  edit: d => { const e = S.exp.find(x => x.id === d.id); if (e) openSheet(expenseForm(e)); },
  close: closeSheet,
  prevMonth: async () => { S.month = addMonths(S.month, -1); await refresh(); },
  nextMonth: async () => { const n = addMonths(S.month, 1); if (n <= monthKey(new Date())) { S.month = n; await refresh(); } },
  delExpense: async d => {
    const e = S.exp.find(x => x.id === d.id);
    if (!confirm(e?.split_id ? 'Delete this split expense? Both parts are removed.' : 'Delete this expense?')) return;
    await q(e?.split_id ? sb.from('expenses').delete().eq('split_id', e.split_id) : sb.from('expenses').delete().eq('id', d.id));
    closeSheet(); await refresh('Deleted');
  },
  addRecurring: () => { if (S.tab === 'settings' && !okToLeave()) return; openSheet(recurringForm()); },
  editRecurring: d => { if (S.tab === 'settings' && !okToLeave()) return; const r = S.recurring.find(x => x.id === d.id); if (r) openSheet(recurringForm(r)); },
  gotPaid: () => openSheet(gotPaidForm()),
  delPayday: async d => {
    if (!confirm('Remove this payday?')) return;
    await q(sb.from('paydays').delete().eq('id', d.id)); closeSheet(); S.period = 0; await refresh('Removed');
  },
  prevPeriod: () => { S.period = (S.period || 0) + 1; render(); },
  nextPeriod: () => { S.period = Math.max(0, (S.period || 0) - 1); render(); },
  markPaid: async (d, btn) => {
    const r = S.recurring.find(x => x.id === d.id); if (!r || !isFixed(r)) return;
    if (btn) btn.disabled = true;
    await addSplitExpenses({ amount: +r.amount, category_id: null, note: r.name, spent_on: todayStr(), shares: splitShares(r.split, +r.amount), recurring_id: r.id });
    await refresh(`${r.name} paid`);
  },
  payRecurring: d => { const r = S.recurring.find(x => x.id === d.id); if (r) openSheet(payForm(r)); },
  skipRecurring: async d => {
    const r = S.recurring.find(x => x.id === d.id); if (!r) return;
    await q(sb.from('recurring').update({ next_due: nextDue(r, r.next_due) }).eq('id', r.id).eq('next_due', r.next_due));
    closeSheet(); await refresh('Skipped');
  },
  delRecurring: async d => {
    if (!confirm('Delete this recurring bill? Expenses already added stay.')) return;
    await q(sb.from('recurring').delete().eq('id', d.id)); closeSheet(); await refresh('Deleted');
  },
  recSplit: (d, btn) => {
    const form = btn.closest('form');
    const fr = S.members.map(m => d.who === 'half' ? 1 / S.members.length : (m.user_id === d.who ? 1 : 0));
    setRecSplit(form, fr); form._fr = fr;
  },
  addSaving: d => openSheet(savingForm({}, d.kind)),
  editSaving: d => { const s = S.sav.find(x => x.id === d.id); if (s && canEditSaving(s)) openSheet(savingForm(s)); },
  delSaving: async d => {
    if (!confirm('Delete this entry?')) return;
    await q(sb.from('savings').delete().eq('id', d.id)); closeSheet(); await refresh('Deleted');
  },
  saveBudgets: async () => {
    const btn = document.querySelector('[data-act=saveBudgets]');
    if (btn) btn.disabled = true;
    try {
      const all = [];
      for (const f of document.querySelectorAll('form.catedit')) {
        const fd = new FormData(f);
        let id = fd.get('id');
        const name = (fd.get('name') || '').trim();
        if (!name) { if (id) { toast('Every category needs a name'); return; } continue; }   // empty new row: skip
        const row = { name, icon: fd.get('icon') || 'box', saving_kind: fd.get('saving_kind') || null, is_saving: !!fd.get('saving_kind') };
        const old = S.cats.find(c => c.id === id);
        if (id) {
          if (!old || old.name !== row.name || old.icon !== row.icon || (savingKind(old) || null) !== row.saving_kind)
            await q(sb.from('categories').update(row).eq('id', id));
        } else {
          id = (await q(sb.from('categories').insert({ ...row, household_id: S.household.id, sort: S.cats.length + 1, color: PALETTE[S.cats.length % PALETTE.length] }).select().single())).id;
        }
        S.members.forEach(m => all.push({ household_id: S.household.id, category_id: id, user_id: m.user_id, amount: num(fd.get('b_' + m.user_id)) || 0 }));
      }
      if (all.length) await q(sb.from('budgets').upsert(all, { onConflict: 'category_id,user_id' }));
      S.budgetsDirty = false;
      await refresh('Budgets saved');
    } finally { if (btn && btn.isConnected) btn.disabled = !S.budgetsDirty; }
  },
  addCat: d => openSheet(catForm(d.kind ? { saving_kind: d.kind } : {})),
  editCat: d => { const c = S.cats.find(x => x.id === d.id); if (c) openSheet(catForm(c)); },
  delCat: async d => {
    if (!confirm(S.budgetsDirty ? 'Delete this category? Your other unsaved changes will be lost.' : 'Delete this category? Its expenses become "Uncategorised".')) return;
    S.budgetsDirty = false;
    await q(sb.from('categories').delete().eq('id', d.id)); closeSheet(); await refresh('Deleted');
  },
  savMode: d => { S.savMode = d.mode; render(); },
  budgetPage: d => {
    S.bPage = +d.i;
    document.querySelectorAll('.dots .pdot').forEach((b, j) => b.classList.toggle('on', j === S.bPage));
    saveUISoon();
    const pager = document.getElementById('bpager');
    if (pager) pager.scrollTo({ left: S.bPage * pager.clientWidth, behavior: 'smooth' });
  },
  joinTab: d => { S.joinTab = d.id; renderJoin(); },
  toggleSavCat: (d, btn) => {
    const input = btn.closest('form').querySelector('input[name=saving_kind]');
    input.value = { '': 'personal', personal: 'joint', joint: '' }[input.value] ?? '';
    btn.classList.toggle('on', !!input.value);
    btn.innerHTML = ic(input.value === 'joint' ? 'users' : 'wallet', 15);
    toast(input.value === 'joint' ? 'Joint savings (from joint deposits)' : input.value ? 'Personal savings (from your deposits)' : 'Not savings');
    markBudgetsDirty();
    updateBudgetLeft();
  },
  nextIcon: (d, btn) => {
    const input = btn.closest('form').querySelector('input[name=icon]');
    const i = CAT_ICONS.indexOf(input.value);
    input.value = CAT_ICONS[(i + 1) % CAT_ICONS.length];
    btn.innerHTML = ic(input.value, 18);
    markBudgetsDirty();
  },
  useSuggest: d => { const i = document.querySelector('#calc input[name=monthly]'); if (i) { i.value = moneyIn(d.v); updateCalc(); } },
  calcReset: () => { try { localStorage.removeItem('nest-calc-' + S.savMode); } catch {} if (S.calc) delete S.calc[S.savMode]; render(); },
  copyCode: async () => {
    try { await navigator.clipboard.writeText(S.household.invite_code); toast('Invite code copied'); }
    catch { toast('Code: ' + S.household.invite_code); }
  },
  export: () => {
    const rows = [['date', 'amount', 'category', 'note', 'paid_by']].concat(
      S.exp.map(e => [e.spent_on, e.amount, e.recurring_id ? 'Recurring bill' : catOf(e.category_id).name, e.note || '', memberName(e.paid_by)]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `nest-expenses-${S.month}.csv`; a.click();
  },
  signout: async () => { if (S.channel) sb.removeChannel(S.channel); await sb.auth.signOut(); S.household = null; renderAuth(); }
};

/* ───────────── Forms (submits) ───────────── */
const FORMS = {
  auth: async (fd, _f, sub) => {
    const email = fd.get('email').trim(), password = fd.get('password');
    const msg = document.getElementById('authmsg');
    if (sub?.value === 'up') {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) return toast(error.message);
      if (!data.session) msg.textContent = 'Check your email and tap the confirmation link, then sign in.';
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return toast(error.message);
    }
  },
  create: async fd => { await q(sb.rpc('create_household', { p_name: fd.get('hname'), p_display: fd.get('name') })); await boot(); },
  join: async fd => { await q(sb.rpc('join_household', { p_code: fd.get('code'), p_display: fd.get('name') })); await boot(); },

  expense: async fd => {
    const amount = num(fd.get('amount'));
    if (!(amount > 0)) return toast('Enter an amount');
    if (fd.get('mode') === 'split' && !fd.get('id')) {
      const total = Math.round(amount * 100) / 100;
      const mine = fd.get('my_share') ? Math.round(num(fd.get('my_share')) * 100) / 100 : Math.round(total * 50) / 100;
      if (!(mine >= 0) || mine > total) return toast("Your part can't be more than the total");
      await addSplitExpenses({ amount: total, category_id: fd.get('category_id') || null, note: fd.get('note').trim() || null, spent_on: fd.get('spent_on'),
        shares: [{ user_id: uid(), amount: mine }, { user_id: partnerOf().user_id, amount: Math.round((total - mine) * 100) / 100 }].filter(s => s.amount > 0) });
      S.lastCat = fd.get('category_id');
      closeSheet();
      return refresh(`Split ${eur(total)}`);
    }
    const row = {
      household_id: S.household.id, amount: Math.round(amount * 100) / 100,
      category_id: fd.get('category_id') || null, note: fd.get('note').trim() || null,
      spent_on: fd.get('spent_on'), paid_by: fd.get('paid_by')
    };
    const id = fd.get('id');
    if (id) await q(sb.from('expenses').update(row).eq('id', id));
    else await q(sb.from('expenses').insert(row));
    S.lastCat = row.category_id;
    closeSheet();
    await refresh(id ? 'Saved' : `Added ${eur(row.amount)}`);
  },
  catEdit: async fd => {
    const name = (fd.get('name') || '').trim();
    if (!name) return toast('Enter a name');
    const kind = fd.get('saving_kind') || null;
    const row = { name, icon: fd.get('icon') || 'box', saving_kind: kind, is_saving: !!kind };
    let id = fd.get('id');
    if (id) await q(sb.from('categories').update(row).eq('id', id));
    else id = (await q(sb.from('categories').insert({ ...row, household_id: S.household.id, sort: S.cats.length + 1, color: PALETTE[S.cats.length % PALETTE.length] }).select().single())).id;
    await q(sb.from('budgets').upsert(S.members.map(m => ({ household_id: S.household.id, category_id: id, user_id: m.user_id, amount: num(fd.get('b_' + m.user_id)) || 0 })), { onConflict: 'category_id,user_id' }));
    closeSheet();
    await refresh(fd.get('id') ? 'Saved' : 'Added');
  },
  payday: async fd => {
    const day = fd.get('paid_on');
    if (!day) return toast('Pick the day you got paid');
    if (!S.paydays.some(p => p.user_id === uid() && p.paid_on === day))
      await q(sb.from('paydays').insert({ household_id: S.household.id, user_id: uid(), paid_on: day }));
    closeSheet(); S.period = 0;
    await refresh('New month started');
  },
  recurring: async fd => {
    const fixed = fd.get('kind') === 'fixed';
    const amount = num(fd.get('amount')), minA = num(fd.get('min_amount')) || 0, maxA = num(fd.get('max_amount'));
    if (fixed && !(amount > 0)) return toast('Enter the amount');
    if (!fixed && !(maxA > 0)) return toast('Enter the usual range, e.g. 15 to 80');
    const repeat = fd.get('repeat') === 'days' ? 'days' : 'monthly';
    const every = parseInt(fd.get('every_days'), 10) || 0;
    if (repeat === 'days' && every < 1) return toast('Enter every how many days');
    // No dates to manage: a new bill is tracked from this month (monthly ones on the 1st), or from today.
    const old = S.recurring.find(x => x.id === fd.get('id'));
    const sameRepeat = old && old.repeat === repeat && (repeat !== 'days' || +old.every_days === every);
    const next = sameRepeat ? old.next_due : (repeat === 'monthly' ? monthKey(new Date()) + '-01' : todayStr());
    const vals = S.members.map(m => num(fd.get('sp_' + m.user_id)) || 0), tot = vals.reduce((a, b) => a + b, 0);
    const split = {};
    S.members.forEach((m, i) => { split[m.user_id] = tot > 0 ? Math.round(vals[i] / tot * 10000) / 10000 : 1 / S.members.length; });
    const row = {
      household_id: S.household.id, name: fd.get('name').trim(), category_id: null, icon: fd.get('icon') || null,   // bills aren't budget categories
      amount: fixed ? Math.round(amount * 100) / 100 : null, min_amount: fixed ? null : minA, max_amount: fixed ? null : maxA,
      repeat, every_days: repeat === 'days' ? every : null, day_of_month: repeat === 'monthly' ? 1 : null,
      next_due: next, split
    };
    const id = fd.get('id');
    if (id) await q(sb.from('recurring').update(row).eq('id', id));
    else await q(sb.from('recurring').insert(row));
    closeSheet();
    await refresh('Saved');
  },
  payRec: async fd => {
    const r = S.recurring.find(x => x.id === fd.get('id')); if (!r) return;
    const amount = num(fd.get('amount'));
    if (!(amount > 0)) return toast('Enter the amount');
    await addSplitExpenses({ amount: Math.round(amount * 100) / 100, category_id: null, note: r.name, spent_on: fd.get('spent_on'), shares: splitShares(r.split, Math.round(amount * 100) / 100), recurring_id: r.id });
    closeSheet();
    await refresh(`Added ${eur(amount)}`);
  },
  saving: async fd => {
    const amount = num(fd.get('amount'));
    if (!(amount > 0)) return toast('Enter an amount');
    const row = {
      household_id: S.household.id,
      amount: Math.round(amount * 100) / 100 * (fd.get('kind') === 'out' ? -1 : 1),
      note: fd.get('note').trim() || null, saved_on: fd.get('saved_on'),
      account: ['joint', 'child'].includes(fd.get('account')) && (fd.get('account') !== 'child' || hasChild()) ? fd.get('account') : 'personal'
    };
    const id = fd.get('id');
    // Personal deposits always belong to whoever is signed in; joint ones don't need a name.
    if (row.account !== 'joint' || !id) row.saved_by = uid();
    if (id) await q(sb.from('savings').update(row).eq('id', id));
    else await q(sb.from('savings').insert(row));
    closeSheet();
    S.calc = null;
    await refresh(row.amount > 0 ? 'Saved' : 'Withdrawal logged');
  },
  profile: async fd => {
    await q(sb.from('members').update({ display_name: fd.get('display_name').trim(), monthly_income: num(fd.get('monthly_income')) || 0, extra_income: num(fd.get('extra_income')) || 0, savings_goal: num(fd.get('savings_goal')) || 0, goal_date: fd.get('goal_date') || null, child_account: fd.get('child_account') === 'on' })
      .eq('household_id', S.household.id).eq('user_id', uid()));
    S.calc = null;
    await refresh('Saved');
  },
  household: async fd => {
    await q(sb.from('households').update({
      name: fd.get('name').trim(), savings_goal: num(fd.get('savings_goal')) || 0, goal_date: fd.get('goal_date') || null
    }).eq('id', S.household.id));
    await loadHousehold(); await refresh('Saved');
  },
  cat: () => ACTIONS.saveBudgets()   // pressing Enter in a budget box saves everything
};

/* ───────────── Event wiring ───────────── */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab],[data-act]');
  if (!t) return;
  if (t.dataset.tab) { if (t.dataset.tab !== S.tab && !okToLeave()) return; S.tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const fn = ACTIONS[t.dataset.act];
  if (fn) { e.preventDefault(); Promise.resolve(fn(t.dataset, t)).catch(err => console.error(err)); }
});
document.addEventListener('submit', async e => {
  const form = e.target, fn = FORMS[form.dataset.form];
  if (!fn) return;
  e.preventDefault();
  const btn = e.submitter || form.querySelector('button:not([type=button])');
  if (btn) btn.disabled = true;
  try { await fn(new FormData(form), form, e.submitter); }
  catch (err) { console.error(err); }
  finally { if (btn && btn.isConnected) btn.disabled = false; }
});
document.addEventListener('change', e => {
  const rf = e.target.closest('form[data-form=recurring]'); if (rf && e.target.type === 'radio') syncRecurringForm(rf, e.target);
  const ef = e.target.closest('form[data-form=expense]'); if (ef && e.target.type === 'radio') syncExpenseSplit(ef, e.target);
});
document.addEventListener('focusout', e => {
  const el = e.target;
  if (el.classList?.contains('money') && el.value.trim() !== '' && !isNaN(num(el.value))) el.value = moneyIn(num(el.value));
});
document.addEventListener('input', e => {
  const rf = e.target.closest('form[data-form=recurring]'); if (rf) syncRecurringForm(rf, e.target);
  const ef = e.target.closest('form[data-form=expense]'); if (ef) syncExpenseSplit(ef, e.target); if (e.target.name === 'includeChild') { updateCalc(); render(); return; } if (e.target.closest('#calc')) updateCalc(); if (e.target.closest('form.catedit')) { markBudgetsDirty(); updateBudgetLeft(); } });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
init();
