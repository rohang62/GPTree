import React from 'react';
import { Markdown } from './Markdown';
import type { ButtonIndex } from '../lib/api';

interface MarkdownWithButtonsProps {
  content: string;
  messageId?: string;
  onTextSelect?: (text: string, startIndex: number, endIndex: number) => void;
  buttonIndices?: ButtonIndex[] | null;
  onButtonClick?: (conversationId: string) => void;
}

/**
 * Component that wraps Markdown and injects buttons for side threads at specific indices
 */
export const MarkdownWithButtons: React.FC<MarkdownWithButtonsProps> = ({
  content,
  messageId,
  onTextSelect,
  buttonIndices,
  onButtonClick,
}) => {
  // If no buttons, just render normal markdown
  if (!buttonIndices || buttonIndices.length === 0) {
    return (
      <Markdown
        content={content}
        messageId={messageId}
        onTextSelect={onTextSelect}
        buttonIndices={null}
        onButtonClick={onButtonClick}
      />
    );
  }

  // Split content by button positions and inject buttons
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  // Sort buttons by start index
  const sortedButtons = [...buttonIndices].sort((a, b) => a.start - b.start);

  sortedButtons.forEach((button, idx) => {
    // Add text before button
    if (button.start > lastIndex) {
      const beforeText = content.substring(lastIndex, button.start);
      if (beforeText) {
        parts.push(
          <Markdown
            key={`text-${idx}`}
            content={beforeText}
            messageId={messageId}
            onTextSelect={onTextSelect}
            buttonIndices={null}
            onButtonClick={onButtonClick}
          />
        );
      }
    }

    // Add button
    const buttonText = content.substring(button.start, button.end);
    parts.push(
      <button
        key={`button-${idx}`}
        onClick={() => onButtonClick?.(button.conversation_id)}
        className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 cursor-pointer transition-colors"
      >
        {buttonText}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );

    lastIndex = button.end;
  });

  // Add remaining text
  if (lastIndex < content.length) {
    const afterText = content.substring(lastIndex);
    if (afterText) {
      parts.push(
        <Markdown
          key="text-after"
          content={afterText}
          messageId={messageId}
          onTextSelect={onTextSelect}
          buttonIndices={null}
          onButtonClick={onButtonClick}
        />
      );
    }
  }

  return <span>{parts}</span>;
};

