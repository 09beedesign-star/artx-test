import { useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

type MaskEditorProps = {
  imageSrc: string;
  width: number;
  height: number;
  className?: string;
  onCancel?: () => void;
  onApply: (maskDataUrl: string) => void;
};

function getCanvasPoint(canvas: HTMLCanvasElement, event: PointerEvent<HTMLCanvasElement>) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

export function MaskEditor({ imageSrc, width, height, className, onCancel, onApply }: MaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(48);

  const drawPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const point = getCanvasPoint(canvas, event);
    context.fillStyle = "rgba(150, 84, 255, 0.82)";
    context.beginPath();
    context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
    context.fill();
  };

  const handleApply = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onApply(canvas.toDataURL("image/png"));
  };

  return (
    <div className={cn("relative inline-block overflow-visible", className)} style={{ width, height }}>
      <img src={imageSrc} alt="" className="block h-full w-full object-contain" draggable={false} />
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0 cursor-crosshair"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setIsDrawing(true);
          drawPoint(event);
        }}
        onPointerMove={(event) => {
          if (isDrawing) drawPoint(event);
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          setIsDrawing(false);
        }}
        onPointerLeave={() => setIsDrawing(false)}
      />
      <div className="absolute left-0 top-full z-20 mt-3 flex w-[360px] items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
        <span className="shrink-0 text-slate-600">橡皮尺寸</span>
        <Slider
          value={[brushSize]}
          min={12}
          max={160}
          step={1}
          onValueChange={(value) => setBrushSize(value[0] || 48)}
        />
        <span className="w-10 shrink-0 text-right text-slate-500">{brushSize}</span>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>取消</Button>
        <Button type="button" size="sm" onClick={handleApply}>应用</Button>
      </div>
    </div>
  );
}
