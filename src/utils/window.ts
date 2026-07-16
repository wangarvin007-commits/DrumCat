export interface PointLike {
  x: number
  y: number
}

export interface SizeLike {
  height: number
  width: number
}

export interface WindowBounds {
  maxX: number
  maxY: number
  minX: number
  minY: number
}

export function getWindowBounds(
  monitorPosition: PointLike,
  monitorSize: SizeLike,
  windowSize: SizeLike,
): WindowBounds {
  const minX = monitorPosition.x
  const minY = monitorPosition.y

  return {
    minX,
    minY,
    maxX: Math.max(minX, monitorPosition.x + monitorSize.width - windowSize.width),
    maxY: Math.max(minY, monitorPosition.y + monitorSize.height - windowSize.height),
  }
}

export function clampWindowPosition(position: PointLike, bounds: WindowBounds): PointLike {
  return {
    x: Math.max(bounds.minX, Math.min(position.x, bounds.maxX)),
    y: Math.max(bounds.minY, Math.min(position.y, bounds.maxY)),
  }
}
