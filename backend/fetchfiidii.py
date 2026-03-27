import requests
import re
import time
import calendar
import json
import os
import ssl
import urllib.request
from datetime import date, timedelta

SUPABASE_URL = "https://munqjcjvzgqyxzlmuyjj.supabase.co"   # ← hardcode here
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bnFqY2p2emdxeXh6bG11eWpqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTcwNzk3MSwiZXhwIjoyMDg3MjgzOTcxfQ.-3HzssD7ydHRixYUxL_DMgkOJI2RnTBi_QW-W0mQXOk"               # ← hardcode here

ctx = ssl.create_default_context()

START_DATE = date(2017, 10, 1)
END_DATE   = date(2017, 10, 31)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://www.moneycontrol.com/markets/fii-dii-data/cash/",
    "Origin": "https://www.moneycontrol.com",
}


# ───────────────────────── FETCH ─────────────────────────

def fetch_raw(start: date, end: date):
    url = (
        f"https://api.moneycontrol.com/swiftapi/v1/fii_dii/cash"
        f"?section=daily&startDate={start}&endDate={end}"
    )
    response = requests.get(url, headers=HEADERS, timeout=30)
    response.raise_for_status()
    return response.content.decode("utf-8", errors="replace")


# ───────────────────────── PARSE ─────────────────────────

def parse_raw(raw: str, month_start: date):
    """
    Extract records from protobuf text using date pattern as anchor.
    Each record starts with a date like 2023-01-31
    followed by numbers: fii_buy, fii_sell, fii_net, dii_buy, dii_sell, dii_net
    """
    rows = []

    # Find all dates in the response
    date_pattern = r'(\d{4}-\d{2}-\d{2})'
    number_pattern = r'[-]?\d{1,3}(?:,\d{3})*(?:\.\d+)?'

    # Split response by date occurrences
    parts = re.split(date_pattern, raw)

    i = 1  # parts[0] is before first date
    while i < len(parts) - 1:
        date_str = parts[i]
        chunk    = parts[i + 1] if i + 1 < len(parts) else ""

        # Extract all numbers from the chunk after this date
        numbers = re.findall(r'-?\d{1,3}(?:,\d{3})*(?:\.\d{2})', chunk)
        numbers = [float(n.replace(",", "")) for n in numbers]

        if len(numbers) >= 6 and date_str.startswith(str(month_start.year)):
            try:
                rows.append({
                    "date":     date_str,
                    "fii_buy":  numbers[0],
                    "fii_sell": numbers[1],
                    "fii_net":  numbers[2],
                    "dii_buy":  numbers[3],
                    "dii_sell": numbers[4],
                    "dii_net":  numbers[5],
                })
            except Exception as e:
                pass

        i += 2

    return rows


# ───────────────────────── SUPABASE ─────────────────────────

def upsert_batch(rows, batch_size=100):
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        body  = json.dumps(batch).encode()
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/fii_dii_activity",
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
            print(f"   ✅ Saved {len(batch)} rows (HTTP {r.status})")


# ───────────────────────── MAIN ─────────────────────────

def main():
    all_rows = []

    year  = START_DATE.year
    month = START_DATE.month

    while date(year, month, 1) <= END_DATE:
        month_start = date(year, month, 1)
        month_end   = min(
            date(year, month, calendar.monthrange(year, month)[1]),
            END_DATE
        )

        print(f"📥 {month_start} to {month_end}...", end=" ", flush=True)

        try:
            raw  = fetch_raw(month_start, month_end)
            rows = parse_raw(raw, month_start)
            print(f"✔ {len(rows)} days")
            all_rows.extend(rows)
        except Exception as e:
            print(f"❌ {e}")

        month += 1
        if month > 12:
            month = 1
            year += 1

        time.sleep(0.3)

    # Deduplicate by date
    seen = set()
    unique_rows = []
    for r in all_rows:
        if r["date"] not in seen:
            seen.add(r["date"])
            unique_rows.append(r)

    unique_rows.sort(key=lambda x: x["date"])
    print(f"\n✔ Total: {len(unique_rows)} trading days")

    if unique_rows:
        # Print a few samples to verify before upserting
        print("\n🔍 Sample rows:")
        for r in unique_rows[:3]:
            print(f"   {r}")

        confirm = input("\n⚠️  Does the data look correct? (y/n): ")
        if confirm.lower() == "y":
            upsert_batch(unique_rows)
            print("✅ Backfill complete!")
        else:
            print("❌ Aborted — check parse logic")
    else:
        print("❌ No data parsed")


if __name__ == "__main__":
    main()