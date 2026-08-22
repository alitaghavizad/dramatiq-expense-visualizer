"use client";

import { useEffect, useRef } from "react";

type FieldPoint = {
  x: number;
  y: number;
  proximity: number;
  seed: number;
};

const TAU = Math.PI * 2;

function hash(row: number, column: number) {
  const value = Math.sin(row * 127.1 + column * 311.7) * 43_758.5453;
  return value - Math.floor(value);
}

function drawGlyph(
  context: CanvasRenderingContext2D,
  kind: number,
  x: number,
  y: number,
  size: number,
  rotation: number,
) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.beginPath();

  if (kind === 0) {
    context.arc(0, 0, size * 0.34, 0, TAU);
  } else if (kind === 1) {
    context.rect(-size * 0.42, -size * 0.42, size * 0.84, size * 0.84);
  } else if (kind === 2) {
    context.moveTo(0, -size * 0.58);
    context.lineTo(size * 0.52, size * 0.38);
    context.lineTo(-size * 0.52, size * 0.38);
    context.closePath();
  } else if (kind === 3) {
    context.moveTo(0, -size * 0.58);
    context.lineTo(size * 0.58, 0);
    context.lineTo(0, size * 0.58);
    context.lineTo(-size * 0.58, 0);
    context.closePath();
  } else if (kind === 4) {
    context.arc(0, 0, size * 0.46, 0, TAU);
    context.moveTo(size * 0.25, 0);
    context.arc(0, 0, size * 0.25, 0, TAU, true);
  } else {
    context.moveTo(-size * 0.55, 0);
    context.lineTo(size * 0.55, 0);
    context.moveTo(0, -size * 0.55);
    context.lineTo(0, size * 0.55);
  }

  context.stroke();
  context.restore();
}

export default function AmbientGeometry() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const pointer = { x: -1_000, y: -1_000, active: false };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let isVisible = true;
    let isPageVisible = !document.hidden;

    function resize() {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(bounds.width));
      height = Math.max(1, Math.round(bounds.height));
      const density = Math.min(window.devicePixelRatio || 1, 1.6);
      canvas.width = Math.round(width * density);
      canvas.height = Math.round(height * density);
      context.setTransform(density, 0, 0, density, 0, 0);
      draw(performance.now());
    }

    function buildPoints(time: number) {
      const spacing = width < 680 ? 58 : 66;
      const columns = Math.ceil(width / spacing) + 3;
      const rows = Math.ceil(height / spacing) + 3;
      const points: FieldPoint[][] = [];

      for (let row = 0; row < rows; row += 1) {
        const line: FieldPoint[] = [];
        for (let column = 0; column < columns; column += 1) {
          const seed = hash(row, column);
          const baseX = (column - 1) * spacing + (row % 2 ? spacing * 0.22 : 0);
          const baseY = (row - 1) * spacing;
          const dx = baseX - pointer.x;
          const dy = baseY - pointer.y;
          const distance = Math.max(1, Math.hypot(dx, dy));
          const proximity = pointer.active ? Math.max(0, 1 - distance / 205) : 0;
          const displacement = proximity * proximity * 25;
          const driftX = reducedMotion.matches ? 0 : Math.sin(time * 0.00022 + row * 0.72) * 2.4;
          const driftY = reducedMotion.matches ? 0 : Math.cos(time * 0.00018 + column * 0.61) * 2.2;

          line.push({
            x: baseX + (dx / distance) * displacement + driftX,
            y: baseY + (dy / distance) * displacement + driftY,
            proximity,
            seed,
          });
        }
        points.push(line);
      }
      return points;
    }

    function drawConnections(points: FieldPoint[][]) {
      context.lineWidth = 0.8;
      for (let row = 0; row < points.length; row += 1) {
        for (let column = 0; column < points[row].length; column += 1) {
          const point = points[row][column];
          const neighbours = [points[row][column + 1], points[row + 1]?.[column]];
          for (const neighbour of neighbours) {
            if (!neighbour || hash(row * 3 + column, column * 5 + row) < 0.24) continue;
            const energy = Math.max(point.proximity, neighbour.proximity);
            context.beginPath();
            context.moveTo(point.x, point.y);
            context.lineTo(neighbour.x, neighbour.y);
            context.strokeStyle = `rgba(54, 91, 76, ${0.055 + energy * 0.2})`;
            context.stroke();
          }

          if (point.proximity > 0.08) {
            context.beginPath();
            context.moveTo(point.x, point.y);
            context.lineTo(pointer.x, pointer.y);
            context.strokeStyle = `rgba(221, 104, 72, ${point.proximity * 0.1})`;
            context.stroke();
          }
        }
      }
    }

    function draw(time: number) {
      context.clearRect(0, 0, width, height);
      const points = buildPoints(time);

      if (pointer.active) {
        const glow = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 210);
        glow.addColorStop(0, "rgba(167, 203, 184, 0.16)");
        glow.addColorStop(0.45, "rgba(238, 105, 70, 0.05)");
        glow.addColorStop(1, "rgba(245, 243, 237, 0)");
        context.fillStyle = glow;
        context.fillRect(pointer.x - 210, pointer.y - 210, 420, 420);
      }

      drawConnections(points);

      for (let row = 0; row < points.length; row += 1) {
        for (let column = 0; column < points[row].length; column += 1) {
          const point = points[row][column];
          const kind = Math.floor(point.seed * 6);
          const size = 3.3 + point.seed * 3.6 + point.proximity * 5.5;
          const rotation = point.seed * Math.PI + (reducedMotion.matches ? 0 : time * 0.00008 * (kind % 2 ? 1 : -1));
          const alpha = 0.15 + point.seed * 0.13 + point.proximity * 0.55;
          const isAccent = kind === 2 || kind === 3;
          context.lineWidth = 1 + point.proximity * 0.7;
          context.strokeStyle = isAccent
            ? `rgba(207, 91, 62, ${alpha * 0.78})`
            : `rgba(45, 90, 75, ${alpha})`;
          drawGlyph(context, kind, point.x, point.y, size, rotation);
        }
      }
    }

    function animate(time: number) {
      draw(time);
      frame = window.requestAnimationFrame(animate);
    }

    function stop() {
      if (!frame) return;
      window.cancelAnimationFrame(frame);
      frame = 0;
    }

    function start() {
      if (frame || reducedMotion.matches || !isVisible || !isPageVisible) {
        if (reducedMotion.matches) draw(0);
        return;
      }
      frame = window.requestAnimationFrame(animate);
    }

    function handlePointerMove(event: PointerEvent) {
      if (reducedMotion.matches || event.pointerType === "touch") return;
      const bounds = canvas.getBoundingClientRect();
      pointer.active = event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
    }

    function handleVisibility() {
      isPageVisible = !document.hidden;
      if (isPageVisible) start();
      else stop();
    }

    function handleMotionPreference() {
      if (reducedMotion.matches) stop();
      else start();
      draw(performance.now());
    }

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      if (isVisible) start();
      else stop();
    });
    resizeObserver.observe(canvas);
    intersectionObserver.observe(canvas);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    reducedMotion.addEventListener("change", handleMotionPreference);
    resize();
    start();

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotion.removeEventListener("change", handleMotionPreference);
    };
  }, []);

  return <canvas ref={canvasRef} className="ambient-geometry" aria-hidden="true" />;
}
