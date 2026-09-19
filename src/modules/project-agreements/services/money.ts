// src/modules/project-agreements/services/money.ts
//
// How money prints on an agreement: the symbol in front of the figure, and the
// figure again in words behind it.
//
// A contract carries both because they are a CHECK ON EACH OTHER. A digit
// dropped from "$15,00" is invisible; the same slip beside "Fifteen Hundred
// Dollars Only" is not, which is exactly why paper contracts have written the
// amount twice for several hundred years.
//
// MIRRORED on the frontend in src/services/projectAgreementsService.ts. Change
// one, change the other — a preview that words an amount differently from the
// PDF is worse than one that omits it.

/**
 * The currencies the composer offers, by country.
 *
 * `symbol` is what prints, so it must stand alone on a signed document:
 * ambiguous dollar marks are disambiguated (A$, C$, S$, HK$, NZ$) because
 * "$2,400,000" on a contract with an Australian counterparty is a real dispute
 * waiting to happen.
 *
 * `locale` decides grouping — en-IN gives 24,00,000 where en-US gives
 * 2,400,000 — and also selects the Indian scale (lakh/crore) for the words.
 *
 * `major`/`minor` are the spoken units, already plural.
 */
export interface CurrencyDef {
  code: string;
  symbol: string;
  country: string;
  locale: string;
  major: string;
  minor: string;
}

export const CURRENCIES: readonly CurrencyDef[] = [
  { code: 'INR', symbol: '₹',   country: 'India',           locale: 'en-IN', major: 'Rupees',   minor: 'Paise' },
  { code: 'USD', symbol: '$',   country: 'United States',   locale: 'en-US', major: 'Dollars',  minor: 'Cents' },
  { code: 'EUR', symbol: '€',   country: 'Eurozone',        locale: 'en-IE', major: 'Euros',    minor: 'Cents' },
  { code: 'GBP', symbol: '£',   country: 'United Kingdom',  locale: 'en-GB', major: 'Pounds',   minor: 'Pence' },
  { code: 'AED', symbol: 'AED', country: 'United Arab Emirates', locale: 'en-AE', major: 'Dirhams', minor: 'Fils' },
  { code: 'SAR', symbol: 'SAR', country: 'Saudi Arabia',    locale: 'en-SA', major: 'Riyals',   minor: 'Halalas' },
  { code: 'QAR', symbol: 'QAR', country: 'Qatar',           locale: 'en-QA', major: 'Riyals',   minor: 'Dirhams' },
  { code: 'AUD', symbol: 'A$',  country: 'Australia',       locale: 'en-AU', major: 'Dollars',  minor: 'Cents' },
  { code: 'CAD', symbol: 'C$',  country: 'Canada',          locale: 'en-CA', major: 'Dollars',  minor: 'Cents' },
  { code: 'SGD', symbol: 'S$',  country: 'Singapore',       locale: 'en-SG', major: 'Dollars',  minor: 'Cents' },
  { code: 'NZD', symbol: 'NZ$', country: 'New Zealand',     locale: 'en-NZ', major: 'Dollars',  minor: 'Cents' },
  { code: 'HKD', symbol: 'HK$', country: 'Hong Kong',       locale: 'en-HK', major: 'Dollars',  minor: 'Cents' },
  { code: 'CHF', symbol: 'CHF', country: 'Switzerland',     locale: 'en-CH', major: 'Francs',   minor: 'Rappen' },
  { code: 'JPY', symbol: '¥',   country: 'Japan',           locale: 'en-JP', major: 'Yen',      minor: 'Sen' },
  { code: 'CNY', symbol: 'CN¥', country: 'China',           locale: 'en-CN', major: 'Yuan',     minor: 'Fen' },
  { code: 'MYR', symbol: 'RM',  country: 'Malaysia',        locale: 'en-MY', major: 'Ringgit',  minor: 'Sen' },
  { code: 'ZAR', symbol: 'R',   country: 'South Africa',    locale: 'en-ZA', major: 'Rand',     minor: 'Cents' },
  { code: 'LKR', symbol: 'Rs',  country: 'Sri Lanka',       locale: 'en-LK', major: 'Rupees',   minor: 'Cents' },
  { code: 'BDT', symbol: '৳',   country: 'Bangladesh',      locale: 'en-BD', major: 'Taka',     minor: 'Poisha' },
];

const FALLBACK: CurrencyDef = CURRENCIES[0];

/** The definition for a code, or the Rupee — this module's default currency. */
export function currencyOf(code?: string | null): CurrencyDef {
  if (!code) return FALLBACK;
  const upper = code.trim().toUpperCase();
  return CURRENCIES.find((c) => c.code === upper) ?? FALLBACK;
}

/* ── Words ───────────────────────────────────────────────────────────────── */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 0–999. The only piece both scales share. */
function underThousand(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const o = ONES[n % 10];
    return o ? `${t} ${o}` : t;
  }
  const rest = underThousand(n % 100);
  return rest ? `${ONES[Math.floor(n / 100)]} Hundred ${rest}` : `${ONES[Math.floor(n / 100)]} Hundred`;
}

/** Thousand / Million / Billion / Trillion. */
function wordsIntl(n: number): string {
  if (n === 0) return 'Zero';
  const scales: Array<[number, string]> = [
    [1e12, 'Trillion'],
    [1e9, 'Billion'],
    [1e6, 'Million'],
    [1e3, 'Thousand'],
  ];
  const parts: string[] = [];
  let rest = n;
  for (const [size, name] of scales) {
    if (rest >= size) {
      parts.push(`${wordsIntl(Math.floor(rest / size))} ${name}`);
      rest %= size;
    }
  }
  if (rest > 0) parts.push(underThousand(rest));
  return parts.join(' ');
}

/**
 * Thousand / Lakh / Crore.
 *
 * Above a hundred crore the Indian scale keeps counting in crore — "one
 * thousand crore", not "ten arab" — which is how Indian contracts are written,
 * so the recursion on the crore part is deliberate.
 */
function wordsIndian(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  let rest = n;
  if (rest >= 1e7) {
    parts.push(`${wordsIndian(Math.floor(rest / 1e7))} Crore`);
    rest %= 1e7;
  }
  if (rest >= 1e5) {
    parts.push(`${underThousand(Math.floor(rest / 1e5))} Lakh`);
    rest %= 1e5;
  }
  if (rest >= 1e3) {
    parts.push(`${underThousand(Math.floor(rest / 1e3))} Thousand`);
    rest %= 1e3;
  }
  if (rest > 0) parts.push(underThousand(rest));
  return parts.join(' ');
}

/**
 * "One Thousand Five Hundred Dollars Only".
 *
 * Returns '' for a missing or unreadable amount rather than the word "Zero" —
 * a blank Total Project Value row is dropped from the summary entirely, and
 * printing "Zero Rupees Only" against a contract that simply has not been
 * priced yet says something quite different from saying nothing.
 */
export function amountInWords(amount?: string | number | null, code?: string | null): string {
  if (amount === null || amount === undefined || String(amount).trim() === '') return '';
  const n = Number(String(amount).replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return '';

  const cur = currencyOf(code);
  const indian = cur.locale === 'en-IN';
  const whole = Math.floor(n);
  // Rounded, not truncated: 1500.999 is 1501.00 on the figure, and the words
  // have to agree with the figure beside them.
  const fraction = Math.round((n - whole) * 100);
  // A fraction that rounds up to a whole unit belongs to the whole part.
  const major = fraction === 100 ? whole + 1 : whole;
  const minor = fraction === 100 ? 0 : fraction;

  const toWords = indian ? wordsIndian : wordsIntl;
  const head = `${toWords(major)} ${cur.major}`;
  return minor > 0
    ? `${head} and ${underThousand(minor)} ${cur.minor} Only`
    : `${head} Only`;
}

/* ── Figures ─────────────────────────────────────────────────────────────── */

/**
 * "₹24,00,000" — the symbol against the figure, grouped for the currency.
 *
 * Grouping follows the CURRENCY's locale rather than the server's, so a rupee
 * figure reads the way an Indian contract prints it (2,40,00,000) instead of
 * the way a US one would.
 */
export function formatMoney(amount?: string | number | null, code?: string | null): string {
  if (amount === null || amount === undefined || String(amount).trim() === '') return '';
  const n = Number(String(amount).replace(/,/g, ''));
  if (!Number.isFinite(n)) return String(amount);

  const cur = currencyOf(code);
  const formatted = n.toLocaleString(cur.locale, {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  // A letter-shaped symbol needs the gap — "AED70" reads as one token, where
  // "$70" does not. Glyph symbols stay tight against the figure.
  const gap = /[A-Za-z]$/.test(cur.symbol) ? ' ' : '';
  return `${cur.symbol}${gap}${formatted}`;
}

/**
 * "₹24,00,000 (Twenty Four Lakh Rupees Only)" — what the Total Project Value
 * row actually prints.
 */
export function formatMoneyWithWords(
  amount?: string | number | null,
  code?: string | null
): string {
  const figure = formatMoney(amount, code);
  if (!figure) return '';
  const words = amountInWords(amount, code);
  return words ? `${figure} (${words})` : figure;
}
