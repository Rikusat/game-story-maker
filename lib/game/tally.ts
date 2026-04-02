import { calculateMbti, type MbtiDimension, type VoteChoice } from "@/types";

export async function tallyAndAdvance(supabase: any, sceneChoiceId: string, roomId: string) {
  // scene_choiceを取得（joinなし）
  const { data: sceneChoice } = await supabase
    .from("scene_choices")
    .select("*")
    .eq("id", sceneChoiceId)
    .single();

  if (!sceneChoice || sceneChoice.winning_choice) return;

  // sessionを別途取得（joinのarray/object問題を回避）
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

  const countA = votes?.filter((v: any) => v.choice === "A").length ?? 0;
  const countB = votes?.filter((v: any) => v.choice === "B").length ?? 0;
  const winner: VoteChoice = countA >= countB ? "A" : "B";

  await supabase
    .from("scene_choices")
    .update({ winning_choice: winner })
    .eq("id", sceneChoiceId);

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
