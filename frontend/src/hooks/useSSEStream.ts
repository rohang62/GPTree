import { useEffect, useRef, useState } from 'react';
import type { ChatStreamRequest } from '../lib/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function useSSEStream() {
  const [streaming, setStreaming] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = async (request: ChatStreamRequest & { userId: string }) => {
    // Reset state
    setContent('');
    setError(null);
    setConversationId(null);
    setStreaming(true);

    // Create abort controller for cleanup
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) {
        throw new Error('No response body');
      }

      let eventType = 'token';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (eventType === 'token' && data.content) {
                setContent(prev => prev + data.content);
              } else if (eventType === 'done') {
                setStreaming(false);
                // Store conversationId if provided
                if (data.conversationId) {
                  setConversationId(data.conversationId);
                }
                return;
              } else if (eventType === 'error') {
                setError(data.message || 'An error occurred');
                setStreaming(false);
                setContent('');
                return;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Stream was intentionally stopped
        setStreaming(false);
      } else {
        setError(err.message || 'Failed to start stream');
        setStreaming(false);
      }
    }
  };

  const stopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreaming(false);
  };

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  return {
    streaming,
    content,
    error,
    conversationId,
    startStream,
    stopStream,
  };
}

