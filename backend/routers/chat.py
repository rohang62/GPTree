from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse
import json
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime

from llm_providers.openai import stream_chat
from supabase_client import get_supabase_client

router = APIRouter()


def sse_format(event: str, data: dict) -> bytes:
    """Format SSE event as bytes"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")


@router.options("/api/chat/stream")
async def options_chat_stream():
    """Handle CORS preflight for streaming endpoint"""
    from fastapi.responses import Response
    return Response(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "3600",
        }
    )


@router.post("/api/chat/stream")
async def chat_stream(request: Request):
    """
    Stream chat completion using SSE.
    
    Expected payload:
    {
        "userId": "user-uuid",
        "conversationId": "optional-uuid",
        "messages": [{"role": "user|assistant|system", "content": "..."}],
        "model": "gpt-4",
        "temperature": 0.7
    }
    """
    try:
        payload = await request.json()
        user_id = payload.get("userId")
        messages = payload.get("messages", [])
        conversation_id = payload.get("conversationId")
        model = payload.get("model", "gpt-4")
        temperature = payload.get("temperature", 0.7)
        
        if not user_id:
            raise HTTPException(status_code=400, detail="userId is required")
        
        # Get Supabase client for use in stream function
        supabase = get_supabase_client()
        
        # Generate conversation ID if not provided
        if not conversation_id:
            conversation_id = str(uuid.uuid4())
            # For new conversations, messages must be provided
            if not messages:
                raise HTTPException(status_code=400, detail="Messages are required for new conversations")
            openai_messages = [
                {"role": msg["role"], "content": msg["content"]}
                for msg in messages
            ]
        else:
            # For existing conversations, load full history from database
            # Check if this is a side thread
            conv_info = supabase.table("conversations")\
                .select("is_side_thread, parent_message_id, parent_conversation_id")\
                .eq("conversation_id", conversation_id)\
                .eq("user_id", user_id)\
                .single()\
                .execute()
            
            is_side_thread = conv_info.data.get("is_side_thread") if conv_info.data else False
            
            if is_side_thread and conv_info.data:
                # For side threads, load parent conversation history up to parent message
                parent_conv_id = conv_info.data.get("parent_conversation_id")
                parent_msg_id = conv_info.data.get("parent_message_id")
                
                # Load all messages from parent conversation up to (and including) parent message
                parent_messages_response = supabase.table("messages")\
                    .select("*")\
                    .eq("conversation_id", parent_conv_id)\
                    .eq("user_id", user_id)\
                    .order("created_at", desc=False)\
                    .execute()
                
                # Find parent message index
                parent_msg_index = -1
                if parent_messages_response.data:
                    for idx, msg in enumerate(parent_messages_response.data):
                        if msg.get("message_id") == parent_msg_id:
                            parent_msg_index = idx
                            break
                    
                    # Include parent conversation messages up to and including parent message
                    openai_messages = [
                        {"role": msg["role"], "content": msg["content"]}
                        for msg in parent_messages_response.data[:parent_msg_index + 1]
                    ]
                else:
                    openai_messages = []
                
                # Now load side thread's own messages
                side_thread_messages = supabase.table("messages")\
                    .select("*")\
                    .eq("conversation_id", conversation_id)\
                    .eq("user_id", user_id)\
                    .order("created_at", desc=False)\
                    .execute()
                
                if side_thread_messages.data:
                    for msg in side_thread_messages.data:
                        openai_messages.append({
                            "role": msg["role"],
                            "content": msg["content"]
                        })
                
                # Append new user message if provided
                if messages:
                    new_user_msg = next((m for m in messages if m["role"] == "user"), None)
                    if new_user_msg:
                        last_msg = openai_messages[-1] if openai_messages else None
                        if not last_msg or last_msg["content"] != new_user_msg["content"]:
                            openai_messages.append({
                                "role": new_user_msg["role"],
                                "content": new_user_msg["content"]
                            })
            else:
                # For main conversations, load full history (excluding side thread messages)
                # Load all messages from the conversation (no pagination - get full history)
                messages_response = supabase.table("messages")\
                    .select("*")\
                    .eq("conversation_id", conversation_id)\
                    .eq("user_id", user_id)\
                    .order("created_at", desc=False)\
                    .execute()
                
                # Build conversation history from database
                if messages_response.data:
                    openai_messages = [
                        {"role": msg["role"], "content": msg["content"]}
                        for msg in messages_response.data
                    ]
                    
                    # Append the new user message if provided (for continue/regenerate, no new message)
                    if messages:
                        new_user_msg = next((m for m in messages if m["role"] == "user"), None)
                        if new_user_msg:
                            # Check if this message is already in history (to avoid duplicates)
                            last_msg = openai_messages[-1] if openai_messages else None
                            if not last_msg or last_msg["content"] != new_user_msg["content"]:
                                openai_messages.append({
                                    "role": new_user_msg["role"],
                                    "content": new_user_msg["content"]
                                })
                else:
                    # No history found, use provided messages as fallback
                    if not messages:
                        raise HTTPException(status_code=400, detail="No conversation history found and no messages provided")
                    openai_messages = [
                        {"role": msg["role"], "content": msg["content"]}
                        for msg in messages
                    ]
        
        async def generate_stream():
            full_response = ""
            import asyncio
            last_keepalive = asyncio.get_event_loop().time()
            
            # Get Supabase client for saving messages
            db_client = get_supabase_client()
            
            try:
                # Stream tokens
                async for token in stream_chat(
                    messages=openai_messages,
                    model=model,
                    temperature=temperature,
                ):
                    if await request.is_disconnected():
                        break
                    
                    full_response += token
                    yield sse_format("token", {"content": token})
                    
                    # Send keep-alive comment every 15 seconds
                    current_time = asyncio.get_event_loop().time()
                    if current_time - last_keepalive > 15:
                        yield ": keep-alive\n\n".encode("utf-8")
                        last_keepalive = current_time
                
                # Save conversation and messages to Supabase
                try:
                    
                    # Get or create conversation
                    conv_check = db_client.table("conversations")\
                        .select("conversation_id")\
                        .eq("conversation_id", conversation_id)\
                        .eq("user_id", user_id)\
                        .execute()
                    
                    if not conv_check.data or len(conv_check.data) == 0:
                        # Create new conversation
                        title = openai_messages[0]["content"][:50] + "..." if openai_messages[0]["content"] else "New Chat"
                        conv_response = db_client.table("conversations")\
                            .insert({
                                "conversation_id": conversation_id,
                                "user_id": user_id,
                                "title": title,
                                "model": model,
                                "temperature": temperature,
                            })\
                            .execute()
                        
                        if not conv_response.data:
                            raise Exception(f"Failed to create conversation: {conv_response}")
                    
                    # Save user message - get the last user message from the conversation history
                    # (this is the new message that was just sent)
                    last_user_msg_in_history = None
                    for msg in reversed(openai_messages):
                        if msg["role"] == "user":
                            last_user_msg_in_history = msg
                            break
                    
                    # Save the user message if it exists
                    # For new conversations, this will be the first message
                    # For existing conversations, this will be the new message appended to history
                    if last_user_msg_in_history:
                        # Check if this exact message already exists in DB (avoid duplicates)
                        existing_msg_check = db_client.table("messages")\
                            .select("message_id")\
                            .eq("conversation_id", conversation_id)\
                            .eq("user_id", user_id)\
                            .eq("content", last_user_msg_in_history["content"])\
                            .eq("role", "user")\
                            .order("created_at", desc=True)\
                            .limit(1)\
                            .execute()
                        
                        # Only save if it doesn't already exist
                        if not existing_msg_check.data or len(existing_msg_check.data) == 0:
                            user_msg_response = db_client.table("messages")\
                                .insert({
                                    "message_id": str(uuid.uuid4()),
                                    "conversation_id": conversation_id,
                                    "user_id": user_id,
                                    "role": "user",
                                    "content": last_user_msg_in_history["content"],
                                })\
                                .execute()
                            
                            if not user_msg_response.data:
                                raise Exception(f"Failed to save user message: {user_msg_response}")
                    
                    # Save assistant response
                    assistant_msg_response = db_client.table("messages")\
                        .insert({
                            "message_id": str(uuid.uuid4()),
                            "conversation_id": conversation_id,
                            "user_id": user_id,
                            "role": "assistant",
                            "content": full_response,
                        })\
                        .execute()
                    
                    if not assistant_msg_response.data:
                        raise Exception(f"Failed to save assistant message: {assistant_msg_response}")
                    
                    # Update conversation timestamp
                    update_response = db_client.table("conversations")\
                        .update({"updated_at": datetime.utcnow().isoformat()})\
                        .eq("conversation_id", conversation_id)\
                        .eq("user_id", user_id)\
                        .execute()
                    
                except Exception as db_error:
                    # Log error but don't fail the stream - send error event instead
                    import traceback
                    error_detail = traceback.format_exc()
                    yield sse_format("error", {"message": f"Failed to save to database: {str(db_error)}"})
                
                # Send done event
                yield sse_format("done", {
                    "finish_reason": "stop",
                    "conversationId": conversation_id,
                })
                
            except Exception as e:
                yield sse_format("error", {"message": str(e)})
        
        return EventSourceResponse(
            generate_stream(),
            media_type="text/event-stream",
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/chat")
async def chat_non_stream(payload: dict):
    """
    Non-streaming chat endpoint (fallback).
    
    Returns the full response as JSON.
    """
    try:
        messages = payload.get("messages", [])
        model = payload.get("model", "gpt-4")
        temperature = payload.get("temperature", 0.7)
        
        if not messages:
            raise HTTPException(status_code=400, detail="Messages are required")
        
        openai_messages = [
            {"role": msg["role"], "content": msg["content"]}
            for msg in messages
        ]
        
        full_response = ""
        async for token in stream_chat(
            messages=openai_messages,
            model=model,
            temperature=temperature,
        ):
            full_response += token
        
        return {"content": full_response}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
