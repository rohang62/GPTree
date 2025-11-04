from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
import uuid

from supabase_client import get_supabase_client

router = APIRouter()


@router.get("/api/messages")
async def get_messages(
    conversation_id: str = Query(..., description="Conversation ID"),
    user_id: str = Query(..., description="User ID"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Number of items per page"),
):
    """Get messages for a conversation with pagination, ordered by created_at asc"""
    try:
        # First verify the conversation belongs to the user
        supabase = get_supabase_client()
        conv_check = supabase.table("conversations")\
            .select("conversation_id")\
            .eq("conversation_id", conversation_id)\
            .eq("user_id", user_id)\
            .single()\
            .execute()
        
        if not conv_check.data:
            raise HTTPException(status_code=404, detail="Conversation not found or access denied")
        
        offset = (page - 1) * page_size
        
        response = get_supabase_client().table("messages")\
            .select("*")\
            .eq("conversation_id", conversation_id)\
            .eq("user_id", user_id)\
            .order("created_at", desc=False)\
            .range(offset, offset + page_size - 1)\
            .execute()
        
        # Get total count for pagination info
        count_response = get_supabase_client().table("messages")\
            .select("*", count="exact")\
            .eq("conversation_id", conversation_id)\
            .eq("user_id", user_id)\
            .execute()
        
        total_count = count_response.count if hasattr(count_response, 'count') else len(response.data)
        has_more = offset + page_size < total_count
        
        return {
            "data": response.data,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_count": total_count,
                "has_more": has_more,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/messages")
async def create_message(
    conversation_id: str,
    user_id: str,
    role: str,
    content: str,
):
    """Create a new message"""
    try:
        # Verify conversation belongs to user
        supabase = get_supabase_client()
        conv_check = supabase.table("conversations")\
            .select("conversation_id")\
            .eq("conversation_id", conversation_id)\
            .eq("user_id", user_id)\
            .single()\
            .execute()
        
        if not conv_check.data:
            raise HTTPException(status_code=404, detail="Conversation not found or access denied")
        
        message_id = str(uuid.uuid4())
        
        response = get_supabase_client().table("messages")\
            .insert({
                "message_id": message_id,
                "conversation_id": conversation_id,
                "user_id": user_id,
                "role": role,
                "content": content,
            })\
            .execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create message")
        
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
