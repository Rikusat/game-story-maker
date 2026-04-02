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

  const total = countA + countB;
  const pctA = total ? Math.round((countA / total) * 100) : 50;
  const pctB = 100 - pctA;

  return (
    <div className="bg-gray-900/90 border border-indigo-800 rounded-2xl p-6 shadow-2xl">
      {/* タイマー */}
      <div className="flex justify-center mb-4">
        <span
          className={`text-4xl font-bold tabular-nums ${
            seconds <= 10 ? "text-red-400 animate-pulse" : "text-indigo-300"
          }`}
        >
          {seconds}
        </span>
      </div>

      {/* 選択肢ボタン */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {(["A", "B"] as const).map((v) => {
          const label = v === "A" ? choice.choice_a : choice.choice_b;
          const count = v === "A" ? countA : countB;
          const pct = v === "A" ? pctA : pctB;
          const selected = myVote === v;

          return (
            <button
              key={v}
              onClick={() => !myVote && onVote(v)}
              disabled={!!myVote}
              className={`relative overflow-hidden rounded-xl p-4 text-left transition-all ${
                selected
                  ? "border-2 border-indigo-400 bg-indigo-900/60"
                  : myVote
                  ? "border border-gray-700 bg-gray-800/60 opacity-60"
                  : "border border-gray-600 bg-gray-800 hover:border-indigo-500 hover:bg-gray-700 cursor-pointer"
              }`}
            >
              {/* 投票バー */}
              <div
                className="absolute inset-0 bg-indigo-600/20 transition-all duration-700"
                style={{ width: myVote ? `${pct}%` : "0%" }}
              />
              <div className="relative">
                <span className="text-xs text-indigo-400 font-bold">選択 {v}</span>
                <p className="text-gray-100 mt-1 text-sm leading-snug">{label}</p>
                {myVote && (
                  <p className="text-indigo-300 text-xs mt-2">
                    {count}票 ({pct}%)
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 投票状況 */}
      <p className="text-center text-gray-400 text-sm">
        {myVote ? `✓ 投票済み — ` : "30秒以内に選んでください — "}
        {countA + countB}/{totalPlayers} 人が投票
      </p>
    </div>
  );
}
