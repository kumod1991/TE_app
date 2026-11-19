const PUBLISHER_ID = 'ca-pub-4063180365030716';

export function initializeAdSense() {
  // Avoid adding the same script more than once.
  if (
    document.querySelector(
      'script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]'
    )
  ) {
    return;
  }

  // Publisher verification metadata belongs on the website only.
  if (!document.querySelector('meta[name="google-adsense-account"]')) {
    const meta = document.createElement('meta');
    meta.name = 'google-adsense-account';
    meta.content = PUBLISHER_ID;
    document.head.appendChild(meta);
  }

  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src =
    `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUBLISHER_ID}`;

  document.head.appendChild(script);
}
