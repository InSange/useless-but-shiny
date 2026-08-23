/* 컬렉션 전체를 하나의 dist/ 로 묶는다.

   dist/
     index.html          ← 목록 페이지 (site/)
     arc-reactor/        ← 각 페이지의 빌드 결과
     (앞으로 추가되는 것들)

   한 단계 아래에 package.json 이 있는 폴더를 "랜딩 페이지 하나"로 본다.
   새 페이지를 추가할 때 이 스크립트를 고칠 필요가 없다. */

import { readdir, mkdir, cp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = process.cwd()
const OUT = join(ROOT, 'dist')
const SKIP = new Set(['node_modules', 'dist', 'scripts', 'site'])

const pages = (await readdir(ROOT, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name))
  .filter((e) => existsSync(join(ROOT, e.name, 'package.json')))
  .map((e) => e.name)
  .sort()

if (pages.length === 0) {
  console.error('빌드할 페이지가 없다.')
  process.exit(1)
}

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

for (const page of pages) {
  const cwd = join(ROOT, page)
  console.log(`\n▶ ${page}`)
  // CI 는 매번 새로 받는다. 로컬에서는 이미 있으면 건너뛴다.
  if (!existsSync(join(cwd, 'node_modules'))) {
    execSync('npm ci --no-audit --no-fund', { cwd, stdio: 'inherit' })
  }
  execSync('npm run build', { cwd, stdio: 'inherit' })
  await cp(join(cwd, 'dist'), join(OUT, page), { recursive: true })
}

// 목록 페이지를 dist 루트에
await cp(join(ROOT, 'site'), OUT, { recursive: true })

console.log(`\n✓ ${pages.length}개 페이지 → dist/  (${pages.join(', ')})`)
