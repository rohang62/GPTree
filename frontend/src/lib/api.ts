import { supabase } from './supabase';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  indices_for_button?: ButtonIndex[] | null;
  message_id?: string;
}

export interface ButtonIndex {
  start: number;
  end: number;
  conversation_id: string;
}

export interface Conversation {
  conversation_id: string;
  user_id: string;
  title: string;
  model: string;
  temperature: number;
  created_at: string;
  updated_at: string;
  is_side_thread?: boolean;
  parent_message_id?: string | null;
  parent_conversation_id?: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    page_size: number;
    total_count: number;
    has_more: boolean;
  };
}

export interface ChatStreamRequest {
  userId: string;
  conversationId?: string;
  messages: Message[];
  model?: string;
  temperature?: number;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function fetchConversations(
  userId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedResponse<Conversation>> {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations?user_id=${userId}&page=${page}&page_size=${pageSize}`
  );
  if (!response.ok) throw new Error('Failed to fetch conversations');
  return response.json();
}

export async function fetchMessages(
  conversationId: string,
  userId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedResponse<any>> {
  const response = await fetch(
    `${API_BASE_URL}/api/messages?conversation_id=${conversationId}&user_id=${userId}&page=${page}&page_size=${pageSize}`
  );
  if (!response.ok) throw new Error('Failed to fetch messages');
  return response.json();
}

export async function createConversation(
  userId: string,
  title: string,
  model: string = 'gpt-4.1',
  temperature: number = 0.7
): Promise<Conversation> {
  const response = await fetch(`${API_BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, title, model, temperature }),
  });
  if (!response.ok) throw new Error('Failed to create conversation');
  const result = await response.json();
  return result;
}

export async function updateConversation(
  conversationId: string,
  userId: string,
  updates: { title?: string; model?: string; temperature?: number }
): Promise<Conversation> {
  const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, ...updates }),
  });
  if (!response.ok) throw new Error('Failed to update conversation');
  return response.json();
}

export async function deleteConversation(conversationId: string, userId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}?user_id=${userId}`,
    {
      method: 'DELETE',
    }
  );
  if (!response.ok) throw new Error('Failed to delete conversation');
}

export async function fetchConversation(conversationId: string, userId: string): Promise<Conversation> {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}?user_id=${userId}`
  );
  if (!response.ok) throw new Error('Failed to fetch conversation');
  return response.json();
}

export async function createSideThread(
  userId: string,
  parentMessageId: string,
  parentConversationId: string,
  selectedText: string,
  startIndex: number,
  endIndex: number
): Promise<{ conversation: Conversation; message: any }> {
  const response = await fetch(`${API_BASE_URL}/api/conversations/side-thread`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      parent_message_id: parentMessageId,
      parent_conversation_id: parentConversationId,
      selected_text: selectedText,
      start_index: startIndex,
      end_index: endIndex,
    }),
  });
  if (!response.ok) throw new Error('Failed to create side thread');
  return response.json();
}
