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
  choice, myVote, countA, countB, totalPlayers,
  onVote, onTimeUp, isHost,
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

  // ── 巻物展開アニメ ──
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  const total    = countA + countB;
  const pctA     = total ? Math.round((countA / total) * 100) : 50;
  const pctB     = 100 - pctA;
  const isUrgent = seconds <= 10;

  // SVGタイマー円弧
  const RADIUS = 20;
  const CIRC   = 2 * Math.PI * RADIUS;
  const dashOffset = CIRC * (1 - seconds / 30);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400&family=Shippori+Mincho:wght@400;500&display=swap');

        .cp-panel {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 100;
          background: #faf8f4;
          border-top: 1px solid rgba(26,22,18,0.12);
          border-radius: 14px 14px 0 0;
          box-shadow: 0 -4px 32px rgba(26,22,18,0.08);
          transform: translateY(100%);
          opacity: 0;
          transition: transform 0.42s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .cp-panel.cp-visible {
          transform: translateY(0);
          opacity: 1;
        }

        /* 上端装飾 */
        .cp-top {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 20px 0;
        }
        .cp-rod {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(26,22,18,0.15), transparent);
        }
        .cp-top-label {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.65rem;
          letter-spacing: 0.2em;
          color: rgba(26,22,18,0.35);
          white-space: nowrap;
        }

        .cp-inner {
          padding: 12px 20px 18px;
          max-width: 600px;
          margin: 0 auto;
        }

        /* ヘッダー */
        .cp-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        .cp-timer-wrap {
          position: relative;
          width: 50px;
          height: 50px;
          flex-shrink: 0;
        }
        .cp-timer-num {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Shippori Mincho', serif;
          font-size: 1rem;
          font-weight: 500;
          color: rgba(26,22,18,0.7);
          transition: color 0.3s;
        }
        .cp-timer-num.urgent {
          color: #b03020;
          animation: cpPulse 0.6s ease-in-out infinite alternate;
        }
        @keyframes cpPulse {
          from { opacity: 0.7; transform: scale(0.95); }
          to   { opacity: 1;   transform: scale(1.05); }
        }
        .cp-vote-status {
          display: flex;
          align-items: baseline;
          gap: 3px;
        }
        .cp-vote-n {
          font-family: 'Shippori Mincho', serif;
          font-size: 1.4rem;
          font-weight: 500;
          color: #1a1612;
          line-height: 1;
        }
        .cp-vote-slash { color: rgba(26,22,18,0.2); font-size: 0.9rem; }
        .cp-vote-total {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.85rem;
          color: rgba(26,22,18,0.4);
        }
        .cp-vote-unit {
          font-size: 0.65rem;
          color: rgba(26,22,18,0.3);
          margin-left: 2px;
        }

        /* 選択肢ボタン */
        .cp-choices {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .cp-btn {
          position: relative;
          width: 100%;
          min-height: 52px;
          padding: 12px 40px 12px 14px;
          background: #fff;
          border: 1px solid rgba(26,22,18,0.12);
          border-radius: 8px;
          cursor: pointer;
          overflow: hidden;
          text-align: left;
          transition: background 0.18s, border-color 0.18s, transform 0.15s;
          font-family: inherit;
        }
        .cp-btn:not(:disabled):hover {
          background: rgba(26,22,18,0.03);
          border-color: rgba(26,22,18,0.25);
          transform: translateX(2px);
        }
        .cp-btn:disabled { cursor: default; }
        .cp-btn.chosen {
          background: rgba(26,22,18,0.05);
          border-color: rgba(26,22,18,0.35);
        }
        .cp-btn.dimmed { opacity: 0.38; }

        /* 投票バー */
        .cp-bar {
          position: absolute;
          top: 0; left: 0; bottom: 0;
          background: rgba(26,22,18,0.04);
          pointer-events: none;
          transition: width 0.7s ease;
        }

        /* ボタン内 */
        .cp-btn-inner {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .cp-letter {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 1px solid rgba(26,22,18,0.2);
          font-family: 'Shippori Mincho', serif;
          font-size: 0.72rem;
          font-weight: 500;
          color: rgba(26,22,18,0.55);
          flex-shrink: 0;
        }
        .cp-btn.chosen .cp-letter {
          background: rgba(26,22,18,0.08);
          border-color: rgba(26,22,18,0.4);
          color: rgba(26,22,18,0.8);
        }
        .cp-text {
          font-family: 'Noto Serif JP', serif;
          font-size: 0.87rem;
          font-weight: 300;
          color: #1a1612;
          line-height: 1.5;
          letter-spacing: 0.04em;
          flex: 1;
        }
        .cp-votes {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          font-family: 'Shippori Mincho', serif;
          font-size: 0.75rem;
          color: rgba(26,22,18,0.4);
        }
        .cp-check {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 0.5rem;
          color: rgba(26,22,18,0.5);
        }

        /* ヒント */
        .cp-hint {
          font-family: 'Shippori Mincho', serif;
          font-size: 0.68rem;
          color: rgba(26,22,18,0.3);
          text-align: center;
          margin-top: 10px;
          letter-spacing: 0.1em;
        }

        @media (prefers-reduced-motion: reduce) {
          .cp-panel { transition: opacity 0.2s; transform: none !important; }
          .cp-timer-num.urgent { animation: none; }
        }
      `}</style>

      <div className={`cp-panel${visible ? " cp-visible" : ""}`}>
        {/* 上端装飾 */}
        <div className="cp-top">
          <div className="cp-rod" />
          <span className="cp-top-label">― 物語の分岐 ―</span>
          <div className="cp-rod" />
        </div>

        <div className="cp-inner">
          {/* ヘッダー */}
          <div className="cp-header">
            <div className="cp-timer-wrap" aria-label={`残り${seconds}秒`}>
              <svg width="50" height="50" viewBox="0 0 50 50" aria-hidden>
                <circle cx="25" cy="25" r={RADIUS}
                  fill="none" stroke="rgba(26,22,18,0.07)" strokeWidth="2" />
                <circle cx="25" cy="25" r={RADIUS}
                  fill="none"
                  stroke={isUrgent ? "#b03020" : "rgba(26,22,18,0.4)"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 25 25)"
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
                />
              </svg>
              <span className={`cp-timer-num${isUrgent ? " urgent" : ""}`}>
                {seconds}
              </span>
            </div>

            <div className="cp-vote-status">
              <span className="cp-vote-n">{countA + countB}</span>
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
                  <span className="cp-bar"
                    style={{ width: myVote ? `${pct}%` : "0%" }}
                    aria-hidden />
                  <span className="cp-btn-inner">
                    <span className="cp-letter">{v}</span>
                    <span className="cp-text">{label}</span>
                  </span>
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

          <p className="cp-hint">
            {myVote
              ? "投票しました。次のシーンへ…"
              : isUrgent
              ? `あと ${seconds} 秒…`
              : "物語の行方を選んでください"}
          </p>
        </div>
      </div>
    </>
  );
}
