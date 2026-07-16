export interface LogicalWindowSize {
  height: number
  width: number
}

export function getMainWindowSize(
  petSize: LogicalWindowSize,
  panelOpen: boolean,
  panelSize: LogicalWindowSize,
): LogicalWindowSize {
  return panelOpen ? panelSize : petSize
}

export function getEffectiveAlwaysOnTop(alwaysOnTop: boolean, panelOpen: boolean): boolean {
  return alwaysOnTop && !panelOpen
}
