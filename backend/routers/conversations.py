from fastapi import APIRouter, HTTPException, Query, Request
from typing import List, Optional
from pydantic import BaseModel
import uuid
from datetime import datetime

from supabase_client import get_supabase_client

router = APIRouter()


@router.get("/api/conversations")
async def get_conversations(
    user_id: str = Query(..., description="User ID"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Number of items per page"),
):
    """Get conversations for a user with pagination, ordered by updated_at desc"""
    try:
        offset = (page - 1) * page_size
        
        supabase = get_supabase_client()
        
        # Get conversations with pagination, excluding side threads
        response = supabase.table("conversations")\
            .select("*")\
            .eq("user_id", user_id)\
            .eq("is_side_thread", False)\
            .order("updated_at", desc=True)\
            .range(offset, offset + page_size - 1)\
            .execute()
        
        # Get total count for pagination info (excluding side threads)
        count_response = supabase.table("conversations")\
            .select("conversation_id", count="exact")\
            .eq("user_id", user_id)\
            .eq("is_side_thread", False)\
            .execute()
        
        # Handle count - Supabase returns it in the response object
        total_count = 0
        if hasattr(count_response, 'count') and count_response.count is not None:
            total_count = count_response.count
        elif response.data:
            # Fallback: if we can't get exact count, estimate based on current page
            total_count = len(response.data) + offset
            if len(response.data) == page_size:
                total_count += 1  # Indicate there might be more
        
        has_more = offset + page_size < total_count if total_count > 0 else len(response.data) == page_size
        
        return {
            "data": response.data or [],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_count": total_count,
                "has_more": has_more,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/conversations")
async def create_conversation(
    user_id: str,
    title: str,
    model: str = "gpt-4",
    temperature: float = 0.7,
    is_side_thread: bool = False,
    parent_message_id: Optional[str] = None,
    parent_conversation_id: Optional[str] = None,
):
    """Create a new conversation"""
    try:
        conversation_id = str(uuid.uuid4())
        
        supabase = get_supabase_client()
        insert_data = {
            "conversation_id": conversation_id,
            "user_id": user_id,
            "title": title,
            "model": model,
            "temperature": temperature,
            "is_side_thread": is_side_thread,
        }
        
        if parent_message_id:
            insert_data["parent_message_id"] = parent_message_id
        if parent_conversation_id:
            insert_data["parent_conversation_id"] = parent_conversation_id
        
        response = supabase.table("conversations")\
            .insert(insert_data)\
            .execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create conversation")
        
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SideThreadCreate(BaseModel):
    user_id: str
    parent_message_id: str
    parent_conversation_id: str
    selected_text: str
    start_index: int
    end_index: int


@router.post("/api/conversations/side-thread")
async def create_side_thread(payload: SideThreadCreate):
    """Create a side thread from selected text"""
    try:
        supabase = get_supabase_client()
        
        # Verify parent message exists and belongs to user
        parent_msg = supabase.table("messages")\
            .select("*")\
            .eq("message_id", payload.parent_message_id)\
            .eq("user_id", payload.user_id)\
            .single()\
            .execute()
        
        if not parent_msg.data:
            raise HTTPException(status_code=404, detail="Parent message not found")
        
        # Create side thread conversation
        side_thread_id = str(uuid.uuid4())
        side_thread_title = f"Side: {payload.selected_text[:30]}..." if len(payload.selected_text) > 30 else f"Side: {payload.selected_text}"
        
        conv_response = supabase.table("conversations")\
            .insert({
                "conversation_id": side_thread_id,
                "user_id": payload.user_id,
                "title": side_thread_title,
                "model": "RohanGPT",  # Default model
                "temperature": 0.7,  # Default temperature
                "is_side_thread": True,
                "parent_message_id": payload.parent_message_id,
                "parent_conversation_id": payload.parent_conversation_id,
            })\
            .execute()
        
        if not conv_response.data:
            raise HTTPException(status_code=500, detail="Failed to create side thread")
        
        # Update parent message to include button indices
        current_indices = parent_msg.data.get("indices_for_button") or []
        if not isinstance(current_indices, list):
            current_indices = []
        
        new_button = {
            "start": payload.start_index,
            "end": payload.end_index,
            "conversation_id": side_thread_id,
        }
        current_indices.append(new_button)
        
        # Update message with button indices
        update_response = supabase.table("messages")\
            .update({"indices_for_button": current_indices})\
            .eq("message_id", payload.parent_message_id)\
            .eq("user_id", payload.user_id)\
            .execute()
        
        # Create initial message in side thread with the selected text as context
        initial_msg_id = str(uuid.uuid4())
        initial_message = supabase.table("messages")\
            .insert({
                "message_id": initial_msg_id,
                "conversation_id": side_thread_id,
                "user_id": payload.user_id,
                "role": "user",
                "content": f"Discuss this: {payload.selected_text}",
            })\
            .execute()
        
        return {
            "conversation": conv_response.data[0],
            "message": update_response.data[0] if update_response.data else parent_msg.data,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    user_id: str = Query(..., description="User ID"),
):
    """Get a single conversation by ID"""
    try:
        supabase = get_supabase_client()
        response = supabase.table("conversations")\
            .select("*")\
            .eq("conversation_id", conversation_id)\
            .eq("user_id", user_id)\
            .single()\
            .execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        return response.data
    except Exception as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail="Conversation not found")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/api/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    request: Request,
    user_id: Optional[str] = Query(None, description="User ID (optional if provided in JSON body)"),
):
    """Update a conversation. Accepts JSON body (preferred) and logs payload for debugging.
    Body example: {"user_id":"...","title":"New title"}
    """
    try:
        # Manually parse JSON to avoid pre-validation 422s
        try:
            body = await request.json()
        except Exception:
            body = {}

        uid = body.get("user_id") or user_id
        if not uid:
            raise HTTPException(status_code=400, detail="user_id is required (in JSON body or as query param)")

        update_data = {}
        if body.get("title") is not None:
            update_data["title"] = body.get("title")
        if body.get("model") is not None:
            update_data["model"] = body.get("model")
        if body.get("temperature") is not None:
            update_data["temperature"] = body.get("temperature")

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        supabase = get_supabase_client()
        response = supabase.table("conversations")\
            .update(update_data)\
            .eq("conversation_id", conversation_id)\
            .eq("user_id", uid)\
            .execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Conversation not found")

        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    user_id: str = Query(..., description="User ID"),
):
    """Delete a conversation and all its messages (cascade delete)"""
    try:
        supabase = get_supabase_client()
        response = supabase.table("conversations")\
            .delete()\
            .eq("conversation_id", conversation_id)\
            .eq("user_id", user_id)\
            .execute()
        
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
