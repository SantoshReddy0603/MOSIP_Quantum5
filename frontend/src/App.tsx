import React, { useState, useEffect } from "react";
import axios from "axios";
import { openDB } from "idb";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Checkbox } from "./components/ui/checkbox";
import { Badge } from "./components/ui/badge";
import { Wifi, WifiOff, Loader2, AlertCircle, Server, Download, Camera, MapPin, User, List } from "lucide-react";

const DB_NAME = "child_records";
const STORE_NAME = "records";

async function initDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    },
  });
}

// Faster internet check with multiple endpoints
async function checkInternet() {
  const endpoints = [
    "https://www.gstatic.com/generate_204",
    "https://connectivitycheck.gstatic.com/generate_204",
    "https://jsonplaceholder.typicode.com/posts/1",
  ];

  const timeout = 2000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'HEAD',
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok || response.status === 204;
    } catch {
      continue;
    }
  }
  
  clearTimeout(timeoutId);
  return false;
}

// Faster backend check
async function checkBackendConnection() {
  try {
    const response = await axios.get("http://localhost:8000/health", {
      timeout: 2000
    });
    return response.data.status === "healthy";
  } catch (error) {
    return false;
  }
}

interface ChildRecord {
  name: string;
  age: string;
  weight: string;
  height: string;
  parent: string;
  visible_signs: string;
  recent_illness: string;
  latitude: string;
  longitude: string;
  consent: boolean;
  photoFile?: File | null;
}

interface SavedRecord extends ChildRecord {
  id: number;
  healthId: string;
  uploaded: boolean;
  timestamp: string;
  photo_filename?: string;
}

type ActiveTab = 'form' | 'records';

function App() {
  const [child, setChild] = useState<ChildRecord>({
    name: "",
    age: "",
    weight: "",
    height: "",
    parent: "",
    visible_signs: "",
    recent_illness: "",
    latitude: "",
    longitude: "",
    consent: false,
    photoFile: null,
  });
  const [records, setRecords] = useState<SavedRecord[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [otp, setOtp] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [isBackendOnline, setIsBackendOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('form');

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!child.photoFile) newErrors.photo = "Child photo is required";
    if (!child.name.trim()) newErrors.name = "Name is required";
    if (child.age && isNaN(Number(child.age))) newErrors.age = "Age must be a number";
    if (child.age && Number(child.age) <= 0) newErrors.age = "Age must be positive";
    if (!child.weight.trim()) newErrors.weight = "Weight is required";
    if (child.weight && isNaN(Number(child.weight))) newErrors.weight = "Weight must be a number";
    if (child.weight && Number(child.weight) <= 0) newErrors.weight = "Weight must be positive";
    if (!child.height.trim()) newErrors.height = "Height is required";
    if (child.height && isNaN(Number(child.height))) newErrors.height = "Height must be a number";
    if (child.height && Number(child.height) <= 0) newErrors.height = "Height must be positive";
    if (!child.parent.trim()) newErrors.parent = "Parent name is required";
    if (!child.consent) newErrors.consent = "Consent is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  useEffect(() => {
    let mounted = true;

    const updateOnlineStatus = async () => {
      if (!mounted) return;

      const online = await checkInternet();
      if (!mounted) return;
      
      setIsOnline(online);
      
      if (online) {
        const backendOnline = await checkBackendConnection();
        if (mounted) setIsBackendOnline(backendOnline);
      } else {
        setIsBackendOnline(false);
      }
    };

    updateOnlineStatus();
    
    const handleOnline = () => {
      setIsOnline(true);
      updateOnlineStatus();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsBackendOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(updateOnlineStatus, 15000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    loadRecords();
  }, []);

  async function loadRecords() {
    try {
      const db = await initDB();
      const allRecords = await db.getAll(STORE_NAME);
      allRecords.sort((a: SavedRecord, b: SavedRecord) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setRecords(allRecords);
    } catch (error) {
      console.error("Failed to load records:", error);
    }
  }

  const getCurrentLocation = () => {
    setGettingLocation(true);
    
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      setGettingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setChild({
          ...child,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        });
        setGettingLocation(false);
        alert("Location captured successfully!");
      },
      (error) => {
        console.error("Error getting location:", error);
        alert("Failed to get location. Please try again.");
        setGettingLocation(false);
      },
      { timeout: 10000 }
    );
  };

  async function saveOffline() {
    if (!validateForm()) {
      alert("Please fix validation errors before saving");
      return;
    }

    if (!child.consent) {
      alert("Parental consent required!");
      return;
    }

    setLoading(true);
    try {
      const db = await initDB();
      const record: SavedRecord = {
        ...child,
        id: Date.now(),
        healthId: "HID-" + Date.now(),
        uploaded: false,
        timestamp: new Date().toISOString(),
      };
      await db.add(STORE_NAME, record);
      await loadRecords();
      
      setChild({
        name: "",
        age: "",
        weight: "",
        height: "",
        parent: "",
        visible_signs: "",
        recent_illness: "",
        latitude: "",
        longitude: "",
        consent: false,
        photoFile: null,
      });
      setErrors({});
      
      alert("Saved offline with Health ID: " + record.healthId);
    } catch (error) {
      console.error("Failed to save offline:", error);
      alert("Failed to save record");
    } finally {
      setLoading(false);
    }
  }

  async function syncData() {
    if (!authenticated) {
      alert("Please login first!");
      return;
    }

    const online = await checkInternet();
    if (!online) {
      setIsOnline(false);
      alert("No internet connection. Please reconnect and try again.");
      return;
    }

    const backendOnline = await checkBackendConnection();
    if (!backendOnline) {
      setIsBackendOnline(false);
      alert("Backend server is not running! Please start the backend server on port 8000.");
      return;
    }

    setSyncLoading(true);
    try {
      const db = await initDB();
      const allRecords = await db.getAll(STORE_NAME);
      const pendingRecords = allRecords.filter((rec: SavedRecord) => !rec.uploaded);

      if (pendingRecords.length === 0) {
        alert("No pending records to sync!");
        return;
      }

      let successCount = 0;
      let failedCount = 0;

      for (const rec of pendingRecords) {
        try {
          console.log("Uploading record:", rec.healthId);
          
          const recordToSend = {
            healthId: rec.healthId,
            name: rec.name,
            age: rec.age,
            weight: rec.weight,
            height: rec.height,
            parent: rec.parent,
            visible_signs: rec.visible_signs,
            recent_illness: rec.recent_illness,
            latitude: rec.latitude,
            longitude: rec.longitude,
            consent: rec.consent,
            timestamp: rec.timestamp
          };

          const response = await axios.post("http://localhost:8000/upload", recordToSend, {
            timeout: 10000,
            headers: {
              'Content-Type': 'application/json',
            }
          });

          if (response.data.status === "success") {
            if (rec.photoFile) {
              try {
                setUploadingPhoto(rec.healthId);
                const photoFormData = new FormData();
                photoFormData.append('file', rec.photoFile);
                
                await axios.post(`http://localhost:8000/upload-photo?health_id=${rec.healthId}`, photoFormData, {
                  headers: {
                    'Content-Type': 'multipart/form-data',
                  },
                  timeout: 15000,
                });
                console.log(`✅ Photo uploaded for: ${rec.healthId}`);
              } catch (photoError) {
                console.error(`❌ Photo upload failed for ${rec.healthId}:`, photoError);
              } finally {
                setUploadingPhoto(null);
              }
            }

            rec.uploaded = true;
            await db.put(STORE_NAME, rec);
            successCount++;
            console.log(`Successfully uploaded: ${rec.healthId}`);
          } else {
            failedCount++;
            console.error(`Upload failed for ${rec.healthId}:`, response.data);
          }
        } catch (error) {
          failedCount++;
          console.error(`Upload failed for ${rec.healthId}:`, error);
          
          if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNREFUSED') {
              alert(`Cannot connect to backend server. Please make sure the backend is running on http://localhost:8000`);
              break;
            } else if (error.response) {
              console.error(`Server error: ${error.response.status} - ${error.response.data}`);
            }
          }
        }
      }

      await loadRecords();
      
      if (successCount > 0) {
        alert(`Sync completed! ${successCount}/${pendingRecords.length} records uploaded successfully.${failedCount > 0 ? ` ${failedCount} failed.` : ''}`);
      } else {
        alert(`Sync failed! All ${failedCount} records failed to upload. Check console for details.`);
      }
    } catch (error) {
      console.error("Sync failed:", error);
      alert("Sync failed. Please check your connection and try again.");
    } finally {
      setSyncLoading(false);
    }
  }

  async function downloadBooklet(healthId: string) {
    if (!isOnline || !isBackendOnline) {
      alert("Internet connection or backend server is not available for download.");
      return;
    }

    try {
      const response = await axios.get(`http://localhost:8000/booklet/${healthId}`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${healthId}_health_record.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      alert(`PDF booklet downloaded for ${healthId}`);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to download PDF booklet. Make sure the record is synced and backend is running.");
    }
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert("Please select an image file (JPEG, PNG, etc.)");
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        alert("Please select an image smaller than 5MB");
        return;
      }
      
      setChild({ ...child, photoFile: file });
      if (errors.photo) setErrors({...errors, photo: ''});
    }
  }

  function handleLogin() {
    if (otp === "123456") {
      setAuthenticated(true);
      alert("Authenticated successfully!");
      setOtp("");
    } else {
      alert("Invalid OTP. Use 123456 for demo.");
    }
  }

  function handleLogout() {
    setAuthenticated(false);
    alert("Logged out successfully!");
  }

  async function handleTestBackend() {
    const backendOnline = await checkBackendConnection();
    if (backendOnline) {
      alert("✅ Backend server is running and connected!");
    } else {
      alert("❌ Backend server is not reachable. Please make sure it's running on http://localhost:8000");
    }
  }

  const pendingCount = records.filter(rec => !rec.uploaded).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">CH</span>
              </div>
              <h1 className="text-lg font-semibold">Child Health Record Booklet</h1>
            </div>
            {authenticated && (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-green-600">✓ Authenticated</span>
                <Button 
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                >
                  Logout
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Connection Status */}
        <div className="space-y-3 mb-6">
          {!isOnline ? (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded flex items-center">
              <WifiOff className="w-4 h-4 mr-2" />
              ⚠️ You are offline. Data will be saved locally until you reconnect.
            </div>
          ) : (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded flex items-center justify-between">
              <div className="flex items-center">
                <Wifi className="w-4 h-4 mr-2" />
                ✅ Online. {pendingCount > 0 ? `${pendingCount} records pending sync.` : "All records synced."}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleTestBackend}
                className="flex items-center space-x-1"
              >
                <Server className="w-3 h-3" />
                <span>Test Backend</span>
              </Button>
            </div>
          )}

          {isOnline && (
            <div className={`px-4 py-2 rounded flex items-center ${
              isBackendOnline 
                ? "bg-green-100 border border-green-400 text-green-700" 
                : "bg-yellow-100 border border-yellow-400 text-yellow-700"
            }`}>
              <Server className="w-4 h-4 mr-2" />
              {isBackendOnline 
                ? "✅ Backend server is connected" 
                : "⚠️ Backend server is not connected - Start the backend to enable sync"}
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          <Button
            variant={activeTab === 'form' ? "default" : "ghost"}
            onClick={() => setActiveTab('form')}
            className={`flex items-center space-x-2 ${
              activeTab === 'form' 
                ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <User className="w-4 h-4" />
            <span>New Record</span>
          </Button>
          <Button
            variant={activeTab === 'records' ? "default" : "ghost"}
            onClick={() => setActiveTab('records')}
            className={`flex items-center space-x-2 ${
              activeTab === 'records' 
                ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <List className="w-4 h-4" />
            <span>Show Records ({records.length})</span>
          </Button>
        </div>

        {activeTab === 'form' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* New Child Record Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl font-bold">New Child Record</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Child's Photo */}
                <div className="space-y-3">
                  <Label htmlFor="photo" className="text-red-500 font-semibold text-base">
                    Child's Photo *
                  </Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Camera className="w-8 h-8 text-gray-400" />
                      <div className="space-y-1">
                        <p className="text-sm text-gray-600">
                          {child.photoFile ? "Photo Selected" : "Upload a photo of the child"}
                        </p>
                        <p className="text-xs text-gray-500">
                          JPEG, PNG, max 5MB
                        </p>
                      </div>
                      <div>
                        <Input
                          id="photo"
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                        <Label htmlFor="photo">
                          <Button
                            type="button"
                            variant="outline"
                            className="cursor-pointer"
                            asChild
                          >
                            <span>Choose File</span>
                          </Button>
                        </Label>
                        {child.photoFile && (
                          <p className="text-xs text-green-600 mt-2">
                            {child.photoFile.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  {errors.photo && (
                    <p className="text-red-500 text-sm flex items-center mt-2">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      {errors.photo}
                    </p>
                  )}
                </div>

                <div className="border-t pt-6 space-y-6">
                  {/* Child's Name */}
                  <div className="space-y-2">
                    <Label htmlFor="childName" className="text-red-500 font-semibold">
                      Child Name *
                    </Label>
                    <Input
                      id="childName"
                      value={child.name}
                      onChange={(e) => {
                        setChild({ ...child, name: e.target.value });
                        if (errors.name) setErrors({...errors, name: ''});
                      }}
                      placeholder="Enter child's full name"
                      className={errors.name ? "border-red-500" : ""}
                    />
                    {errors.name && (
                      <p className="text-red-500 text-sm flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.name}
                      </p>
                    )}
                  </div>

                  {/* Age, Weight, Height */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="age" className="text-red-500 font-semibold">
                        Age (years) *
                      </Label>
                      <Input
                        id="age"
                        type="number"
                        step="0.1"
                        value={child.age}
                        onChange={(e) => {
                          setChild({ ...child, age: e.target.value });
                          if (errors.age) setErrors({...errors, age: ''});
                        }}
                        placeholder="0.0"
                        className={errors.age ? "border-red-500" : ""}
                      />
                      {errors.age && (
                        <p className="text-red-500 text-sm flex items-center">
                          <AlertCircle className="w-4 h-4 mr-1" />
                          {errors.age}
                        </p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="weight" className="text-red-500 font-semibold">
                        Weight (kg) *
                      </Label>
                      <Input
                        id="weight"
                        type="number"
                        step="0.1"
                        value={child.weight}
                        onChange={(e) => {
                          setChild({ ...child, weight: e.target.value });
                          if (errors.weight) setErrors({...errors, weight: ''});
                        }}
                        placeholder="0.0"
                        className={errors.weight ? "border-red-500" : ""}
                      />
                      {errors.weight && (
                        <p className="text-red-500 text-sm flex items-center">
                          <AlertCircle className="w-4 h-4 mr-1" />
                          {errors.weight}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="height" className="text-red-500 font-semibold">
                        Height (cm) *
                      </Label>
                      <Input
                        id="height"
                        type="number"
                        step="0.1"
                        value={child.height}
                        onChange={(e) => {
                          setChild({ ...child, height: e.target.value });
                          if (errors.height) setErrors({...errors, height: ''});
                        }}
                        placeholder="0.0"
                        className={errors.height ? "border-red-500" : ""}
                      />
                      {errors.height && (
                        <p className="text-red-500 text-sm flex items-center">
                          <AlertCircle className="w-4 h-4 mr-1" />
                          {errors.height}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Parent/Guardian */}
                  <div className="space-y-2">
                    <Label htmlFor="parent" className="text-red-500 font-semibold">
                      Parent/Guardian Name *
                    </Label>
                    <Input
                      id="parent"
                      value={child.parent}
                      onChange={(e) => {
                        setChild({ ...child, parent: e.target.value });
                        if (errors.parent) setErrors({...errors, parent: ''});
                      }}
                      placeholder="Enter parent's full name"
                      className={errors.parent ? "border-red-500" : ""}
                    />
                    {errors.parent && (
                      <p className="text-red-500 text-sm flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.parent}
                      </p>
                    )}
                  </div>

                  {/* Health Information */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="visible_signs" className="font-semibold">
                        Visible Signs of Malnutrition
                      </Label>
                      <Input
                        id="visible_signs"
                        value={child.visible_signs}
                        onChange={(e) => setChild({ ...child, visible_signs: e.target.value })}
                        placeholder="Describe any visible signs or enter 'None'"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="recent_illness" className="font-semibold">
                        Recent Illnesses
                      </Label>
                      <Input
                        id="recent_illness"
                        value={child.recent_illness}
                        onChange={(e) => setChild({ ...child, recent_illness: e.target.value })}
                        placeholder="List any recent illnesses or enter 'None'"
                      />
                    </div>
                  </div>

                  {/* Location */}
                  <div className="space-y-3">
                    <Label className="font-semibold">Location</Label>
                    <Button
                      type="button"
                      onClick={getCurrentLocation}
                      disabled={gettingLocation}
                      variant="outline"
                      className="w-full"
                    >
                      {gettingLocation ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <MapPin className="w-4 h-4 mr-2" />
                      )}
                      {gettingLocation ? "Getting Location..." : "Get Location"}
                    </Button>
                    {(child.latitude || child.longitude) && (
                      <div className="bg-green-50 border border-green-200 rounded p-3">
                        <p className="text-green-800 text-sm">
                          Location captured: {child.latitude}, {child.longitude}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Consent */}
                  <div className="space-y-2 pt-4">
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="consent"
                        checked={child.consent}
                        onCheckedChange={(checked) => {
                          setChild({ ...child, consent: checked as boolean });
                          if (errors.consent) setErrors({...errors, consent: ''});
                        }}
                        className={`mt-1 ${errors.consent ? "border-red-500" : ""}`}
                      />
                      <Label htmlFor="consent" className={errors.consent ? "text-red-500 font-semibold" : "font-semibold"}>
                        I provide parental consent for data collection *
                      </Label>
                    </div>
                    {errors.consent && (
                      <p className="text-red-500 text-sm flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.consent}
                      </p>
                    )}
                  </div>

                  {/* Save Button */}
                  <Button
                    onClick={saveOffline}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 py-3 text-base font-semibold mt-4"
                  >
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {loading ? "Saving..." : "Save Offline"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Login Section */}
              {!authenticated ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Login (Mock eSignet)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="otp">Enter OTP (use 123456 for demo)</Label>
                      <Input
                        id="otp"
                        type="password"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="Enter OTP: 123456"
                      />
                    </div>
                    <Button
                      onClick={handleLogin}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      Login
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Sync Controls</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button
                      onClick={syncData}
                      disabled={!isOnline || !isBackendOnline || syncLoading || pendingCount === 0}
                      className={`w-full bg-purple-600 hover:bg-purple-700 ${
                        (!isOnline || !isBackendOnline || pendingCount === 0) ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      {syncLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      {syncLoading ? "Syncing..." : `Sync Data (${pendingCount} pending)`}
                    </Button>
                    
                    {!isBackendOnline && (
                      <p className="text-yellow-600 text-sm text-center">
                        ⚠️ Start backend server to enable sync
                      </p>
                    )}
                    
                    {pendingCount === 0 && authenticated && (
                      <p className="text-green-600 text-sm text-center">All records are synced! ✅</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        ) : (
          /* Records Tab */
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>Saved Records</span>
                <Badge variant="outline">{records.length} total</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {records.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-8">No records saved yet.</p>
                ) : (
                  records.map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {record.name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {record.healthId} • {record.parent}
                        </p>
                        <p className="text-xs text-gray-500">
                          Age: {record.age}y • Weight: {record.weight}kg • Height: {record.height}cm
                        </p>
                        {record.photoFile && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            📷 Photo attached
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-col space-y-2 ml-2">
                        <Badge 
                          variant={record.uploaded ? "default" : "secondary"}
                          className="flex-shrink-0"
                        >
                          {record.uploaded ? "Uploaded" : "Pending"}
                        </Badge>
                        {record.uploaded && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadBooklet(record.healthId)}
                            className="h-7 text-xs flex items-center space-x-1"
                            disabled={uploadingPhoto === record.healthId}
                          >
                            {uploadingPhoto === record.healthId ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Download className="w-3 h-3" />
                            )}
                            <span>PDF</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default App;