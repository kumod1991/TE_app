import sharp from 'sharp'

await sharp('public/tradeedge_logo.png')
  .resize(512, 512)
  .toFile('public/icon-512.png')

await sharp('public/tradeedge_logo.png')
  .resize(192, 192)
  .toFile('public/icon-192.png')

console.log('Icons created!')