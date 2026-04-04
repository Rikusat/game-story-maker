"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import NovelViewer from "@/components/novel/NovelViewer";
import ChoicePanel from "@/components/novel/ChoicePanel";
import type { SceneChoice } from "@/types";

// ── ページタイプ ──────────────────────────────────────────
type PageType = "op" | "text" | "choice" | "summary" | "ending";
type Phase    = "init" | "lobby" | "generating" | "reading" | "voting" | "waiting" | "ending";

function getPageType(page: number): PageType {
  if (page === 0)  return "op";
  if (page === 16) return "ending";
  if (page === 15) return "summary";
  if (page % 2 === 0 && page >= 2 && page <= 14) return "choice";
  return "text";
}

// ─────────────────────────────────────────────────────────
export default function RoomPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const router         = useRouter();
  const supabase       = createClient();

  const [phase, setPhase]             = useState<Phase>("init");
  const [displayText, setDisplayText] = useState("");
  const [sceneChoice, setSceneChoice] = useState<SceneChoice | null>(null);
  const [myVote, setMyVote]           = useState<"A" | "B" | null>(null);
  const [voteCountA, setVoteCountA]   = useState(0);
  const [voteCountB, setVoteCountB]   = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [deadline, setDeadline]       = useState("");
  const [myReady, setMyReady]         = useState(false);
  const [readyCount, setReadyCount]       = useState(0);
  const [totalPlayers, setTotalPlayers]   = useState(1);
  const [humanCount, setHumanCount]       = useState(1);
  const [roomCode, setRoomCode]       = useState("");
  const [isSoloMode, setIsSoloMode]   = useState(false);
  const [error, setError]             = useState("");
  const [showChoicePanel, setShowChoicePanel] = useState(false);

  const sessionIdRef       = useRef("");
  const userIdRef          = useRef("");
  const isHostRef          = useRef(false);
  const generatingPageRef  = useRef<number | null>(null);
  const currentPageRef     = useRef(0);
  const sceneChoiceIdRef   = useRef("");
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const botIdsRef          = useRef<string[]>([]);
  const humanCountRef      = useRef(1);

  // ── 初期化 ──────────────────────────────────────────────
  useEffect(() => {
    userIdRef.current = localStorage.getItem("userId") ?? "";
    init();
    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, []);

  const init = async () => {
    const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();
    if (!room) { setError("ルームが見つかりません"); return; }
    setRoomCode(room.code ?? "");
    isHostRef.current = room.host_id === userIdRef.current;

    // localStorage でソロモード（ボットと遊ぶ）かどうかを確認
    const isSoloMode = localStorage.getItem(`soloMode_${roomId}`) === "1";
    setIsSoloMode(isSoloMode);
    if (isSoloMode) {
      humanCountRef.current = 1;
      setHumanCount(1);
    }

    const { data: players } = await supabase
      .from("room_players").select("*").eq("room_id", roomId).eq("is_active", true);
    setTotalPlayers((players ?? []).length);

    // is_bot フィールドで確実にボット判定（プロフィール名依存を排除）
    botIdsRef.current = (players ?? [])
      .filter((p: any) => p.is_bot)
      .map((p: any) => p.user_id as string);
    if (!isSoloMode) {
      const humanPlayers = (players ?? []).filter((p: any) => !p.is_bot);
      humanCountRef.current = humanPlayers.length;
      setHumanCount(humanPlayers.length);
    }

    // ── ゲーム開始前のロビー ────────────────────────────────
    if (room.status === "waiting") {
      setPhase("lobby");
      subscribeRoomStatus();
      return;
    }

    const { data: session } = await supabase
      .from("novel_sessions").select("*").eq("room_id", roomId).maybeSingle();
    if (!session) { setError("セッションが見つかりません"); return; }

    sessionIdRef.current    = session.id;
    const page              = session.current_page ?? 0;
    currentPageRef.current  = page;
    setCurrentPage(page);

    // ready カウント
    const readyPlayers = (players ?? []).filter(
      (p: any) => (p.ready_page ?? -1) >= page
    );
    setReadyCount(readyPlayers.length);

    if (session.status === "completed" && page !== 16) {
      router.push(`/result/${roomId}`); return;
    }

    await loadPageContent(session.id, page, session.status ?? "generating");

    // ページ16以外はRealtime購読
    if (page < 16) {
      subscribeRealtime(session.id);
    }
  };

  // ── ルームステータス購読（ロビー用）─────────────────────
  const subscribeRoomStatus = () => {
    if (realtimeChannelRef.current) return;
    const channel = supabase
      .channel(`room-lobby:${roomId}:${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        async (payload) => {
          if (payload.new.status === "playing") {
            // ロビー用チャンネルを切断してゲーム開始
            if (realtimeChannelRef.current) {
              supabase.removeChannel(realtimeChannelRef.current);
              realtimeChannelRef.current = null;
            }
            // セッション取得（サーバー側の書き込み遅延に備えてリトライ）
            let session = null;
            for (let i = 0; i < 6; i++) {
              const { data } = await supabase
                .from("novel_sessions").select("*").eq("room_id", roomId).maybeSingle();
              if (data) { session = data; break; }
              await new Promise((r) => setTimeout(r, 400));
            }
            if (!session) { setError("セッションが見つかりません"); return; }
            sessionIdRef.current   = session.id;
            const page             = session.current_page ?? 0;
            currentPageRef.current = page;
            setCurrentPage(page);
            await loadPageContent(session.id, page, session.status ?? "generating");
            if (page < 16) subscribeRealtime(session.id);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        async () => {
          const { data: players } = await supabase
            .from("room_players").select("*").eq("room_id", roomId).eq("is_active", true);
          setTotalPlayers((players ?? []).length);
        }
      )
      .subscribe();
    realtimeChannelRef.current = channel;
  };

  // ── ゲーム開始（ホストのみ）─────────────────────────────
  const handleStartGame = async () => {
    const userId = userIdRef.current;
    const res = await fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", roomId, userId }),
    });
    const data = await res.json();
    if (data.error) setError(data.error);
    // Realtime が rooms UPDATE を検知して init() を再実行
  };

  // ── ページコンテンツ取得 ─────────────────────────────────
  const loadPageContent = async (sessionId: string, page: number, status: string) => {
    const { data: arr } = await supabase
      .from("scene_choices")
      .select("*")
      .eq("novel_session_id", sessionId)
      .eq("page_number", page)
      .order("created_at", { ascending: false })
      .limit(1);

    const sc = arr?.[0] ?? null;

    if (sc) {
      setDisplayText(sc.story_segment ?? "");
      setDeadline(sc.vote_deadline ?? "");
      setSceneChoice(sc as SceneChoice);
      sceneChoiceIdRef.current = sc.id;

      const pt = getPageType(page);

      if (pt === "ending") {
        setPhase("ending");
        return;
      }

      if (pt === "choice") {
        const { data: votes } = await supabase
          .from("votes").select("*").eq("scene_choice_id", sc.id);
        const myPrev = (votes ?? []).find((v: any) => v.user_id === userIdRef.current);
        setMyVote(myPrev?.choice ?? null);
        setVoteCountA((votes ?? []).filter((v: any) => v.choice === "A").length);
        setVoteCountB((votes ?? []).filter((v: any) => v.choice === "B").length);
        setPhase(myPrev ? "voting" : "reading");
        return;
      }

      setPhase("reading");
    } else {
      // コンテンツ未生成
      setPhase("generating");
      if (isHostRef.current && generatingPageRef.current !== page) {
        generatingPageRef.current = page;
        startGenerating(page);
      }
    }
  };

  // ── 生成 ────────────────────────────────────────────────
  const startGenerating = useCallback(async (pageNumber: number) => {
    setPhase("generating");
    setError("");
    setMyVote(null);
    setMyReady(false);
    setSceneChoice(null);
    setShowChoicePanel(false);
    sceneChoiceIdRef.current = "";
    setVoteCountA(0);
    setVoteCountB(0);

    // 直前の選択肢テキストを取得
    let previousChoiceText = "";
    try {
      const { data: prevChoices } = await supabase
        .from("scene_choices")
        .select("*")
        .eq("novel_session_id", sessionIdRef.current)
        .not("winning_choice", "is", null)
        .lt("page_number", pageNumber)
        .order("page_number", { ascending: false })
        .limit(1);
      if (prevChoices && prevChoices.length > 0) {
        const prev = prevChoices[0];
        previousChoiceText = prev.winning_choice === "A"
          ? (prev.choice_a ?? "") : (prev.choice_b ?? "");
      }
    } catch { /* 無視 */ }

    try {
      const res = await fetch("/api/novel/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          pageNumber,
          previousChoiceText,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "生成に失敗しました");
      }

      const data = await res.json();

      setDisplayText(data.text ?? "");

      if (data.completed) {
        // ページ16（ED）
        setDeadline("");
        setPhase("ending");
        // Realtimeは session update イベントで切断
        return;
      }

      if (data.choices) {
        // CHOICEページ
        const sc: SceneChoice = {
          id:                data.sceneChoiceId ?? "",
          novel_session_id:  sessionIdRef.current,
          scene_number:      pageNumber,
          page_number:       pageNumber,
          story_segment:     data.text ?? "",
          choice_a:          data.choices.a,
          choice_b:          data.choices.b,
          vote_deadline:     data.deadline ?? "",
          winning_choice:    null,
          created_at:        new Date().toISOString(),
        };
        setSceneChoice(sc);
        sceneChoiceIdRef.current = sc.id;
        setDeadline(data.deadline ?? "");
      } else {
        // TEXTページ
        setDeadline(data.deadline ?? new Date(Date.now() + 60_000).toISOString());
      }

      setPhase("reading");
    } catch (err: any) {
      generatingPageRef.current = null;
      setError(err.message ?? "エラーが発生しました");
    }
  }, []);

  // ── Realtime 購読 ────────────────────────────────────────
  const subscribeRealtime = useCallback((sessionId: string) => {
    if (realtimeChannelRef.current) return; // 既に購読済み

    const channel = supabase
      .channel(`room-game:${roomId}:${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "novel_sessions", filter: `id=eq.${sessionId}` },
        (payload) => handleSessionUpdate(payload)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        () => handlePlayersUpdate()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "votes" },
        (payload) => handleVoteInsert(payload)
      )
      .subscribe();

    realtimeChannelRef.current = channel;
  }, []);

  // ── session 変化ハンドラ ──────────────────────────────────
  const handleSessionUpdate = async (payload: any) => {
    const session  = payload.new;
    const newPage  = session.current_page as number;
    const newStatus = session.status as string;

    if (newPage !== currentPageRef.current) {
      // ページ変化
      currentPageRef.current = newPage;
      setCurrentPage(newPage);
      setMyVote(null);
      setMyReady(false);
      setReadyCount(0);
      setSceneChoice(null);
      setShowChoicePanel(false);
      sceneChoiceIdRef.current = "";
      setDisplayText("");
      setVoteCountA(0);
      setVoteCountB(0);

      if (newPage === 16 || newStatus === "completed") {
        // Realtime 切断
        if (realtimeChannelRef.current) {
          supabase.removeChannel(realtimeChannelRef.current);
          realtimeChannelRef.current = null;
        }
      }

      if (newStatus === "generating") {
        setPhase("generating");
        if (isHostRef.current && generatingPageRef.current !== newPage) {
          generatingPageRef.current = newPage;
          startGenerating(newPage);
        }
      } else {
        await loadPageContent(sessionIdRef.current, newPage, newStatus);
      }
    } else {
      // 同じページ、statusのみ変化（generating→reading/choice/completed）
      if (
        newStatus === "reading" ||
        newStatus === "choice" ||
        newStatus === "completed"
      ) {
        await loadPageContent(sessionIdRef.current, newPage, newStatus);
      }
    }
  };

  // ── room_players 変化ハンドラ ─────────────────────────────
  const handlePlayersUpdate = async () => {
    const pt = getPageType(currentPageRef.current);
    if (pt === "choice") return; // CHOICEページはready_page不使用

    const { data: players } = await supabase
      .from("room_players").select("*").eq("room_id", roomId).eq("is_active", true);
    const active = players ?? [];
    setTotalPlayers(active.length);

    // is_bot で確実にボット除外
    const humanActive = active.filter((p: any) => !p.is_bot);
    humanCountRef.current = humanActive.length;
    setHumanCount(humanActive.length);

    const ready = humanActive.filter(
      (p: any) => (p.ready_page ?? -1) >= currentPageRef.current
    );
    setReadyCount(ready.length);

    if (ready.length >= humanActive.length && humanActive.length > 0) {
      advancePage();
    }
  };

  // ── 投票 INSERT ハンドラ ──────────────────────────────────
  const handleVoteInsert = async (payload: any) => {
    const vote = payload.new;
    if (vote.scene_choice_id !== sceneChoiceIdRef.current) return;

    const { data: votes } = await supabase
      .from("votes").select("choice").eq("scene_choice_id", sceneChoiceIdRef.current);
    setVoteCountA((votes ?? []).filter((v: any) => v.choice === "A").length);
    setVoteCountB((votes ?? []).filter((v: any) => v.choice === "B").length);
  };

  // ── テキストページ「次へ」 ────────────────────────────────
  const handleNextButton = async () => {
    if (myReady) return;

    const pageNumber = currentPageRef.current;
    const nextPage   = pageNumber + 1;

    // ── 1人プレイ（ボットモード）：待機なしで即座に進む ──
    if (humanCountRef.current <= 1) {
      currentPageRef.current = nextPage;
      setCurrentPage(nextPage);
      setMyVote(null);
      setMyReady(false);
      setReadyCount(0);
      setSceneChoice(null);
      setShowChoicePanel(false);
      sceneChoiceIdRef.current = "";
      setDisplayText("");
      setVoteCountA(0);
      setVoteCountB(0);
      setPhase("generating");
      if (isHostRef.current && generatingPageRef.current !== nextPage) {
        generatingPageRef.current = nextPage;
        startGenerating(nextPage);
      }
      // DB のセッション状態をバックグラウンドで更新
      fetch("/api/vote", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "advance-page",
          sessionId: sessionIdRef.current,
          nextPage,
        }),
      }).catch(() => {});
      return;
    }

    // ── 複数人プレイ：全員の「次へ」を待つ ───────────────
    setMyReady(true);
    setPhase("waiting");

    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:     "player-ready",
          sessionId:  sessionIdRef.current,
          roomId,
          userId:     userIdRef.current,
          pageNumber,
        }),
      });
      const data = await res.json();

      // 全員 ready → Realtime を待たずにクライアント側でも即座にページ進行
      if (data.allReady) {
        currentPageRef.current = nextPage;
        setCurrentPage(nextPage);
        setMyVote(null);
        setMyReady(false);
        setReadyCount(0);
        setSceneChoice(null);
        setShowChoicePanel(false);
        sceneChoiceIdRef.current = "";
        setDisplayText("");
        setVoteCountA(0);
        setVoteCountB(0);
        setPhase("generating");
        if (isHostRef.current && generatingPageRef.current !== nextPage) {
          generatingPageRef.current = nextPage;
          startGenerating(nextPage);
        }
      }
    } catch { /* Realtime フォールバックで進行 */ }
  };

  // ── ページ進行 ────────────────────────────────────────────
  const advancePage = async () => {
    const nextPage = currentPageRef.current + 1;
    await fetch("/api/vote", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "advance-page",
        sessionId: sessionIdRef.current,
        nextPage,
      }),
    });
  };

  // ── テキストページ タイムアウト ──────────────────────────
  const handleTextTimeout = useCallback(() => {
    if (!myReady) handleNextButton();
  }, [myReady]);

  // ── 投票 ─────────────────────────────────────────────────
  const handleVote = async (choice: "A" | "B") => {
    if (myVote || !sceneChoice) return;
    setMyVote(choice);
    setPhase("voting");
    if (choice === "A") setVoteCountA((n) => n + 1);
    else                setVoteCountB((n) => n + 1);

    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneChoiceId: sceneChoice.id,
          choice, roomId,
          userId: userIdRef.current,
        }),
      });
      const data = await res.json();

      // ソロモード: APIレスポンスで即座にページ進行（Realtimeを待たない）
      if (humanCountRef.current <= 1 && data.nextPage > currentPageRef.current) {
        const nextPage = data.nextPage as number;
        currentPageRef.current = nextPage;
        setCurrentPage(nextPage);
        setMyVote(null);
        setSceneChoice(null);
        setShowChoicePanel(false);
        sceneChoiceIdRef.current = "";
        setDisplayText("");
        setVoteCountA(0);
        setVoteCountB(0);
        setPhase("generating");
        if (isHostRef.current && generatingPageRef.current !== nextPage) {
          generatingPageRef.current = nextPage;
          startGenerating(nextPage);
        }
      }
    } catch (err: any) {
      setError(err.message ?? "投票に失敗しました");
      setMyVote(null);
      setPhase("reading");
    }
  };

  // ── 投票タイムアウト ─────────────────────────────────────
  const handleVoteTimeout = useCallback(() => {
    if (!myVote) handleVote(Math.random() < 0.5 ? "A" : "B");
  }, [myVote, sceneChoice]);

  // ── ED「次へ」 ────────────────────────────────────────────
  const handleEndingNext = () => {
    router.push(`/result/${roomId}`);
  };

  const pageType = getPageType(currentPage);

  // ── UI ──────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400&family=Shippori+Mincho:wght@400;500&display=swap');

        .rp-root {
          min-height: 100svh;
          background: #faf8f4;
          color: #1a1612;
          display: flex;
          flex-direction: column;
        }

        /* ヘッダー */
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
        .rp-code-hint, .rp-scene-hint {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.6rem;
          color: rgba(26,22,18,0.35);
          letter-spacing: 0.14em;
          margin-bottom: 2px;
        }
        .rp-scene-hint { text-align: right; }
        .rp-code {
          font-family: 'Shippori Mincho', serif;
          font-size: 1.05rem;
          font-weight: 500;
          color: rgba(26,22,18,0.75);
          letter-spacing: 0.2em;
        }
        .rp-scene {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.95rem;
          color: rgba(26,22,18,0.65);
          text-align: right;
          letter-spacing: 0.08em;
        }

        /* 進捗バー */
        .rp-progress {
          display: flex;
          gap: 3px;
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

        /* メイン */
        .rp-main {
          flex: 1;
          position: relative;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        /* 生成中 */
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
          width: 28px; height: 28px;
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

        /* エラー */
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

        /* 待機中 */
        .rp-waiting {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 16px 24px;
          font-family: 'Shippori Mincho', serif;
          font-size: 0.8rem;
          color: rgba(26,22,18,0.35);
          letter-spacing: 0.12em;
        }

        /* フッター共通 */
        .rp-footer {
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
        .rp-next-btn:disabled {
          opacity: 0.45;
          cursor: default;
        }

        /* カウントダウンバー */
        .rp-countdown-bar {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .rp-cd-track {
          flex: 1; height: 2px;
          background: rgba(26,22,18,0.08);
          border-radius: 2px;
          overflow: hidden;
        }
        .rp-cd-fill {
          height: 100%;
          background: rgba(26,22,18,0.2);
          border-radius: 2px;
          transition: width 1s linear;
        }
        .rp-cd-sec {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.68rem;
          color: rgba(26,22,18,0.28);
          letter-spacing: 0.06em;
          min-width: 32px;
          text-align: right;
        }

        /* ready カウント */
        .rp-ready-label {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.68rem;
          color: rgba(26,22,18,0.35);
          letter-spacing: 0.1em;
          text-align: center;
        }
      `}</style>

      <div className="rp-root">
        {/* ヘッダー */}
        <header className="rp-header">
          {!isSoloMode && (
          <div>
            <p className="rp-code-hint">合言葉</p>
            <p className="rp-code">{roomCode || "…"}</p>
          </div>
          )}
          <div>
            <p className="rp-scene-hint">ページ</p>
            <p className="rp-scene">{currentPage} / 16</p>
          </div>
        </header>

        {/* 進捗バー（17分割） */}
        <div className="rp-progress">
          {Array.from({ length: 17 }, (_, i) => (
            <div
              key={i}
              className={`rp-prog-seg ${
                i < currentPage
                  ? "rp-prog-done"
                  : i === currentPage && phase !== "init"
                  ? "rp-prog-current"
                  : "rp-prog-future"
              }`}
            />
          ))}
        </div>

        {/* ロビー */}
        {phase === "lobby" && (
          <main className="rp-main" style={{ alignItems: "center", justifyContent: "center", display: "flex", flexDirection: "column", gap: 24, padding: "40px 24px" }}>
            {!isSoloMode && (
              <>
                <p style={{ fontFamily: "'Shippori Mincho', serif", fontSize: "0.72rem", color: "rgba(26,22,18,0.35)", letterSpacing: "0.14em" }}>合言葉</p>
                <p style={{ fontFamily: "'Shippori Mincho', serif", fontSize: "2.4rem", fontWeight: 500, letterSpacing: "0.3em", color: "rgba(26,22,18,0.8)" }}>{roomCode}</p>
              </>
            )}
            <p style={{ fontFamily: "'Shippori Mincho', serif", fontSize: "0.78rem", color: "rgba(26,22,18,0.4)", letterSpacing: "0.1em" }}>
              参加者 {totalPlayers} 人
            </p>
            {isHostRef.current ? (
              <button
                onClick={handleStartGame}
                style={{
                  marginTop: 16,
                  fontFamily: "'Shippori Mincho', serif",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  letterSpacing: "0.18em",
                  color: "rgba(26,22,18,0.85)",
                  background: "#faf8f4",
                  border: "1px solid rgba(26,22,18,0.3)",
                  borderRadius: "100px",
                  padding: "12px 32px",
                  cursor: "pointer",
                }}
              >
                ゲームを始める
              </button>
            ) : (
              <p style={{ fontFamily: "'Shippori Mincho', serif", fontSize: "0.8rem", color: "rgba(26,22,18,0.35)", letterSpacing: "0.12em" }}>
                ホストを待っています…
              </p>
            )}
            {error && <p style={{ color: "rgba(160,40,30,0.85)", fontSize: "0.8rem" }}>{error}</p>}
          </main>
        )}

        {/* メイン */}
        {phase !== "lobby" && <main className="rp-main">
          {/* エラー */}
          {error && (
            <div className="rp-error">
              {error}
              <br />
              <button
                className="rp-retry"
                onClick={() => {
                  setError("");
                  if (isHostRef.current) startGenerating(currentPage);
                }}
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
            </div>
          )}

          {/* テキスト表示 */}
          {(phase === "reading" ||
            phase === "voting" ||
            phase === "waiting" ||
            phase === "ending") &&
            displayText && (
              <>
                <NovelViewer text={displayText} isGenerating={false} />
                {/* ChoicePanel表示中の高さ分だけ余白を確保して文章が隠れないようにする */}
                {pageType === "choice" && showChoicePanel && (
                  <div style={{ height: "280px", flexShrink: 0 }} aria-hidden />
                )}
              </>
            )}

          {/* 投票待ち表示（CHOICEページ投票後） */}
          {phase === "voting" && (
            <div className="rp-waiting">
              <div className="rp-spinner" />
              <span>相手の選択を待っています…</span>
            </div>
          )}

          {/* 待機表示（TEXTページ「次へ」後） */}
          {phase === "waiting" && (
            <div className="rp-waiting">
              <div className="rp-spinner" />
              <span>他のプレイヤーを待っています… ({readyCount}/{humanCount})</span>
            </div>
          )}
        </main>}

        {/* CHOICEページ：「行方を選択する」ボタン → ChoicePanel */}
        {phase !== "lobby" && phase === "reading" && pageType === "choice" && sceneChoice && (
          <>
            {!showChoicePanel && (
              <div className="rp-footer">
                <button
                  className="rp-next-btn"
                  onClick={() => setShowChoicePanel(true)}
                >
                  行方を選択する →
                </button>
              </div>
            )}
            {showChoicePanel && (
              <ChoicePanel
                choice={sceneChoice}
                myVote={myVote}
                countA={voteCountA}
                countB={voteCountB}
                totalPlayers={totalPlayers}
                onVote={handleVote}
                onTimeUp={handleVoteTimeout}
                isHost={isHostRef.current}
                isSolo={humanCount <= 1}
              />
            )}
          </>
        )}

        {/* テキストページ・OP・SUMMARY：次へボタン＋カウントダウン */}
        {(phase === "reading" || phase === "waiting") &&
          pageType !== "choice" &&
          pageType !== "ending" && (
            <div className="rp-footer">
              <button
                className="rp-next-btn"
                onClick={handleNextButton}
                disabled={myReady}
              >
                {myReady ? `待機中… (${readyCount}/${humanCount})` : "次へ →"}
              </button>
              {deadline && !isSoloMode && (
                <CountdownBar
                  deadline={deadline}
                  onTimeout={handleTextTimeout}
                />
              )}
            </div>
          )}

        {/* EDページ：次へボタンのみ */}
        {phase === "ending" && (
          <div className="rp-footer">
            <button className="rp-next-btn" onClick={handleEndingNext}>
              次へ →
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── カウントダウンバー ────────────────────────────────────
function CountdownBar({
  deadline,
  onTimeout,
}: {
  deadline: string;
  onTimeout: () => void;
}) {
  const TOTAL_MS        = 60_000;
  const [pct, setPct]   = useState(100);
  const [sec, setSec]   = useState(60);
  const firedRef        = useRef(false);

  useEffect(() => {
    if (!deadline) return;
    firedRef.current = false;

    const update = () => {
      const rem = Math.max(0, new Date(deadline).getTime() - Date.now());
      setPct((rem / TOTAL_MS) * 100);
      setSec(Math.ceil(rem / 1000));
      if (rem === 0 && !firedRef.current) {
        firedRef.current = true;
        onTimeout();
      }
    };
    update();
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, [deadline]);

  return (
    <div className="rp-countdown-bar">
      <div className="rp-cd-track">
        <div className="rp-cd-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="rp-cd-sec">{sec > 0 ? `${sec}秒` : ""}</span>
    </div>
  );
}
