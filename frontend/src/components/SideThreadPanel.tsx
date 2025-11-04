import React from 'react';
import { MessageSquare, MoreVertical, X as CloseIcon } from 'lucide-react';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { useSSEStream } from '../hooks/useSSEStream';
// Local state for side thread to avoid polluting main thread store
import { useAuthStore } from '../store/useAuthStore';
import { fetchMessages, createSideThread, fetchConversation, updateConversation, deleteConversation, type Message } from '../lib/api';

interface SideThreadPanelProps {
  conversationId: string;
  parentConversationId: string;
  parentMessageId: string;
  onClose: () => void;
  onOpenChild?: (childConversationId: string, parentMessageId?: string) => void;
  widthPx?: number;
  onMinimize?: (title?: string) => void;
}

export const SideThreadPanel: React.FC<SideThreadPanelProps> = ({
  conversationId,
  parentConversationId: _parentConversationId,
  parentMessageId: _parentMessageId,
  onClose,
  onOpenChild,
  widthPx,
  onMinimize,
}) => {
  const { user } = useAuthStore();
  const [sideMessages, setSideMessages] = React.useState<Message[]>([]);
  // reuse global model/temperature assumptions via constants for now
  const model = 'gpt-4.1';
  const temperature = 0.7;
  const { streaming, content, startStream, stopStream } = useSSEStream();
  const [streamingContent, setStreamingContent] = React.useState('');
  const [messagesLoading, setMessagesLoading] = React.useState(false);
  const [messagesHasMore, setMessagesHasMore] = React.useState(true);
  // const [messagesPage, setMessagesPage] = React.useState(1);
  const messagesScrollRef = React.useRef<HTMLDivElement>(null);
  const [title, setTitle] = React.useState<string>('Side Thread');
  const [menuOpen, setMenuOpen] = React.useState(false);

  // Load messages for side thread
  React.useEffect(() => {
    if (!user || !conversationId) return;
    
    const loadMessages = async () => {
      setMessagesLoading(true);
      try {
        const result = await fetchMessages(conversationId, user.id, 1, 20);
        const formattedMessages: Message[] = result.data.map((msg: any) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          message_id: msg.message_id,
          indices_for_button: msg.indices_for_button,
        }));
        setSideMessages(formattedMessages);
        setMessagesHasMore(result.pagination.has_more);
      } catch (err) {
        // Silently fail
      } finally {
        setMessagesLoading(false);
      }
    };

    loadMessages();
    // Load conversation title
    (async () => {
      try {
        const convo = await fetchConversation(conversationId, user!.id);
        if (convo?.title) setTitle(convo.title);
      } catch {}
    })();
  }, [user, conversationId]);

  // Handle streaming content
  React.useEffect(() => {
    if (streaming && content) {
      setStreamingContent(content);
    } else if (!streaming) {
      // If a stream just finished and we have content, persist it in the UI
      if (streamingContent || content) {
        const finalText = streamingContent || content;
        if (finalText && finalText.length > 0) {
          setSideMessages(prev => [...prev, { role: 'assistant', content: finalText }]);
        }
      }
      setStreamingContent('');
    }
  }, [streaming, content]);

  const handleSend = async (userMessage: string) => {
    if (!user) return;
    
    const newUserMessage: Message = { role: 'user', content: userMessage };
    setSideMessages(prev => [...prev, newUserMessage]);
    setStreamingContent('');

    startStream({
      userId: user.id,
      conversationId: conversationId,
      messages: [newUserMessage],
      model: model,
      temperature: temperature,
    });
  };

  const handleStop = () => {
    stopStream();
  };

  const handleTextSelect = async (messageId: string, text: string, startIndex: number, endIndex: number) => {
    if (!user) return;
    try {
      const result = await createSideThread(
        user.id,
        messageId,
        conversationId,
        text,
        startIndex,
        endIndex
      );
      onOpenChild?.(result.conversation.conversation_id, messageId);
      // reload to show button
      const refreshed = await fetchMessages(conversationId, user.id, 1, 20);
      const formatted: Message[] = refreshed.data.map((msg: any) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
        message_id: msg.message_id,
        indices_for_button: msg.indices_for_button,
      }));
      setSideMessages(formatted);
    } catch {}
  };

  const handleButtonClick = (childConversationId: string) => {
    onOpenChild?.(childConversationId);
  };

  return (
    <div className="h-full bg-[var(--sidebar-bg)] border-l border-[var(--border-color)] flex flex-col shadow-xl overflow-hidden" style={{ width: widthPx ? `${widthPx}px` : undefined }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] relative">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} className="text-blue-400" />
          <span className="text-sm font-medium text-[var(--text-primary)] truncate" title={title}>{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Close"
            onClick={onClose}
            className="p-1.5 hover:bg-[var(--hover-bg)] rounded transition-colors"
            title="Close"
          >
            <CloseIcon size={18} className="text-[var(--text-secondary)]" />
          </button>
          {onMinimize ? (
            <button
              aria-label="Minimize"
              onClick={() => onMinimize(title)}
              className="p-1.5 hover:bg-[var(--hover-bg)] rounded transition-colors text-[var(--text-secondary)]"
              title="Minimize"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/></svg>
            </button>
          ) : null}
          <button
            aria-label="Options"
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 hover:bg-[var(--hover-bg)] rounded transition-colors"
            title="Options"
          >
            <MoreVertical size={18} className="text-[var(--text-secondary)]" />
          </button>
        </div>
        {menuOpen && (
          <div className="absolute right-2 top-12 w-44 bg-[var(--sidebar-bg)] border border-[var(--border-color)] rounded-md shadow-lg z-50">
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--hover-bg)]"
              onClick={async () => {
                setMenuOpen(false);
                const newTitle = window.prompt('Rename conversation', title);
                if (!newTitle || !user) return;
                try {
                  const updated = await updateConversation(conversationId, user.id, { title: newTitle });
                  setTitle(updated.title || newTitle);
                } catch {}
              }}
            >Rename conversation</button>
            <button
              className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-500/10"
              onClick={async () => {
                setMenuOpen(false);
                if (!user) return;
                try {
                  await deleteConversation(conversationId, user.id);
                  onClose();
                } catch {}
              }}
            >Delete conversation</button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" ref={messagesScrollRef}>
        <MessageList
          messages={sideMessages}
          streaming={streaming}
          loading={messagesLoading}
          hasMore={messagesHasMore}
          onTextSelect={handleTextSelect}
          onButtonClick={handleButtonClick}
        />
        {streaming && streamingContent && (
          <div className="px-4 py-2">
            <div className="max-w-[780px] mx-auto">
              <div className="text-[var(--text-primary)] leading-7">
                {streamingContent}
                <span className="inline-block w-3 h-5 bg-[var(--text-secondary)] animate-pulse align-middle ml-1" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--border-color)] p-4">
        <Composer
          onSend={handleSend}
          streaming={streaming}
          onStop={handleStop}
        />
      </div>

    </div>
  );
};

