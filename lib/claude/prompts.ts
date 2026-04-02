import { MBTI_SCENES, type MbtiDimension } from "@/types";

interface BuildStoryPromptOptions {
  previousText: string;
  sceneNumber: number;
  isLastScene: boolean;
  previousChoiceText?: string;
}

const SCENE_ROLES = [
  {
    role: "起",
    desc: "物語の幕開け。主人公と世界観を鮮やかに描写し、胸躍る冒険や謎の発端を作る",
    hint: "情景描写・主人公の感情・世界の空気感から入り、読者を一気に引き込む",
  },
  {
    role: "承",
    desc: "物語の展開。前の選択が引き金となって状況が動き出し、緊張感や期待感が高まる",
    hint: "直前の選択の結果を自然に反映させ、新たな出会いや障害、感情の変化を描く",
  },
  {
    role: "転",
    desc: "物語の転換点・山場。予想外の出来事が起き、主人公は人生を左右する決断を迫られる",
    hint: "読者が驚く展開を入れ、感情が最高潮に達する場面にする。選択の重みを最大にする",
  },
  {
    role: "結",
    desc: "物語の結末。すべての選択の積み重ねが一点に収束し、感動的な幕切れを迎える",
    hint: "これまでの選択を振り返りながら、読後に余韻が残る締めくくりにする",
  },
];

export function buildStoryPrompt({
  previousText,
  sceneNumber,
  isLastScene,
  previousChoiceText,
}: BuildStoryPromptOptions): string {
  const scene = MBTI_SCENES[sceneNumber];
  const sr = SCENE_ROLES[Math.min(sceneNumber, 3)];

  if (isLastScene) {
    return `あなたは日本語インタラクティブノベルの名手です。感情豊かで読み応えのある物語を書くことが得意です。

【これまでの物語】
${previousText || "（物語の始まり）"}

【直前の選択】${previousChoiceText || "なし"}

【今回の役割】第4章「結」— ${sr.desc}

【執筆の心がけ】${sr.hint}

これまでのすべての選択を踏まえた、350〜450文字の感動的な結末を日本語で書いてください。
プレイヤーの選択の積み重ねが意味を持つ締めくくりにしてください。
マークダウン記法（**や##など）は使わないでください。

===END===`;
  }

  return `あなたは日本語インタラクティブノベルの名手です。プレイヤーの選択で物語が変化するゲームのシナリオを書いてください。

【これまでの物語】
${previousText || "（まだ何も起きていない）"}

【直前の選択】${previousChoiceText || "（最初のシーンのため選択なし）"}

【今回の役割】第${sceneNumber + 1}章「${sr.role}」— ${sr.desc}

【執筆の心がけ】${sr.hint}

【指示】
・280〜350文字の日本語テキストを書く
・情景・感情・対話を豊かに織り交ぜ、読者を引き込む
・直前の選択があれば、その結果を冒頭で自然に物語に反映する
・最後は自然な形でこのシーンならではの分岐点に誘導する
・マークダウン記法は使わない

テキストを書いたら、必ず続けて以下の形式で選択肢を出力してください（他の文字は入れない）:

===CHOICES===
{"choice_a":"${scene.typeA}タイプとして：この場面でキャラクターが実際に取る具体的な行動や発言（40文字以内）","choice_b":"${scene.typeB}タイプとして：この場面でキャラクターが実際に取る具体的な行動や発言（40文字以内）"}`;
}

export function buildTitlePrompt(fullText: string): string {
  return `以下の物語に相応しい短いタイトル（15文字以内）を日本語で1つだけ答えてください。タイトルのみ出力し、説明や記号は不要です。

【物語】
${fullText.substring(0, 500)}`;
}
