"use client";

import type { RoomPlayer, Vote } from "@/types";

interface Props {
  players: RoomPlayer[];
  hostId: string;
  currentUserId: string;
  votes?: Vote[];
}

const COLORS = [
  "bg-indigo-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-emerald-500",
  "bg-amber-500",
];

export default function PlayerList({ players, hostId, currentUserId, votes = [] }: Props) {
  const votedIds = new Set(votes.map((v) => v.user_id));

  return (
    <div className="flex flex-col gap-2">
      {players.map((p, i) => {
        const name = p.profiles?.username ?? "プレイヤー";
        const isHost = p.user_id === hostId;
        const isMe = p.user_id === currentUserId;
        const hasVoted = votedIds.has(p.user_id);

        return (
          <div
            key={p.id}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
              isMe ? "bg-indigo-900/40 border border-indigo-700" : "bg-gray-800/60"
            }`}
          >
            {/* アバター */}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                COLORS[i % COLORS.length]
              }`}
            >
              {name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-100 text-sm truncate">
                {name}
                {isMe && <span className="text-gray-400 text-xs ml-1">（あなた）</span>}
              </p>
              {isHost && (
                <span className="text-xs text-amber-400">👑 ホスト</span>
              )}
            </div>
            {hasVoted && (
              <span className="text-green-400 text-xs">✓</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
