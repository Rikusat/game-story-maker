"use client";

import { useEffect, useState } from "react";
import type { SceneChoice, VoteChoice } from "@/types";

interface Props {
  choice: SceneChoice;
  myVote: VoteChoice | null;
  countA: number;
  countB: number;
  totalPlayers: number;
  onVote: (v: VoteChoice) => void;
  onTimeUp: () => void;
  isHost: boolean;
}

export default function ChoicePanel({
  choice,
  myVote,
  countA,
  countB,
  totalPlayers,
  onVote,
  onTimeUp,
  isHost,
}: Props) {
  const [seconds, setSeconds] = useState(30);
  const [visible, setVisible] = useState(false);

  // ── タイマー（既存ロジック維持） ──
  useEffect(() => {
    if (!choice.vote_deadline) return;
    const update = () => {
      const rem = Math.max(
        0,
        Math.ceil((new Date(choice.vote_deadline!).getTime() - Date.now()) / 1000)
      );
      setSeconds(rem);
      if (rem === 0 && isHost) onTimeUp();
    };
    update();
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, [choice.vote_deadline, isHost]);

  // ── 巻物展開アニメーション ──
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  const total = countA + countB;
  const pctA  = total ? Math.round((countA / total) * 100) : 50;
  const pctB  = 100 - pctA;
  const isUrgent = seconds <= 10;

  // タイマーの円弧計算
  const RADIUS = 22;
  const CIRC   = 2 * Math.PI * RADIUS;
  const progress = seconds / 30;
  const dashOffset = CIRC * (1 - progress);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400&family=Shippori+Mincho:wght@400;500&display=swap');

        .cp-panel {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 100;
          background: linear-gradient(180deg, #1a1510 0%, #1f1a14 100%);
          border-top: 1px solid rgba(200,185,154,0.2);
          border-radius: 16px 16px 0 0;
          box-shadow: 0 -4px 40px rgba(0,0,0,0.6), 0 -1px 0 rgba(200,185,154,0.1);
          transform: translateY(100%);
          opacity: 0;
          transition: transform 0.45s cubic-bezier(0.16,1,0.3,1), opacity 0.35s ease;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .cp-panel.cp-visible {
          transform: translateY(0);
          opacity: 1;
        }

        /* 上端の巻物装飾 */
        .cp-scroll-top {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 20px 0;
        }
        .cp-rod {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(200,185,154,0.35), transparent);
        }
        .cp-label {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.68rem;
          letter-spacing: 0.22em;
          color: rgba(200,185,154,0.45);
          white-space: nowrap;
        }

        .cp-inner {
          padding: 14px 20px 20px;
          max-width: 600px;
          margin: 0 auto;
        }

        /* ヘッダー：タイマー + 投票状況 */
        .cp-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 14px;
        }
        .cp-timer-wrap {
          position: relative;
          width: 56px;
          height: 56px;
          flex-shrink: 0;
        }
        .cp-timer-num {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Shippori Mincho', serif;
          font-size: 1.05rem;
          font-weight: 500;
          color: #c8b99a;
          transition: color 0.3s;
        }
        .cp-timer-num.urgent {
          color: #c0392b;
          animation: cpUrgentPulse 0.6s ease-in-out infinite alternate;
        }
        @keyframes cpUrgentPulse {
          from { opacity: 0.7; transform: scale(0.95); }
          to   { opacity: 1;   transform: scale(1.05); }
        }
        .cp-vote-status {
          display: flex;
          align-items: baseline;
          gap: 3px;
        }
        .cp-vote-count {
          font-family: 'Shippori Mincho', serif;
          font-size: 1.5rem;
          font-weight: 500;
          color: #f0ead8;
          line-height: 1;
        }
        .cp-vote-slash { color: rgba(240,234,216,0.25); font-size: 1rem; }
        .cp-vote-total {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.9rem;
          color: rgba(240,234,216,0.45);
        }
        .cp-vote-unit {
          font-size: 0.7rem;
          color: rgba(240,234,216,0.35);
          margin-left: 2px;
        }

        /* 選択肢ボタン */
        .cp-choices {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }
        .cp-btn {
          position: relative;
          width: 100%;
          min-height: 54px;
          padding: 13px 44px 13px 14px;
          background: rgba(240,234,216,0.04);
          border: 1px solid rgba(200,185,154,0.18);
          border-radius: 6px;
          cursor: pointer;
          overflow: hidden;
          text-align: left;
          transition: background 0.2s, border-color 0.2s, transform 0.15s;
          font-family: inherit;
        }
        .cp-btn:not(:disabled):hover {
          background: rgba(240,234,216,0.08);
          border-color: rgba(200,185,154,0.4);
          transform: translateX(3px);
        }
        .cp-btn:disabled { cursor: default; }
        .cp-btn.chosen {
          background: rgba(200,185,154,0.1);
          border-color: rgba(200,185,154,0.5);
        }
        .cp-btn.dimmed { opacity: 0.4; }

        /* 投票バー */
        .cp-bar {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(200,185,154,0.08) 0%, transparent 100%);
          pointer-events: none;
          transition: width 0.7s ease;
        }

        /* ボタン内ラベル */
        .cp-btn-inner {
          position: relative;
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .cp-letter {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 1px solid rgba(200,185,154,0.3);
          font-family: 'Shippori Mincho', serif;
          font-size: 0.75rem;
          font-weight: 500;
          color: #c8b99a;
          flex-shrink: 0;
        }
        .cp-btn.chosen .cp-letter {
          background: rgba(200,185,154,0.18);
          border-color: #c8b99a;
        }
        .cp-text {
          font-family: 'Noto Serif JP', serif;
          font-size: 0.88rem;
          font-weight: 300;
          color: #f0ead8;
          line-height: 1.5;
          letter-spacing: 0.04em;
          flex: 1;
        }
        .cp-votes {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          font-family: 'Shippori Mincho', serif;
          font-size: 0.8rem;
          color: rgba(200,185,154,0.6);
        }
        .cp-check {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 0.55rem;
          color: #c8b99a;
        }

        /* ヒント */
        .cp-hint {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.7rem;
          color: rgba(200,185,154,0.38);
          text-align: center;
          margin-top: 12px;
          letter-spacing: 0.1em;
        }

        @media (prefers-reduced-motion: reduce) {
          .cp-panel { transition: opacity 0.2s; transform: none !important; }
          .cp-timer-num.urgent { animation: none; }
          .cp-btn:not(:disabled):hover { transform: none; }
        }
      `}</style>

      <div className={`cp-panel${visible ? " cp-visible" : ""}`}>
        {/* 巻物上端 */}
        <div className="cp-scroll-top">
          <div className="cp-rod" />
          <span className="cp-label">― 物語の分岐 ―</span>
          <div className="cp-rod" />
        </div>

        <div className="cp-inner">
          {/* ヘッダー */}
          <div className="cp-header">
            {/* SVGタイマー */}
            <div className="cp-timer-wrap" aria-label={`残り${seconds}秒`}>
              <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
                <circle
                  cx="28" cy="28" r={RADIUS}
                  fill="none"
                  stroke="rgba(240,234,216,0.07)"
                  strokeWidth="2.5"
                />
                <circle
                  cx="28" cy="28" r={RADIUS}
                  fill="none"
                  stroke={isUrgent ? "#c0392b" : "#c8b99a"}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 28 28)"
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
                />
              </svg>
              <span className={`cp-timer-num${isUrgent ? " urgent" : ""}`}>
                {seconds}
              </span>
            </div>

            {/* 投票状況 */}
            <div className="cp-vote-status">
              <span className="cp-vote-count">{countA + countB}</span>
              <span className="cp-vote-slash">/</span>
              <span className="cp-vote-total">{totalPlayers}</span>
              <span className="cp-vote-unit">票</span>
            </div>
          </div>

          {/* 選択肢 */}
          <div className="cp-choices">
            {(["A", "B"] as const).map((v) => {
              const label    = v === "A" ? choice.choice_a : choice.choice_b;
              const count    = v === "A" ? countA : countB;
              const pct      = v === "A" ? pctA   : pctB;
              const isChosen = myVote === v;
              const isDimmed = !!myVote && !isChosen;

              return (
                <button
                  key={v}
                  className={`cp-btn${isChosen ? " chosen" : ""}${isDimmed ? " dimmed" : ""}`}
                  onClick={() => !myVote && onVote(v)}
                  disabled={!!myVote}
                  aria-pressed={isChosen}
                >
                  {/* 投票バー */}
                  <span
                    className="cp-bar"
                    style={{ width: myVote ? `${pct}%` : "0%" }}
                    aria-hidden
                  />

                  <span className="cp-btn-inner">
                    <span className="cp-letter">{v}</span>
                    <span className="cp-text">{label}</span>
                  </span>

                  {/* 票数 or チェックマーク */}
                  {myVote && count > 0 && (
                    <span className="cp-votes">{count}</span>
                  )}
                  {isChosen && (
                    <span className="cp-check" aria-label="あなたの選択">◆</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ヒントテキスト */}
          <p className="cp-hint">
            {myVote
              ? "投票しました。他のプレイヤーを待っています…"
              : isUrgent
              ? `あと ${seconds} 秒…`
              : "物語の行方を選んでください"}
          </p>
        </div>
      </div>
    </>
  );
}
