# TradeEdge: separate AdSense website and Android builds

## Files and destinations

Copy the files in this package into the matching locations in your existing project:

- `index.html` -> project root `index.html` (replace the existing file)
- `package.json` -> project root `package.json` (replace the existing file)
- `.env.web` -> project root `.env.web`
- `.env.android` -> project root `.env.android`
- `src/web/adsense.js` -> create `src/web/` if it does not exist, then place `adsense.js` there
- `scripts/postbuild-android.mjs` -> create `scripts/` if it does not exist, then place the file there
- `capacitor.config.json` -> reference copy only; it is unchanged and does not need replacing

## Required edit to your existing src/main.jsx

The existing `src/main.jsx` was not provided, so this package deliberately does not replace it.
Add the following top-level block after its existing import declarations and before React app rendering:

```js
if (import.meta.env.VITE_ENABLE_ADSENSE === 'true') {
  import('./web/adsense.js').then(({ initializeAdSense }) => {
    initializeAdSense();
  }).catch((error) => {
    console.error('Failed to initialize website AdSense:', error);
  });
}
```

Do not add the AdSense script or `google-adsense-account` meta tag back into `index.html`.
Also search React components for AdSense-specific ad units (`adsbygoogle`, `data-ad-client`, `data-ad-slot`) and ensure those components are not rendered in Android. The setup here gates the loader and metadata; it does not automatically remove existing ad-unit components.

## Build commands

Website:
```powershell
npm run build:web
```

Android:
```powershell
npm run build:android
npx cap sync android
```

The `build` script remains mapped to the website build for compatibility with the existing Vercel build command. If Vercel currently runs `npm run build`, it will continue to build the website with AdSense enabled.

## Verify

After the Android build:
```powershell
Get-ChildItem ".\dist" -Recurse -File |
  Select-String -Pattern "pagead2.googlesyndication.com|google-adsense-account|ca-pub-|adsbygoogle"
```

Expected: no matches in text assets. Also confirm `dist/ads.txt` does not exist.

After the website build:
- Confirm `https://tradeedge.in/ads.txt` still returns the expected file.
- Inspect the website page source/network requests and confirm AdSense loads.

Important: `.env.web` and `.env.android` contain public build flags, not secrets. Do not put Supabase service-role keys or other secrets in Vite environment files.
