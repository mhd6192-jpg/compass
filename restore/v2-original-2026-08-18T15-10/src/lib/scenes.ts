export interface SceneDef {
  id: string;
  label: string;
}

// The ordered TV scenes. Shared by the display carousel and the control panel
// so scene ids always line up.
export const TV_SCENES: SceneDef[] = [
  { id: "compass", label: "Compass Overview" },
  { id: "fulldraw", label: "Full Draw — East & West" },
  { id: "directions", label: "North · South · Corners" },
  { id: "leaderboard", label: "Champions & Stats" },
];

export const SCENE_DURATION_MS = 16000;
