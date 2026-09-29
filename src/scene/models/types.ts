import type { Object3D } from "three";

export type Vec3 = [number, number, number];

/** One separable part of a model. */
export interface ModelPart {
  id: string;
  name: string;
  /** Optional text shown when the part is selected. */
  description?: string;
  /** The part's 3D object (its own copy, so highlighting it doesn't affect other parts). */
  object: Object3D;
  /** The part's centre, in the model's (fitted) coordinates — where its label floats. */
  center: Vec3;
  /** Roughly how big the part is: the radius of a ball that encloses it (fitted metres). */
  radius: number;
  /** Which way the part moves when the model is scattered (unit length). */
  explode: Vec3;
}

/** A model made of parts that can be explored and scattered. */
export interface PartModel {
  name: string;
  parts: ModelPart[];
  /** How far (in metres) parts travel when fully scattered. */
  explodeDistance: number;
}
