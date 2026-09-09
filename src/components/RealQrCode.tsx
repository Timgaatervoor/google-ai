import React, { useMemo } from 'react';
import QRCode from 'qrcode';
export function RealQrCode({ value, size = 128 }: { value: string; size?: number }) {
  const matrix = useMemo(() => QRCode.create(value, { errorCorrectionLevel: 'M' }).modules, [value]);
  const n = matrix.size;
  const path: string[] = [];
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) if (matrix.data[row * n + col]) path.push(`M${col + 4} ${row + 4}h1v1h-1z`);
  return <svg role="img" aria-label="Scanbare QR-code" width={size} height={size} viewBox={`0 0 ${n + 8} ${n + 8}`} shapeRendering="crispEdges"><rect width={n + 8} height={n + 8} fill="white" /><path d={path.join('')} fill="black" /></svg>;
}
