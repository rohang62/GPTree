import os
from typing import Optional

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Lazy initialization to avoid import errors if supabase is not installed
supabase: Optional[object] = None

def get_supabase_client():
    """Get or create Supabase client with lazy initialization"""
    global supabase
    
    if supabase is not None:
        return supabase
    
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables. "
            "Please add them to your backend/.env file."
        )
    
    try:
        from supabase import create_client, Client
        
        # Create client with service role key - this should bypass RLS
        # The service role key automatically bypasses RLS, no special options needed
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        return supabase
    except ImportError:
        raise ImportError(
            "Supabase package is not installed. Please run: pip install supabase>=2.0.0"
        )

