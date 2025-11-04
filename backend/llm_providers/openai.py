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
    model: str = "gpt-4.1",
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
    Ask the LLM to produce a concise conversation title using the first user
    message and the first assistant reply. Falls back to a heuristic if the
    provider call fails. Always returns a short string (<= 8 words) without
    quotes or trailing punctuation.
    """
    if not messages:
        return "New Chat"

    # Extract first user and first assistant contents
    first_user = next((m for m in messages if m.get("role") == "user" and m.get("content")), None)
    first_assistant = next((m for m in messages if m.get("role") == "assistant" and m.get("content")), None)

    user_text = (first_user or {}).get("content", "").strip()
    assistant_text = (first_assistant or {}).get("content", "").strip()

    if not user_text and not assistant_text:
        return "New Chat"

    prompt_user = (
        "User message:\n" + user_text + "\n\nAssistant reply:\n" + assistant_text + "\n\n"
        "Write a concise, descriptive conversation title (<= 8 words). "
        "No quotes, no trailing punctuation. Return ONLY the title."
    )

    try:
        client = get_client()
        comp = await client.chat.completions.create(
            model="gpt-4.1",  # keep consistent with default app model
            temperature=0.2,
            messages=[
                {"role": "system", "content": "You write short, clear titles for conversations."},
                {"role": "user", "content": prompt_user},
            ],
        )
        title = comp.choices[0].message.content.strip() if comp.choices else ""
        # Sanitize: cap words and strip quotes/punctuation
        import re
        title = re.sub(r'^[\"\'\s]+|[\"\'\s]+$', "", title)
        words = title.split()
        if len(words) > 8:
            title = " ".join(words[:8])
        title = title.rstrip(".!?，。！？」』\"'")
        return title or "New Chat"
    except Exception:
        # Fallback heuristic (first sentence of assistant or user)
        text = assistant_text or user_text
        if not text:
            return "New Chat"
        sentence_end = min([i for i in [text.find('.'), text.find('!'), text.find('?')] if i != -1] or [len(text)])
        first_sentence = text[: sentence_end + 1] if sentence_end < len(text) else text
        words = first_sentence.split()[:8]
        return (" ".join(words)).strip() or "New Chat"

