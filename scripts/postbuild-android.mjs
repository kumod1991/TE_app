
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs'
import { resolve, join, extname } from 'node:path'

const DIST_DIR = resolve('dist')

if (!existsSync(DIST_DIR)) {
  throw new Error('dist directory not found. Run the Android build first.')
}

let htmlFilesProcessed = 0
let adsenseScriptsRemoved = 0
let adsenseMetaRemoved = 0

function cleanDirectory(directory) {
  const entries = readdirSync(directory, { withFileTypes: true })

  for (const entry of entries) {
    const filePath = join(directory, entry.name)

    if (entry.isDirectory()) {
      cleanDirectory(filePath)
      continue
    }

    if (extname(entry.name).toLowerCase() !== '.html') {
      continue
    }

    let html = readFileSync(filePath, 'utf8')
    const original = html

    // Remove AdSense script tags.
    html = html.replace(
      /<script\b(?=[^>]*pagead2\.googlesyndication\.com)[^>]*>[\s\S]*?<\/script\s*>/gi,
      () => {
        adsenseScriptsRemoved++
        return ''
      }
    )

    // Remove AdSense publisher verification metadata.
    html = html.replace(
      /<meta\b(?=[^>]*name\s*=\s*["']google-adsense-account["'])[^>]*\/?>/gi,
      () => {
        adsenseMetaRemoved++
        return ''
      }
    )

    if (html !== original) {
      writeFileSync(filePath, html, 'utf8')
    }

    htmlFilesProcessed++
  }
}

cleanDirectory(DIST_DIR)

// ads.txt is required on the website, not inside the Android package.
const adsTxtPath = resolve(DIST_DIR, 'ads.txt')

if (existsSync(adsTxtPath)) {
  unlinkSync(adsTxtPath)
}

console.log('Android asset cleanup completed.')
console.log(`HTML files checked: ${htmlFilesProcessed}`)
console.log(`AdSense scripts removed: ${adsenseScriptsRemoved}`)
console.log(`AdSense metadata removed: ${adsenseMetaRemoved}`)
console.log('Website source files were not modified.')
