import React, { useState, useRef, useEffect } from 'react';
import { Crop, RotateCw, ZoomIn, ZoomOut, RotateCcw, Check, Move } from 'lucide-react';

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedImageUrl: string) => void;
  onCancel: () => void;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({
  imageSrc,
  onCropComplete,
  onCancel,
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const positionStart = useRef({ x: 0, y: 0 });

  // Mobile multi-touch gesture references
  const initialTouchDistance = useRef<number | null>(null);
  const initialTouchZoom = useRef<number>(1);
  const initialTouchPosition = useRef({ x: 0, y: 0 });

  // Load image measurements
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
    });
  };

  // Viewport aspect ratio dimensions
  const viewportWidth = 240;
  const viewportHeight = 300; // Perfect 4:5 Portrait Academic ratio (matches student profile ID cards)

  // Compute pristine cover layout bounds at the current rotation
  let baseWidth = viewportWidth;
  let baseHeight = viewportHeight;

  if (imageSize.width && imageSize.height) {
    const isRotated90 = rotation % 180 !== 0;
    const imgRatio = imageSize.width / imageSize.height;
    const viewportRatio = viewportWidth / viewportHeight; // 0.8
    const effectiveRatio = isRotated90 ? (1 / imgRatio) : imgRatio;

    let visualWidth = viewportWidth;
    let visualHeight = viewportHeight;

    if (effectiveRatio > viewportRatio) {
      // Landscape relative to portrait viewport
      visualHeight = viewportHeight;
      visualWidth = viewportHeight * effectiveRatio;
    } else {
      // Portrait relative to portrait viewport
      visualWidth = viewportWidth;
      visualHeight = viewportWidth / effectiveRatio;
    }

    // Map visual cover dimensions back to stylesheet image dimensions
    if (isRotated90) {
      baseWidth = visualHeight;
      baseHeight = visualWidth;
    } else {
      baseWidth = visualWidth;
      baseHeight = visualHeight;
    }
  }

  // Panning helper
  const handleStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    dragStart.current = { x: clientX, y: clientY };
    positionStart.current = { ...position };
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    const dx = clientX - dragStart.current.x;
    const dy = clientY - dragStart.current.y;
    
    setPosition({
      x: positionStart.current.x + dx,
      y: positionStart.current.y + dy,
    });
  };

  const handleEnd = () => {
    setIsDragging(false);
  };

  // Mouse handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    handleStart(e.clientX, e.clientY);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      handleMove(e.clientX, e.clientY);
    }
  };

  // Multi-touch gestures (Pinch-to-zoom + Simultaneous Pan)
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      initialTouchDistance.current = null;
      handleStart(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      initialTouchDistance.current = distance;
      initialTouchZoom.current = zoom;
      
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      dragStart.current = { x: midX, y: midY };
      initialTouchPosition.current = { ...position };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && !initialTouchDistance.current) {
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2 && initialTouchDistance.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      
      // Calculate active pinch factor
      const dxDist = t1.clientX - t2.clientX;
      const dyDist = t1.clientY - t2.clientY;
      const distance = Math.sqrt(dxDist * dxDist + dyDist * dyDist);
      
      if (initialTouchDistance.current > 0) {
        const ratio = distance / initialTouchDistance.current;
        const nextZoom = Math.min(5, Math.max(1, initialTouchZoom.current * ratio));
        setZoom(nextZoom);
      }

      // Simultaneously support multi-touch panning
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const dx = midX - dragStart.current.x;
      const dy = midY - dragStart.current.y;
      
      setPosition({
        x: initialTouchPosition.current.x + dx,
        y: initialTouchPosition.current.y + dy,
      });
    }
  };

  const onTouchEnd = () => {
    initialTouchDistance.current = null;
    setIsDragging(false);
  };

  useEffect(() => {
    const handleMouseUpGlobal = () => {
      if (isDragging) handleEnd();
    };
    
    window.addEventListener('mouseup', handleMouseUpGlobal);
    window.addEventListener('touchend', handleMouseUpGlobal);
    
    return () => {
      window.removeEventListener('mouseup', handleMouseUpGlobal);
      window.removeEventListener('touchend', handleMouseUpGlobal);
    };
  }, [isDragging]);

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
    setPosition({ x: 0, y: 0 }); // Center to prevent image displacement on rotate
  };

  const handleRotateCcw = () => {
    setRotation((prev) => (prev + 270) % 360);
    setPosition({ x: 0, y: 0 });
  };

  // High quality Canvas Cropping mapped 1:1 with base view dimensions
  const handleCrop = () => {
    if (!imageSize.width || !imageSize.height) return;

    const img = imageRef.current;
    if (!img) return;

    const targetWidth = 320;
    const targetHeight = 400; // Perfect clean high resolution 4:5 aspect ratio

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Smooth images rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Blank backdrop cover layout
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    // Compute coordinate mapping scale factor from viewport size to canvas size
    const scaleFactor = targetWidth / viewportWidth; // 320 / 240 = 1.33333333

    // 1. Center the context
    ctx.translate(targetWidth / 2, targetHeight / 2);

    // 2. Apply scaled coordinate translations
    ctx.translate(position.x * scaleFactor, position.y * scaleFactor);

    // 3. Apply rotation
    ctx.rotate((rotation * Math.PI) / 180);

    // 4. Scale both Zoom factor and structural coordinate Factor
    ctx.scale(zoom * scaleFactor, zoom * scaleFactor);

    // 5. Draw the source image with crisp dimensions
    ctx.drawImage(
      img,
      -baseWidth / 2,
      -baseHeight / 2,
      baseWidth,
      baseHeight
    );

    try {
      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      onCropComplete(croppedDataUrl);
    } catch (error) {
      console.error("Failed to crop passport photo:", error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4 z-[10000] animate-fade-in text-white select-none">
      <div className="bg-[#161B22] border border-white/10 rounded-2xl max-w-sm w-full p-5 sm:p-6 space-y-5 flex flex-col shadow-2xl relative">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
          <div className="flex items-center space-x-2">
            <Crop className="w-4 h-4 text-amber-500 animate-pulse" />
            <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-100">
              Crop Passport Photo
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 px-2 text-[10px] uppercase font-mono font-bold text-slate-400 hover:text-white hover:bg-white/5 rounded transition-all cursor-pointer"
          >
            Cancel
          </button>
        </div>

        {/* Informative advice */}
        <p className="text-[10px] text-slate-400 leading-tight">
          👉 <span className="text-amber-500 font-semibold">Touch & Drag (Pinch to zoom)</span> on the image to align perfectly inside the portrait frame guidelines.
        </p>

        {/* Viewport Box (Perfect Portrait Frame Guidelines) */}
        <div className="relative flex justify-center items-center py-2 select-none touch-none">
          <div
            ref={viewportRef}
            style={{ width: `${viewportWidth}px`, height: `${viewportHeight}px` }}
            className="border-2 border-amber-500 rounded-xl overflow-hidden bg-[#0D1117] relative flex items-center justify-center shadow-lg cursor-move select-none touch-none group"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {/* Alignment Guideline Overlays */}
            <div className="absolute inset-0 pointer-events-none z-10 border border-white/10 flex flex-col justify-between p-0.5">
              <div className="w-full flex justify-between">
                <span className="w-2.5 h-2.5 border-t-2 border-l-2 border-amber-500" />
                <span className="w-2.5 h-2.5 border-t-2 border-r-2 border-amber-500" />
              </div>
              
              {/* Inner Focus Oval Frame */}
              <div className="absolute inset-0 m-6 border border-dashed border-white/20 rounded-full opacity-60" />

              <div className="w-full flex justify-between">
                <span className="w-2.5 h-2.5 border-b-2 border-l-2 border-amber-500" />
                <span className="w-2.5 h-2.5 border-b-2 border-r-2 border-amber-500" />
              </div>
            </div>

            {/* Micro Interaction Drag Action Tip */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none z-10 bg-black/70 backdrop-blur-xs text-[7px] text-slate-350 uppercase tracking-widest px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Move className="w-2 h-2 text-amber-500" /> Align & Scale Portrait
            </div>

            {/* Cropping visual target - explicitly constrained inline to bypass responsive preflights */}
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Source Crop"
              onLoad={handleImageLoad}
              style={{
                width: `${baseWidth}px`,
                height: `${baseHeight}px`,
                transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${zoom})`,
                transformOrigin: 'center center',
                maxWidth: 'none',
                maxHeight: 'none',
              }}
              className="absolute select-none pointer-events-none"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span className="flex items-center gap-1"><ZoomOut className="w-2.5 h-2.5 text-slate-500" /> Zoom Out</span>
            <span className="font-bold text-amber-400 text-xs px-2 py-0.5 bg-black/25 rounded-md min-w-[50px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <span className="flex items-center gap-1">Zoom In <ZoomIn className="w-2.5 h-2.5 text-slate-500" /></span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom(prev => Math.max(1, prev - 0.25))}
              className="w-8 h-8 rounded-lg bg-[#21262D] hover:bg-[#30363D] active:scale-90 transition-all flex items-center justify-center shrink-0 cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5 text-slate-300" />
            </button>
            
            <input
              type="range"
              min="1"
              max="5"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-[#21262D] rounded-lg appearance-none cursor-pointer accent-amber-500 outline-none"
            />

            <button
              type="button"
              onClick={() => setZoom(prev => Math.min(5, prev + 0.25))}
              className="w-8 h-8 rounded-lg bg-[#21262D] hover:bg-[#30363D] active:scale-90 transition-all flex items-center justify-center shrink-0 cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Rotation Panel */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            type="button"
            onClick={handleRotateCcw}
            className="py-2 text-[9px] uppercase font-mono font-bold bg-[#1F2937]/50 border border-white/5 hover:border-slate-500/40 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
            title="Rotate Left 90 deg"
          >
            <RotateCcw className="w-3 h-3 text-slate-400" />
            Rotate L
          </button>
          
          <button
            type="button"
            onClick={handleReset}
            className="py-2 text-[9px] uppercase font-mono font-bold bg-[#1F2937]/50 border border-white/5 hover:border-slate-500/40 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95 text-slate-400 hover:text-white"
            title="Reset alignment coordinates"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={handleRotate}
            className="py-2 text-[9px] uppercase font-mono font-bold bg-[#1F2937]/50 border border-white/5 hover:border-slate-500/40 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
            title="Rotate Right 90 deg"
          >
            <RotateCw className="w-3 h-3 text-slate-400" />
            Rotate R
          </button>
        </div>

        {/* Bottom Actions */}
        <div className="flex gap-3 pt-3 border-t border-white/5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wide bg-[#21262D] hover:bg-[#30363D] rounded-xl cursor-pointer text-slate-300 hover:text-white transition-all active:scale-95"
          >
            Cancel
          </button>
          
          <button
            type="button"
            onClick={handleCrop}
            className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wide bg-amber-500 hover:bg-amber-400 text-black rounded-xl cursor-pointer shadow-md shadow-amber-500/15 flex items-center justify-center gap-1 transition-all active:scale-95"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            Apply & Crop
          </button>
        </div>

      </div>
    </div>
  );
};
