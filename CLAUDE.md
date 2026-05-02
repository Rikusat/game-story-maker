# game-story-maker — プロジェクト概要

参加型AIノベルゲーム「一期一会ノベル」の Next.js 実装。
複数プレイヤーがリアルタイムで物語の分岐を選びながら、AIが生成する一度きりの物語を体験する。

---

## 技術スタック

- **フレームワーク**: Next.js 14 (App Router)
- **言語**: TypeScript
- **DB / Realtime**: Supabase (PostgreSQL + Realtime)
- **AI生成**: OpenAI API (gpt-4o-mini / gpt-4o)
- **デプロイ**: Vercel
- **スタイリング**: CSS-in-JS（`<style>` タグ）、Tailwind CSS は使用しない

---

## ディレクトリ構成

```
app/
  (game)/
    lobby/page.tsx        マッチング待機室
    room/[id]/page.tsx    ゲーム本編（物語表示・投票）★ メインファイル
    result/[id]/page.tsx  リザルト画面
    layout.tsx
  api/
    match/route.ts        ルーム作成・参加
    novel/
      generate/route.ts   物語生成（OpenAI呼び出し）★ メインAPI
      stream/route.ts     SSEストリーミング（現在は未使用）
    vote/route.ts         投票処理・全員投票判定
    save/route.ts         物語保存・タイトル生成
  bookshelf/page.tsx      保存済み物語一覧
  page.tsx                トップ

components/
  novel/
    NovelViewer.tsx       物語テキスト表示（フェードイン）
    ChoicePanel.tsx       選択肢パネル（タイマー付き）
    BookCloseEffect.tsx   本を閉じる演出
  room/
    PlayerList.tsx        参加者リスト
    ReactionStamp.tsx     リアクションスタンプ

lib/
  claude/
    index.ts              OpenAI クライアント（削除禁止：save/route.ts が依存）
    prompts.ts            プロンプト組み立て（YAMLから読み込む）
    promptLoader.ts       YAMLパーサー
  game/
    tally.ts              投票集計・次ページ進行ロジック
  hooks/
    useRoom.ts            ルーム状態のRealtime購読
    useVote.ts            投票状態の管理
  novel/
    stream.ts             OpenAI ストリーミング共通関数
  supabase/
    index.ts              Supabaseクライアント（クライアント用）
    server.ts             Supabaseクライアント（サーバー用）
    admin.ts              Supabase管理者クライアント

prompts/
  scenes/
    system.yaml           AIの役割・文体・文字数・選択肢フォーマット ★ 編集対象
    roles.yaml            各ページの役割定義 ★ 編集対象

types/
  index.ts                共通型定義

supabase/
  schema.sql              DBスキーマ

PROMPT_GUIDE.md           プロンプト改善ガイド（編集方法の説明）
```

---

## データベース構造

### 主要テーブル

```sql
rooms
  id, code, host_id, status(waiting/playing/finished), max_players

room_players
  id, room_id, user_id, is_active, joined_at
  ready_page int  -- 「次へ」ボタン同期用（null=未押下）

profiles
  id, username, avatar_url

novel_sessions
  id, room_id, title, genre, full_text, status, current_page(0-16)

scene_choices
  id, novel_session_id, page_number(0-16),
  story_segment, choice_a, choice_b,
  winning_choice, vote_deadline

votes
  id, scene_choice_id, room_id, user_id, choice(A/B)

saved_novels
  id, novel_session_id, user_id, title
```

---

## ゲームフロー（17ページ構成）

```
ページ0  : OP/導入（選択肢なし）
ページ1  : 文章のみ
ページ2  : 文章+選択肢（分岐①）
ページ3  : 文章のみ
ページ4  : 文章+選択肢（分岐②）
ページ5  : 文章のみ
ページ6  : 文章+選択肢（分岐③）
ページ7  : 文章のみ
ページ8  : 文章+選択肢（分岐④）
ページ9  : 文章のみ
ページ10 : 文章+選択肢（分岐⑤）
ページ11 : 文章のみ
ページ12 : 文章+選択肢（分岐⑥）
ページ13 : 文章のみ
ページ14 : 文章+選択肢（分岐⑦）
ページ15 : EDまとめ（選択肢なし）
ページ16 : ED（各自「次へ」でリザルトへ・Realtime切断）
```

### ページタイプ判定

```typescript
function getPageType(page: number): "op" | "text" | "choice" | "summary" | "ending" {
  if (page === 0)  return "op"
  if (page === 16) return "ending"
  if (page === 15) return "summary"
  if (page % 2 === 0 && page >= 2 && page <= 14) return "choice"
  return "text"
}
```

### 進行ルール

- **ページ0〜15**：「1分経過」または「全員が次へボタンを押す」で次ページへ
- **CHOICEページ**：文章と選択肢を同時表示。全員投票 or 1分で次ページ
- **ページ16**：Realtimeを切断。各自「次へ」ボタンでリザルトへ遷移

---

## プロンプト管理

AIの文章品質は `prompts/scenes/` の YAML ファイルを編集して git push するだけで改善できる。
コードを触る必要はない。

```
prompts/scenes/system.yaml  ← 文体・文字数・選択肢フォーマット
prompts/scenes/roles.yaml   ← 各ページの役割・ヒント
```

詳細は `PROMPT_GUIDE.md` を参照。

---

## 重要な制約・注意事項

### 絶対に削除・変更してはいけないファイル

- `lib/claude/index.ts` — `app/api/save/route.ts` が `openai` インスタンスを直接 import している
- `lib/supabase/` 配下 — 全APIルートが依存
- `next.config.ts` — `outputFileTracingIncludes` で `prompts/` をVercelに含める設定がある

### スタイリングのルール

- Tailwind CSS は**使用しない**（`<style>` タグ内の CSS で実装）
- フォント：`Noto Serif JP`（本文）・`Shippori Mincho`（UI）
- カラーパレット：白基調（背景 `#faf8f4`）・墨色文字（`#1a1208`）
- Google Fonts は `<style>` 内の `@import` で読み込む

### OpenAI API

- モデル：環境変数 `OPENAI_MODEL`（デフォルト `gpt-4o-mini`）
- ストリーミングは `lib/novel/stream.ts` の `streamNovel()` を使う
- APIキー：`OPENAI_API_KEY`（サーバーサイドのみ）

### Supabase Realtime

- `lib/hooks/useRoom.ts` でルーム状態を購読
- `lib/hooks/useVote.ts` で投票状態を管理
- ページ16でRealtimeを切断する

### 環境変数（必須）

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_MODEL          # 省略時は gpt-4o-mini
```

---

## よくある作業パターン

### プロンプトを改善したい
→ `prompts/scenes/system.yaml` または `roles.yaml` を編集して git push

### 新しいページタイプを追加したい
→ `getPageType()` を修正 → `roles.yaml` にページ定義を追加 → `generate/route.ts` の判定を更新

### UIを変更したい
→ `app/(game)/room/[id]/page.tsx` または `components/novel/` 配下を編集
→ Tailwind は使わず `<style>` タグ内のCSSで実装

### DBスキーマを変更したい
→ `supabase/schema.sql` を更新 → Supabase ダッシュボードの SQL Editor で実行

### ボットの挙動を変えたい
→ `app/api/vote/route.ts` の bot 処理部分を編集
