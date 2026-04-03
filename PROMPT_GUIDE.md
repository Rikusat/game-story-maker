# プロンプト改善ガイド

AIの物語品質は `prompts/` の YAML ファイルを編集して Git push するだけで改善できます。
**コードは一切触る必要がありません。**

---

## ファイル構成

```
prompts/
└── scenes/
    ├── system.yaml    AIの役割・文体・文字数・選択肢フォーマット
    └── roles.yaml     各章（起承転結）の説明とAIへのヒント
```

---

## やりたいこと別の対応表

| やりたいこと | 編集するファイル | 編集箇所 |
|---|---|---|
| AIのトーンを変える | `system.yaml` | `system_prompt:` |
| AIの書き出し一文を変える | `system.yaml` | `persona:` |
| 通常シーンの文字数を変える | `system.yaml` | `normal_scene.min_chars` / `max_chars` |
| 通常シーンの執筆指示を変える | `system.yaml` | `normal_scene.instructions:` |
| 最終シーンの文字数を変える | `system.yaml` | `final_scene.min_chars` / `max_chars` |
| 最終シーンの執筆指示を変える | `system.yaml` | `final_scene.instructions:` |
| 選択肢の文字数制限を変える | `system.yaml` | `choices_format.max_label_chars:` |
| 選択肢の指示文を変える | `system.yaml` | `choices_format.choice_a_template:` / `choice_b_template:` |
| 起章（第1章）の方向性を変える | `roles.yaml` | `index: 0` の `desc:` / `hint:` |
| 承章（第2章）の方向性を変える | `roles.yaml` | `index: 1` の `desc:` / `hint:` |
| 転章（第3章）の方向性を変える | `roles.yaml` | `index: 2` の `desc:` / `hint:` |
| 結章（第4章）の方向性を変える | `roles.yaml` | `index: 3` の `desc:` / `hint:` |

---

## 編集例

### 文章を長くしたい

`prompts/scenes/system.yaml`:

```yaml
normal_scene:
  min_chars: 350   # 280 → 350
  max_chars: 500   # 350 → 500
```

### AIの文体を変えたい

`prompts/scenes/system.yaml`:

```yaml
persona: あなたは日本語インタラクティブノベルの名手です。簡潔で鋭い文体を得意とし、無駄な言葉を削ぎ落とした緊張感のある文章を書きます。
```

### 転章をもっとドラマチックにしたい

`prompts/scenes/roles.yaml`:

```yaml
- index: 2
  role: 転
  desc: 物語の転換点・山場。予想外の出来事が起き、主人公は人生を左右する決断を迫られる
  hint: |
    読者が驚く展開を入れ、感情が最高潮に達する場面にする。
    過去の選択が思わぬ形で影響してくる伏線回収の要素を必ず1つ入れること。
    選択肢はどちらを選んでも何かを失う構造にする。
```

### 選択肢の指示を変えたい

`prompts/scenes/system.yaml`:

```yaml
choices_format:
  choice_a_template: "{typeA}タイプとして：感情と行動を含む、キャラクターらしい具体的な選択（{max_label_chars}文字以内）"
  choice_b_template: "{typeB}タイプとして：感情と行動を含む、キャラクターらしい具体的な選択（{max_label_chars}文字以内）"
```

---

## デプロイ手順

```bash
git add prompts/
git commit -m "prompt: 〇〇を調整"
git push
```

Vercel が自動デプロイします（約1〜2分で本番反映）。

---

## しくみ（開発者向け）

```
prompts/scenes/system.yaml  ┐
prompts/scenes/roles.yaml   ┘ YAMLで文言を管理

lib/claude/promptLoader.ts    YAMLを読み込む
lib/claude/prompts.ts         プロンプトを組み立てる
app/api/novel/generate/route.ts  APIの処理（触らない）
lib/novel/stream.ts           OpenAIへの送信（触らない）
```
