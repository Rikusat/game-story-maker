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
  isSolo?: boolean;
}

export default function ChoicePanel({
  choice, myVote, countA, countB, totalPlayers,
  onVote, onTimeUp, isHost, isSolo = false,
}: Props) {
  const [seconds, setSeconds] = useState(60);
  const [visible, setVisible] = useState(false);
  // マウント直後はタイムアウトを発火させない（deadline超過済みでも即ページ進行しないための猶予）
  const [canTimeout, setCanTimeout] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setCanTimeout(true), 5000);
    return () => clearTimeout(t);
  }, []);

  // ── タイマー ──
  useEffect(() => {
    if (!choice.vote_deadline) return;
    // パネルを開いた時点から最低60秒は選択できるよう、ローカル期限を延長
    const mountDeadline = Date.now() + 60_000;
    const serverDeadline = new Date(choice.vote_deadline!).getTime();
    const effectiveDeadline = Math.max(serverDeadline, mountDeadline);

    const update = () => {
      const rem = Math.max(0, Math.ceil((effectiveDeadline - Date.now()) / 1000));
      setSeconds(Math.min(rem, 60));
      if (rem === 0 && isHost && canTimeout && !isSolo) onTimeUp();
    };
    update();
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, [choice.vote_deadline, isHost, canTimeout]);

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
  const dashOffset = CIRC * (1 - seconds / 60);

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
        @keyframes cpPulse {
          from { opacity: 0.7; }
          to   { opacity: 1; }
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
          {/* ヘッダー（タイマーゲージ：ソロモードは非表示） */}
          {!isSolo && (
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
              </div>
            </div>
          )}

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
            {myVote ? "相手の選択を待っています…" : "物語の行方を選んでください"}
          </p>
        </div>
      </div>
    </>
  );
}
