import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import { Copy, Check, MessageSquare } from 'lucide-react';
import type { ButtonIndex } from '../lib/api';

interface MarkdownProps {
  content: string;
  messageId?: string;
  onTextSelect?: (text: string, startIndex: number, endIndex: number) => void;
  buttonIndices?: ButtonIndex[] | null;
  onButtonClick?: (conversationId: string) => void;
}

export const Markdown: React.FC<MarkdownProps> = ({ 
  content, 
  messageId,
  onTextSelect,
  buttonIndices,
  onButtonClick 
}) => {
  const [copied, setCopied] = React.useState<string | null>(null);
  const [selectedText, setSelectedText] = React.useState<string | null>(null);
  const [selectionStart, setSelectionStart] = React.useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = React.useState<number | null>(null);
  const [showSideThreadButton, setShowSideThreadButton] = React.useState(false);
  const [buttonPosition, setButtonPosition] = React.useState<{ x: number; y: number } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const copyToClipboard = async (text: string, codeId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(codeId);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      // Ignore copy errors
    }
  };

  // Handle text selection
  React.useEffect(() => {
    if (!onTextSelect) return;

    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setShowSideThreadButton(false);
        return;
      }

      const selectedText = selection.toString().trim();
      if (selectedText.length === 0) {
        setShowSideThreadButton(false);
        return;
      }

      // Check if selection is within this container
      const container = containerRef.current;
      if (!container || !container.contains(selection.anchorNode)) {
        setShowSideThreadButton(false);
        return;
      }

      // Get the range
      const range = selection.getRangeAt(0);
      
      // Calculate start and end indices in the plain text content
      const preSelectionRange = range.cloneRange();
      preSelectionRange.selectNodeContents(container);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      const startIndex = preSelectionRange.toString().length;
      
      const endIndex = startIndex + selectedText.length;

      // Show button
      const rect = range.getBoundingClientRect();
      setSelectedText(selectedText);
      setSelectionStart(startIndex);
      setSelectionEnd(endIndex);
      setShowSideThreadButton(true);
      setButtonPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      });
    };

    const handleMouseUp = () => {
      setTimeout(handleSelection, 10);
    };

    const handlePointerDownOutside = (e: MouseEvent) => {
      // Only hide if clicking outside; do NOT clear selection here
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSideThreadButton(false);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handlePointerDownOutside);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handlePointerDownOutside);
    };
  }, [onTextSelect]);

  // Process content to insert buttons
  const processContentWithButtons = () => {
    if (!buttonIndices || buttonIndices.length === 0) {
      return content;
    }

    // Sort buttons by start index (descending) to insert from end to start
    const sortedButtons = [...buttonIndices].sort((a, b) => b.start - a.start);
    
    let result = content;
    sortedButtons.forEach((button) => {
      const before = result.substring(0, button.start);
      const buttonText = result.substring(button.start, button.end);
      const after = result.substring(button.end);
      
      // Create a unique marker for the button
      const marker = `__SIDE_THREAD_BUTTON_${button.start}_${button.end}__`;
      result = `${before}${marker}${after}`;
    });

    return result;
  };

  // Custom component for text that handles button rendering
  const TextWithButtons: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    if (!buttonIndices || buttonIndices.length === 0 || typeof children !== 'string') {
      return <>{children}</>;
    }

    const text = String(children);
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    // Sort buttons by start index
    const sortedButtons = [...buttonIndices].sort((a, b) => a.start - b.start);

    sortedButtons.forEach((button, idx) => {
      // Add text before button
      if (button.start > lastIndex) {
        parts.push(text.substring(lastIndex, button.start));
      }

      // Add button
      const buttonText = text.substring(button.start, button.end);
      parts.push(
        <button
          key={`btn-${idx}`}
          onClick={() => onButtonClick?.(button.conversation_id)}
          className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 cursor-pointer transition-colors"
        >
          {buttonText}
          <MessageSquare size={12} />
        </button>
      );

      lastIndex = button.end;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return <>{parts}</>;
  };

  return (
    <div ref={containerRef} className="relative">
      {showSideThreadButton && selectedText && selectionStart !== null && selectionEnd !== null && onTextSelect && (
        <div
          className="fixed z-50 bg-[var(--sidebar-bg)] border border-[var(--border-color)] rounded-lg shadow-lg p-2 flex items-center gap-2"
          style={{
            left: `${buttonPosition?.x || 0}px`,
            top: `${(buttonPosition?.y || 0) - 40}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <button
            onClick={() => {
              if (onTextSelect && selectionStart !== null && selectionEnd !== null) {
                onTextSelect(selectedText, selectionStart, selectionEnd);
                setShowSideThreadButton(false);
                window.getSelection()?.removeAllRanges();
              }
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
          >
            <MessageSquare size={14} />
            Open side thread
          </button>
        </div>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;

            return !inline && match ? (
              <div className="relative my-4">
                <div className="flex items-center justify-between bg-gray-800 px-4 py-2 rounded-t-lg">
                  <span className="text-xs text-gray-400">{match[1]}</span>
                  <button
                    onClick={() => copyToClipboard(codeString, codeId)}
                    className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    {copied === codeId ? (
                      <>
                        <Check size={14} />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <pre className="bg-gray-900 p-4 rounded-b-lg overflow-x-auto">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              </div>
            ) : (
              <code className="bg-gray-700 px-1.5 py-0.5 rounded text-sm" {...props}>
                {children}
              </code>
            );
          },
          p: ({ children }) => {
            // For paragraphs, we need to process text nodes to insert buttons
            if (buttonIndices && buttonIndices.length > 0) {
              return (
                <p className="mb-4 last:mb-0">
                  <TextWithButtons>{children}</TextWithButtons>
                </p>
              );
            }
            return <p className="mb-4 last:mb-0">{children}</p>;
          },
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold mb-4 mt-6">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold mb-3 mt-5">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-bold mb-2 mt-4">{children}</h3>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-4 space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li className="ml-4">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-500 pl-4 italic my-4">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
