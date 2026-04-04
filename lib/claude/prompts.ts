// ============================================================
// lib/claude/prompts.ts
//
// YAML ファイルからプロンプトを組み立てる。
// ロジックはここ、文言は prompts/scenes/*.yaml で管理する。
//
// ── 文言を変えたい場合 ─────────────────────────────────────
//   各ページの役割・ヒント → prompts/scenes/roles.yaml
//   文字数・システム文言  → prompts/scenes/system.yaml
//   変更後は git push するだけで本番に反映される
// ============================================================

import { loadYaml, str, arr, obj } from './promptLoader'

export type PageType = "op" | "text" | "choice" | "summary" | "ending"

export interface BuildStoryPromptOptions {
  previousText: string
  pageNumber: number
  pageType: PageType
  previousChoiceText?: string
}

// ── YAML ロード ───────────────────────────────────────────
const rolesYaml  = loadYaml('scenes/roles.yaml')
const systemYaml = loadYaml('scenes/system.yaml')

// ── PageRole 型 ──────────────────────────────────────────
interface PageRole { role: string; desc: string; hint: string }

function getPageRole(pageNumber: number): PageRole {
  const pages = arr(rolesYaml['pages'])
  const page = pages[pageNumber]
  if (page) {
    const o = obj(page)
    return { role: str(o['role']), desc: str(o['desc']), hint: str(o['hint']) }
  }
  // フォールバック
  return { role: `ページ${pageNumber}`, desc: '物語を進める', hint: '前の展開を受けて物語を前進させる' }
}

// ── システムプロンプト（route.ts から呼ぶ） ────────────────
export function getSystemPrompt(): string {
  return str(
    systemYaml['system_prompt'],
    'あなたは日本語のインタラクティブノベルゲームのシナリオライターです。指示に従い、指定フォーマットで必ず出力してください。',
  )
}

// ── メイン ────────────────────────────────────────────────
export function buildStoryPrompt({
  previousText,
  pageNumber,
  pageType,
  previousChoiceText,
}: BuildStoryPromptOptions): string {
  const pr      = getPageRole(pageNumber)
  const persona = str(systemYaml['persona'], 'あなたは日本語インタラクティブノベルの名手です。感情豊かで読み応えのある物語を書くことが得意です。')

  // ── ED（ページ16） ──────────────────────────────────────
  if (pageType === 'ending') {
    const fc       = obj(systemYaml['final_scene'])
    const minChars = str(fc['min_chars'], '350')
    const maxChars = str(fc['max_chars'], '450')
    const insts    = arr(fc['instructions'])
    const instText = insts.length > 0
      ? insts.map(i => `・${str(i)}`).join('\n')
      : '・プレイヤーの選択の積み重ねが意味を持つ締めくくりにする\n・マークダウン記法（**や##など）は使わないでください\n・最後は「了」で終える'

    return `${persona}

【これまでの物語】
${previousText || '（物語の始まり）'}

【直前の選択】${previousChoiceText || 'なし'}

【今回の役割】${pr.role}（ページ${pageNumber}）— ${pr.desc}

【執筆の心がけ】${pr.hint}

これまでのすべての選択を踏まえた、${minChars}〜${maxChars}文字の感動的な結末を日本語で書いてください。
${instText}

===END===`
  }

  // ── まとめ（ページ15） ────────────────────────────────
  if (pageType === 'summary') {
    return `${persona}

【これまでの物語】
${previousText || '（まだ何も起きていない）'}

【直前の選択】${previousChoiceText || 'なし'}

【今回の役割】${pr.role}（ページ${pageNumber}）— ${pr.desc}

【執筆の心がけ】${pr.hint}

350〜450文字の日本語テキストを書いてください。マークダウン記法は使わない。

===END===`
  }

  // ── CHOICEページ（偶数2〜14） ─────────────────────────
  if (pageType === 'choice') {
    const nc       = obj(systemYaml['normal_scene'])
    const minChars = str(nc['min_chars'], '280')
    const maxChars = str(nc['max_chars'], '350')
    const insts    = arr(nc['instructions'])
    const instText = insts.length > 0
      ? insts.map(i => `・${str(i)}`).join('\n')
      : '・情景・感情・対話を豊かに織り交ぜ、読者を引き込む\n・直前の選択があれば、その結果を冒頭で自然に物語に反映する\n・マークダウン記法は使わない'

    const cc       = obj(systemYaml['choices_format'])
    const maxLabel = str(cc['max_label_chars'], '40')

    return `${persona}プレイヤーの選択で物語が変化するゲームのシナリオを書いてください。

【これまでの物語】
${previousText || '（まだ何も起きていない）'}

【直前の選択】${previousChoiceText || '（最初の選択のため選択なし）'}

【今回の役割】${pr.role}（ページ${pageNumber}）— ${pr.desc}

【執筆の心がけ】${pr.hint}

【指示】
・${minChars}〜${maxChars}文字の日本語テキストを書く
${instText}

テキストを書いたら、必ず続けて以下の形式で選択肢を出力してください（他の文字は入れない）:

===CHOICES===
{"choice_a":"この場面でキャラクターが実際に取る具体的な行動や発言（${maxLabel}文字以内）","choice_b":"別の選択肢。キャラクターが実際に取る具体的な行動や発言（${maxLabel}文字以内）"}`
  }

  // ── OPページ・TEXTページ（op / text） ─────────────────
  const nc       = obj(systemYaml['normal_scene'])
  const minChars = str(nc['min_chars'], '280')
  const maxChars = str(nc['max_chars'], '350')

  return `${persona}

【これまでの物語】
${previousText || '（まだ何も起きていない）'}

【直前の選択】${previousChoiceText || '（選択なし）'}

【今回の役割】${pr.role}（ページ${pageNumber}）— ${pr.desc}

【執筆の心がけ】${pr.hint}

${minChars}〜${maxChars}文字の日本語テキストを書いてください。マークダウン記法は使わない。

===END===`
}

// ── タイトル生成 ──────────────────────────────────────────
export function buildTitlePrompt(fullText: string): string {
  return `以下の物語に相応しい短いタイトル（15文字以内）を日本語で1つだけ答えてください。タイトルのみ出力し、説明や記号は不要です。

【物語】
${fullText.substring(0, 500)}`
}
