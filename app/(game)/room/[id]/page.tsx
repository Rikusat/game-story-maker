"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useRoom } from "@/lib/hooks/useRoom";
import { useVote } from "@/lib/hooks/useVote";
import NovelViewer from "@/components/novel/NovelViewer";
import ChoicePanel from "@/components/novel/ChoicePanel";
import BookCloseEffect from "@/components/novel/BookCloseEffect";
import PlayerList from "@/components/room/PlayerList";
import ReactionStamp from "@/components/room/ReactionStamp";
import { MBTI_SCENES } from "@/types";

export default function RoomPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState("");
  const [displayText, setDisplayText] = useState("");
  const [streamBody, setStreamBody] = useState<string | null>(null);
  const [showBookClose, setShowBookClose] = useState(false);
  const streamingRef = useRef(false);

  const { room, players, session, currentChoice, refetch } = useRoom(roomId);
  const { myVote, countA, countB, votes, castVote } = useVote(
    currentChoice?.id ?? null,
    roomId,
    userId
  );

  const isHost = room?.host_id === userId;
  const isGenerating = session?.status === "generating";
  const isChoice = session?.status === "choice";
  const isCompleted = session?.status === "completed";

  // 現在のユーザーID取得
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  // session のテキストを displayText へ反映
  useEffect(() => {
    if (session?.full_text) setDisplayText(session.full_text);
  }, [session?.full_text]);

  // ホストが generating になったらストリームを開始
  useEffect(() => {
    if (!isHost || !session || session.status !== "generating" || streamingRef.current) return;
    streamingRef.current = true;

    const sceneNumber = session.current_scene;
    const isLastScene = sceneNumber >= 3;

    // 直前シーンの勝利選択肢テキストを取得してコンテキストに
    (async () => {
      let previousChoiceText = "";
      if (sceneNumber > 0) {
        const { data: prevChoice } = await supabase
          .from("scene_choices")
          .select("*")
          .eq("novel_session_id", session.id)
          .eq("scene_number", sceneNumber - 1)
          .maybeSingle();
        if (prevChoice?.winning_choice) {
          previousChoiceText =
            prevChoice.winning_choice === "A"
              ? prevChoice.choice_a
              : prevChoice.choice_b;
        }
      }

      setStreamBody(
        JSON.stringify({ sessionId: session.id, sceneNumber, previousChoiceText })
      );
    })();
  }, [session?.status, session?.current_scene, isHost]);

  // ストリーム完了ハンドラ
  const handleStreamDone = (data: {
    sceneChoiceId?: string;
    deadline?: string;
    completed?: boolean;
  }) => {
    streamingRef.current = false;
    setStreamBody(null);
    if (data.completed) {
      setShowBookClose(true);
    }
    refetch();
  };

  // ストリームチャンク受信（表示 + DBは API 側が 1 秒バッチで更新）
  const handleStreamChunk = (chunk: string) => {
    setDisplayText((t) => t + chunk);
  };

  // ゲーム開始（ホストのみ）
  const handleStart = async () => {
    const res = await fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", roomId }),
    });
    await res.json();
    refetch();
  };

  // タイマー切れ集計（ホストのみ）
  const handleTimeUp = async () => {
    if (!currentChoice) return;
    await fetch("/api/vote", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneChoiceId: currentChoice.id, roomId }),
    });
    refetch();
  };

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <span className="text-gray-400">読み込み中…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col md:flex-row">
      {showBookClose && (
        <BookCloseEffect
          mbtiResult={session?.mbti_result}
          onDone={() => router.push(`/result/${roomId}`)}
        />
      )}

      {/* サイドバー */}
      <aside className="md:w-64 bg-gray-900 border-b md:border-b-0 md:border-r border-gray-800 p-4 flex flex-col gap-4">
        {/* ルームコード */}
        <div className="text-center">
          <p className="text-gray-400 text-xs">ルームコード</p>
          <p className="text-2xl font-bold text-indigo-300 tracking-widest">{room.code}</p>
        </div>

        {/* シーン進捗 */}
        {session && (
          <div>
            <p className="text-gray-400 text-xs mb-1">進捗</p>
            <div className="flex gap-1">
              {MBTI_SCENES.map((s, i) => (
                <div
                  key={s.dimension}
                  className={`flex-1 h-1.5 rounded-full ${
                    i < session.current_scene
                      ? "bg-indigo-400"
                      : i === session.current_scene && session.status !== "completed"
                      ? "bg-indigo-600 animate-pulse"
                      : "bg-gray-700"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* プレイヤー一覧 */}
        <div>
          <p className="text-gray-400 text-xs mb-2">プレイヤー</p>
          <PlayerList
            players={players}
            hostId={room.host_id}
            currentUserId={userId}
            votes={votes}
          />
        </div>

        {/* ゲーム開始ボタン（待機中のホストのみ） */}
        {room.status === "waiting" && isHost && (
          <button
            onClick={handleStart}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl mt-auto transition-colors"
          >
            ゲーム開始
          </button>
        )}

        {room.status === "waiting" && !isHost && (
          <p className="text-gray-500 text-sm text-center mt-auto">
            ホストの開始を待っています…
          </p>
        )}

        {/* スタンプ */}
        {room.status === "playing" && (
          <div>
            <p className="text-gray-400 text-xs mb-2">リアクション</p>
            <ReactionStamp roomId={roomId} />
          </div>
        )}
      </aside>

      {/* メインエリア */}
      <main className="flex-1 flex flex-col min-h-0">
        {room.status === "waiting" ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <p className="text-6xl mb-4">📖</p>
            <p className="text-gray-300 text-xl mb-2">冒険が始まるのを待っています</p>
            <p className="text-gray-500">
              コード <span className="text-indigo-300 font-bold">{room.code}</span> を友達に教えよう
            </p>
          </div>
        ) : (
          <>
            {/* ストーリー表示 */}
            <div className="flex-1 overflow-hidden">
              <NovelViewer
                text={displayText}
                isGenerating={isGenerating}
                streamUrl={isHost && streamBody ? streamBody : null}
                onStreamChunk={handleStreamChunk}
                onStreamDone={handleStreamDone}
              />
            </div>

            {/* 選択肢パネル */}
            {isChoice && currentChoice && (
              <div className="p-4 md:p-6">
                <ChoicePanel
                  choice={currentChoice}
                  myVote={myVote}
                  countA={countA}
                  countB={countB}
                  totalPlayers={players.length}
                  onVote={castVote}
                  onTimeUp={handleTimeUp}
                  isHost={isHost}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
