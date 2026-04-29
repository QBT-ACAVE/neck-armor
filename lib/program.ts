export type Exercise = {
  id: string;
  name: string;
  equip: string;
  sets: number;
  reps: string;
  rest: number;
  baseWeight: number | null;
  weightUnit: 'lb' | 'kg' | 'level';
  targetRPE: number;
  videoId?: string;
  cue: string;
};

export type Day = {
  week: number;
  day: number;
  dayName: string;
  letter: 'A' | 'B';
  label: string;
  tag: string;
  color: string;
  phase: 'Foundation' | 'Strength' | 'Power';
  exercises: Exercise[];
};

const PHASES = {
  1: { name: 'Foundation' as const, color: '#1D9E75', mult: [1.0, 1.05, 1.1, 1.15] },
  2: { name: 'Strength' as const, color: '#185FA5', mult: [1.2, 1.25, 1.3, 1.35] },
  3: { name: 'Power' as const, color: '#D4537E', mult: [1.4, 1.45, 1.5, 1.4] },
};

/* ============================================================================
 * YOUTUBE VIDEO LIBRARY
 * ----------------------------------------------------------------------------
 * To swap a video: replace the ID after the colon with the new YouTube ID.
 * The ID is the part after `?v=` in any YouTube URL. Example:
 *   https://www.youtube.com/watch?v=ABC123xyz  →  use 'ABC123xyz'
 *
 * SLOT                  | USED BY EXERCISES
 * ----------------------|---------------------------------------------------
 * ironNeckRotations     | Iron Neck Rotations (P1, P2, P3 dynamic)
 * ironNeckPhase1        | Iron Neck 360° Circles (P1)
 * ironNeckElitefts      | Iron Neck Anti-Rotation Holds, Flexion/Extension (P2)
 * ironNeckResistance    | Band 4-Way Neck (P1), Head-on-a-Swivel Drill (P3)
 * plateNeckFlexion      | Lying Plate Neck Flexion (P1), Plate Work All 4 (P3)
 * plateNeckRaise        | Plate Neck Flexion 3s eccentric (P2)
 * neckExtension         | Prone Plate Neck Extension (P1, P2)
 * neckFlexExt           | Side-Lying Lateral Flexion (P1, P2)
 * chinTucks             | Banded Chin Tucks (P1)
 * chinTucksAlt          | Band-Resisted Chin Tucks (P2), Banded Explosive (P3)
 * farmerCarry           | Dumbbell Shrugs, Farmer Carries, Heavy variants (all phases)
 *
 * NOT VIDEOED (cue text only): Manual Resistance 4-Way, Manual Resistance 3s/4s
 * Eccentric, Partner Perturbations, Wrestler's Bridge.
 * ============================================================================ */
const VIDEOS = {
  ironNeckRotations: 'e6cAvTtvX0c',
  ironNeckPhase1: 'ODf2-hL-86c',
  ironNeckElitefts: '1-yJLmus0xw',
  ironNeckResistance: 'aZiCFJ05uqQ',
  plateNeckFlexion: 'mb6P_cIINmw',
  plateNeckRaise: '7CIM4N4KWHc',
  neckExtension: 'dOPwvCBT3GA',
  neckFlexExt: '6k9VQNN8B5U',
  chinTucks: 'gIBoxQ6AlS0',
  chinTucksAlt: 'u8C5LgpK3r4',
  farmerCarry: 'lrdfwD927LI',
};

const dayA_P1: Exercise[] = [
  { id: 'in_rot', name: 'Iron Neck Rotations', equip: 'Iron Neck', sets: 3, reps: '10 each way', rest: 60, baseWeight: 1, weightUnit: 'level', targetRPE: 1, cue: 'Light tension. Smooth, controlled.', videoId: VIDEOS.ironNeckRotations },
  { id: 'in_circ', name: 'Iron Neck 360 Circles', equip: 'Iron Neck', sets: 3, reps: '5 each way', rest: 60, baseWeight: 1, weightUnit: 'level', targetRPE: 1, cue: 'Slow circles, no jerking.', videoId: VIDEOS.ironNeckPhase1 },
  { id: 'man_iso', name: 'Manual Resistance 4-Way', equip: 'Bodyweight', sets: 3, reps: '6s holds', rest: 45, baseWeight: null, weightUnit: 'lb', targetRPE: 2, cue: 'Front, back, each side. Press into your hands.' },
  { id: 'band_chin', name: 'Banded Chin Tucks', equip: 'Band', sets: 3, reps: '12', rest: 45, baseWeight: 1, weightUnit: 'level', targetRPE: 1, cue: 'Pull chin straight back, not down.', videoId: VIDEOS.chinTucks },
  { id: 'shrug', name: 'Dumbbell Shrugs', equip: 'Dumbbell', sets: 3, reps: '12', rest: 60, baseWeight: 20, weightUnit: 'lb', targetRPE: 2, cue: 'Straight up, no rolling.', videoId: VIDEOS.farmerCarry },
];

const dayB_P1: Exercise[] = [
  { id: 'plate_flex', name: 'Lying Plate Neck Flexion', equip: 'Plate', sets: 3, reps: '12', rest: 60, baseWeight: 2.5, weightUnit: 'lb', targetRPE: 2, cue: 'Lie on bench, head off edge. Tuck chin to chest.', videoId: VIDEOS.plateNeckFlexion },
  { id: 'plate_ext', name: 'Prone Plate Neck Extension', equip: 'Plate', sets: 3, reps: '12', rest: 60, baseWeight: 2.5, weightUnit: 'lb', targetRPE: 2, cue: 'Prone, head off bench. Lift slowly.', videoId: VIDEOS.neckExtension },
  { id: 'plate_lat', name: 'Side-Lying Lateral Flexion', equip: 'Plate', sets: 3, reps: '10 each side', rest: 60, baseWeight: 2.5, weightUnit: 'lb', targetRPE: 2, cue: 'Side-lying, lift head toward ceiling.', videoId: VIDEOS.neckFlexExt },
  { id: 'band_4way', name: 'Band 4-Way Neck', equip: 'Band', sets: 2, reps: '12 each way', rest: 45, baseWeight: 2, weightUnit: 'level', targetRPE: 1, cue: 'Anchor band, head harness or towel.', videoId: VIDEOS.ironNeckResistance },
  { id: 'farmer', name: 'Farmer Carries', equip: 'Dumbbell', sets: 3, reps: '40 yards', rest: 90, baseWeight: 40, weightUnit: 'lb', targetRPE: 2, cue: 'Pack neck, shoulders down, walk tall.', videoId: VIDEOS.farmerCarry },
];

const dayA_P2: Exercise[] = [
  { id: 'in_rot_h', name: 'Iron Neck Resisted Rotations', equip: 'Iron Neck', sets: 4, reps: '8 each way', rest: 75, baseWeight: 3, weightUnit: 'level', targetRPE: 2, cue: 'Moderate tension, controlled tempo.', videoId: VIDEOS.ironNeckRotations },
  { id: 'in_anti', name: 'Iron Neck Anti-Rotation Holds', equip: 'Iron Neck', sets: 3, reps: '20s holds', rest: 60, baseWeight: 3, weightUnit: 'level', targetRPE: 2, cue: 'Resist rotation. Stay rigid.', videoId: VIDEOS.ironNeckElitefts },
  { id: 'in_fe', name: 'Iron Neck Flexion/Extension', equip: 'Iron Neck', sets: 4, reps: '10', rest: 75, baseWeight: 3, weightUnit: 'level', targetRPE: 2, cue: 'Full ROM both directions.', videoId: VIDEOS.ironNeckElitefts },
  { id: 'man_ecc', name: 'Manual Resistance 3s Eccentric', equip: 'Bodyweight', sets: 3, reps: '6', rest: 60, baseWeight: null, weightUnit: 'lb', targetRPE: 2, cue: '3-second lowering on every rep.' },
  { id: 'shrug_h', name: 'Heavy Shrugs', equip: 'Dumbbell', sets: 4, reps: '8', rest: 90, baseWeight: 40, weightUnit: 'lb', targetRPE: 2, cue: 'Heavier load, full squeeze at top.', videoId: VIDEOS.farmerCarry },
];

const dayB_P2: Exercise[] = [
  { id: 'plate_flex_h', name: 'Plate Neck Flexion (3s eccentric)', equip: 'Plate', sets: 4, reps: '10', rest: 75, baseWeight: 7.5, weightUnit: 'lb', targetRPE: 2, cue: '3-sec lowering. Control matters most.', videoId: VIDEOS.plateNeckRaise },
  { id: 'plate_ext_h', name: 'Plate Neck Extension', equip: 'Plate', sets: 4, reps: '10', rest: 75, baseWeight: 7.5, weightUnit: 'lb', targetRPE: 2, cue: 'Slow eccentric, smooth concentric.', videoId: VIDEOS.neckExtension },
  { id: 'plate_lat_h', name: 'Lateral Flexion w/ Plate', equip: 'Plate', sets: 3, reps: '8 each side', rest: 60, baseWeight: 5, weightUnit: 'lb', targetRPE: 2, cue: 'Side-lying, controlled both directions.', videoId: VIDEOS.neckFlexExt },
  { id: 'band_chin_h', name: 'Band-Resisted Chin Tucks', equip: 'Band', sets: 3, reps: '12', rest: 60, baseWeight: 4, weightUnit: 'level', targetRPE: 2, cue: 'Heavier band tension.', videoId: VIDEOS.chinTucksAlt },
  { id: 'farmer_h', name: 'Heavy Farmer Carries', equip: 'Dumbbell', sets: 4, reps: '50 yards', rest: 90, baseWeight: 55, weightUnit: 'lb', targetRPE: 2, cue: 'Heavier load, neck packed throughout.', videoId: VIDEOS.farmerCarry },
];

const dayA_P3: Exercise[] = [
  { id: 'in_dyn', name: 'Iron Neck Dynamic Rotations', equip: 'Iron Neck', sets: 4, reps: '12 each way', rest: 60, baseWeight: 3, weightUnit: 'level', targetRPE: 2, cue: 'Faster tempo, stay controlled.', videoId: VIDEOS.ironNeckRotations },
  { id: 'in_swivel', name: 'Head-on-a-Swivel Drill', equip: 'Iron Neck', sets: 3, reps: '30s', rest: 60, baseWeight: 3, weightUnit: 'level', targetRPE: 2, cue: 'Rapid scanning, full ROM under tension.', videoId: VIDEOS.ironNeckResistance },
  { id: 'partner_pert', name: 'Partner Perturbations', equip: 'Bodyweight', sets: 3, reps: '20s holds', rest: 75, baseWeight: null, weightUnit: 'lb', targetRPE: 2, cue: 'Partner pushes randomly. Hold position.' },
  { id: 'man_h_ecc', name: 'Heavy Manual 4s Eccentric', equip: 'Bodyweight', sets: 4, reps: '5', rest: 75, baseWeight: null, weightUnit: 'lb', targetRPE: 3, cue: '4-second lowering, max tension.' },
];

const dayB_P3: Exercise[] = [
  { id: 'plate_4way', name: 'Plate Work All 4 Directions', equip: 'Plate', sets: 3, reps: '6-8', rest: 75, baseWeight: 10, weightUnit: 'lb', targetRPE: 3, cue: 'Heaviest tolerated. All 4 planes.', videoId: VIDEOS.plateNeckFlexion },
  { id: 'band_explos', name: 'Banded Explosive Chin Tucks', equip: 'Band', sets: 4, reps: '8', rest: 60, baseWeight: 5, weightUnit: 'level', targetRPE: 2, cue: 'Explosive concentric, controlled eccentric.', videoId: VIDEOS.chinTucksAlt },
  { id: 'bridge', name: "Wrestler's Bridge Progression", equip: 'Bodyweight', sets: 3, reps: '30s', rest: 60, baseWeight: null, weightUnit: 'lb', targetRPE: 2, cue: 'Start head-supported on towel. Skip if any neck history.' },
  { id: 'farmer_p', name: 'Packed-Neck Carries', equip: 'Dumbbell', sets: 4, reps: '60 yards', rest: 90, baseWeight: 70, weightUnit: 'lb', targetRPE: 3, cue: 'Chin tucked, neck packed, walk strong.', videoId: VIDEOS.farmerCarry },
];

function buildDay(week: number, letter: 'A' | 'B'): Day {
  const phaseNum = (week <= 4 ? 1 : week <= 8 ? 2 : 3) as 1 | 2 | 3;
  const phase = PHASES[phaseNum];
  const weekInPhase = ((week - 1) % 4);
  const mult = phase.mult[weekInPhase];

  const tpl = phaseNum === 1 ? (letter === 'A' ? dayA_P1 : dayB_P1)
    : phaseNum === 2 ? (letter === 'A' ? dayA_P2 : dayB_P2)
    : (letter === 'A' ? dayA_P3 : dayB_P3);

  const exercises = tpl.map(ex => ({
    ...ex,
    baseWeight: ex.baseWeight !== null ? Math.round(ex.baseWeight * mult * 10) / 10 : null,
  }));

  const dayInWeek = letter === 'A' ? (week % 2 === 1 ? 1 : 3) : (week % 2 === 1 ? 2 : 4);
  const dayNames = ['Mon', 'Tue', 'Thu', 'Fri'];

  return {
    week, day: dayInWeek, dayName: dayNames[dayInWeek - 1], letter,
    label: phaseNum === 1 ? (letter === 'A' ? 'Iron Neck + Isometrics' : 'Plate & Band Dynamic')
      : phaseNum === 2 ? (letter === 'A' ? 'Iron Neck Heavy' : 'Loaded Dynamic')
      : (letter === 'A' ? 'Iron Neck Reactive' : 'Integrated Power'),
    tag: phaseNum === 1 ? (letter === 'A' ? 'IRON NECK' : 'PLATES') : phaseNum === 2 ? (letter === 'A' ? 'IRON NECK' : 'PLATES') : 'POWER',
    color: phase.color,
    phase: phase.name,
    exercises,
  };
}

export const SCHEDULE: Day[] = [];
for (let w = 1; w <= 12; w++) {
  SCHEDULE.push(buildDay(w, 'A'));
  SCHEDULE.push(buildDay(w, 'B'));
  SCHEDULE.push(buildDay(w, 'A'));
  SCHEDULE.push(buildDay(w, 'B'));
}

export const PROGRAM_META = {
  name: 'Neck Armor',
  subtitle: '12-week football prep',
  totalSessions: SCHEDULE.length,
  phases: [
    { name: 'Foundation', weeks: [1, 2, 3, 4], color: '#1D9E75', desc: 'Tissue tolerance & motor control' },
    { name: 'Strength', weeks: [5, 6, 7, 8], color: '#185FA5', desc: 'Heavier loads, slow eccentrics' },
    { name: 'Power', weeks: [9, 10, 11, 12], color: '#D4537E', desc: 'Reactive strength & contact prep' },
  ],
};

export function sessionKey(week: number, day: number) {
  return `w${week}d${day}`;
}
