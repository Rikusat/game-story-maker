export type RoomStatus = "waiting" | "playing" | "finished";
export type NovelStatus = "generating" | "choice" | "completed";
export type MbtiDimension = "EI" | "SN" | "TF" | "JP";
export type VoteChoice = "A" | "B";

export interface Profile {
  id: string;
  username: string;
  avatar_url?: string | null;
  created_at: string;
}

export interface Room {
  id: string;
  code: string;
  host_id: string;
  status: RoomStatus;
  max_players: number;
  created_at: string;
}

export interface RoomPlayer {
  id: string;
  room_id: string;
  user_id: string;
  is_active: boolean;
  joined_at: string;
  profiles?: Profile | null;
}

export interface NovelSession {
  id: string;
  room_id: string;
  title?: string | null;
  genre: string;
  full_text: string;
  status: NovelStatus;
  current_scene: number;
  mbti_result?: string | null;
  created_at: string;
}

export interface SceneChoice {
  id: string;
  novel_session_id: string;
  scene_number: number;
  story_segment: string;
  choice_a: string;
  choice_b: string;
  mbti_dimension: MbtiDimension;
  choice_a_type: string;
  choice_b_type: string;
  winning_choice?: VoteChoice | null;
  vote_deadline?: string | null;
  created_at: string;
}

export interface Vote {
  id: string;
  scene_choice_id: string;
  room_id: string;
  user_id: string;
  choice: VoteChoice;
  created_at: string;
}

export interface SavedNovel {
  id: string;
  novel_session_id: string;
  user_id: string;
  title: string;
  saved_at: string;
  novel_sessions?: NovelSession | null;
}

export const MBTI_SCENES: Array<{
  dimension: MbtiDimension;
  name: string;
  typeA: string;
  typeB: string;
  label: string;
}> = [
  { dimension: "EI", name: "社交性",   typeA: "E", typeB: "I", label: "外向的 vs 内向的" },
  { dimension: "SN", name: "感覚",     typeA: "S", typeB: "N", label: "現実的 vs 直感的" },
  { dimension: "TF", name: "判断",     typeA: "T", typeB: "F", label: "論理的 vs 感情的" },
  { dimension: "JP", name: "生活様式", typeA: "J", typeB: "P", label: "計画的 vs 柔軟"   },
];

export function calculateMbti(
  results: Partial<Record<MbtiDimension, VoteChoice>>
): string {
  const get = (dim: MbtiDimension, a: string, b: string) =>
    results[dim] === "A" ? a : b;
  return (
    get("EI", "E", "I") +
    get("SN", "S", "N") +
    get("TF", "T", "F") +
    get("JP", "J", "P")
  );
}
