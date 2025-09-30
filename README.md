Child Health Record Booklet - Installation and Usage Guide

Overview

A digital platform to manage and track child health records efficiently.
Designed for low-connectivity environments, it ensures offline-first
functionality with automatic synchronization once internet access is
restored.

Prerequisites

-   Python 3.8+
-   pip
-   Node.js 16+ or https://nodejs.org/en
-   npm

Installation & Setup

Clone the repository: git clone
https://github.com/your-username/child-health-record-booklet.git cd
child-health-record-booklet

Backend Setup

cd backend 
pip install -r requirements.txt 
python -m uvicorn main:app –reload –port 8000

Backend runs at: http://127.0.0.1:8000

Frontend Setup

cd frontend
npm install
npm run dev

Frontend runs at: http://localhost:xxxx

Usage

1.  Start the backend server.
2.  Start the frontend server.
3.  Open the frontend URL in a browser.
4.  Use the interface to add, view, and manage child health records.

To stop servers: press CTRL + C in the terminal.
