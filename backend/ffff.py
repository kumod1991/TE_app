import csv
import io
import json
import os
import ssl
import urllib.request
from datetime import date, timedelta

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

ctx = ssl.create_default_context()

# ───────────────────────── CONFIG ─────────────────────────

START_DATE = date(2016, 1, 1)   # ← change as needed
END_DATE   = date.today()


# ───────────────────────── FETCH CSV ─────────────────────────

def fetch_csv(target_date: date):
    date_str = target_date.strftime("%d%m%Y")
    url = f"https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_{date_str}.csv"

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Referer": "https://www.nseindia.com/",
            "Accept": "text/html,application/xhtml+xml,*/*",
        }
    )

    with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
        return r.read().decode("utf-8")


# ───────────────────────── PARSE ─────────────────────────

def parse_csv(raw: str, file_date: date):
    parsed = []

    reader = csv.reader(io.StringIO(raw))

    for row in reader:
        if not row or row[0].strip() not in ("FII", "DII"):
            continue

        cols = [c.strip().replace(",", "") for c in row]

        parsed.append({
            "date": file_date.isoformat(),
            "client_type": cols[0],

            "index_fut_long":   float(cols[1] or 0),
            "index_fut_short":  float(cols[2] or 0),

            "index_call_long":  float(cols[5] or 0),
            "index_call_short": float(cols[7] or 0),

            "index_put_long":   float(cols[6] or 0),
            "index_put_short":  float(cols[8] or 0),
        })

    if not parsed:
        raise Exception(f"❌ No FII/DII rows found for {file_date}")

    return parsed


# ───────────────────────── SUPABASE ─────────────────────────

def upsert(rows):
    body = json.dumps(rows).encode()

    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/fii_dii_fo",
        data=body,
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Prefer": "resolution=merge-duplicates"
        },
        method="POST"
    )

    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        print(f"   ✅ Saved {len(rows)} rows (HTTP {r.status})")


# ───────────────────────── MAIN ─────────────────────────

def main():
    current = START_DATE
    skipped = []

    while current <= END_DATE:
        # Skip weekends
        if current.weekday() >= 5:
            current += timedelta(days=1)
            continue

        print(f"📥 {current} ...", end=" ")

        try:
            raw  = fetch_csv(current)
            rows = parse_csv(raw, current)
            upsert(rows)

        except urllib.error.HTTPError as e:
            if e.code == 404:
                print(f"⚠️  No file (holiday or data unavailable)")
                skipped.append(current)
            else:
                print(f"❌ HTTP {e.code} — stopping")
                raise

        except Exception as e:
            print(f"❌ {e}")
            skipped.append(current)

        current += timedelta(days=1)

    print(f"\n✅ Backfill complete!")
    if skipped:
        print(f"⚠️  Skipped {len(skipped)} days (holidays/missing data):")
        for d in skipped:
            print(f"   - {d}")


if __name__ == "__main__":
    main()