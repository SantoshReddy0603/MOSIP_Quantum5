"""
Child Health Records Backend API

Features:
- Child health record management
- BMI and malnutrition assessment
- Photo upload support
- Automatic PDF booklet generation
- Statistical analysis of malnutrition data
"""

from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, Dict
import json
import os
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import shutil

app = FastAPI(title="Child Health Records API")

# ✅ Enhanced CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173", 
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# File paths
DB_FILE = "child_records.json"
BOOKLETS_DIR = "booklets"
PHOTOS_DIR = "photos"

class ChildRecord(BaseModel):
    id: Optional[int] = None
    healthId: str
    name: str
    age: Optional[str] = ""
    weight: Optional[str] = ""
    height: Optional[str] = ""
    parent: Optional[str] = ""
    visible_signs: Optional[str] = ""
    recent_illness: Optional[str] = ""
    latitude: Optional[str] = ""
    longitude: Optional[str] = ""
    location_name: Optional[str] = ""
    bmi: Optional[float] = None
    malnutrition_status: Optional[str] = ""
    consent: Optional[bool] = False
    uploaded: Optional[bool] = False
    timestamp: Optional[str] = ""
    photo_filename: Optional[str] = ""

def calculate_bmi(weight: float, height: float) -> float:
    """Calculate BMI from weight (kg) and height (m)"""
    if height <= 0:
        return 0
    height_m = height / 100  # Convert cm to meters
    return weight / (height_m * height_m)

def assess_malnutrition(bmi: float, age: float) -> str:
    """Assess malnutrition status based on BMI and age"""
    if bmi == 0:
        return "Unknown"
    
    # Simple BMI-based assessment
    if age < 18:  # Children and adolescents
        if bmi < 16:
            return "Severely Underweight"
        elif bmi < 18.5:
            return "Underweight"
        elif bmi < 25:
            return "Normal"
        elif bmi < 30:
            return "Overweight"
        else:
            return "Obese"
    else:  # Adults (fallback)
        if bmi < 18.5:
            return "Underweight"
        elif bmi < 25:
            return "Normal"
        elif bmi < 30:
            return "Overweight"
        else:
            return "Obese"

def load_db() -> Dict[str, dict]:
    """Load records from JSON file"""
    try:
        if os.path.exists(DB_FILE):
            with open(DB_FILE, 'r') as f:
                return json.load(f)
        return {}
    except Exception as e:
        print(f"Error loading database: {e}")
        return {}

def save_db(db: Dict[str, dict]):
    """Save records to JSON file"""
    try:
        with open(DB_FILE, 'w') as f:
            json.dump(db, f, indent=2)
    except Exception as e:
        print(f"Error saving database: {e}")

@app.on_event("startup")
async def startup_event():
    """Initialize database and directories"""
    if not os.path.exists(DB_FILE):
        save_db({})
    os.makedirs(BOOKLETS_DIR, exist_ok=True)
    os.makedirs(PHOTOS_DIR, exist_ok=True)
    print("✅ Backend server started successfully!")

@app.post("/upload")
async def upload_record(record: ChildRecord):
    try:
        # Validate required fields
        if not record.name or not record.healthId:
            raise HTTPException(status_code=400, detail="Name and healthId are required")
        
        if not record.consent:
            raise HTTPException(status_code=400, detail="Parental consent required")
        
        # Calculate BMI and malnutrition status
        try:
            weight = float(record.weight) if record.weight else 0
            height = float(record.height) if record.height else 0
            age = float(record.age) if record.age else 0
            
            bmi = calculate_bmi(weight, height)
            malnutrition_status = assess_malnutrition(bmi, age)
            
            record.bmi = round(bmi, 2)
            record.malnutrition_status = malnutrition_status
        except (ValueError, TypeError):
            record.bmi = None
            record.malnutrition_status = "Unknown"
        
        db = load_db()
        
        # Add metadata
        record_dict = record.dict()
        record_dict['server_received'] = datetime.now().isoformat()
        record_dict['uploaded'] = True
        
        # Store in database
        db[record.healthId] = record_dict
        save_db(db)
        
        print(f"✅ Uploaded record: {record.healthId} - BMI: {record.bmi}, Status: {record.malnutrition_status}")
        
        return {
            "status": "success", 
            "healthId": record.healthId,
            "message": "Record uploaded successfully",
            "bmi": record.bmi,
            "malnutrition_status": record.malnutrition_status
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Upload error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/upload-photo")
async def upload_photo(health_id: str, file: UploadFile = File(...)):
    try:
        # Validate file type
        if not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Generate filename
        file_extension = os.path.splitext(file.filename)[1]
        contents = await file.read()
        if len(contents) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large (max 5MB)")
        
        with open(file_path, "wb") as buffer:
            buffer.write(contents)
        filename = f"{health_id}{file_extension}"
        file_path = os.path.join(PHOTOS_DIR, filename)
        
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Update record with photo filename
        db = load_db()
        if health_id in db:
            db[health_id]['photo_filename'] = filename
            save_db(db)
        
        return {
            "status": "success",
            "filename": filename,
            "message": "Photo uploaded successfully"
        }
    except Exception as e:
        print(f"❌ Photo upload error: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload photo")

@app.get("/booklet/{health_id}")
async def get_booklet(health_id: str):
    try:
        db = load_db()
        
        if health_id not in db:
            raise HTTPException(status_code=404, detail="Record not found")
        
        record = db[health_id]
        
        # Create PDF
        filename = f"{BOOKLETS_DIR}/{health_id}.pdf"
        
        c = canvas.Canvas(filename, pagesize=letter)
        width, height = letter
        
        # Title
        c.setFont("Helvetica-Bold", 16)
        c.drawString(100, height - 100, "Child Health Record Booklet")
        
        # Health ID
        c.setFont("Helvetica-Bold", 12)
        c.drawString(100, height - 130, f"Health ID: {record.get('healthId', 'N/A')}")
        
        # Add photo if exists
        photo_filename = record.get('photo_filename')
        if photo_filename:
            photo_path = os.path.join(PHOTOS_DIR, photo_filename)
            if os.path.exists(photo_path):
                try:
                    img = ImageReader(photo_path)
                    c.drawImage(img, width - 200, height - 200, width=100, height=100)
                    c.drawString(width - 200, height - 210, "Child Photo")
                except Exception as e:
                    print(f"⚠️ Could not add photo to PDF: {e}")
        
        # Record details
        c.setFont("Helvetica", 10)
        y = height - 160
        
        details = [
            ("Child Name", record.get('name', 'N/A')),
            ("Age", f"{record.get('age', 'N/A')} years"),
            ("Weight", f"{record.get('weight', 'N/A')} kg"),
            ("Height", f"{record.get('height', 'N/A')} cm"),
            ("BMI", f"{record.get('bmi', 'N/A')}"),
            ("Nutrition Status", record.get('malnutrition_status', 'Unknown')),
            ("Parent/Guardian", record.get('parent', 'N/A')),
            ("Visible Signs", record.get('visible_signs', 'None')),
            ("Recent Illnesses", record.get('recent_illness', 'None')),
            ("Location", record.get('location_name', 'N/A')),
            ("Parental Consent", "Yes" if record.get('consent') else "No"),
            ("Record Created", record.get('timestamp', 'N/A')),
        ]
        
        for label, value in details:
            c.drawString(100, y, f"{label}: {value}")
            y -= 20
            
            if y < 100:
                c.showPage()
                c.setFont("Helvetica", 10)
                y = height - 100
        
        c.save()
        
        return FileResponse(
            filename, 
            media_type="application/pdf", 
            filename=f"{health_id}_health_record.pdf"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ PDF generation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate PDF")

@app.get("/records")
async def get_all_records():
    """Get all stored records"""
    try:
        db = load_db()
        return {
            "count": len(db),
            "records": list(db.values())
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to retrieve records")

@app.get("/stats")
async def get_statistics():
    """Get malnutrition statistics"""
    try:
        db = load_db()
        records = list(db.values())
        
        total_records = len(records)
        if total_records == 0:
            return {
                "total_records": 0,
                "malnutrition_stats": {
                    "Normal": {"count": 0, "percentage": 0},
                    "Underweight": {"count": 0, "percentage": 0},
                    "Severely Underweight": {"count": 0, "percentage": 0},
                    "Overweight": {"count": 0, "percentage": 0},
                    "Obese": {"count": 0, "percentage": 0},
                    "Unknown": {"count": 0, "percentage": 0}
                }
            }
        
        # Malnutrition statistics
        status_count = {
            "Normal": 0,
            "Underweight": 0,
            "Severely Underweight": 0,
            "Overweight": 0,
            "Obese": 0,
            "Unknown": 0
        }
        
        for record in records:
            status = record.get('malnutrition_status', 'Unknown')
            status_count[status] = status_count.get(status, 0) + 1
        
        # Calculate percentages
        malnutrition_stats = {}
        for status, count in status_count.items():
            malnutrition_stats[status] = {
                'count': count,
                'percentage': round((count / total_records) * 100, 1) if total_records > 0 else 0
            }
        
        return {
            "total_records": total_records,
            "malnutrition_stats": malnutrition_stats
        }
    except Exception as e:
        print(f"❌ Stats error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate statistics")

@app.delete("/records/{health_id}")
async def delete_record(health_id: str):
    """Delete a specific record"""
    try:
        db = load_db()
        if health_id not in db:
            raise HTTPException(status_code=404, detail="Record not found")
        
        # Delete photo if exists
        photo_filename = db[health_id].get('photo_filename')
        if photo_filename:
            photo_path = os.path.join(PHOTOS_DIR, photo_filename)
            if os.path.exists(photo_path):
                os.remove(photo_path)
        
        del db[health_id]
        save_db(db)
        
        # Clean up PDF file if exists
        pdf_path = f"{BOOKLETS_DIR}/{health_id}.pdf"
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
            
        return {"status": "success", "message": "Record deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete record")

@app.get("/")
async def read_root():
    return {
        "message": "Child Health Records Backend is running!",
        "endpoints": {
            "POST /upload": "Upload a child record",
            "POST /upload-photo": "Upload child photo",
            "GET /booklet/{health_id}": "Download PDF booklet",
            "GET /records": "Get all records",
            "GET /stats": "Get malnutrition statistics",
            "DELETE /records/{health_id}": "Delete a record",
            "GET /health": "Health check"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        db = load_db()
        return {
            "status": "healthy", 
            "timestamp": datetime.now().isoformat(),
            "records_count": len(db),
            "server": "Child Health Records API"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Health check failed")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
