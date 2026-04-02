// ============================================================
// lib/claude/promptLoader.ts
//
// prompts/ の YAML を読み込む軽量ユーティリティ。
// 外部パッケージなし・fs.readFileSync のみ。
// ============================================================

import { readFileSync } from 'fs'
import { join } from 'path'

const PROMPTS_DIR = join(process.cwd(), 'prompts')

export function loadYaml(relativePath: string): Record<string, unknown> {
  try {
    const raw = readFileSync(join(PROMPTS_DIR, relativePath), 'utf-8')
    return parseYaml(raw)
  } catch {
    return {}
  }
}

// ── 型安全アクセサ ──
export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback
}
export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
export function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}
}

// ── 軽量 YAML パーサー ──
function parseYaml(raw: string): Record<string, unknown> {
  const lines = raw.split('\n').map(l => l.replace(/#.*$/, ''))
  return parseBlock(lines, 0).result
}

function getIndent(line: string): number {
  return line.match(/^(\s*)/)?.[1].length ?? 0
}

function parseBlock(
  lines: string[],
  startIndent: number,
): { result: Record<string, unknown>; consumed: number } {
  const result: Record<string, unknown> = {}
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') { i++; continue }
    if (getIndent(line) < startIndent) break

    const km = line.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_ ]*):\s*(.*)$/)
    if (!km) { i++; continue }

    const key  = km[2].trim()
    const rest = km[3].trim()

    if (rest === '|') {
      // ブロックスカラー
      const ci = getIndent(lines[i + 1] ?? '')
      const buf: string[] = []
      i++
      while (i < lines.length) {
        const bl = lines[i]
        if (bl.trim() === '') { buf.push(''); i++; continue }
        if (getIndent(bl) < ci) break
        buf.push(bl.slice(ci)); i++
      }
      result[key] = buf.join('\n').replace(/\n+$/, '')
    } else if (rest === '') {
      // ネスト or リスト
      const ci = getIndent(lines[i + 1] ?? '')
      i++
      if (lines[i]?.match(/^\s+-\s/)) {
        // リスト
        const items: unknown[] = []
        while (i < lines.length) {
          const cl = lines[i]
          if (cl.trim() === '') { i++; continue }
          if (getIndent(cl) < ci) break
          const lm = cl.match(/^\s+-\s+(.*)$/)
          if (!lm) break
          const val = lm[1].trim()
          // リスト要素にネストが続く場合
          if (lines[i + 1] && getIndent(lines[i + 1]) > ci) {
            const sub = parseBlock(lines.slice(i + 1), getIndent(lines[i + 1]))
            items.push(sub.result)
            i += sub.consumed + 1
          } else {
            items.push(val); i++
          }
        }
        result[key] = items
      } else {
        // ネストオブジェクト
        const sub = parseBlock(lines.slice(i), ci)
        result[key] = sub.result
        i += sub.consumed
      }
    } else {
      result[key] = rest; i++
    }
  }

  return { result, consumed: i }
}
