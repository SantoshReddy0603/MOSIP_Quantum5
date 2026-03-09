# 🧒 Child Health Record Booklet System

## 📌 Overview

The **Child Health Record Booklet System** is a full-stack web application for managing and tracking child health records digitally.

Healthcare workers can record child health data such as weight, height, illnesses, and visible symptoms.  
The backend automatically calculates **BMI and malnutrition status**, stores records, and generates **PDF health booklets**.

The system also supports **photo uploads**, **statistics tracking**, and **record management**.

---

## 🚀 Features

• Child health record management  
• Automatic **BMI calculation**  
• **Malnutrition status detection**  
• Upload child photos  
• Generate **PDF health booklets**  
• View all stored records  
• Malnutrition statistics dashboard  
• Delete existing records  
• REST API with FastAPI  

---

## 🛠 Tech Stack

**Frontend**
- React
- Vite
- TailwindCSS

**Backend**
- Python
- FastAPI
- Uvicorn
- ReportLab (PDF generation)

**Storage**
- JSON file database

---

## 📂 Project Structure

```
project-root
│
├── backend
│   ├── main.py
│   ├── requirements.txt
│   └── child_records.json
│
├── frontend
│   ├── src
│   ├── package.json
│   └── vite.config.ts
│
└── README.md
```

---

## ⚙️ Backend Setup

```
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

Backend runs at:

```
http://localhost:8000
```

API docs:

```
http://localhost:8000/docs
```

---

## 💻 Frontend Setup

```
cd frontend
npm install
npm run dev
```

Frontend runs at:

```
http://localhost:5173
```

---

## 🔗 Main API Endpoints

| Method | Endpoint | Description |
|------|------|------|
| POST | `/upload` | Upload child health record |
| POST | `/upload-photo` | Upload child photo |
| GET | `/booklet/{health_id}` | Download PDF booklet |
| GET | `/records` | Get all records |
| GET | `/stats` | Malnutrition statistics |
| DELETE | `/records/{health_id}` | Delete record |
| GET | `/health` | API health check |

---

## 📈 Future Improvements

• Database integration (MongoDB/PostgreSQL)  
• Authentication system  
• Role-based access control  
• Cloud storage for photos  

---

## 📄 License

Educational project developed for learning and experimentation.
