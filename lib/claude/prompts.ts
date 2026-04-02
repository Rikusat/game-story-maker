import { MBTI_SCENES, type MbtiDimension } from "@/types";

interface BuildStoryPromptOptions {
  previousText: string;
  sceneNumber: number;
  isLastScene: boolean;
  previousChoiceText?: string;
}

export function buildStoryPrompt({
  previousText,
  sceneNumber,
  isLastScene,
  previousChoiceText,
}: BuildStoryPromptOptions): string {
  const scene = MBTI_SCENES[sceneNumber];

  if (isLastScene) {
    return `あなたはマルチプレイヤーゲーム「ノベルストーリーメーカー」のシナリオライターです。

【これまでの物語】
${previousText || "（物語の始まり）"}

【直前の選択】${previousChoiceText || "なし"}

これは最終シーン（シーン4/4）です。これまでの選択を踏まえ、感動的で美しい結末を300文字程度の日本語で書いてください。
物語全体を締めくくる余韻のある終わりにしてください。

===END===`;
  }

  return `あなたはマルチプレイヤーゲーム「ノベルストーリーメーカー」のシナリオライターです。
プレイヤーたちが共同で読むインタラクティブな物語を書いてください。

【これまでの物語】
${previousText || "（物語の始まり）"}

【直前の選択】${previousChoiceText || "まだ選択なし（最初のシーン）"}

【今回のシーン】シーン${sceneNumber + 1}/4 — ${scene.label}を問う場面

指示：
1. 200文字程度の魅力的な日本語テキストを書く（ファンタジー世界観）
2. 情景・感情を豊かに描写し、最後は自然に分岐点へ誘導する
3. 物語の直後に必ず以下の区切りと選択肢JSONを出力する（マークダウン不使用）

===CHOICES===
{"choice_a":"[選択肢A：${scene.typeA}タイプの行動、30文字以内]","choice_b":"[選択肢B：${scene.typeB}タイプの行動、30文字以内]"}`;
}

export function buildTitlePrompt(fullText: string): string {
  return `以下の物語に相応しい短いタイトル（15文字以内）を日本語で1つだけ答えてください。タイトルのみ出力し、説明や記号は不要です。

【物語】
${fullText.substring(0, 500)}`;
}
