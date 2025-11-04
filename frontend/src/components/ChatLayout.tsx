import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Plus, Search, Settings, Moon, Sun, X, LogOut, User, MoreVertical } from 'lucide-react';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { SideThreadPanel } from './SideThreadPanel';
import { useSSEStream } from '../hooks/useSSEStream';
import {
  fetchConversations,
  fetchMessages,
  deleteConversation,
  createSideThread,
  type Conversation,
  type Message,
} from '../lib/api';

export const ChatLayout: React.FC = () => {
  const navigate = useNavigate();
  const {
    conversations,
    currentConversationId,
    messages,
    model,
    temperature,
    darkMode,
    setConversations,
    setCurrentConversationId,
    setMessages,
    addMessage,
    deleteConversation: deleteConvFromStore,
    addConversation,
    toggleDarkMode,
  } = useChatStore();

  const { streaming, content, conversationId: streamConversationId, startStream, stopStream } = useSSEStream();
  const { profile, signOut, user } = useAuthStore();
  const [showSettings, setShowSettings] = useState(false);
  const [openConvMenuId, setOpenConvMenuId] = useState<string | null>(null);
  
  // Pagination state
  const [conversationsPage, setConversationsPage] = useState(1);
  const [conversationsHasMore, setConversationsHasMore] = useState(true);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [messagesPage, setMessagesPage] = useState(1);
  const [messagesHasMore, setMessagesHasMore] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  
  const conversationsScrollRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const [streamingContent, setStreamingContent] = useState('');
  
  // Side thread stack (rendered right-docked side-by-side)
  const [sideThreads, setSideThreads] = useState<Array<{
    conversationId: string;
    parentConversationId: string;
    parentMessageId: string;
  }>>([]);
  const [sideWidths, setSideWidths] = useState<number[]>([]);
  const [minimizedThreads, setMinimizedThreads] = useState<Array<{
    conversationId: string;
    parentConversationId: string;
    parentMessageId: string;
    title?: string;
    rightOffsetPx: number;
    panelWidthPx: number;
  }>>([]);

  // Compute panel widths so that older panels shrink first down to a min width
  useEffect(() => {
    const compute = () => {
      const base = 360; // desired base width per panel
      const min = 220;  // minimum width per panel
      const max = 420;  // hard cap so panels don't get too wide
      const gap = 8;    // px gap between panels
      const n = sideThreads.length;
      if (n === 0) { setSideWidths([]); return; }

      const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
      const sumWithGaps = (arr: number[]) => sum(arr) + Math.max(0, arr.length - 1) * gap;

      // Available right-dock width: up to 60% of viewport but preserve a minimum main area
      const vw = window.innerWidth;
      const mainMin = 720; // keep at least this for main chat area
      let available = Math.max(0, vw - mainMin);
      available = Math.min(available, Math.floor(vw * 0.6));

      // If nothing available, collapse all to min
      if (available <= 0) {
        setSideWidths(Array(n).fill(min));
        return;
      }

      // Desired total with base width
      const desired = n * base + (n - 1) * gap;
      let widths: number[] = [];

      if (desired <= available) {
        // Enough space: assign widths with gentle emphasis on newest
        widths = Array.from({ length: n }, (_, i) => {
          const bias = (i / Math.max(1, n - 1)); // 0 oldest → 1 newest
          const w = Math.min(max, Math.floor(base + bias * 24));
          return Math.max(min, w);
        });
        // Adjust to fit exactly if we overshoot due to rounding
        while (sumWithGaps(widths) > available) {
          for (let i = 0; i < n && sumWithGaps(widths) > available; i++) {
            widths[i] = Math.max(min, widths[i] - 1);
          }
        }
      } else {
        // Not enough space: start from an even target and then gradually favor newer panels
        const even = Math.max(min, Math.floor((available - (n - 1) * gap) / n));
        widths = Array(n).fill(even);
        // Nudge pixels from older to newer until we hit available exactly (cosmetic balance)
        // Keep a gradient: newest gets up to +16 more than even, oldest up to -16
        let budget = available - sumWithGaps(widths);
        for (let step = 0; step < 16 && budget > 0; step++) {
          for (let i = n - 1; i >= 0 && budget > 0; i--) {
            const cap = Math.min(max, even + (n - 1 - i));
            if (widths[i] < cap) { widths[i]++; budget--; }
          }
        }
        // If still overflowing due to rounding, trim oldest first
        while (sumWithGaps(widths) > available) {
          for (let i = 0; i < n && sumWithGaps(widths) > available; i++) {
            widths[i] = Math.max(min, widths[i] - 1);
          }
        }
      }

      setSideWidths(widths);
    };
    compute();
    const onResize = () => compute();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [sideThreads]);

  // Reload profile if user exists but profile doesn't
  useEffect(() => {
    if (user && !profile) {
      const { loadProfile } = useAuthStore.getState()
      loadProfile().catch(() => {})
    }
  }, [user, profile])

  if (!user) {
    return null; // Or show loading/error
  }

  // Load conversations on mount and when page changes
  useEffect(() => {
    if (user) {
      loadConversations(1, true).catch(() => {});
    }
  }, [user]);

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConversationId && user) {
      loadMessages(currentConversationId, 1, true).catch(() => {});
    } else {
      setMessages([]);
      setMessagesPage(1);
      setMessagesHasMore(true);
    }
    setStreamingContent('');
  }, [currentConversationId, user]);

  // Handle streaming content updates
  useEffect(() => {
    if (streaming) {
      setStreamingContent(content);
    } else if (!streaming && content && streamingContent) {
      // Stream finished, add final message
      addMessage({ role: 'assistant', content });
      setStreamingContent('');
      
      // Update conversationId if backend created a new conversation
      if (streamConversationId && !currentConversationId) {
        setCurrentConversationId(streamConversationId);
        // Reload conversations to get the new one
        loadConversations(1, true);
        // Also load messages so the newest assistant message has a stable message_id
        setTimeout(() => {
          loadMessages(streamConversationId, 1, true);
        }, 0);
      } else if (currentConversationId) {
        // Existing conversation: reload messages so the most recent assistant message has message_id
        setTimeout(() => {
          loadMessages(currentConversationId, 1, true);
        }, 0);
      }
    }
  }, [content, streaming, streamConversationId]);

  // Helper to compare conversations for equality
  const conversationsEqual = (a: Conversation[], b: Conversation[]): boolean => {
    if (a.length !== b.length) return false;
    return a.every((convA, idx) => {
      const convB = b[idx];
      return convA.conversation_id === convB.conversation_id &&
             convA.title === convB.title &&
             convA.updated_at === convB.updated_at;
    });
  };

  const loadConversations = async (page: number = 1, reset: boolean = false) => {
    if (!user || conversationsLoading) return;
    
    setConversationsLoading(true);
    try {
      const result = await fetchConversations(user.id, page, 20);
      let newConversations: Conversation[];
      if (reset) {
        newConversations = result.data;
        // Only update if conversations actually changed
        if (conversationsEqual(newConversations, conversations)) {
          setConversationsHasMore(result.pagination.has_more);
          setConversationsPage(page);
          setConversationsLoading(false);
          return;
        }
        setConversations(newConversations);
      } else {
        // For pagination, append new conversations
        newConversations = [...conversations, ...result.data];
        // Only update if pagination actually added new conversations
        if (result.data.length === 0 || conversationsEqual(newConversations, conversations)) {
          setConversationsHasMore(result.pagination.has_more);
          setConversationsPage(page);
          setConversationsLoading(false);
          return;
        }
        setConversations(newConversations);
      }
      setConversationsHasMore(result.pagination.has_more);
      setConversationsPage(page);
    } catch (err) {
      // Silently fail
    } finally {
      setConversationsLoading(false);
    }
  };

  // Helper to compare messages for equality
  const messagesEqual = (a: Message[], b: Message[]): boolean => {
    if (a.length !== b.length) return false;
    return a.every((msgA, idx) => {
      const msgB = b[idx];
      return msgA.message_id === msgB.message_id &&
             msgA.role === msgB.role &&
             msgA.content === msgB.content &&
             JSON.stringify(msgA.indices_for_button || []) === JSON.stringify(msgB.indices_for_button || []);
    });
  };

  const loadMessages = async (conversationId: string, page: number = 1, reset: boolean = false) => {
    if (!user || messagesLoading) return;
    
    setMessagesLoading(true);
    try {
      const result = await fetchMessages(conversationId, user.id, page, 20);
      // Convert DB messages to app format
      const formattedMessages: Message[] = result.data.map((msg: any) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
        message_id: msg.message_id,
        indices_for_button: msg.indices_for_button,
      }));
      
      let newMessages: Message[];
      if (reset) {
        newMessages = formattedMessages;
        // Only update if messages actually changed
        if (messagesEqual(newMessages, messages)) {
          setMessagesHasMore(result.pagination.has_more);
          setMessagesPage(page);
          setMessagesLoading(false);
          return;
        }
        setMessages(newMessages);
      } else {
        // For pagination, prepend older messages (since we load from oldest)
        newMessages = [...formattedMessages, ...messages];
        // Only update if pagination actually added new messages
        if (formattedMessages.length === 0 || messagesEqual(newMessages, messages)) {
          setMessagesHasMore(result.pagination.has_more);
          setMessagesPage(page);
          setMessagesLoading(false);
          return;
        }
        setMessages(newMessages);
      }
      setMessagesHasMore(result.pagination.has_more);
      setMessagesPage(page);
    } catch (err) {
      // Silently fail
    } finally {
      setMessagesLoading(false);
    }
  };

  // Handle conversations scroll (load more when scrolling up)
  const handleConversationsScroll = useCallback(() => {
    const container = conversationsScrollRef.current;
    if (!container || !conversationsHasMore || conversationsLoading) return;

    // Load more when scrolled to top
    if (container.scrollTop === 0 && conversationsHasMore) {
      loadConversations(conversationsPage + 1, false);
    }
  }, [conversationsHasMore, conversationsLoading, conversationsPage]);

  // Handle messages scroll (load more when scrolling up to see older messages)
  const handleMessagesScroll = useCallback(() => {
    const container = messagesScrollRef.current;
    if (!container || !messagesHasMore || messagesLoading || !currentConversationId) return;

    // Load more when scrolled to top (older messages)
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    // If scrolled near the top (within 100px), load more
    if (scrollTop < 100 && messagesHasMore) {
      loadMessages(currentConversationId, messagesPage + 1, false);
    }
  }, [messagesHasMore, messagesLoading, messagesPage, currentConversationId]);

  const handleNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setMessagesPage(1);
    setMessagesHasMore(true);
  };

  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id);
    setMessagesPage(1);
    setMessagesHasMore(true);
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    
    try {
      await deleteConversation(id, user.id);
      deleteConvFromStore(id);
      if (currentConversationId === id) {
        handleNewChat();
      }
      // Reload conversations
      loadConversations(1, true);
    } catch (err) {
      // Silently fail
    }
  };

  const handleSend = async (userMessage: string) => {
    if (!user) return;
    
    const newUserMessage: Message = { role: 'user', content: userMessage };
    
    // Add message to UI immediately
    addMessage(newUserMessage);
    setStreamingContent('');

    // For existing conversations, backend will load full history from DB
    // For new conversations, send the message array
    const messagesToSend = currentConversationId 
      ? [newUserMessage]  // Only send new message - backend loads history
      : [newUserMessage];  // New conversation - just send this message

    // Start streaming - conversationId will be returned if new conversation created
    startStream({
      userId: user.id,
      conversationId: currentConversationId || undefined,
      messages: messagesToSend,
      model: model,
      temperature: temperature,
    });
  };

  const handleStop = () => {
    stopStream();
  };

  const handleRegenerate = () => {
    if (!user || !currentConversationId) return;
    
    // Remove the last assistant message from UI
    const lastAssistantIndex = messages.map((m, i) => ({ msg: m, idx: i }))
      .filter(({ msg }) => msg.role === 'assistant')
      .pop();
    
    if (lastAssistantIndex) {
      const messagesToKeep = messages.slice(0, lastAssistantIndex.idx);
      setMessages(messagesToKeep);
      
      // Backend will load full history from DB and regenerate from last user message
      startStream({
        userId: user.id,
        conversationId: currentConversationId,
        messages: [],  // Backend loads history from DB
        model: model,
        temperature: temperature,
      });
    }
  };

  const handleContinue = () => {
    if (!user || !currentConversationId) return;
    
    // Backend loads full history from DB and continues
    startStream({
      userId: user.id,
      conversationId: currentConversationId,
      messages: [],  // Backend loads history from DB
      model: model,
      temperature: temperature,
    });
  };

  const handleTextSelect = async (messageId: string | undefined, text: string, startIndex: number, endIndex: number) => {
    if (!user || !currentConversationId) return;
    
    try {
      let parentMessageId = messageId;
      if (!parentMessageId) {
        // Try to resolve to the latest assistant message with an id
        const candidate = [...messages].reverse().find(m => m.role === 'assistant' && !!m.message_id);
        if (candidate && candidate.message_id) {
          parentMessageId = candidate.message_id;
        } else {
          // Force a quick reload and retry once
          await loadMessages(currentConversationId, 1, true);
          const recheck = [...useChatStore.getState().messages].reverse().find(m => m.role === 'assistant' && !!m.message_id);
          if (recheck && recheck.message_id) parentMessageId = recheck.message_id;
        }
      }
      if (!parentMessageId) return; // still no id; abort silently

      // Create side thread
      const result = await createSideThread(
        user.id,
        parentMessageId,
        currentConversationId,
        text,
        startIndex,
        endIndex
      );
      
      const newThreadId = result.conversation.conversation_id;
      
      // Check if already open or minimized before adding
      if (sideThreads.some(st => st.conversationId === newThreadId)) {
        // Already open, do nothing
      } else if (minimizedThreads.some(mt => mt.conversationId === newThreadId)) {
        // If minimized, unminimize it
        const minExists = minimizedThreads.find(mt => mt.conversationId === newThreadId);
        if (minExists) {
          setMinimizedThreads(prev => prev.filter(x => x.conversationId !== newThreadId));
          setSideThreads(prev => [...prev, {
            conversationId: minExists.conversationId,
            parentConversationId: minExists.parentConversationId,
            parentMessageId: minExists.parentMessageId,
          }]);
        }
      } else {
        // Open side thread panel (push to stack)
        setSideThreads(prev => ([
          ...prev,
          {
            conversationId: newThreadId,
            parentConversationId: currentConversationId,
            parentMessageId: parentMessageId,
          }
        ]));
      }
      
      // Reload messages to show the new button
      if (currentConversationId) {
        loadMessages(currentConversationId, 1, true);
      }
    } catch (err) {
      // Silently fail
    }
  };

  const handleButtonClick = (conversationId: string) => {
    // Check if already open in side threads - do nothing
    if (sideThreads.some(t => t.conversationId === conversationId)) {
      return;
    }
    
    // Check if minimized - if so, unminimize it
    const minimized = minimizedThreads.find(mt => mt.conversationId === conversationId);
    if (minimized) {
      setMinimizedThreads(prev => prev.filter(x => x.conversationId !== conversationId));
      setSideThreads(prev => [...prev, {
        conversationId: minimized.conversationId,
        parentConversationId: minimized.parentConversationId,
        parentMessageId: minimized.parentMessageId,
      }]);
      return;
    }
    
    // Otherwise, open it as a new side thread
    setSideThreads(prev => ([...prev, {
      conversationId,
      parentConversationId: currentConversationId || '',
      parentMessageId: '',
    }]));
  };

  return (
    <div className="flex h-screen bg-[var(--chat-bg)] text-[var(--text-primary)] overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] flex flex-col h-screen">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-color)]">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-4 py-2 bg-[var(--chat-bg)] hover:bg-[var(--message-user)] rounded-lg transition-colors"
          >
            <Plus size={18} />
            New chat
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-[var(--border-color)]">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              type="text"
              placeholder="Search chats"
              className="w-full pl-10 pr-4 py-2 bg-[var(--chat-bg)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Conversations List */}
        <div 
          ref={conversationsScrollRef}
          onScroll={handleConversationsScroll}
          className="flex-1 overflow-y-auto p-2"
        >
          <div className="space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.conversation_id}
                onClick={() => handleSelectConversation(conv.conversation_id)}
                className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                  currentConversationId === conv.conversation_id
                    ? 'bg-[var(--message-user)]'
                    : 'hover:bg-[var(--message-user)]'
                }`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <MessageSquare size={16} className="text-[var(--text-secondary)] flex-shrink-0" />
                  <span className="text-sm truncate">{conv.title}</span>
                </div>
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpenConvMenuId(prev => prev === conv.conversation_id ? null : conv.conversation_id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--hover-bg)] rounded transition-opacity"
                    title="Options"
                  >
                    <MoreVertical size={14} />
                  </button>
                  {openConvMenuId === conv.conversation_id && (
                    <div className="absolute right-0 top-6 w-44 bg-[var(--sidebar-bg)] border border-[var(--border-color)] rounded-md shadow-lg z-50" onClick={(e)=>e.stopPropagation()}>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--hover-bg)]"
                        onClick={async () => {
                          setOpenConvMenuId(null);
                          if (!user) return;
                          const newTitle = window.prompt('Rename conversation', conv.title || '');
                          if (!newTitle) return;
                          try {
                            const updated = await (await import('../lib/api')).updateConversation(conv.conversation_id, user.id, { title: newTitle });
                            useChatStore.getState().updateConversation(conv.conversation_id, { title: updated.title || newTitle });
                          } catch {}
                        }}
                      >Rename conversation</button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-500/10"
                        onClick={async () => {
                          setOpenConvMenuId(null);
                          if (!user) return;
                          try {
                            await (await import('../lib/api')).deleteConversation(conv.conversation_id, user.id);
                            deleteConvFromStore(conv.conversation_id);
                            if (currentConversationId === conv.conversation_id) {
                              handleNewChat();
                            }
                          } catch {}
                        }}
                      >Delete</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {conversationsLoading && (
              <div className="text-center text-sm text-[var(--text-secondary)] py-2">
                Loading...
              </div>
            )}
          </div>
        </div>

        {/* User Profile Footer */}
        <div className="p-4 border-t border-[var(--border-color)] flex-shrink-0">
          <div className="flex items-center gap-3 p-2 text-sm">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
              <User size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[var(--text-primary)] truncate">
                {profile?.username || 
                 (profile?.first_name && profile?.last_name 
                   ? `${profile.first_name} ${profile.last_name}` 
                   : null) ||
                 profile?.email || 
                 'User'}
              </div>
              {profile?.email && profile?.username && (
                <div className="text-xs text-[var(--text-secondary)] truncate">
                  {profile.email}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="h-16 border-b border-[var(--border-color)] flex items-center justify-between px-6 relative flex-shrink-0">
          <h1 className="text-lg font-semibold">
            {currentConversationId
              ? (conversations.find(c => c.conversation_id === currentConversationId)?.title || 'New chat')
              : 'New chat'}
          </h1>
          <div className="flex items-center gap-2 relative settings-dropdown">
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-[var(--message-user)] rounded-lg transition-colors"
            >
              <Settings size={18} />
            </button>
            
            
            {showSettings && (
              <div 
                className="absolute right-0 top-full mt-2 w-64 p-4 bg-[var(--sidebar-bg)] rounded-lg border border-[var(--border-color)] shadow-lg z-50 settings-dropdown"
              >
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={toggleDarkMode}
                    className="w-full flex items-center justify-between p-2 hover:bg-[var(--message-user)] rounded-lg transition-colors text-[var(--text-primary)]"
                  >
                    <span className="text-sm">Theme</span>
                    {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                  </button>
                  
                  <div className="pt-2 border-t border-[var(--border-color)]">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await signOut()
                          setShowSettings(false)
                          navigate('/login', { replace: true })
                        } catch (error) {
                          navigate('/login', { replace: true })
                        }
                      }}
                      className="w-full flex items-center gap-2 p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <LogOut size={18} />
                      <span className="text-sm">Logout</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div 
          ref={messagesScrollRef}
          onScroll={handleMessagesScroll}
          className="flex-1 overflow-y-auto"
        >
          <MessageList
            messages={streaming && streamingContent ? [...messages, { role: 'assistant' as const, content: streamingContent }] : messages}
            streaming={streaming}
                  onRegenerate={handleRegenerate}
                  onContinue={handleContinue}
                  loading={messagesLoading}
                  hasMore={messagesHasMore}
                  onTextSelect={handleTextSelect}
                  onButtonClick={handleButtonClick}
                />
        </div>

        {/* Composer */}
        <div className="flex-shrink-0 flex justify-center px-4 pb-4">
          <div className="w-full max-w-3xl">
            <Composer
              onSend={handleSend}
              streaming={streaming}
              onStop={handleStop}
            />
          </div>
        </div>
      </div>
      
      {/* Side Threads Dock */}
      {sideThreads.length > 0 && (
        <div className="fixed inset-y-0 right-0 flex items-stretch gap-2 z-40 pr-2 pointer-events-none">
          {sideThreads.map((t, i) => (
            <div key={t.conversationId} className="h-full pointer-events-auto">
              <SideThreadPanel
                conversationId={t.conversationId}
                parentConversationId={t.parentConversationId}
                parentMessageId={t.parentMessageId}
                onClose={() => setSideThreads(prev => prev.filter(x => x.conversationId !== t.conversationId))}
                onOpenChild={(childId, parentMsgId) => {
                  // Check if already open or minimized
                  if (sideThreads.some(st => st.conversationId === childId)) return;
                  const minExists = minimizedThreads.find(mt => mt.conversationId === childId);
                  if (minExists) {
                    // Unminimize it
                    setMinimizedThreads(prev => prev.filter(x => x.conversationId !== childId));
                    setSideThreads(prev => [...prev, {
                      conversationId: minExists.conversationId,
                      parentConversationId: minExists.parentConversationId,
                      parentMessageId: minExists.parentMessageId,
                    }]);
                    return;
                  }
                  // Otherwise add it
                  setSideThreads(prev => ([...prev, {
                    conversationId: childId,
                    parentConversationId: t.conversationId,
                    parentMessageId: parentMsgId || '',
                  }]));
                }}
                onMinimize={(titleFromPanel?: string) => {
                  // calculate current horizontal offset from the right for this panel
                  const GAP = 8; // px gap between panels
                  const DOCK_PAD = 8; // pr-2
                  let offset = DOCK_PAD;
                  for (let k = sideThreads.length - 1; k > i; k--) {
                    offset += (sideWidths[k] || 360) + GAP;
                  }
                  const convTitle = titleFromPanel || (conversations.find(c => c.conversation_id === t.conversationId)?.title) || 'Side thread';
                  setSideThreads(prev => prev.filter(x => x.conversationId !== t.conversationId));
                  setMinimizedThreads(prev => [...prev, { ...t, title: convTitle, rightOffsetPx: offset, panelWidthPx: (sideWidths[i] || 360) }]);
                }}
                widthPx={sideWidths[i] || 360}
              />
            </div>
          ))}
        </div>
      )}

      {/* Minimized Side Threads Dock (positioned under original panel horizontally) */}
      {minimizedThreads.length > 0 && (
        <div className="fixed right-2 left-2 bottom-2 z-40 flex justify-end gap-0">
          {minimizedThreads.map((mt) => (
            <div key={`min-${mt.conversationId}`} className="flex items-center border border-[var(--border-color)] bg-[var(--sidebar-bg)] shadow-md px-3 py-1 h-9 max-w-[240px] w-auto overflow-hidden text-ellipsis whitespace-nowrap" style={{borderRadius: '6px'}}>
              <button
                className="flex-1 text-sm text-[var(--text-primary)] text-left overflow-hidden text-ellipsis whitespace-nowrap"
                onClick={() => {
                  // Check if already open - if so, just remove from minimized
                  if (sideThreads.some(st => st.conversationId === mt.conversationId)) {
                    setMinimizedThreads(prev => prev.filter(x => x.conversationId !== mt.conversationId));
                    return;
                  }
                  // Otherwise unminimize it
                  setMinimizedThreads(prev => prev.filter(x => x.conversationId !== mt.conversationId));
                  setSideThreads(prev => [...prev, { conversationId: mt.conversationId, parentConversationId: mt.parentConversationId, parentMessageId: mt.parentMessageId }]);
                }}
                title={mt.title || 'Side thread'}
              >
                {mt.title || 'Side thread'}
              </button>
              <button
                aria-label="Close"
                className="ml-2 p-1 hover:bg-[var(--hover-bg)]"
                onClick={() => setMinimizedThreads(prev => prev.filter(x => x.conversationId !== mt.conversationId))}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
