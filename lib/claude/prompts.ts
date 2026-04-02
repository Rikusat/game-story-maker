// ============================================================
// lib/claude/prompts.ts
//
// YAML ファイルからプロンプトを組み立てる。
// ロジックはここ、文言は prompts/scenes/*.yaml で管理する。
//
// ── 文言を変えたい場合 ─────────────────────────────────────
//   起承転結の役割・ヒント → prompts/scenes/roles.yaml
//   文字数・システム文言  → prompts/scenes/system.yaml
//   変更後は git push するだけで本番に反映される
// ============================================================

import { MBTI_SCENES } from '@/types'
import { loadYaml, str, arr, obj } from './promptLoader'

export interface BuildStoryPromptOptions {
  previousText: string
  sceneNumber: number
  isLastScene: boolean
  previousChoiceText?: string
}

// ── YAML ロード ───────────────────────────────────────────
const rolesYaml  = loadYaml('scenes/roles.yaml')
const systemYaml = loadYaml('scenes/system.yaml')

// ── SceneRole 型 ──────────────────────────────────────────
interface SceneRole { role: string; desc: string; hint: string }

function getSceneRoles(): SceneRole[] {
  const scenes = arr(rolesYaml['scenes'])
  if (scenes.length === 0) {
    // YAML が読めない場合のフォールバック（元の定義をそのまま）
    return [
      { role: '起', desc: '物語の幕開け。主人公と世界観を鮮やかに描写し、胸躍る冒険や謎の発端を作る',   hint: '情景描写・主人公の感情・世界の空気感から入り、読者を一気に引き込む' },
      { role: '承', desc: '物語の展開。前の選択が引き金となって状況が動き出し、緊張感や期待感が高まる',   hint: '直前の選択の結果を自然に反映させ、新たな出会いや障害、感情の変化を描く' },
      { role: '転', desc: '物語の転換点・山場。予想外の出来事が起き、主人公は人生を左右する決断を迫られる', hint: '読者が驚く展開を入れ、感情が最高潮に達する場面にする。選択の重みを最大にする' },
      { role: '結', desc: '物語の結末。すべての選択の積み重ねが一点に収束し、感動的な幕切れを迎える',      hint: 'これまでの選択を振り返りながら、読後に余韻が残る締めくくりにする' },
    ]
  }
  return scenes.map(s => {
    const o = obj(s)
    return { role: str(o['role']), desc: str(o['desc']), hint: str(o['hint']) }
  })
}

// ── システムプロンプト（route.ts から呼ぶ） ────────────────
export function getSystemPrompt(): string {
  return str(
    systemYaml['system_prompt'],
    'あなたは日本語のインタラクティブノベルゲームのシナリオライターです。指示に従い、指定フォーマットで必ず出力してください。===CHOICES===ブロックは省略せず必ず含めてください。',
  )
}

// ── メイン ────────────────────────────────────────────────
export function buildStoryPrompt({
  previousText,
  sceneNumber,
  isLastScene,
  previousChoiceText,
}: BuildStoryPromptOptions): string {
  const sceneRoles = getSceneRoles()
  const scene      = MBTI_SCENES[sceneNumber]
  const sr         = sceneRoles[Math.min(sceneNumber, sceneRoles.length - 1)]
  const persona    = str(systemYaml['persona'], 'あなたは日本語インタラクティブノベルの名手です。感情豊かで読み応えのある物語を書くことが得意です。')

  // ── 最終シーン（結） ──────────────────────────────────
  if (isLastScene) {
    const fc       = obj(systemYaml['final_scene'])
    const minChars = str(fc['min_chars'], '350')
    const maxChars = str(fc['max_chars'], '450')
    const insts    = arr(fc['instructions'])
    const instText = insts.length > 0
      ? insts.map(i => `・${str(i)}`).join('\n')
      : '・プレイヤーの選択の積み重ねが意味を持つ締めくくりにする\n・マークダウン記法（**や##など）は使わないでください'

    return `${persona}

【これまでの物語】
${previousText || '（物語の始まり）'}

【直前の選択】${previousChoiceText || 'なし'}

【今回の役割】第4章「結」— ${sr.desc}

【執筆の心がけ】${sr.hint}

これまでのすべての選択を踏まえた、${minChars}〜${maxChars}文字の感動的な結末を日本語で書いてください。
${instText}

===END===`
  }

  // ── 通常シーン（起・承・転） ──────────────────────────
  const nc       = obj(systemYaml['normal_scene'])
  const minChars = str(nc['min_chars'], '280')
  const maxChars = str(nc['max_chars'], '350')
  const insts    = arr(nc['instructions'])
  const instText = insts.length > 0
    ? insts.map(i => `・${str(i)}`).join('\n')
    : '・情景・感情・対話を豊かに織り交ぜ、読者を引き込む\n・直前の選択があれば、その結果を冒頭で自然に物語に反映する\n・最後は自然な形でこのシーンならではの分岐点に誘導する\n・マークダウン記法は使わない'

  // 選択肢フォーマット
  const cc       = obj(systemYaml['choices_format'])
  const maxLabel = str(cc['max_label_chars'], '40')
  const tmplA    = str(cc['choice_a_template'], '{typeA}タイプとして：この場面でキャラクターが実際に取る具体的な行動や発言（{max_label_chars}文字以内）')
  const tmplB    = str(cc['choice_b_template'], '{typeB}タイプとして：この場面でキャラクターが実際に取る具体的な行動や発言（{max_label_chars}文字以内）')

  const choiceA = tmplA.replace('{typeA}', scene.typeA).replace('{max_label_chars}', maxLabel)
  const choiceB = tmplB.replace('{typeB}', scene.typeB).replace('{max_label_chars}', maxLabel)

  return `${persona}プレイヤーの選択で物語が変化するゲームのシナリオを書いてください。

【これまでの物語】
${previousText || '（まだ何も起きていない）'}

【直前の選択】${previousChoiceText || '（最初のシーンのため選択なし）'}

【今回の役割】第${sceneNumber + 1}章「${sr.role}」— ${sr.desc}

【執筆の心がけ】${sr.hint}

【指示】
・${minChars}〜${maxChars}文字の日本語テキストを書く
${instText}

テキストを書いたら、必ず続けて以下の形式で選択肢を出力してください（他の文字は入れない）:

===CHOICES===
{"choice_a":"${choiceA}","choice_b":"${choiceB}"}`
}

// ── タイトル生成（変更なし） ──────────────────────────────
export function buildTitlePrompt(fullText: string): string {
  return `以下の物語に相応しい短いタイトル（15文字以内）を日本語で1つだけ答えてください。タイトルのみ出力し、説明や記号は不要です。

【物語】
${fullText.substring(0, 500)}`
}
