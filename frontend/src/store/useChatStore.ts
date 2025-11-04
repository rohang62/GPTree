import { create } from 'zustand';
import type { Conversation, Message } from '../lib/api';

interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Message[];
  model: string;
  temperature: number;
  darkMode: boolean;
  
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  deleteConversation: (id: string) => void;
  setCurrentConversationId: (id: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  appendToLastMessage: (content: string) => void;
  clearMessages: () => void;
  setModel: (model: string) => void;
  setTemperature: (temperature: number) => void;
  toggleDarkMode: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  model: 'gpt-4',
  temperature: 0.7,
  darkMode: true,

  setConversations: (conversations) => set({ conversations }),
  
  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    })),
  
  updateConversation: (id, updates) =>
    set((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.conversation_id === id ? { ...conv, ...updates } : conv
      ),
    })),
  
  deleteConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((conv) => conv.conversation_id !== id),
      currentConversationId:
        state.currentConversationId === id ? null : state.currentConversationId,
    })),
  
  setCurrentConversationId: (id) => set({ currentConversationId: id }),
  
  setMessages: (messages) => set({ messages }),
  
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  
  appendToLastMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        messages[messages.length - 1] = {
          ...lastMsg,
          content: lastMsg.content + content,
        };
      }
      return { messages };
    }),
  
  clearMessages: () => set({ messages: [] }),
  
  setModel: (model) => set({ model }),
  setTemperature: (temperature) => set({ temperature }),
  toggleDarkMode: () =>
    set((state) => {
      const newDarkMode = !state.darkMode;
      document.documentElement.classList.toggle('dark', newDarkMode);
      localStorage.setItem('darkMode', String(newDarkMode));
      return { darkMode: newDarkMode };
    }),
}));

// Initialize dark mode from localStorage
if (typeof window !== 'undefined') {
  const savedDarkMode = localStorage.getItem('darkMode');
  if (savedDarkMode !== null) {
    const isDark = savedDarkMode === 'true';
    document.documentElement.classList.toggle('dark', isDark);
    useChatStore.setState({ darkMode: isDark });
  } else {
    // Default to dark mode
    document.documentElement.classList.add('dark');
  }
}

