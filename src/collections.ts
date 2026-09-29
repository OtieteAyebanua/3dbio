/**
 * What there is to explore: each collection is a set of 3D models (files in public/models)
 * that the explorer steps through with its arrows and dropdown.
 */

export interface ModelSource {
  url: string;
  name: string;
  /** Friendlier names for parts, by the object's name in the file (after three.js drops any dots). */
  labels?: Record<string, string>;
}

export interface Collection {
  /** What the dropdown is called ("Body parts"). */
  pickerLabel: string;
  models: ModelSource[];
}

const file = (name: string) => `${import.meta.env.BASE_URL}models/${encodeURIComponent(name)}`;

export const ANATOMY: Collection = {
  pickerLabel: "Body parts",
  models: [
    { url: file("heart.glb"), name: "Heart" },
    { url: file("lungs.glb"), name: "Lungs" },
    { url: file("liver.glb"), name: "Liver" },
    { url: file("abdomen.glb"), name: "Stomach, spleen, pancreas & kidneys" },
    { url: file("brain.glb"), name: "Brain" },
    { url: file("skull.glb"), name: "Skull" },
    { url: file("mouth.glb"), name: "Mouth & teeth" },
    { url: file("eye.glb"), name: "Eye" },
    { url: file("ear.glb"), name: "Inner & middle ear" },
    { url: file("spine.glb"), name: "Spine" },
    { url: file("ribcage.glb"), name: "Rib cage" },
    { url: file("pelvis.glb"), name: "Pelvis" },
    { url: file("hand.glb"), name: "Hand bones" },
    { url: file("foot.glb"), name: "Foot bones" },
  ],
};

export const NASA: Collection = {
  pickerLabel: "Spacecraft",
  models: [
    {
      url: file("Mars 2020 Perseverance Rover.glb"),
      name: "Perseverance rover",
      labels: {
        Cylinder: "Remote Sensing Mast",
        Body: "Rover body",
        Body002: "Rover body panel",
        Body003: "Rover body panel",
        Body_Parts: "Body fittings",
        Body_Parts001: "Body fittings",
        hazcams_front: "Front hazard cameras",
        hazcams_front_cover: "Front hazard camera cover",
        hazcams_rear: "Rear hazard cameras",
        hazcams_rear_cover_l: "Rear hazard camera cover (left)",
        hazcams_rear_cover_r: "Rear hazard camera cover (right)",
        hazcams_rear_wiring: "Rear hazard camera wiring",
        microphones: "Microphones",
        Wheels_objs: "Wheels",
        suspension: "Rocker-bogie suspension",
        Armature: "Robotic arm",
        arm001: "Robotic arm segment",
        arm003: "Robotic arm segment",
        arm_01_joint: "Robotic arm joint",
        arm_02_joint: "Robotic arm joint",
        arm_cable_etc: "Robotic arm cables",
        rtg: "RTG power source",
        antenna_uhf: "UHF antenna",
        antenna_hg: "High-gain antenna",
        antenna_lg: "Low-gain antenna",
        RIMFAX: "RIMFAX ground-penetrating radar",
        Name_Chips: "Name chips plate",
        calibration_target: "Camera calibration target",
        calibration_target_bracket: "Calibration target bracket",
        Up_Look_Camera: "Upward-looking camera",
        Down_Look_Camera: "Downward-looking camera",
      },
    },
    {
      // Compressed from the original (66 MB, kept in assets/) with gltf-transform: textures → WebP, max 2048 px.
      url: file("gateway-core.glb"),
      name: "Gateway lunar space station",
      labels: {
        NG_HALO: "HALO (Habitation and Logistics Outpost)",
        Maxar_PPE: "Power and Propulsion Element (PPE)",
        iHAB: "I-Hab (International Habitation module)",
        ERMXL: "ESPRIT Refuelling Module",
        airlock: "Crew and Science Airlock",
        Big_Arm_1: "Canadarm3 (large arm)",
        Little_Arm_1: "Canadarm3 (small arm)",
      },
    },
  ],
};
