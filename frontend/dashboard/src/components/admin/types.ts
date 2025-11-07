export interface RecruitmentData {
  id?: string;
  recruitId?: string;
  messageId?: string;
  guild_id: string;
  channel_id: string;
  message_id: string;
  guild_name: string;
  channel_name: string;
  status: string;
  start_time: string;
  content: string;
  participants_count?: number;
  start_game_time: string;
  vc?: string;
  note?: string;
  title?: string;
  description?: string;
  maxParticipants?: number;
  currentParticipants?: number;
  createdAt?: string;
  participants?: Array<{ id: string; name: string; }>;
  participantsList?: Array<{ id: string; name: string; }>;
}

export interface AdminDashboardProps {
  initialData?: RecruitmentData[];
}
