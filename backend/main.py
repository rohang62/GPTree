from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi import Request
from routers import chat, conversations, messages

app = FastAPI(title="RohanGPT API")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://192.168.0.64:5173", "*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Include routers
app.include_router(chat.router)
app.include_router(conversations.router)
app.include_router(messages.router)


@app.get("/api/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}

