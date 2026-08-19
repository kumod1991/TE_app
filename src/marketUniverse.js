const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const EXCLUDED_SECURITY_SERIES = new Set([
    "GB", "SG", "MF", "RR", "GS", "TB", "E1", "IV", "P1",
    "N0", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9",
    "NA", "NB", "NC", "ND", "NE", "NF", "NG", "NH", "NI", "NJ",
    "NK", "NL", "NM", "NN", "NO", "NP", "NQ", "NR", "NT", "NU",
    "NV", "NW", "NX", "NY", "NZ",
    "Y0", "Y1", "Y2", "Y3", "Y4", "Y5", "Y6", "Y7", "Y8", "Y9",
    "YA", "YB", "YC", "YD", "YE", "YF", "YG", "YH", "YI", "YJ",
    "YK", "YL", "YM", "YN", "YO", "YP", "YQ", "YR", "YS", "YT",
    "YU", "YV", "YW", "YX", "YY", "YZ",
    "Z0", "Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7", "Z8", "Z9",
    "ZA", "ZB", "ZC", "ZD", "ZE", "ZF", "ZG", "ZH", "ZI", "ZJ",
    "ZK", "ZL", "ZM", "ZN", "ZO", "ZP", "ZQ", "ZR", "ZS", "ZT",
    "ZU", "ZV", "ZW", "ZX", "ZY", "ZZ",
    "P", "E", "IF", "F", "MS", "R", "G",
]);

const ALLOWED_TICKER_CACHE_KEY = "te_allowed_tickers_v1";
const ALLOWED_TICKER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let _allowedTickerSet = null;
let _allowedTickerLoadedAt = null;
let _allowedTickerPromise = null;

function _canUseStorage() {
    return typeof localStorage !== "undefined";
}

function _readCache() {
    if (!_canUseStorage()) return null;
    try {
        const raw = localStorage.getItem(ALLOWED_TICKER_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function _writeCache(payload) {
    if (!_canUseStorage()) return;
    try {
        localStorage.setItem(ALLOWED_TICKER_CACHE_KEY, JSON.stringify(payload));
    } catch {
        // Ignore storage quota issues; the in-memory cache still works.
    }
}

function normalizeTicker(ticker) {
    return (ticker || "").trim().toUpperCase();
}

function normalizeSeries(series) {
    return (series || "").trim().toUpperCase();
}

export function isExcludedSecuritySeries(series) {
    return EXCLUDED_SECURITY_SERIES.has(normalizeSeries(series));
}

export function isAllowedSecuritySeries(series) {
    return !isExcludedSecuritySeries(series);
}

export function getAllowedTickerSetSync() {
    if (_allowedTickerSet && _allowedTickerSet.size > 0) return _allowedTickerSet;
    const cached = _readCache();
    if (!cached?.tickers || !Array.isArray(cached.tickers) || cached.tickers.length === 0) return null;
    if (cached.loadedAt && (Date.now() - cached.loadedAt) > ALLOWED_TICKER_CACHE_TTL_MS) return null;
    _allowedTickerLoadedAt = cached.loadedAt || Date.now();
    _allowedTickerSet = new Set(cached.tickers.map(normalizeTicker).filter(Boolean));
    return _allowedTickerSet;
}

export function filterRowsByAllowedTickers(rows, tickerKey = "ticker", allowedSet = getAllowedTickerSetSync()) {
    if (!Array.isArray(rows)) return [];
    if (allowedSet == null) return rows;
    return rows.filter(row => allowedSet.has(normalizeTicker(row?.[tickerKey])));
}

export function isAllowedTicker(ticker, allowedSet = getAllowedTickerSetSync()) {
    if (!ticker) return false;
    if (allowedSet == null) return true;
    return allowedSet.has(normalizeTicker(ticker));
}

export async function ensureAllowedTickerSet(force = false) {
    const cached = getAllowedTickerSetSync();
    if (!force && cached && _allowedTickerLoadedAt && (Date.now() - _allowedTickerLoadedAt) < ALLOWED_TICKER_CACHE_TTL_MS) {
        return cached;
    }
    if (_allowedTickerPromise) return _allowedTickerPromise;

    _allowedTickerPromise = (async () => {
        try {
            const headers = {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            };

            // allowed_tickers is precomputed server-side (security_series
            // exclusion + latest-date filtering already applied by
            // refresh_allowed_tickers(), kept fresh by a trigger on bhav_copy
            // sync). This is a single filtered table now — no separate
            // "latest date" lookup, no security_series to filter client-side,
            // and typically 1-2 pages instead of the full day's bhav_copy.
            const fetchAllPages = async (baseUrl, pageSize = 1000) => {
                let all = [], offset = 0;
                while (true) {
                    const res = await fetch(`${baseUrl}&limit=${pageSize}&offset=${offset}`, { headers });
                    const rows = await res.json().catch(() => []);
                    if (!Array.isArray(rows) || rows.length === 0) break;
                    all = all.concat(rows);
                    if (rows.length < pageSize) break;
                    offset += pageSize;
                }
                return all;
            };

            const rows = await fetchAllPages(
                `${SUPABASE_URL}/rest/v1/allowed_tickers?select=ticker&order=ticker.asc`
            );
            if (!rows || rows.length === 0) return cached || null;

            const allowed = new Set();
            for (const row of rows) {
                const ticker = normalizeTicker(row?.ticker);
                if (ticker) allowed.add(ticker);
            }
            _allowedTickerSet = allowed;
            _allowedTickerLoadedAt = Date.now();
            _writeCache({
                loadedAt: _allowedTickerLoadedAt,
                tickers: [...allowed],
            });
            return allowed;
        } catch {
            return cached || null;
        } finally {
            _allowedTickerPromise = null;
        }
    })();

    return _allowedTickerPromise;
}

export function preloadAllowedTickerSet(force = false) {
    void ensureAllowedTickerSet(force).catch(() => null);
}
