import os
from typing import AsyncGenerator, Dict, List, Any, Optional
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

# Lazy initialization of client to avoid import-time errors
_client: Optional[AsyncOpenAI] = None

def get_client() -> AsyncOpenAI:
    """Get or create OpenAI client instance"""
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        _client = AsyncOpenAI(api_key=api_key)
    return _client


async def stream_chat(
    messages: List[Dict[str, str]],
    model: str = "gpt-4",
    temperature: float = 0.7,
    top_p: float = 1.0,
) -> AsyncGenerator[str, None]:
    """
    Stream chat completion tokens from OpenAI.
    
    Yields token strings as they arrive.
    """
    try:
        client = get_client()
        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            top_p=top_p,
            stream=True,
        )
        
        async for chunk in stream:
            if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
                
    except Exception as e:
        # Re-raise to be handled by the caller
        raise Exception(f"LLM provider error: {str(e)}")


async def generate_title(messages: List[Dict[str, str]]) -> str:
    """
    Generate a short title for a conversation based on the first user message.
    
    Returns a simplified title (first few words of the user message).
    """
    if not messages:
        return "New Chat"
    
    # Find first user message
    user_msg = next((m for m in messages if m.get("role") == "user"), None)
    if not user_msg:
        return "New Chat"
    
    content = user_msg.get("content", "").strip()
    if not content:
        return "New Chat"
    
    # Take first 6-8 meaningful words
    words = content.split()[:8]
    title = " ".join(words)
    if len(content) > len(title):
        title += "..."
    
    return title

