export type Source = {
  title: string;
  url: string;
};

export type Message = {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  used_web_search?: boolean;
  sources?: Source[] | null;
  answered_by_model?: string;
  created_at: string;
};

export type Chat = {
  id: string;
  user_id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
};
