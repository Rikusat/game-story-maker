// ============================================================
// lib/novel/prompt.ts
//
// prompts/ の YAML ファイルを読み込んでプロンプトを組み立てる。
//
// ── 改善の仕方（コード不要）────────────────────────────────
//  全体のトーン・文字数    → prompts/base/system.yaml
//  選択肢フォーマット      → prompts/base/format.yaml
//  禁止事項               → prompts/base/constraints.yaml
//  導入部の書き方          → prompts/phases/intro.yaml
//  継続の書き方            → prompts/phases/continue.yaml
//  エンディングの書き方    → prompts/phases/ending.yaml
//  カテゴリー別指示        → prompts/categories/[name].yaml
//  レア選択肢              → prompts/phases/continue.yaml の rare_choice_instruction
//  終盤の指示              → prompts/phases/continue.yaml の pacing_by_step.climax
//
// Git push するだけで Vercel に反映される。
// ============================================================

import { readFileSync } from 'fs'
import { join } from 'path'
import type { ChoiceLogEntry } from '@/types/novel'

// ─────────────────────────────────────────
// 簡易 YAML パーサー（依存ゼロ）
// ─────────────────────────────────────────
// yaml パッケージを追加せず、必要なフィールドだけを抽出する。
// ブロックスカラー（|）と通常スカラー、配列に対応。

const PROMPTS_DIR = join(process.cwd(), 'prompts')

function loadYaml(relativePath: string): Record<string, unknown> {
  try {
    const raw = readFileSync(join(PROMPTS_DIR, relativePath), 'utf-8')
    return parseYamlSubset(raw)
  } catch {
    return {}
  }
}

/**
 * コメント除去 → ブロックスカラー展開 → キーバリュー抽出
 * 対応形式：
 *   key: scalar value
 *   key: |
 *     multi
 *     line
 *   list_key:
 *     - item1
 *     - item2
 *   nested:
 *     child: value
 */
function parseYamlSubset(raw: string): Record<string, unknown> {
  // コメント行を除去
  const lines = raw.split('\n').map(l => l.replace(/#.*$/, ''))
  const result: Record<string, unknown> = {}

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const topKey = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/)
    if (!topKey) { i++; continue }

    const key = topKey[1]
    const rest = topKey[2].trim()

    if (rest === '|') {
      // ブロックスカラー：インデントが深い連続行を結合
      const baseIndent = (lines[i + 1] ?? '').match(/^(\s*)/)?.[1].length ?? 0
      const collected: string[] = []
      i++
      while (i < lines.length) {
        const bl = lines[i]
        const indent = bl.match(/^(\s*)/)?.[1].length ?? 0
        if (bl.trim() === '' || indent >= baseIndent) {
          collected.push(bl.slice(baseIndent))
          i++
        } else { break }
      }
      result[key] = collected.join('\n').trimEnd()
    } else if (rest === '') {
      // ネスト or リスト
      const children: string[] = []
      const childRecord: Record<string, unknown> = {}
      i++
      while (i < lines.length) {
        const cl = lines[i]
        if (cl.trim() === '') { i++; continue }
        const listItem = cl.match(/^\s+- (.*)$/)
        if (listItem) {
          children.push(listItem[1].trim())
          i++
        } else {
          const childKey = cl.match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/)
          if (childKey) {
            // 簡易的に子キーのブロックスカラーだけ対応
            if (childKey[2].trim() === '|') {
              const ci = (lines[i + 1] ?? '').match(/^(\s*)/)?.[1].length ?? 0
              const cb: string[] = []
              i++
              while (i < lines.length) {
                const bl2 = lines[i]
                const ind2 = bl2.match(/^(\s*)/)?.[1].length ?? 0
                if (bl2.trim() === '' || ind2 >= ci) { cb.push(bl2.slice(ci)); i++ }
                else break
              }
              childRecord[childKey[1]] = cb.join('\n').trimEnd()
            } else {
              childRecord[childKey[1]] = childKey[2].trim()
              i++
            }
          } else { break }
        }
      }
      result[key] = children.length > 0 ? children : childRecord
    } else {
      result[key] = rest
      i++
    }
  }
  return result
}

/** string[] を読みやすい箇条書き文字列に変換 */
function listToText(items: unknown): string {
  if (!Array.isArray(items)) return ''
  return items.map(item => `- ${item}`).join('\n')
}

/** unknown を string に安全に変換 */
function str(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  return ''
}

// ─────────────────────────────────────────
// カテゴリー名 → ファイル名マッピング
// ─────────────────────────────────────────
const CATEGORY_FILE_MAP: Record<string, string> = {
  // ── ミステリー ──
  'ミステリー':         'mystery',
  '優しめミステリー':   'mystery',
  '本格ミステリー':     'mystery',
  'ダーク探偵':         'mystery',
  // ── ホラー ──
  'ホラー':             'horror',
  '静かなホラー':       'horror',
  'Jホラー':            'horror',
  'グロテスク':         'horror',
  // ── 恋愛 ──
  '恋愛':               'romance',
  '切ない恋愛':         'romance',
  '純愛':               'romance',
  '大人の恋愛':         'romance',
  // ── ファンタジー ──
  'ファンタジー':       'fantasy',
  '王道ファンタジー':   'fantasy',
  'ダークファンタジー': 'fantasy',
  // ── SF ──
  'SF':                 'sf',
  'スペースオペラ':     'sf',
  'サイバーパンク':     'sf',
  // ── 日常 ──
  '日常':               'everyday',
  'ほっこり日常':       'everyday',
  '青春':               'everyday',
  // ── 新カテゴリーはここに追記するだけで自動的に有効になる ──
}

function getCategoryFile(name: string): string {
  const parts = name.split(' / ')
  const sub   = parts[parts.length - 1].trim()
  const main  = parts[0].trim()
  return CATEGORY_FILE_MAP[sub] ?? CATEGORY_FILE_MAP[main] ?? ''
}

/** サブカテゴリーに対応した tone_adjustment を取得する */
function getSubcategoryTone(categoryYaml: Record<string, unknown>, subName: string): string {
  const overrides = categoryYaml['subcategory_overrides'] as Record<string, unknown> | undefined
  if (!overrides) return ''
  const sub = overrides[subName] as Record<string, unknown> | undefined
  if (!sub) return ''
  return str(sub['tone_adjustment'])
}

// ─────────────────────────────────────────
// ブロック結合ユーティリティ
// ─────────────────────────────────────────
function joinBlocks(...blocks: string[]): string {
  return blocks.filter(b => b.trim().length > 0).join('\n\n---\n\n')
}

// ─────────────────────────────────────────
// システムプロンプト
// ─────────────────────────────────────────
export function buildSystemPrompt(categoryName: string): string {
  const sys  = loadYaml('base/system.yaml')
  const fmt  = loadYaml('base/format.yaml')
  const cons = loadYaml('base/constraints.yaml')

  const catFile = getCategoryFile(categoryName)
  const cat     = catFile ? loadYaml(`categories/${catFile}.yaml`) : {}

  // サブカテゴリー名（複合名の末尾）
  const subName = categoryName.split(' / ').pop()?.trim() ?? ''

  const blocks: string[] = []

  // 1. 役割定義
  blocks.push(`あなたは参加型AIノベルの語り手です。\nカテゴリー：${categoryName}`)

  // 2. 文体ルール
  const styleRules = listToText(sys['style_rules'])
  if (styleRules) blocks.push(`## 文体ルール\n${styleRules}`)

  // 3. 文字数基準
  const qmin = str(sys['quality_standards'] ? (sys['quality_standards'] as Record<string,unknown>)['min_chars'] : '')
  const qmax = str(sys['quality_standards'] ? (sys['quality_standards'] as Record<string,unknown>)['max_chars'] : '')
  if (qmin && qmax) {
    blocks.push(`## 1セグメントの文字数\n${qmin}〜${qmax}文字`)
  }

  // 4. 選択肢フォーマット
  const choiceFmt = fmt['choice_format'] as Record<string, unknown> | undefined
  if (choiceFmt) {
    const normal = str(choiceFmt['normal'])
    if (normal) blocks.push(`## 選択肢フォーマット\n${normal}`)
  }

  // 5. 禁止事項
  const absoList = listToText(cons['absolute_prohibitions'])
  if (absoList) blocks.push(`## 絶対禁止事項\n${absoList}`)

  // 6. カテゴリー固有指示
  const catHints = listToText(cat['category_hints'])
  if (catHints) blocks.push(`## カテゴリー固有の指示\n${catHints}`)

  // 7. サブカテゴリーのトーン調整
  const subTone = getSubcategoryTone(cat, subName)
  if (subTone) blocks.push(`## トーン調整\n${subTone}`)

  // 8. 選択肢スタイル
  const choiceStyle = str(cat['choice_style'])
  if (choiceStyle) blocks.push(`## 選択肢スタイル\n${choiceStyle}`)

  return joinBlocks(...blocks)
}

// ─────────────────────────────────────────
// 導入部プロンプト
// ─────────────────────────────────────────
export function buildNovelPrompt(categoryName: string): string {
  const intro = loadYaml('phases/intro.yaml')

  const instruction = str(intro['instruction']).replace('{category}', categoryName)
  const reqs        = listToText(intro['requirements'])
  const hints       = listToText(intro['opening_hooks'])
  const firstChoice = str(intro['first_choice_hint'])
  const fmtYaml     = loadYaml('base/format.yaml')
  const choiceFmt   = fmtYaml['choice_format'] as Record<string,unknown> | undefined
  const fmtNormal   = choiceFmt ? str(choiceFmt['normal']) : ''

  return joinBlocks(
    instruction,
    reqs  ? `## 要件\n${reqs}` : '',
    hints ? `## 書き出しのヒント（ランダムで選択してください）\n${hints}` : '',
    firstChoice ? `## 第1選択肢の設計\n${firstChoice}` : '',
    fmtNormal   ? `## 選択肢フォーマット\n${fmtNormal}` : '',
  )
}

// ─────────────────────────────────────────
// 継続セグメントプロンプト
// ─────────────────────────────────────────
export function buildContinuePrompt(
  existingContent: string,
  choices: ChoiceLogEntry[],
  currentStep: number,
  choiceCount: 2 | 3
): string {
  const cont    = loadYaml('phases/continue.yaml')
  const fmtYaml = loadYaml('base/format.yaml')

  const instruction = str(cont['instruction'])
  const reqs        = listToText(cont['requirements'])

  // ペーシング指示（ステップ数に応じて選択）
  const pacing     = cont['pacing_by_step'] as Record<string, unknown> | undefined
  let   pacingHint = ''
  if (pacing) {
    if (currentStep <= 3) {
      pacingHint = str((pacing['early'] as Record<string,unknown>)?.['hint'])
    } else if (currentStep <= 6) {
      pacingHint = str((pacing['middle'] as Record<string,unknown>)?.['hint'])
    } else {
      pacingHint = str((pacing['climax'] as Record<string,unknown>)?.['hint'])
    }
  }

  // 選択の重み付け
  const weighting = listToText(cont['choice_weighting'])

  // レア選択肢指示
  let rareInstruction = ''
  if (choiceCount === 3) {
    rareInstruction = str(cont['rare_choice_instruction'])
  }

  // 選択肢フォーマット
  const choiceFmt = fmtYaml['choice_format'] as Record<string,unknown> | undefined
  const fmtNormal = choiceFmt ? str(choiceFmt['normal']) : ''
  const fmtRare   = choiceFmt ? str(choiceFmt['rare_addition']) : ''

  // コンテキスト（直近1000文字）
  const context = existingContent.length > 1000
    ? '（前略）\n' + existingContent.slice(-1000)
    : existingContent

  // 直前の選択
  const lastChoice  = choices[choices.length - 1]
  const chosenLabel = lastChoice
    ? `選択肢${'ABC'[lastChoice.chosen]}：${lastChoice.options[lastChoice.chosen]}`
    : '（不明）'

  const choiceFmtInstruction = choiceCount === 3
    ? `${fmtNormal}\n${fmtRare}`
    : fmtNormal

  return joinBlocks(
    instruction,
    reqs        ? `## 要件\n${reqs}` : '',
    pacingHint  ? `## この段階の物語の進め方\n${pacingHint}` : '',
    weighting   ? `## 選択肢の設計ガイド\n${weighting}` : '',
    rareInstruction ? `## レア選択肢の指示\n${rareInstruction}` : '',
    `## これまでの物語\n${context}`,
    `## ステップ ${currentStep} で選ばれた選択\n「${chosenLabel}」`,
    `上記を受けて物語を継続してください。\n\n選択肢フォーマット：\n${choiceFmtInstruction}`,
  )
}

// ─────────────────────────────────────────
// エンディングプロンプト
// ─────────────────────────────────────────
export function buildEndingPrompt(
  existingContent: string,
  choices: ChoiceLogEntry[]
): string {
  const ending  = loadYaml('phases/ending.yaml')
  const fmtYaml = loadYaml('base/format.yaml')

  const instruction = str(ending['instruction'])
  const reqs        = listToText(ending['requirements'])
  const toneTips    = listToText(ending['tone_tips'])
  const closing     = str((fmtYaml['ending_format'] as Record<string,unknown>)?.['closing_marker']) || '了'

  const context = existingContent.length > 1500
    ? '（前略）\n' + existingContent.slice(-1500)
    : existingContent

  const choicesSummary = choices
    .map((c, i) => `ステップ${i + 1}: ${'ABC'[c.chosen]}「${c.options[c.chosen]}」`)
    .join(' → ')

  return joinBlocks(
    instruction,
    reqs     ? `## 要件\n${reqs}` : '',
    toneTips ? `## トーンのヒント\n${toneTips}` : '',
    `## これまでの物語\n${context}`,
    `## 選択の流れ\n${choicesSummary || '（記録なし）'}`,
    `エンディングを書いてください。最後は必ず「${closing}」で終えてください。選択肢は不要です。`,
  )
}

// ─────────────────────────────────────────
// 選択肢テキストパーサー
// ─────────────────────────────────────────
export function extractChoicesFromText(text: string, count: 2 | 3): string[] {
  const labels  = ['A', 'B', 'C'].slice(0, count)
  const options: string[] = []

  for (const label of labels) {
    const pattern = new RegExp(`【選択肢${label}】★?\\s*レア?\\s*([^\\n【]{1,40})`, 'i')
    const match   = text.match(pattern)
    if (match) options.push(match[1].trim())
  }

  if (options.length < 2) {
    return ['前へ進む', '立ち止まる', ...(count === 3 ? ['第三の道へ'] : [])].slice(0, count)
  }
  return options.slice(0, count)
}

export function extractStoryBody(fullText: string): string {
  return fullText
    .replace(/\n---[\s\S]*?---/g, '')
    .replace(/\n【選択肢[ABC]】[\s\S]{0,100}(?=\n【選択肢|$)/g, '')
    .trim()
}

export const RARE_CHOICE_PROBABILITY = 0.15

export function shouldShowRareChoice(): boolean {
  return Math.random() < RARE_CHOICE_PROBABILITY
}

export function generateRareChoice(_existingOptions: string[]): string {
  const templates = ['誰も予期しない第三の選択', '物語を根底から覆す決断', '運命の隠された扉']
  return templates[Math.floor(Math.random() * templates.length)]
}
