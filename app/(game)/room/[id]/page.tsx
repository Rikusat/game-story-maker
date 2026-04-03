"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { MBTI_SCENES } from "@/types";
import NovelViewer from "@/components/novel/NovelViewer";
import ChoicePanel from "@/components/novel/ChoicePanel";

const SCENE_CHAPTER_LABELS = ["起", "承", "転", "結"];

type Phase = "init" | "generating" | "reading" | "choosing" | "voting";

interface Choices {
  a: string;
  b: string;
}

// ChoicePanel が要求する SceneChoice 型を最小限で満たす
function makeSceneChoice(choices: Choices, sceneNumber: number) {
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
    vote_deadline: new Date(Date.now() + 30_000).toISOString(),
    winning_choice: null,
    created_at: new Date().toISOString(),
  };
}

export default function RoomPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const router  = useRouter();
  const supabase = createClient();

  // ── ゲーム状態 ──
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

  // ── refs ──
  const sessionIdRef      = useRef("");
  const sceneNumberRef    = useRef(0);
  const sceneChoiceIdRef  = useRef("");
  const userIdRef         = useRef("");
  const generatingRef     = useRef(false);
  const animIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFullTextRef   = useRef("");
  const animOnDoneRef     = useRef<(() => void) | undefined>(undefined);
  const deadlineRef       = useRef("");

  // ─────────────────────────────────────
  // 初期化
  // ─────────────────────────────────────
  useEffect(() => {
    userIdRef.current = localStorage.getItem("userId") ?? "";
    init();
  }, []);

  const init = async () => {
    const { data: room } = await supabase
      .from("rooms").select("*").eq("id", roomId).single();
    if (!room) { setError("ルームが見つかりません"); return; }
    setRoomCode(room.code);

    const { data: session } = await supabase
      .from("novel_sessions").select("*").eq("room_id", roomId).maybeSingle();

    if (!session) {
      setPhase("choosing");
      return;
    }

    sessionIdRef.current   = session.id;
    sceneNumberRef.current = session.current_scene;
    setSceneNumber(session.current_scene);

    if (session.status === "completed") {
      router.push(`/result/${roomId}`);
      return;
    }

    if (session.status === "choice") {
      const { data: sc } = await supabase
        .from("scene_choices").select("*")
        .eq("novel_session_id", session.id)
        .eq("scene_number", session.current_scene - 1)
        .maybeSingle();
      if (sc) {
        sceneChoiceIdRef.current = sc.id;
        deadlineRef.current      = sc.vote_deadline ?? "";
        setChoices({ a: sc.choice_a, b: sc.choice_b });
        setDisplayText(session.full_text ?? "");
        setSceneLabel(SCENE_CHAPTER_LABELS[sc.scene_number] ?? "");
        setPhase("choosing");
        return;
      }
    }

    startGenerating();
  };

  // ─────────────────────────────────────
  // 生成開始
  // ─────────────────────────────────────
  const startGenerating = useCallback(async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setPhase("generating");
    setError("");
    setMyVote(null);
    setChoices(null);
    setVoteCountA(0);
    setVoteCountB(0);

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
          previousChoiceText = prev.winning_choice === "A" ? prev.choice_a : prev.choice_b;
        }
      }

      const res = await fetch("/api/novel/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, sceneNumber: scene, previousChoiceText }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "生成に失敗しました");
      }

      const data = await res.json();
      generatingRef.current = false;
      setSceneLabel(SCENE_CHAPTER_LABELS[scene] ?? "");

      if (data.completed) {
        animateText(data.text, () => {
          setTimeout(() => router.push(`/result/${roomId}`), 1500);
        });
      } else {
        sceneChoiceIdRef.current = data.sceneChoiceId ?? "";
        deadlineRef.current      = data.deadline ?? new Date(Date.now() + 30_000).toISOString();
        setChoices({ a: data.choices.a, b: data.choices.b });
        animateText(data.text, () => setPhase("choosing"));
      }
    } catch (err: any) {
      generatingRef.current = false;
      setError(err.message ?? "エラーが発生しました");
      setPhase("choosing");
    }
  }, []);

  // ─────────────────────────────────────
  // タイプライター演出
  // ─────────────────────────────────────
  const animateText = (text: string, onDone?: () => void) => {
    if (animIntervalRef.current) clearInterval(animIntervalRef.current);
    animFullTextRef.current = text;
    animOnDoneRef.current   = onDone;
    setPhase("reading");
    setDisplayText(text[0] ?? "");
    let i = 1;
    animIntervalRef.current = setInterval(() => {
      if (i >= text.length) {
        clearInterval(animIntervalRef.current!);
        animIntervalRef.current = null;
        onDone?.();
        return;
      }
      setDisplayText((d) => d + text[i]);
      i++;
    }, 18);
  };

  const skipAnimation = () => {
    if (phase !== "reading" || !animIntervalRef.current) return;
    clearInterval(animIntervalRef.current);
    animIntervalRef.current = null;
    setDisplayText(animFullTextRef.current);
    animOnDoneRef.current?.();
  };

  // ─────────────────────────────────────
  // 投票
  // ─────────────────────────────────────
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
          choice,
          roomId,
          userId: userIdRef.current,
        }),
      });
      const data = await res.json();

      if (data.completed) {
        router.push(`/result/${roomId}`);
        return;
      }

      sceneNumberRef.current = data.nextScene;
      setSceneNumber(data.nextScene);
      setDisplayText("");
      startGenerating();
    } catch (err: any) {
      setError(err.message ?? "投票に失敗しました");
      setMyVote(null);
      setPhase("choosing");
    }
  };

  // ─────────────────────────────────────
  // レンダリング
  // ─────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;500&display=swap');

        .room-root {
          min-height: 100svh;
          background: #0e0c0a;
          color: #f0ead8;
          display: flex;
          flex-direction: column;
        }

        /* ヘッダー */
        .room-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          background: rgba(14,12,10,0.9);
          border-bottom: 1px solid rgba(200,185,154,0.12);
          backdrop-filter: blur(8px);
          position: sticky;
          top: 0;
          z-index: 20;
          padding-top: max(12px, env(safe-area-inset-top));
        }
        .room-code-label {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.62rem;
          color: rgba(200,185,154,0.4);
          letter-spacing: 0.12em;
          margin-bottom: 2px;
        }
        .room-code {
          font-family: 'Shippori Mincho', serif;
          font-size: 1.1rem;
          font-weight: 500;
          color: rgba(200,185,154,0.85);
          letter-spacing: 0.25em;
        }
        .room-scene-label {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.62rem;
          color: rgba(200,185,154,0.4);
          letter-spacing: 0.12em;
          text-align: right;
          margin-bottom: 2px;
        }
        .room-scene {
          font-family: 'Shippori Mincho', serif;
          font-size: 1rem;
          color: rgba(240,234,216,0.7);
          text-align: right;
        }

        /* 進捗バー */
        .room-progress {
          display: flex;
          gap: 4px;
          padding: 8px 20px 0;
          background: #0e0c0a;
        }
        .room-prog-seg {
          flex: 1;
          height: 2px;
          border-radius: 2px;
          transition: background 0.4s;
        }
        .room-prog-done    { background: rgba(200,185,154,0.7); }
        .room-prog-current { background: rgba(200,185,154,0.35); }
        .room-prog-future  { background: rgba(200,185,154,0.1); }

        /* メイン */
        .room-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          position: relative;
          min-height: 0;
          height: calc(100svh - 80px);
        }

        /* 生成中 */
        .room-generating {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }
        @keyframes roomSpin {
          to { transform: rotate(360deg); }
        }
        .room-spinner {
          width: 32px;
          height: 32px;
          border: 2px solid rgba(200,185,154,0.15);
          border-top-color: rgba(200,185,154,0.6);
          border-radius: 50%;
          animation: roomSpin 0.9s linear infinite;
        }
        .room-gen-text {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.85rem;
          color: rgba(200,185,154,0.45);
          letter-spacing: 0.15em;
        }
        .room-gen-chapter {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.72rem;
          color: rgba(200,185,154,0.25);
          letter-spacing: 0.1em;
        }

        /* エラー */
        .room-error {
          margin: 16px 20px;
          background: rgba(192,57,43,0.1);
          border: 1px solid rgba(192,57,43,0.3);
          border-radius: 8px;
          padding: 14px 16px;
          font-family: 'Shippori Mincho', serif;
          font-size: 0.82rem;
          color: rgba(224,140,130,0.9);
          letter-spacing: 0.04em;
          line-height: 1.7;
        }
        .room-retry {
          margin-top: 8px;
          font-size: 0.72rem;
          color: rgba(200,185,154,0.5);
          text-decoration: underline;
          cursor: pointer;
          background: none;
          border: none;
          font-family: inherit;
          letter-spacing: 0.06em;
        }

        /* 投票待ち */
        .room-voting {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 24px;
          font-family: 'Shippori Mincho', serif;
          font-size: 0.82rem;
          color: rgba(200,185,154,0.4);
          letter-spacing: 0.12em;
        }

        /* スキップヒント */
        .room-skip-hint {
          position: absolute;
          bottom: 12px;
          right: 16px;
          font-family: 'Shippori Mincho', serif;
          font-size: 0.62rem;
          color: rgba(200,185,154,0.25);
          letter-spacing: 0.08em;
          pointer-events: none;
        }
      `}</style>

      <div className="room-root">
        {/* ヘッダー */}
        <header className="room-header">
          <div>
            <p className="room-code-label">合言葉</p>
            <p className="room-code">{roomCode}</p>
          </div>
          <div>
            <p className="room-scene-label">シーン</p>
            <p className="room-scene">
              {sceneNumber + 1} / 4
              {sceneLabel && <span style={{ marginLeft: "6px", opacity: 0.5 }}>「{sceneLabel}」</span>}
            </p>
          </div>
        </header>

        {/* 進捗バー */}
        <div className="room-progress">
          {MBTI_SCENES.map((s, i) => (
            <div
              key={s.dimension}
              className={`room-prog-seg ${
                i < sceneNumber
                  ? "room-prog-done"
                  : i === sceneNumber && phase !== "init"
                  ? "room-prog-current"
                  : "room-prog-future"
              }`}
            />
          ))}
        </div>

        {/* メインエリア */}
        <main
          className="room-main"
          onClick={phase === "reading" ? skipAnimation : undefined}
          style={{ cursor: phase === "reading" ? "pointer" : "default" }}
        >
          {/* エラー */}
          {error && (
            <div className="room-error">
              {error}
              <br />
              <button
                className="room-retry"
                onClick={() => { setError(""); startGenerating(); }}
              >
                再試行する
              </button>
            </div>
          )}

          {/* 生成中 */}
          {phase === "generating" && !error && (
            <div className="room-generating">
              <div className="room-spinner" />
              <p className="room-gen-text">物語を紡いでいます</p>
              {sceneLabel && (
                <p className="room-gen-chapter">
                  第{sceneNumber + 1}章「{sceneLabel}」
                </p>
              )}
            </div>
          )}

          {/* 物語テキスト */}
          {(phase === "reading" || phase === "choosing" || phase === "voting") && displayText && (
            <NovelViewer
              text={displayText}
              isGenerating={phase === "reading"}
            />
          )}

          {/* スキップヒント */}
          {phase === "reading" && (
            <p className="room-skip-hint">タップで全文表示</p>
          )}

          {/* 投票待ち */}
          {phase === "voting" && (
            <div className="room-voting">
              <div className="room-spinner" />
              <span>次のシーンを準備中…</span>
            </div>
          )}
        </main>

        {/* 選択肢パネル */}
        {phase === "choosing" && choices && (
          <ChoicePanel
            choice={{
              ...makeSceneChoice(choices, sceneNumber),
              vote_deadline: deadlineRef.current || new Date(Date.now() + 30_000).toISOString(),
            }}
            myVote={myVote}
            countA={voteCountA}
            countB={voteCountB}
            totalPlayers={1}
            onVote={(v) => handleVote(v)}
            onTimeUp={() => {
              if (!myVote) handleVote(Math.random() < 0.5 ? "A" : "B");
            }}
            isHost={true}
          />
        )}
      </div>
    </>
  );
}
