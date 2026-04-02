import { calculateMbti, type MbtiDimension, type VoteChoice } from "@/types";

export async function tallyAndAdvance(supabase: any, sceneChoiceId: string, roomId: string) {
  const { data: sceneChoice } = await supabase
    .from("scene_choices")
    .select("*, novel_sessions(*)")
    .eq("id", sceneChoiceId)
    .single();

  if (!sceneChoice || sceneChoice.winning_choice) return;

  const { data: votes } = await supabase
    .from("votes")
    .select("*")
    .eq("scene_choice_id", sceneChoiceId);

  const countA = votes?.filter((v: any) => v.choice === "A").length ?? 0;
  const countB = votes?.filter((v: any) => v.choice === "B").length ?? 0;
  const winner: VoteChoice = countA >= countB ? "A" : "B";

  await supabase
    .from("scene_choices")
    .update({ winning_choice: winner })
    .eq("id", sceneChoiceId);

  const session = sceneChoice.novel_sessions;
  const nextScene = session.current_scene + 1;
  const isLastScene = nextScene >= 4;

  if (isLastScene) {
    const { data: allChoices } = await supabase
      .from("scene_choices")
      .select("*")
      .eq("novel_session_id", session.id)
      .order("scene_number");

    const results: Partial<Record<MbtiDimension, VoteChoice>> = {};
    for (const c of allChoices ?? []) {
      if (c.winning_choice) {
        results[c.mbti_dimension as MbtiDimension] = c.winning_choice;
      }
    }
    results[sceneChoice.mbti_dimension as MbtiDimension] = winner;

    const mbtiResult = calculateMbti(results);
    await supabase
      .from("novel_sessions")
      .update({ status: "generating", current_scene: nextScene, mbti_result: mbtiResult })
      .eq("id", session.id);
  } else {
    await supabase
      .from("novel_sessions")
      .update({ status: "generating", current_scene: nextScene })
      .eq("id", session.id);
  }
}
