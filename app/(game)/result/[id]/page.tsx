import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import SaveButton from "./SaveButton";

export default async function ResultPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const roomId   = params.id;

  const { data: session } = await supabase
    .from("novel_sessions")
    .select("*")
    .eq("room_id", roomId)
    .single();

  if (!session) redirect("/lobby");

  // CHOICEページの選択肢と投票結果を取得（偶数ページのみ）
  const { data: choices } = await supabase
    .from("scene_choices")
    .select("*, votes(*)")
    .eq("novel_session_id", session.id)
    .not("choice_a", "is", null)
    .order("page_number");

  const { data: players } = await supabase
    .from("room_players")
    .select("*")
    .eq("room_id", roomId);

  return (
    <div
      style={{
        minHeight: "100svh",
        background: "#faf8f4",
        color: "#1a1612",
        fontFamily: "'Shippori Mincho', serif",
        padding: "48px 20px",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400&family=Shippori+Mincho:wght@400;500&display=swap');`}</style>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        {/* タイトル */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <p style={{ fontSize: "0.7rem", color: "rgba(26,22,18,0.35)", letterSpacing: "0.2em", marginBottom: 8 }}>
            物語の終わり
          </p>
          <h1
            style={{
              fontSize: "1.6rem",
              fontWeight: 500,
              color: "#1a1612",
              letterSpacing: "0.1em",
              lineHeight: 1.4,
            }}
          >
            {session.title ?? "名もなき物語"}
          </h1>
          <p style={{ fontSize: "0.75rem", color: "rgba(26,22,18,0.4)", marginTop: 12 }}>
            {(players ?? []).length}人で紡いだ物語
          </p>
        </div>

        {/* 投票の記録 */}
        {(choices ?? []).length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <p
              style={{
                fontSize: "0.7rem",
                letterSpacing: "0.2em",
                color: "rgba(26,22,18,0.4)",
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              ― 選択の記録 ―
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(choices ?? []).map((c, i) => {
                const totalVotes = c.votes?.length ?? 0;
                const countA     = c.votes?.filter((v: any) => v.choice === "A").length ?? 0;
                const countB     = totalVotes - countA;
                const pctA       = totalVotes ? Math.round((countA / totalVotes) * 100) : 50;

                return (
                  <div
                    key={c.id}
                    style={{
                      background: "#fff",
                      border: "1px solid rgba(26,22,18,0.1)",
                      borderRadius: 10,
                      padding: "14px 16px",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "0.65rem",
                        color: "rgba(26,22,18,0.35)",
                        letterSpacing: "0.15em",
                        marginBottom: 10,
                      }}
                    >
                      分岐 {i + 1}（ページ {c.page_number}）
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {(["A", "B"] as const).map((v) => {
                        const label = v === "A" ? c.choice_a : c.choice_b;
                        const count = v === "A" ? countA : countB;
                        const pct   = v === "A" ? pctA : 100 - pctA;
                        const won   = c.winning_choice === v;
                        return (
                          <div
                            key={v}
                            style={{
                              borderRadius: 8,
                              padding: "10px 12px",
                              border: won
                                ? "1px solid rgba(26,22,18,0.4)"
                                : "1px solid rgba(26,22,18,0.1)",
                              background: won ? "rgba(26,22,18,0.04)" : "transparent",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: 6,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.6rem",
                                  color: "rgba(26,22,18,0.35)",
                                  letterSpacing: "0.1em",
                                }}
                              >
                                選択 {v}
                              </span>
                              {won && (
                                <span
                                  style={{
                                    fontSize: "0.6rem",
                                    color: "rgba(26,22,18,0.6)",
                                    letterSpacing: "0.08em",
                                  }}
                                >
                                  ✓ 採用
                                </span>
                              )}
                            </div>
                            <p
                              style={{
                                fontSize: "0.8rem",
                                color: "#1a1612",
                                lineHeight: 1.5,
                                marginBottom: 8,
                                fontFamily: "'Noto Serif JP', serif",
                                fontWeight: 300,
                              }}
                            >
                              {label}
                            </p>
                            <div
                              style={{
                                height: 2,
                                background: "rgba(26,22,18,0.08)",
                                borderRadius: 2,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${pct}%`,
                                  background: won
                                    ? "rgba(26,22,18,0.45)"
                                    : "rgba(26,22,18,0.15)",
                                  borderRadius: 2,
                                }}
                              />
                            </div>
                            <p
                              style={{
                                fontSize: "0.62rem",
                                color: "rgba(26,22,18,0.35)",
                                marginTop: 4,
                              }}
                            >
                              {count}票 ({pct}%)
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* アクション */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SaveButton sessionId={session.id} existingTitle={session.title} />
          <Link
            href="/lobby"
            style={{
              display: "block",
              textAlign: "center",
              padding: "12px 20px",
              border: "1px solid rgba(26,22,18,0.18)",
              borderRadius: 100,
              color: "rgba(26,22,18,0.65)",
              fontSize: "0.85rem",
              letterSpacing: "0.12em",
              textDecoration: "none",
            }}
          >
            ロビーに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
