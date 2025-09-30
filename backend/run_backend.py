import uvicorn

if __name__ == "__main__":
    print("🚀 Starting Child Health Records Backend Server...")
    print("📍 Server will run at: http://localhost:8000")
    print("📚 API documentation: http://localhost:8000/docs")
    print("⏹️  Press CTRL+C to stop the server")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)