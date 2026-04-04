export type RoomStatus = "waiting" | "playing" | "finished";
export type NovelStatus = "generating" | "reading" | "choice" | "completed";
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
  is_bot: boolean;
  joined_at: string;
  ready_page?: number | null;
  profiles?: Profile | null;
}

export interface NovelSession {
  id: string;
  room_id: string;
  title?: string | null;
  genre: string;
  full_text: string;
  status: NovelStatus;
  current_page: number;
  created_at: string;
}

export interface SceneChoice {
  id: string;
  novel_session_id: string;
  scene_number: number;
  page_number: number;
  story_segment: string;
  choice_a: string | null;
  choice_b: string | null;
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
