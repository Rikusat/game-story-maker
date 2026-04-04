import type { VoteChoice } from "@/types";

export async function tallyAndAdvance(supabase: any, sceneChoiceId: string, roomId: string) {
  const { data: sceneChoice } = await supabase
    .from("scene_choices")
    .select("*")
    .eq("id", sceneChoiceId)
    .single();

  if (!sceneChoice || sceneChoice.winning_choice) return;

  const { data: session } = await supabase
    .from("novel_sessions")
    .select("*")
    .eq("id", sceneChoice.novel_session_id)
    .single();

  if (!session) return;

  const { data: votes } = await supabase
    .from("votes")
    .select("*")
    .eq("scene_choice_id", sceneChoiceId);

  const countA  = votes?.filter((v: any) => v.choice === "A").length ?? 0;
  const countB  = votes?.filter((v: any) => v.choice === "B").length ?? 0;
  const winner: VoteChoice = countA >= countB ? "A" : "B";

  await supabase
    .from("scene_choices")
    .update({ winning_choice: winner })
    .eq("id", sceneChoiceId);

  const currentPage = session.current_page ?? sceneChoice.page_number ?? 0;
  const nextPage    = currentPage + 1;

  await supabase
    .from("novel_sessions")
    .update({ status: "generating", current_page: nextPage })
    .eq("id", session.id);
}
