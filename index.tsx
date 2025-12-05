import React, { useState, useRef, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Types ---
type Point = { x: number; y: number };
type Path = { points: Point[]; size: number };
type Tool = "brush" | "hand";
type Mode = "edit" | "compare";

// --- Icons (Inline SVG) ---
const Icons = {
  Upload: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Brush: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 12l-8-8-6 6 8 8 9-3-3-3z"></path><line x1="15" y1="13" x2="20" y2="18"></line><line x1="10" y1="21" x2="13" y2="21"></line></svg>,
  Hand: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M6 12v-2a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/></svg>,
  Undo: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>,
  Trash: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Check: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Download: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Magic: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 16 .5-1.5 .5 1.5 1.5 .5-1.5 .5-.5 1.5-.5-1.5-1.5-.5Z"/><path d="m15 4 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/><path d="M20 20c0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2 2-.9 2-2Z"/></svg>,
  ArrowLeft: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  Scissors: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
  X: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
};

const App = () => {
  // --- State ---
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [originalImageObj, setOriginalImageObj] = useState<HTMLImageElement | null>(null);
  const [processedImageSrc, setProcessedImageSrc] = useState<string | null>(null);
  
  const [mode, setMode] = useState<Mode>("edit");
  const [tool, setTool] = useState<Tool>("brush");
  const [brushSize, setBrushSize] = useState(30);
  
  // Viewport State
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  // Drawing State
  const [paths, setPaths] = useState<Path[]>([]);
  const [history, setHistory] = useState<Path[][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  
  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingText, setLoadingText] = useState("正在努力擦除中...");

  // Upload State
  const [isDragging, setIsDragging] = useState(false);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef<Point | null>(null);

  // Background Pattern Style (Dot pattern) for Editor
  const editorBackgroundStyle = {
    backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)",
    backgroundSize: "20px 20px",
    backgroundColor: "white"
  };

  // --- Effects ---

  // Initialize Image Object
  useEffect(() => {
    if (imageSrc) {
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        setOriginalImageObj(img);
        // Fit image to screen initially
        const container = containerRef.current;
        if (container) {
          const scaleX = (container.clientWidth - 40) / img.width;
          const scaleY = (container.clientHeight - 40) / img.height;
          const initialScale = Math.min(scaleX, scaleY, 1);
          setScale(initialScale);
          setPan({
            x: (container.clientWidth - img.width * initialScale) / 2,
            y: (container.clientHeight - img.height * initialScale) / 2,
          });
        }
      };
    }
  }, [imageSrc]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode !== "edit") return;
      
      // Tools
      if (e.key.toLowerCase() === "b") setTool("brush");
      if (e.key.toLowerCase() === "h") setTool("hand");

      // Brush Size
      if (e.key === "-" || e.key === "_") {
        setBrushSize(prev => Math.max(5, prev - 5));
      }
      if (e.key === "=" || e.key === "+") {
        setBrushSize(prev => Math.min(100, prev + 5));
      }

      // Undo
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") handleUndo();
      
      // Pan
      if (e.code === "Space") {
        if (!e.repeat) setTool("hand");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, paths, history]);

  // Render Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImageObj) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions to image dimensions (high res)
    canvas.width = originalImageObj.width;
    canvas.height = originalImageObj.height;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Original Image
    ctx.drawImage(originalImageObj, 0, 0);

    // 2. Draw Mask Paths
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    // Draw semi-transparent red for user feedback
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "rgba(255, 0, 0, 1)";
    ctx.fillStyle = "rgba(255, 0, 0, 1)";
    
    paths.forEach(path => {
      if (path.points.length === 0) return;
      ctx.lineWidth = path.size;
      
      ctx.beginPath();
      ctx.moveTo(path.points[0].x, path.points[0].y);
      if (path.points.length === 1) {
        // Dot
        ctx.arc(path.points[0].x, path.points[0].y, path.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        path.points.forEach((p, i) => {
          if (i > 0) ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }
    });
    
    ctx.globalAlpha = 1.0;

  }, [originalImageObj, paths, mode]);

  // --- Handlers ---

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      setImageSrc(evt.target?.result as string);
      setPaths([]);
      setHistory([]);
      setProcessedImageSrc(null);
      setMode("edit");
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      processFile(file);
    }
  };

  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent): Point => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    
    const rect = container.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    // Convert screen coordinates to canvas coordinates accounting for pan and scale
    const x = (clientX - rect.left - pan.x) / scale;
    const y = (clientY - rect.top - pan.y) / scale;
    return { x, y };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!imageSrc || mode !== "edit") return;
    
    // Middle mouse or Tool Hand -> Pan
    const isMiddleMouse = 'button' in e && (e as React.MouseEvent).button === 1;
    
    if (tool === "hand" || isMiddleMouse) {
      setIsPanning(true);
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      lastMousePos.current = { x: clientX, y: clientY };
      return;
    }

    if (tool === "brush") {
      setIsDrawing(true);
      const point = getCanvasPoint(e);
      setHistory(prev => [...prev, paths]); // Save state for undo
      setPaths(prev => [...prev, { points: [point], size: brushSize / scale }]); 
      // Note: dividing brush size by scale keeps it visually consistent on screen
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    // Update Custom Cursor Position
    if (cursorRef.current && tool === 'brush') {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        // Check if inside container
        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
           cursorRef.current.style.display = 'block';
           // Use client coordinates directly for fixed positioning
           cursorRef.current.style.transform = `translate(${clientX - brushSize/2}px, ${clientY - brushSize/2}px)`;
        } else {
           cursorRef.current.style.display = 'none';
        }
      }
    }

    if (isPanning) {
      if (lastMousePos.current) {
        const dx = clientX - lastMousePos.current.x;
        const dy = clientY - lastMousePos.current.y;
        setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        lastMousePos.current = { x: clientX, y: clientY };
      }
      return;
    }

    if (isDrawing && tool === "brush") {
      const point = getCanvasPoint(e);
      setPaths(prev => {
        const newPaths = [...prev];
        const currentPath = newPaths[newPaths.length - 1];
        if (currentPath) {
          currentPath.points.push(point);
        }
        return newPaths;
      });
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    setIsPanning(false);
    lastMousePos.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!imageSrc) return;
    const zoomIntensity = 0.1;
    const direction = e.deltaY > 0 ? -1 : 1;
    const factor = 1 + direction * zoomIntensity;
    
    const newScale = Math.max(0.1, Math.min(scale * factor, 10)); // Limit zoom
    
    // Zoom towards cursor logic
    const rect = containerRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newPanX = mouseX - (mouseX - pan.x) * (newScale / scale);
    const newPanY = mouseY - (mouseY - pan.y) * (newScale / scale);

    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  };

  const handleUndo = () => {
    if (history.length > 0) {
      const previousPaths = history[history.length - 1];
      setPaths(previousPaths);
      setHistory(prev => prev.slice(0, -1));
    }
  };

  const handleReset = () => {
    if (paths.length === 0) return;
    setHistory(prev => [...prev, paths]);
    setPaths([]);
  };

  // --- Core Logic: Call Gemini ---
  
  const processImageRequest = async (prompt: string, imageBase64: string) => {
    setIsProcessing(true);
    try {
      // Call API
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "image/png", // Tell the model we are sending a PNG
                data: imageBase64
              }
            },
            {
              text: prompt
            }
          ]
        }
      });

      // Process Response
      let resultBase64 = null;
      let mimeType = "image/png"; // Default to PNG
      
      // Iterate parts to find image
      const candidate = response.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            resultBase64 = part.inlineData.data;
            if (part.inlineData.mimeType) {
                mimeType = part.inlineData.mimeType;
            }
            break;
          }
        }
      }

      if (resultBase64) {
        setProcessedImageSrc(`data:${mimeType};base64,${resultBase64}`);
        setMode("compare");
      } else {
        alert("未能生成图片，请重试。");
      }

    } catch (error) {
      console.error(error);
      alert("处理失败，请检查网络或重试。");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartRemoval = async () => {
    if (!originalImageObj || paths.length === 0) return;

    setLoadingText("正在准备图片...");

    // 1. Create a composite image for the model
    // We draw the image and the mask (in red) into a single base64 string
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = originalImageObj.width;
    tempCanvas.height = originalImageObj.height;
    const ctx = tempCanvas.getContext("2d");
    
    if (!ctx) return;

    // Draw original
    ctx.drawImage(originalImageObj, 0, 0);

    // Draw Mask (Solid Red for the model to see clearly)
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255, 0, 0, 1)";
    ctx.fillStyle = "rgba(255, 0, 0, 1)";
    
    paths.forEach(path => {
      ctx.lineWidth = path.size;
      ctx.beginPath();
      if (path.points.length > 0) {
          ctx.moveTo(path.points[0].x, path.points[0].y);
          if (path.points.length === 1) {
              ctx.arc(path.points[0].x, path.points[0].y, path.size/2, 0, Math.PI*2);
              ctx.fill();
          } else {
              path.points.forEach((p, i) => { if(i>0) ctx.lineTo(p.x, p.y); });
              ctx.stroke();
          }
      }
    });

    // Use PNG to preserve quality and transparency of input (if any)
    const base64Data = tempCanvas.toDataURL("image/png").split(",")[1];
    setLoadingText("正在努力擦除中...");
    
    const prompt = "Remove the object covered by the red mask in this image. Replace it seamlessly with the background. Return only the image.";
    await processImageRequest(prompt, base64Data);
  };

  const handleRemoveBackground = async () => {
     if (!originalImageObj) return;
     
     setLoadingText("正在去除背景...");

     // Get Original Image Base64
     const tempCanvas = document.createElement("canvas");
     tempCanvas.width = originalImageObj.width;
     tempCanvas.height = originalImageObj.height;
     const ctx = tempCanvas.getContext("2d");
     if (!ctx) return;
     ctx.drawImage(originalImageObj, 0, 0);
     
     // Use PNG to preserve input transparency and avoid JPEG artifacts
     const base64Data = tempCanvas.toDataURL("image/png").split(",")[1];
     
     // Explicitly request transparency and alpha channel, FORBID CHECKERBOARD
     const prompt = "Remove the background of the image. The output image MUST be a PNG with an alpha channel (transparent background). CRITICAL: DO NOT RENDER A CHECKERBOARD OR GRID PATTERN TO SIMULATE TRANSPARENCY. The background pixels must be completely transparent (alpha=0). Return the main subject only.";
     await processImageRequest(prompt, base64Data);
  };

  const handleApply = () => {
    if (processedImageSrc) {
      setImageSrc(processedImageSrc);
      setPaths([]);
      setHistory([]);
      setMode("edit");
      setProcessedImageSrc(null);
    }
  };

  const handleDiscard = () => {
    // Just reset result and go back to edit, keeping original image and masks
    setProcessedImageSrc(null);
    setMode("edit");
  };

  const handleDownload = () => {
    // If we are in compare mode, download the result.
    // If we are in edit mode, download the current source image.
    const targetSrc = (mode === "compare" && processedImageSrc) ? processedImageSrc : imageSrc;
    if (targetSrc) {
      const link = document.createElement("a");
      
      // Determine extension from MIME type to ensure transparency is saved correctly
      const mimeMatch = targetSrc.match(/^data:(image\/[a-zA-Z+]+);base64,/);
      let ext = "png"; // Default to png for transparency support
      if (mimeMatch && mimeMatch[1]) {
          const mime = mimeMatch[1];
          if (mime === "image/jpeg") ext = "jpg";
          else if (mime === "image/webp") ext = "webp";
      }

      link.download = `image_${Date.now()}.${ext}`;
      link.href = targetSrc;
      link.click();
    }
  };

  // --- Components ---

  const CompareView = () => {
    const [sliderPos, setSliderPos] = useState(50);
    const containerRef = useRef<HTMLDivElement>(null);

    if (!originalImageObj || !processedImageSrc) return null;

    const aspectRatio = originalImageObj.width / originalImageObj.height;

    return (
      <div className="flex flex-col items-center justify-center w-full h-full p-4">
        <div 
          className="relative w-full max-w-5xl shadow-2xl rounded-lg overflow-hidden select-none bg-white"
          style={{ 
            aspectRatio: `${aspectRatio}`,
            ...editorBackgroundStyle // Apply the Dot Pattern background to Compare View
          }}
          ref={containerRef}
        >
          {/* Bottom Layer: Original (Clipped to Left Side) */}
          <div 
             className="absolute top-0 left-0 w-full h-full overflow-hidden"
             style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
          >
              <img 
                src={imageSrc!} 
                className="absolute top-0 left-0 w-full h-full object-contain" 
                alt="Original" 
                draggable={false}
              />
          </div>
          
          {/* Top Layer: Result (Clipped to Right Side) */}
          <div 
            className="absolute top-0 left-0 w-full h-full overflow-hidden"
            style={{ 
                clipPath: `inset(0 0 0 ${sliderPos}%)` 
            }}
          >
             <img 
                src={processedImageSrc} 
                className="absolute top-0 left-0 w-full h-full object-contain" 
                alt="Processed" 
                draggable={false}
              />
          </div>

          {/* Slider Handle */}
          <div 
            className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize shadow-[0_0_10px_rgba(0,0,0,0.5)] flex items-center justify-center z-10"
            style={{ left: `${sliderPos}%` }}
          >
            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg text-gray-600">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 12H6M6 12l5-5M6 12l5 5M18 12l-5-5M18 12l-5 5"/></svg>
            </div>
          </div>

          {/* Invisible Range Input for Interaction */}
          <input
            type="range"
            min="0"
            max="100"
            value={sliderPos}
            onChange={(e) => setSliderPos(Number(e.target.value))}
            className="absolute top-0 left-0 w-full h-full opacity-0 cursor-ew-resize z-20"
          />

           {/* Labels */}
           <div className="absolute top-4 left-4 bg-black/50 text-white px-2 py-1 rounded text-sm pointer-events-none z-10">原图</div>
           <div className="absolute top-4 right-4 bg-black/50 text-white px-2 py-1 rounded text-sm pointer-events-none z-10">处理后</div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#f4f4f5] text-[#18181b] font-sans">
      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #2563eb;
          margin-top: -6px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        input[type=range]::-webkit-slider-runnable-track {
          width: 100%;
          height: 4px;
          background: #e4e4e7;
          border-radius: 2px;
        }
      `}</style>

      {/* Header */}
      <header className="flex-none h-14 bg-white border-b border-gray-200 flex items-center justify-center px-4 shadow-sm z-10 relative">
        <h1 className="text-lg font-semibold tracking-wide">图像物体去除 V1.0 By Gambey</h1>
        {imageSrc && (
          <button 
            onClick={handleDownload}
            className="absolute right-4 flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 hover:text-gray-900 rounded-full transition shadow-sm"
            title="下载当前显示的图片"
          >
            <Icons.Download />
            <span className="hidden sm:inline">下载</span>
          </button>
        )}
      </header>

      {/* Main Area */}
      <main className="flex-1 relative overflow-hidden flex items-center justify-center bg-gray-50">
        {!imageSrc ? (
          /* Upload View */
          <div 
            className="h-full w-full flex flex-col items-center justify-center p-8 animate-fade-in"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className={`max-w-md w-full border-2 border-dashed rounded-2xl p-12 flex flex-col items-center text-center bg-white transition-colors duration-200 ${isDragging ? "border-blue-500 bg-blue-50 scale-105" : "border-gray-300 hover:bg-gray-50"}`}>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 transition-colors ${isDragging ? "bg-blue-100 text-blue-700" : "bg-blue-50 text-blue-600"}`}>
                <Icons.Upload />
              </div>
              <h3 className="text-xl font-medium mb-2">{isDragging ? "松手即可上传" : "上传图片"}</h3>
              <p className="text-gray-500 mb-6">{isDragging ? "支持图片文件" : "点击或拖拽上传，支持 JPG, PNG 格式"}</p>
              <label className="bg-black text-white px-6 py-2 rounded-full cursor-pointer hover:bg-gray-800 transition shadow-lg relative z-20">
                选择文件
                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
            {isDragging && (
                <div className="absolute inset-0 bg-blue-500/10 pointer-events-none z-10 flex items-center justify-center backdrop-blur-[1px]">
                </div>
            )}
          </div>
        ) : (
          /* Canvas or Compare View */
          <>
            {mode === "edit" ? (
              <div 
                ref={containerRef}
                className={`w-full h-full relative overflow-hidden touch-none ${
                  tool === "hand" ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-none"
                }`}
                style={editorBackgroundStyle}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={(e) => { handlePointerUp(); handleDragLeave(e as unknown as React.DragEvent); }}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
                onWheel={handleWheel}
                // Drag and drop handlers for replacement
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                 <canvas
                  ref={canvasRef}
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    transformOrigin: "top left",
                  }}
                  className="block pointer-events-none"
                />
                
                {/* Custom Brush Cursor */}
                <div 
                  ref={cursorRef}
                  className="pointer-events-none fixed top-0 left-0 z-40 rounded-full hidden"
                  style={{
                    width: brushSize,
                    height: brushSize,
                    backgroundColor: 'rgba(255, 223, 0, 0.5)',
                    border: '1px solid rgba(255, 223, 0, 0.8)',
                    boxShadow: '0 0 4px rgba(0,0,0,0.2)'
                  }}
                />

                {/* Drag Overlay for Replacement */}
                {isDragging && (
                  <div className="absolute inset-0 z-50 bg-blue-500/10 backdrop-blur-[1px] border-4 border-blue-500/50 m-4 rounded-xl flex flex-col items-center justify-center text-blue-600 animate-in fade-in duration-200 pointer-events-none">
                     <div className="bg-white p-6 rounded-full shadow-xl mb-4">
                       <Icons.Upload />
                     </div>
                     <p className="text-2xl font-bold bg-white/80 px-6 py-2 rounded-full shadow-sm">释放以更换图片</p>
                  </div>
                )}
              </div>
            ) : (
              <CompareView />
            )}
          </>
        )}

        {/* Loading Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center text-white">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
            <p className="font-medium tracking-wide">{loadingText}</p>
          </div>
        )}
      </main>

      {/* Toolbar */}
      {imageSrc && (
        <footer className="flex-none h-auto min-h-[80px] bg-white border-t border-gray-200 p-4 flex flex-col items-center justify-center z-20 gap-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          {mode === "edit" ? (
            <div className="flex flex-col md:flex-row items-center gap-6 w-full max-w-4xl justify-between">
               
               {/* Left Group: Tools */}
              <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
                <button 
                  onClick={() => setTool("brush")} 
                  className={`p-3 rounded-md transition ${tool === "brush" ? "bg-white shadow text-blue-600" : "text-gray-500 hover:bg-gray-200"}`}
                  title="画笔 (B)"
                >
                  <Icons.Brush />
                </button>
                <button 
                  onClick={() => setTool("hand")} 
                  className={`p-3 rounded-md transition ${tool === "hand" ? "bg-white shadow text-blue-600" : "text-gray-500 hover:bg-gray-200"}`}
                  title="移动 (H)"
                >
                  <Icons.Hand />
                </button>
              </div>

              {/* Center Group: Brush Size (Only if Brush) */}
              <div className="flex-1 max-w-xs flex items-center gap-4">
                 {tool === "brush" && (
                   <>
                    <span className="text-xs text-gray-400 font-medium whitespace-nowrap">笔刷</span>
                    <input 
                      type="range" 
                      min="5" 
                      max="100" 
                      value={brushSize} 
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-full cursor-pointer"
                    />
                    <div className="w-6 h-6 rounded-full bg-red-500 opacity-50 flex-none" style={{ width: Math.min(24, Math.max(8, brushSize/2)), height: Math.min(24, Math.max(8, brushSize/2)) }} />
                   </>
                 )}
              </div>

              {/* Right Group: Actions */}
              <div className="flex items-center gap-4">
                <div className="flex gap-2 mr-4">
                  <button onClick={handleUndo} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full" title="撤销 (Ctrl+Z)">
                    <Icons.Undo />
                  </button>
                  <button onClick={handleReset} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full" title="重置">
                    <Icons.Trash />
                  </button>
                </div>

                {/* Remove Background Button */}
                <button 
                  onClick={handleRemoveBackground}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full font-medium transition shadow-sm bg-indigo-50 text-indigo-600 hover:bg-indigo-100 whitespace-nowrap"
                  title="自动去除背景"
                >
                   <Icons.Scissors />
                   去除背景
                </button>

                <button 
                  onClick={handleStartRemoval}
                  disabled={paths.length === 0}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-medium transition shadow-lg whitespace-nowrap
                    ${paths.length > 0 
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 hover:scale-105 transform" 
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                >
                   <Icons.Magic />
                   开始去除
                </button>
              </div>
            </div>
          ) : (
            /* Compare Mode Toolbar */
            <div className="flex items-center gap-6">
              <button 
                onClick={handleDiscard}
                className="flex items-center gap-2 px-5 py-2.5 text-red-600 hover:bg-red-50 border border-red-200 hover:border-red-300 rounded-full font-medium transition"
              >
                <Icons.X />
                放弃修改
              </button>

              <button 
                 onClick={handleApply}
                 className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white hover:bg-gray-800 rounded-full font-medium transition shadow-md"
              >
                <Icons.Check />
                应用当前效果
              </button>
            </div>
          )}
        </footer>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);