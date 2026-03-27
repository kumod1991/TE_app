import requests, zipfile, io, pandas as pd, time
from datetime import datetime, timedelta
from supabase import create_client

# ================= CONFIG =================
SUPABASE_URL = "https://munqjcjvzgqyxzlmuyjj.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bnFqY2p2emdxeXh6bG11eWpqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTcwNzk3MSwiZXhwIjoyMDg3MjgzOTcxfQ.-3HzssD7ydHRixYUxL_DMgkOJI2RnTBi_QW-W0mQXOk"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

HEADERS_NSE = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://www.nseindia.com/"
}

HEADERS_BSE = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://www.bseindia.com/"
}

# ================= NSE =================
def get_nse_bhav(date):
    yyyy = date.strftime("%Y")
    mm = date.strftime("%m")
    dd = date.strftime("%d")

    url = f"https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{yyyy}{mm}{dd}_F_0000.csv.zip"

    r = requests.get(url, headers=HEADERS_NSE, timeout=30)
    if r.status_code != 200:
        raise Exception("NSE not available")

    z = zipfile.ZipFile(io.BytesIO(r.content))
    df = pd.read_csv(z.open(z.namelist()[0]))

    df.columns = [c.strip().lower() for c in df.columns]

    df = df.rename(columns={
        "tckrsymb": "ticker",
        "opnpric": "open",
        "hghpric": "high",
        "lwpric": "low",
        "clspric": "close",
        "ttltradgvol": "volume",
        "isin": "isin"
    })

    df = df[df["close"] > 0]

    if "isin" not in df.columns:
        df["isin"] = None

    df["exchange"] = "NSE"
    df["date"] = date.strftime("%Y-%m-%d")

    return df[["ticker","exchange","date","open","high","low","close","volume","isin"]]


# ================= BSE =================
def get_bse_bhav(date):
    yyyy = date.strftime("%Y")
    mm = date.strftime("%m")
    dd = date.strftime("%d")

    urls = [
        f"https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_{yyyy}{mm}{dd}_F_0000.CSV",
        f"https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_{yyyy}{mm}{dd}_F_0000.CSV.ZIP",
    ]

    for url in urls:
        try:
            r = requests.get(url, headers=HEADERS_BSE, timeout=25)
            if r.status_code != 200:
                continue

            content = r.content

            # ZIP file
            if content[:2] == b'PK':
                z = zipfile.ZipFile(io.BytesIO(content))
                df = pd.read_csv(z.open(z.namelist()[0]))
            else:
                text = content.decode("utf-8", errors="ignore").lower()
                if "<html" in text:
                    continue
                df = pd.read_csv(io.StringIO(content.decode("utf-8")))

            break
        except:
            continue
    else:
        return None

    df.columns = [c.strip().lower() for c in df.columns]

    df = df.rename(columns={
        "tckrsymb": "ticker",
        "opnpric": "open",
        "hghpric": "high",
        "lwpric": "low",
        "clspric": "close",
        "ttltradgvol": "volume",
        "isin": "isin"
    })

    df = df[df["close"] > 0]

    if "isin" not in df.columns:
        df["isin"] = None

    df["exchange"] = "BSE"
    df["date"] = date.strftime("%Y-%m-%d")

    return df[["ticker","exchange","date","open","high","low","close","volume","isin"]]


# ================= BACKFILL =================
def backfill(days=365):

    today = datetime.utcnow()
    success_days = 0

    for i in range(days):
        date = today - timedelta(days=i)

        # Skip weekends
        if date.weekday() >= 5:
            continue

        print(f"\n📅 {date.strftime('%Y-%m-%d')}")

        # ---- NSE with retry ----
        nse = None
        for attempt in range(3):
            try:
                nse = get_nse_bhav(date)
                print("✅ NSE fetched")
                break
            except Exception as e:
                print(f"⚠️ NSE attempt {attempt+1} failed:", e)
                time.sleep(1)

        # ---- BSE ----
        bse = get_bse_bhav(date)
        if bse is not None:
            print("✅ BSE fetched")
        else:
            print("❌ BSE failed")

        # ---- BOTH FAILED ----
        if nse is None and bse is None:
            print("⛔ Skipping day (no data)")
            continue

        # ================= MERGE =================
        if nse is not None and bse is not None:

            nse["isin"] = nse["isin"].str.upper()
            bse["isin"] = bse["isin"].str.upper()

            nse_isin_set = set(nse["isin"].dropna())

            # Remove BSE duplicates
            bse = bse[
                (bse["isin"].isna()) |
                (~bse["isin"].isin(nse_isin_set))
            ]

            df = pd.concat([nse, bse])

        elif nse is not None:
            df = nse

        else:
            df = bse

        # Final dedup
        df = df.drop_duplicates(subset=["ticker","exchange","date"])

        if df.empty:
            print("⚠️ Empty after processing")
            continue

        # Remove ISIN before insert
        df = df.drop(columns=["isin"], errors="ignore")

        records = df.to_dict(orient="records")

        # ================= UPSERT =================
        for j in range(0, len(records), 500):
            supabase.table("stock_prices_daily")\
                .upsert(
                    records[j:j+500],
                    on_conflict="ticker,exchange,date"
                )\
                .execute()

        print(f"✅ Inserted: {len(records)} rows")
        success_days += 1

        time.sleep(0.5)

    print(f"\n🎯 Backfill complete: {success_days} trading days")


# ================= RUN =================
if __name__ == "__main__":
    backfill(365)