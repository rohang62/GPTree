import React, { useRef, useEffect, useState } from 'react';
import { Send, Paperclip, Loader2 } from 'lucide-react';
import { useChatStore } from '../store/useChatStore';

interface ComposerProps {
  onSend: (message: string) => void;
  streaming: boolean;
  onStop: () => void;
  focusSignal?: number; // increment to force focus
}

export const Composer: React.FC<ComposerProps> = ({ onSend, streaming, onStop, focusSignal }) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { model } = useChatStore();

  useEffect(() => {
    // Focus composer on mount and after sending
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (typeof focusSignal !== 'undefined') {
      textareaRef.current?.focus();
    }
  }, [focusSignal]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !streaming) {
      onSend(input.trim());
      setInput('');
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    } else if (e.key === 'Escape') {
      if (streaming) {
        onStop();
      }
      textareaRef.current?.focus();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  return (
    <div className="bg-[var(--chat-bg)] border-t border-[var(--border-color)] p-4">
      <form onSubmit={handleSubmit} className="w-full">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              disabled={streaming}
              rows={1}
              className="w-full px-4 py-3 pr-12 bg-[var(--message-user)] border border-[var(--border-color)] rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ minHeight: '48px', maxHeight: '200px' }}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Attach file"
            >
              <Paperclip size={18} />
            </button>
          </div>
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              className="px-4 h-12 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Loader2 size={18} className="animate-spin" />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              className="px-4 h-12 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center"
            >
              <Send size={18} />
            </button>
          )}
        </div>
        <div className="mt-2 text-xs text-[var(--text-secondary)] text-center">
          {streaming ? 'Streaming...' : 'Press Cmd/Ctrl+Enter to send, Esc to focus'}
        </div>
      </form>
    </div>
  );
};

