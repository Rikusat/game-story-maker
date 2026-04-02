"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Vote, VoteChoice } from "@/types";

export function useVote(sceneChoiceId: string | null, roomId: string, userId: string) {
  const supabase = createClient();
  const [votes, setVotes] = useState<Vote[]>([]);
  const [myVote, setMyVote] = useState<VoteChoice | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchVotes = useCallback(async () => {
    if (!sceneChoiceId) return;
    const { data } = await supabase
      .from("votes")
      .select("*")
      .eq("scene_choice_id", sceneChoiceId);
    if (data) {
      setVotes(data as Vote[]);
      const mine = data.find((v: Vote) => v.user_id === userId);
      setMyVote(mine?.choice ?? null);
    }
  }, [sceneChoiceId, userId]);

  useEffect(() => {
    fetchVotes();
    if (!sceneChoiceId) return;

    const channel = supabase
      .channel(`votes:${sceneChoiceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "votes",
          filter: `scene_choice_id=eq.${sceneChoiceId}`,
        },
        () => fetchVotes()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sceneChoiceId]);

  const castVote = useCallback(
    async (choice: VoteChoice) => {
      if (!sceneChoiceId || loading) return;
      setLoading(true);
      try {
        await fetch("/api/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneChoiceId, choice, roomId, userId }),
        });
        setMyVote(choice);
        await fetchVotes();
      } finally {
        setLoading(false);
      }
    },
    [sceneChoiceId, roomId, loading, fetchVotes]
  );

  const countA = votes.filter((v) => v.choice === "A").length;
  const countB = votes.filter((v) => v.choice === "B").length;

  return { votes, myVote, countA, countB, castVote, loading };
}
