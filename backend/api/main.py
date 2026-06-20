"""
FastAPI Backend
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import repositories, languages

app = FastAPI(
    title="Habitable Worlds API",
    description="Backend for the GitHub-as-Universe data storytelling app",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers                                                            
app.include_router(repositories.router, prefix="/repos",     tags=["Repositories"])
app.include_router(languages.router,    prefix="/languages", tags=["Languages / Galaxies"])

@app.get("/health", tags=["Meta"])
def health():
    return {"status": "ok"}
