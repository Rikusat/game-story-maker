"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { MBTI_SCENES } from "@/types";
import NovelViewer from "@/components/novel/NovelViewer";
import ChoicePanel from "@/components/novel/ChoicePanel";

const SCENE_CHAPTER_LABELS = ["起", "承", "転", "結"];

type Phase = "init" | "generating" | "reading" | "choosing" | "voting";

interface Choices { a: string; b: string; }

function makeSceneChoice(choices: Choices, sceneNumber: number, deadline: string) {
  return {
    id: "",
    novel_session_id: "",
    scene_number: sceneNumber,
    story_segment: "",
    choice_a: choices.a,
    choice_b: choices.b,
    mbti_dimension: "EI" as const,
    choice_a_type: "E" as const,
    choice_b_type: "I" as const,
    vote_deadline: deadline,
    winning_choice: null,
    created_at: new Date().toISOString(),
  };
}

export default function RoomPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const router   = useRouter();
  const supabase = createClient();

  const [phase, setPhase]             = useState<Phase>("init");
  const [displayText, setDisplayText] = useState("");
  const [choices, setChoices]         = useState<Choices | null>(null);
  const [myVote, setMyVote]           = useState<"A" | "B" | null>(null);
  const [sceneNumber, setSceneNumber] = useState(0);
  const [sceneLabel, setSceneLabel]   = useState("");
  const [error, setError]             = useState("");
  const [roomCode, setRoomCode]       = useState("");
  const [voteCountA, setVoteCountA]   = useState(0);
  const [voteCountB, setVoteCountB]   = useState(0);
  const [deadline, setDeadline]           = useState("");

  const sessionIdRef     = useRef("");
  const sceneNumberRef   = useRef(0);
  const sceneChoiceIdRef = useRef("");
  const userIdRef        = useRef("");
  const generatingRef    = useRef(false);


  // ── 初期化 ──
  useEffect(() => {
    userIdRef.current = localStorage.getItem("userId") ?? "";
    init();
  }, []);

  const init = async () => {
    const { data: room } = await supabase
      .from("rooms").select("*").eq("id", roomId).single();
    if (!room) { setError("ルームが見つかりません"); return; }
    setRoomCode(room.code ?? "");

    const { data: session } = await supabase
      .from("novel_sessions").select("*").eq("room_id", roomId).maybeSingle();

    if (!session) { setPhase("choosing"); return; }

    sessionIdRef.current   = session.id;
    sceneNumberRef.current = session.current_scene ?? 0;
    setSceneNumber(session.current_scene ?? 0);

    if (session.status === "completed") {
      router.push(`/result/${roomId}`); return;
    }

    if (session.status === "choice") {
      const { data: sc } = await supabase
        .from("scene_choices").select("*")
        .eq("novel_session_id", session.id)
        .eq("scene_number", (session.current_scene ?? 1) - 1)
        .maybeSingle();
      if (sc) {
        sceneChoiceIdRef.current = sc.id;
        const dl = sc.vote_deadline ?? new Date(Date.now() + 30_000).toISOString();
        setDeadline(dl);
        setChoices({ a: sc.choice_a ?? "", b: sc.choice_b ?? "" });
        setDisplayText(session.full_text ?? "");
        setSceneLabel(SCENE_CHAPTER_LABELS[sc.scene_number] ?? "");
        setPhase("choosing"); return;
      }
    }

    startGenerating();
  };

  // ── 生成 ──
  const startGenerating = useCallback(async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setPhase("generating");
    setError(""); setMyVote(null); setChoices(null);
    setVoteCountA(0); setVoteCountB(0);

    try {
      const scene = sceneNumberRef.current;
      const sid   = sessionIdRef.current;

      let previousChoiceText = "";
      if (scene > 0) {
        const { data: prev } = await supabase
          .from("scene_choices").select("*")
          .eq("novel_session_id", sid)
          .eq("scene_number", scene - 1)
          .maybeSingle();
        if (prev?.winning_choice) {
          previousChoiceText = prev.winning_choice === "A"
            ? (prev.choice_a ?? "") : (prev.choice_b ?? "");
        }
      }

      const res = await fetch("/api/novel/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, sceneNumber: scene, previousChoiceText }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "生成に失敗しました");
      }

      const data = await res.json();
      generatingRef.current = false;
      setSceneLabel(SCENE_CHAPTER_LABELS[scene] ?? "");

      if (data.completed) {
        animateText(data.text ?? "");
        // 最終シーンは読書バッファなしで1.5秒後にリザルトへ
        setTimeout(() => router.push(`/result/${roomId}`), 1500);
      } else {
        sceneChoiceIdRef.current = data.sceneChoiceId ?? "";
        const dl = data.deadline ?? new Date(Date.now() + 20_000).toISOString();
        setDeadline(dl);
        setChoices({
          a: data.choices?.a ?? "前に進む",
          b: data.choices?.b ?? "立ち止まる",
        });
        animateText(data.text ?? "");
      }
    } catch (err: any) {
      generatingRef.current = false;
      setError(err.message ?? "エラーが発生しました");
      setPhase("choosing");
    }
  }, []);

  // ── フェードイン表示（readingDeadline が自動で choosing に遷移） ──
  const animateText = (text: string) => {
    if (!text) return;
    setDisplayText(text);
    setPhase("reading");
  };

  // ── 読書バッファ：45秒で自動的に choosing へ（次へボタンでも遷移可） ──
  const READING_BUFFER_MS = 45_000;
  const readingStartRef = useRef<number>(0);

  useEffect(() => {
    if (phase !== "reading") return;
    readingStartRef.current = Date.now();
    const t = setTimeout(() => setPhase("choosing"), READING_BUFFER_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const handleNextPage = () => {
    if (phase !== "reading") return;
    setPhase("choosing");
  };

  // ── 投票 ──
  const handleVote = async (choice: "A" | "B") => {
    if (myVote || phase !== "choosing") return;
    setMyVote(choice);
    setPhase("voting");
    if (choice === "A") setVoteCountA((n) => n + 1);
    else                setVoteCountB((n) => n + 1);

    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneChoiceId: sceneChoiceIdRef.current,
          choice, roomId,
          userId: userIdRef.current,
        }),
      });
      const data = await res.json();
      if (data.completed) { router.push(`/result/${roomId}`); return; }
      sceneNumberRef.current = data.nextScene ?? sceneNumberRef.current + 1;
      setSceneNumber(sceneNumberRef.current);
      setDisplayText("");
      startGenerating();
    } catch (err: any) {
      setError(err.message ?? "投票に失敗しました");
      setMyVote(null); setPhase("choosing");
    }
  };

  // ── UI ──
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400&family=Shippori+Mincho:wght@400;500&display=swap');

        /* ── ベース：白基調 ── */
        .rp-root {
          min-height: 100svh;
          background: #faf8f4;
          color: #1a1612;
          display: flex;
          flex-direction: column;
        }

        /* ── ヘッダー ── */
        .rp-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: max(12px, env(safe-area-inset-top)) 20px 12px;
          background: #faf8f4;
          border-bottom: 1px solid rgba(26,22,18,0.1);
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .rp-code-hint {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.6rem;
          color: rgba(26,22,18,0.35);
          letter-spacing: 0.14em;
          margin-bottom: 2px;
        }
        .rp-code {
          font-family: 'Shippori Mincho', serif;
          font-size: 1.05rem;
          font-weight: 500;
          color: rgba(26,22,18,0.75);
          letter-spacing: 0.2em;
        }
        .rp-scene-hint {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.6rem;
          color: rgba(26,22,18,0.35);
          letter-spacing: 0.14em;
          text-align: right;
          margin-bottom: 2px;
        }
        .rp-scene {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.95rem;
          color: rgba(26,22,18,0.65);
          text-align: right;
          letter-spacing: 0.08em;
        }

        /* ── 進捗バー ── */
        .rp-progress {
          display: flex;
          gap: 4px;
          padding: 8px 20px 0;
          background: #faf8f4;
        }
        .rp-prog-seg {
          flex: 1;
          height: 2px;
          border-radius: 2px;
          transition: background 0.4s;
        }
        .rp-prog-done    { background: rgba(26,22,18,0.55); }
        .rp-prog-current { background: rgba(26,22,18,0.2); }
        .rp-prog-future  { background: rgba(26,22,18,0.08); }

        /* ── メイン ── */
        .rp-main {
          flex: 1;
          position: relative;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        /* ── 生成中 ── */
        .rp-generating {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }
        @keyframes rpSpin { to { transform: rotate(360deg); } }
        .rp-spinner {
          width: 28px;
          height: 28px;
          border: 1.5px solid rgba(26,22,18,0.1);
          border-top-color: rgba(26,22,18,0.45);
          border-radius: 50%;
          animation: rpSpin 0.9s linear infinite;
        }
        .rp-gen-text {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.82rem;
          color: rgba(26,22,18,0.4);
          letter-spacing: 0.18em;
        }
        .rp-gen-chapter {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.68rem;
          color: rgba(26,22,18,0.25);
          letter-spacing: 0.12em;
        }

        /* ── エラー ── */
        .rp-error {
          margin: 16px 20px;
          background: rgba(180,50,40,0.06);
          border: 1px solid rgba(180,50,40,0.2);
          border-radius: 8px;
          padding: 14px 16px;
          font-family: 'Shippori Mincho', serif;
          font-size: 0.82rem;
          color: rgba(160,40,30,0.85);
          letter-spacing: 0.04em;
          line-height: 1.7;
        }
        .rp-retry {
          margin-top: 8px;
          font-size: 0.72rem;
          color: rgba(26,22,18,0.4);
          text-decoration: underline;
          cursor: pointer;
          background: none;
          border: none;
          font-family: inherit;
          letter-spacing: 0.06em;
        }

        /* ── 投票待ち ── */
        .rp-voting {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 24px;
          font-family: 'Shippori Mincho', serif;
          font-size: 0.8rem;
          color: rgba(26,22,18,0.35);
          letter-spacing: 0.12em;
        }

        /* ── 読書バッファ：次へボタン + カウントダウンバー ── */
        .rp-reading-footer {
          position: sticky;
          bottom: 0;
          padding: 10px 20px calc(10px + env(safe-area-inset-bottom, 0px));
          background: linear-gradient(to top, #faf8f4 70%, transparent);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .rp-next-btn {
          align-self: flex-end;
          font-family: 'Shippori Mincho', serif;
          font-size: 0.85rem;
          font-weight: 500;
          letter-spacing: 0.18em;
          color: rgba(26,22,18,0.75);
          background: #faf8f4;
          border: 1px solid rgba(26,22,18,0.22);
          border-radius: 100px;
          padding: 9px 22px;
          cursor: pointer;
          transition: background 0.18s, border-color 0.18s;
        }
        .rp-next-btn:hover {
          background: rgba(26,22,18,0.05);
          border-color: rgba(26,22,18,0.38);
        }
        .rp-reading-bar {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .rp-reading-track {
          flex: 1;
          height: 2px;
          background: rgba(26,22,18,0.08);
          border-radius: 2px;
          overflow: hidden;
        }
        .rp-reading-fill {
          height: 100%;
          background: rgba(26,22,18,0.2);
          border-radius: 2px;
          transition: width 1s linear;
        }
        .rp-reading-sec {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.68rem;
          color: rgba(26,22,18,0.28);
          letter-spacing: 0.06em;
          min-width: 32px;
          text-align: right;
        }
      `}</style>

      <div className="rp-root">
        {/* ヘッダー */}
        <header className="rp-header">
          <div>
            <p className="rp-code-hint">合言葉</p>
            <p className="rp-code">{roomCode || "…"}</p>
          </div>
          <div>
            <p className="rp-scene-hint">シーン</p>
            <p className="rp-scene">
              {sceneNumber + 1} / 4
              {sceneLabel && (
                <span style={{ marginLeft: "6px", opacity: 0.5 }}>「{sceneLabel}」</span>
              )}
            </p>
          </div>
        </header>

        {/* 進捗バー */}
        <div className="rp-progress">
          {MBTI_SCENES.map((s, i) => (
            <div
              key={s.dimension}
              className={`rp-prog-seg ${
                i < sceneNumber
                  ? "rp-prog-done"
                  : i === sceneNumber && phase !== "init"
                  ? "rp-prog-current"
                  : "rp-prog-future"
              }`}
            />
          ))}
        </div>

        {/* メイン */}
        <main
          className="rp-main"

        >
          {/* エラー */}
          {error && (
            <div className="rp-error">
              {error}
              <br />
              <button
                className="rp-retry"
                onClick={(e) => { e.stopPropagation(); setError(""); startGenerating(); }}
              >
                再試行する
              </button>
            </div>
          )}

          {/* 生成中 */}
          {phase === "generating" && !error && (
            <div className="rp-generating">
              <div className="rp-spinner" />
              <p className="rp-gen-text">物語を紡いでいます</p>
              {sceneLabel && (
                <p className="rp-gen-chapter">第{sceneNumber + 1}章「{sceneLabel}」</p>
              )}
            </div>
          )}

          {/* 物語テキスト */}
          {(phase === "reading" || phase === "choosing" || phase === "voting") &&
            displayText && (
              <NovelViewer
                text={displayText}
                isGenerating={phase === "reading"}
              />
            )}

          {/* 読書バッファ：次へボタン + 残り時間バー */}
          {phase === "reading" && (
            <ReadingBar
              startTime={readingStartRef.current}
              totalMs={READING_BUFFER_MS}
              onNext={handleNextPage}
            />
          )}

          {/* 投票待ち */}
          {phase === "voting" && (
            <div className="rp-voting">
              <div className="rp-spinner" />
              <span>{myVote ? "相手の選択を待っています…" : "次のシーンを準備中…"}</span>
            </div>
          )}
        </main>

        {/* 選択肢パネル */}
        {phase === "choosing" && choices && (
          <ChoicePanel
            choice={makeSceneChoice(
              choices,
              sceneNumber,
              deadline || new Date(Date.now() + 10_000).toISOString()
            )}
            myVote={myVote}
            countA={voteCountA}
            countB={voteCountB}
            totalPlayers={1}
            onVote={handleVote}
            onTimeUp={() => { if (!myVote) handleVote(Math.random() < 0.5 ? "A" : "B"); }}
            isHost={true}
          />
        )}
      </div>
    </>
  );
}


// ── 読書バッファ：次へボタン + カウントダウンバー ──
function ReadingBar({
  startTime,
  totalMs,
  onNext,
}: {
  startTime: number;
  totalMs: number;
  onNext: () => void;
}) {
  const [pct, setPct] = useState(100);
  const [sec, setSec] = useState(Math.ceil(totalMs / 1000));

  useEffect(() => {
    if (!startTime) return;
    const update = () => {
      const elapsed = Date.now() - startTime;
      const rem = Math.max(0, totalMs - elapsed);
      setPct((rem / totalMs) * 100);
      setSec(Math.ceil(rem / 1000));
    };
    update();
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, [startTime, totalMs]);

  return (
    <div className="rp-reading-footer">
      <button className="rp-next-btn" onClick={onNext}>
        次へ →
      </button>
      <div className="rp-reading-bar">
        <div className="rp-reading-track">
          <div className="rp-reading-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="rp-reading-sec">
          {sec > 0 ? `${sec}秒` : ""}
        </span>
      </div>
    </div>
  );
}
