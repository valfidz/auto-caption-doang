// Unduh model faster-whisper ke direktori lokal (tanpa cache HF), untuk dipakai via WHISPER_MODEL=<path>.
// Pemakaian: node scripts/fetch-model.mjs small [dest]
import fs from 'node:fs'
import path from 'node:path'

const model = process.argv[2] || 'small'
const dest = path.resolve(process.argv[3] || path.join('data', 'models', 'local', `faster-whisper-${model}`))
const repo = `Systran/faster-whisper-${model}`
const files = ['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.txt']

fs.mkdirSync(dest, { recursive: true })

for (const file of files) {
  const url = `https://huggingface.co/${repo}/resolve/main/${file}`
  const target = path.join(dest, file)
  if (fs.existsSync(target) && fs.statSync(target).size > 0) {
    console.log(`skip ${file}`)
    continue
  }
  process.stdout.write(`download ${file} ... `)
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    console.error(`HTTP ${response.status}`)
    process.exit(1)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(target, buffer)
  console.log(`${(buffer.length / 1024 / 1024).toFixed(1)} MB`)
}

console.log(`Model siap di ${dest}`)
