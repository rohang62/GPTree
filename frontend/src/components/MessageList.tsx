import React from 'react';
import { User, Bot, RotateCcw, Play } from 'lucide-react';
import { Markdown } from './Markdown';
import type { Message } from '../lib/api';

interface MessageListProps {
  messages: Message[];
  streaming: boolean;
  onRegenerate?: () => void;
  onContinue?: () => void;
  loading?: boolean;
  hasMore?: boolean;
  onTextSelect?: (messageId: string, text: string, startIndex: number, endIndex: number) => void;
  onButtonClick?: (conversationId: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  streaming,
  onRegenerate,
  onContinue,
  loading = false,
  hasMore = false,
  onTextSelect,
  onButtonClick,
}) => {
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {messages.length === 0 && (
          <div className="text-center text-[var(--text-secondary)] mt-20">
            <h2 className="text-2xl font-semibold mb-2">Hey, ready to dive in?</h2>
            <p className="text-sm">Start a conversation to get going.</p>
          </div>
        )}
        {messages.map((message, idx) => (
          <div
            key={idx}
            className={`flex gap-4 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                <Bot size={18} className="text-white" />
              </div>
            )}
            {message.role === 'user' ? (
              <div className="max-w-[85%] rounded-lg px-4 py-3 bg-[var(--message-user)]">
                <div className="text-[var(--text-primary)] whitespace-pre-wrap">
                  {message.content}
                </div>
              </div>
            ) : (
              // Assistant message: free-form like ChatGPT (no bubble box)
              <div className="max-w-[780px] w-full">
                <div className="text-[var(--text-primary)] leading-7">
                  <Markdown 
                    content={message.content}
                    messageId={message.message_id}
                    onTextSelect={message.message_id && onTextSelect ? (text, start, end) => onTextSelect(message.message_id!, text, start, end) : undefined}
                    buttonIndices={message.indices_for_button || null}
                    onButtonClick={onButtonClick}
                  />
                  {idx === messages.length - 1 && !streaming && (
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={onRegenerate}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded transition-colors"
                      >
                        <RotateCcw size={14} />
                        Regenerate
                      </button>
                      <button
                        onClick={onContinue}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded transition-colors"
                      >
                        <Play size={14} />
                        Continue
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            {message.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                <User size={18} className="text-white" />
              </div>
            )}
          </div>
        ))}
        {/* Streaming cursor indicator (inline) */}
        {streaming && (
          <div className="flex gap-4 justify-start">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
              <Bot size={18} className="text-white" />
            </div>
            <div className="max-w-[780px] w-full">
              <span className="inline-block w-3 h-5 bg-[var(--text-secondary)] animate-pulse align-middle" />
            </div>
          </div>
        )}
        {loading && (
          <div className="text-center text-sm text-[var(--text-secondary)] py-4">
            Loading older messages...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

