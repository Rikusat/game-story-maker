"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { MBTI_SCENES } from "@/types";

const SCENE_CHAPTER_LABELS = ["起", "承", "転", "結"];

type Phase = "init" | "generating" | "reading" | "choosing" | "voting";

interface Choices {
  a: string;
  b: string;
}

export default function RoomPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  // ゲーム状態
  const [phase, setPhase] = useState<Phase>("init");
  const [displayText, setDisplayText] = useState("");
  const [choices, setChoices] = useState<Choices | null>(null);
  const [myVote, setMyVote] = useState<"A" | "B" | null>(null);
  const [sceneNumber, setSceneNumber] = useState(0);
  const [sceneLabel, setSceneLabel] = useState("");
  const [error, setError] = useState("");
  const [roomCode, setRoomCode] = useState("");

  // refs（再レンダリングをまたぐ値）
  const sessionIdRef = useRef("");
  const sceneNumberRef = useRef(0);
  const sceneChoiceIdRef = useRef("");
  const userIdRef = useRef("");
  const generatingRef = useRef(false);
  const animIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFullTextRef = useRef("");
  const animOnDoneRef = useRef<(() => void) | undefined>(undefined);

  // ─────────────────────────────────────
  // 初期化: ルーム・セッション取得
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
      // waiting（まだ開始していない）
      setPhase("choosing"); // ← 開始ボタン表示のため
      return;
    }

    sessionIdRef.current = session.id;
    sceneNumberRef.current = session.current_scene;
    setSceneNumber(session.current_scene);

    if (session.status === "completed") {
      router.push(`/result/${roomId}`);
      return;
    }

    if (session.status === "choice") {
      // 既存の選択肢を復元
      const { data: sc } = await supabase
        .from("scene_choices").select("*")
        .eq("novel_session_id", session.id)
        .eq("scene_number", session.current_scene - 1)
        .maybeSingle();
      if (sc) {
        sceneChoiceIdRef.current = sc.id;
        setChoices({ a: sc.choice_a, b: sc.choice_b });
        setDisplayText(session.full_text ?? "");
        setSceneLabel(SCENE_CHAPTER_LABELS[sc.scene_number] ?? "");
        setPhase("choosing");
        return;
      }
    }

    // status === "generating" → 生成開始
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

    try {
      const scene = sceneNumberRef.current;
      const sid = sessionIdRef.current;

      // 直前シーンの勝利選択肢を取得
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
    animOnDoneRef.current = onDone;
    setPhase("reading");
    setDisplayText(text[0] ?? ""); // 1文字目を即時表示
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
  // 選択肢を選ぶ
  // ─────────────────────────────────────
  const handleVote = async (choice: "A" | "B") => {
    if (myVote || phase !== "choosing") return;
    setMyVote(choice);
    setPhase("voting");

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

      // 次シーンへ
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
  const progressBar = (
    <div className="flex gap-1 mb-4">
      {MBTI_SCENES.map((s, i) => (
        <div
          key={s.dimension}
          className={`flex-1 h-1.5 rounded-full transition-colors ${
            i < sceneNumber
              ? "bg-indigo-400"
              : i === sceneNumber && phase !== "init"
              ? "bg-indigo-600 animate-pulse"
              : "bg-gray-700"
          }`}
        />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* ヘッダー */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">ルームコード</p>
          <p className="text-lg font-bold text-indigo-300 tracking-widest">{roomCode}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">シーン</p>
          <p className="text-lg font-bold text-gray-200">{sceneNumber + 1} / 4</p>
        </div>
      </header>

      {/* 進捗バー */}
      <div className="px-6 pt-3">{progressBar}</div>

      {/* メインコンテンツ */}
      <main className="flex-1 flex flex-col px-6 py-4 max-w-2xl mx-auto w-full">
        {/* エラー */}
        {error && (
          <div className="mb-4 bg-red-900/40 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
            <p>{error}</p>
            <button
              onClick={() => { setError(""); startGenerating(); }}
              className="mt-2 text-red-400 underline text-xs"
            >
              再試行
            </button>
          </div>
        )}

        {/* 生成中 */}
        {phase === "generating" && !error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <span className="animate-spin text-4xl text-indigo-400">✦</span>
            <p className="text-gray-400 text-lg">物語を紡いでいます…</p>
            {sceneLabel && (
              <p className="text-gray-600 text-sm">第{sceneNumber + 1}章「{sceneLabel}」</p>
            )}
          </div>
        )}

        {/* テキスト表示 */}
        {(phase === "reading" || phase === "choosing" || phase === "voting") && displayText && (
          <div
            className="flex-1 overflow-y-auto mb-6 cursor-pointer select-none"
            onClick={skipAnimation}
          >
            <p className="text-gray-100 text-lg leading-relaxed whitespace-pre-wrap font-serif">
              {displayText}
              {phase === "reading" && (
                <span className="inline-block w-0.5 h-5 bg-indigo-400 ml-0.5 animate-pulse" />
              )}
            </p>
            {phase === "reading" && (
              <p className="text-gray-600 text-xs text-right mt-2">タップで全文表示</p>
            )}
          </div>
        )}

        {/* 選択肢 */}
        {phase === "choosing" && choices && (
          <div className="mt-auto">
            {sceneLabel && (
              <p className="text-center text-indigo-400 text-sm font-medium mb-3">
                第{sceneNumber + 1}章「{sceneLabel}」— あなたはどうする？
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {(["A", "B"] as const).map((v) => {
                const label = v === "A" ? choices.a : choices.b;
                return (
                  <button
                    key={v}
                    onClick={() => handleVote(v)}
                    className="bg-gray-800 hover:bg-indigo-900/60 border border-gray-700 hover:border-indigo-500 rounded-xl p-4 text-left transition-all cursor-pointer"
                  >
                    <span className="text-xs text-indigo-400 font-bold block mb-1">
                      選択 {v}
                    </span>
                    <span className="text-gray-100 text-sm leading-snug">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 投票中（集計待ち） */}
        {phase === "voting" && (
          <div className="mt-auto flex items-center justify-center gap-3 py-6 text-gray-400">
            <span className="animate-spin text-xl text-indigo-400">✦</span>
            <span>次のシーンを準備中…</span>
          </div>
        )}
      </main>
    </div>
  );
}
