"""Exports body parts from the anatomy atlas as separate, compressed .glb files (one object per part).
Usage (from the project folder):
  /Applications/Blender.app/Contents/MacOS/Blender -b assets/human.blend --python scripts/blender/export_organs.py -- public/models [organ ...]
"""
import bpy, sys, re, os
sys.path.insert(0, os.path.join(os.getcwd(), "scripts", "blender"))  # for colour.py
from colour import find_colour
LABEL = re.compile(r"\.[jtg]$")  # label lines / text / group markers, not anatomy
def matching(pattern, side=None, skeletal=False, exclude=None):
    """Mesh objects whose name matches, optionally only one side (.r / .l) or only bones."""
    rx = re.compile(pattern, re.I)
    out = []
    for o in bpy.data.objects:
        if o.type != "MESH" or LABEL.search(o.name) or not rx.search(o.name) or len(o.data.polygons) == 0: continue
        if side and not o.name.endswith("." + side): continue
        if exclude and re.search(exclude, o.name, re.I): continue
        if skeletal and not any(c.name.startswith("1: Skeletal") or "skeleton" in c.name.lower() for c in o.users_collection): continue
        out.append(o.name)
    return out

def display(name):
    """Object name as shown in the app. three.js drops dots from names, so '.r' → ' (right)'."""
    name = re.sub(r"\.r$", " (right)", re.sub(r"\.l$", " (left)", name))
    return name.replace(".", "")

def meshes_in(col):
    return [o.name for o in bpy.data.collections[col].all_objects if o.type in ("MESH","CURVE") and not LABEL.search(o.name)]
HEART_VESSELS = ["Ascending aorta","Aortic arch","Brachiocephalic trunk","Pulmonary trunk","Bifurcation of pulmonary trunk",
 "Left pulmonary artery","Right pulmonary artery","Superior vena cava","Inferior vena cava (thoracic part)",
 "Left superior pulmonary vein","Left inferior pulmonary vein","Right superior pulmonary vein","Right inferior pulmonary vein",
 "Left coronary artery","Right coronary artery","Circumflex artery of heart","Right inferolateral branch of right coronary artery",
 "Coronary sinus","Great cardiac vein","Middle cardiac vein"]
ORGANS = {
 "heart": lambda: meshes_in("Heart") + HEART_VESSELS,
 "lungs": lambda: meshes_in("Lungs") + ["Trachea","Left main bronchus","Right main bronchus","Left superior lobar bronchus",
          "Left inferior lobar bronchus","Right superior lobar bronchus","Middle lobar bronchus.r","Right inferior lobar bronchus","Intermediate bronchus.r"],
 "liver": lambda: meshes_in("Liver") + ["Gallbladder"],
 "brain": lambda: meshes_in("Brain"),
 "abdomen": lambda: ["Stomach","Spleen","Pancreas","Kidney.l","Kidney.r","Gallbladder"],
 "skull": lambda: meshes_in("Cranium") + meshes_in("Mandible"),
 "mouth": lambda: meshes_in("Mouth") + meshes_in("Teeth"),
 "eye": lambda: matching(r"(eyeball|cornea|lens|iris|retina|sclera|choroid|ciliary|vitreous|optic nerve|rectus muscle|oblique muscle|levator palpebrae|lacrimal|nasolacrimal)", side="r",
                        exclude=r"retinaculum|abdominal|plexus"),
 "ear": lambda: matching(r"(auricle|auricular|malleus|incus|stapes|cochlea|vestibul|semicircular|tympanic|acoustic|auditory tube)", side="r",
                        exclude=r"region|nodes|nucleus|nuclei|groove|auricle|auricular"),  # the atlas's outer ear is only surface patches
 "spine": lambda: meshes_in("Bones of vertebral column") + ["Sacrum","Coccyx"] + meshes_in("Intervertebral disc"),
 "ribcage": lambda: meshes_in("Bones of thorax"),
 "pelvis": lambda: meshes_in("Bony pelvis"),
 "hand": lambda: matching(r"(scaphoid|lunate|triquetr|pisiform|trapezi|trapezoid|capitate bone|hamate|metacarpal bone|phalanx of .* of hand|sesamoid bones of hand)", side="r", skeletal=True),
 "foot": lambda: [n for n in meshes_in("Right foot") if n.endswith(".r") and re.search(r"(bone|phalanx|talus|calcaneus|sesamoid)", n, re.I) and not re.search("ligament", n, re.I)],
}
# Colours for materials that are plain grey/odd in the atlas (by material name).
BONE = (0.86, 0.8, 0.68, 1)
RECOLOUR = {
 "Teeth": (0.94, 0.91, 0.83, 1),
 "Teeth-roots": (0.84, 0.76, 0.6, 1),
 "Cornea": (0.86, 0.9, 0.94, 1),
 "Iris": (0.36, 0.46, 0.6, 1),
 "Eye": (0.94, 0.92, 0.9, 1),       # the white of the eye
 "Trapezius": (0.62,0.16,0.14,1),   # heart muscle
 "Organ": (0.72,0.38,0.33,1),       # stomach, spleen (atlas colour is near black)
 "Bronchi": (0.86,0.76,0.66,1),     # cartilage-pale windpipe and bronchi
 "White matter": (0.86,0.8,0.72,1),
}
# Bright atlas colour-coding (brain lobes, liver segments) is softened towards warm white to suit the studio.
SOFTEN = re.compile(r"Abductor|Adductor|Flexion|Extension|rotat|Levator|lobe|Organ-\d|Lung-\d|Insula|sulci|Nerve|Nucleus", re.I)
def soften(c, amount=0.3):
    return tuple(c[i] * (1 - amount) + w * amount for i, w in enumerate((0.95, 0.9, 0.85))) + (1,)

args = sys.argv[sys.argv.index("--")+1:]
out_dir, wanted = args[0], args[1:] or list(ORGANS)
dg = bpy.context.evaluated_depsgraph_get()
scene = bpy.context.scene
clean = {}
def plain(m):
    if m.name not in clean:
        old = next((nd for nd in m.node_tree.nodes if nd.type=="BSDF_PRINCIPLED"), None) if m.use_nodes else None
        n = bpy.data.materials.new(m.name)
        n.use_nodes = True
        b = next(nd for nd in n.node_tree.nodes if nd.type=="BSDF_PRINCIPLED")
        colour = RECOLOUR.get(m.name)
        if colour is None and re.match(r"(Bone|Suture)", m.name):
            # The atlas colour-codes bones; here they're all bone-coloured (sutures a shade darker).
            colour = BONE if m.name.startswith("Bone") else tuple(c * 0.88 for c in BONE[:3]) + (1,)
        colour = colour or find_colour(m) or tuple(m.diffuse_color)
        b.inputs["Base Color"].default_value = soften(colour) if SOFTEN.search(m.name) else colour
        b.inputs["Roughness"].default_value = max(0.45, old.inputs["Roughness"].default_value if old else 0.5)
        clean[m.name] = n
    return clean[m.name]

for organ in wanted:
    names = list(dict.fromkeys(ORGANS[organ]()))
    for o in scene.objects: o.select_set(False)
    made = []
    for n in names:
        src = bpy.data.objects.get(n)
        if src is None: print("MISSING", organ, n); continue
        me = bpy.data.meshes.new_from_object(src.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
        if len(me.polygons) == 0: print("EMPTY", organ, n); continue
        for i, m in enumerate(me.materials):
            if m: me.materials[i] = plain(m)
        ob = bpy.data.objects.new("tmp", me)
        ob.matrix_world = src.matrix_world.copy()
        scene.collection.objects.link(ob)
        ob.select_set(True)
        made.append((ob, n))
    # Give the copies the real names (renaming the originals out of the way first).
    for ob, n in made:
        bpy.data.objects[n].name = n + " (source)"
        ob.name = display(n)
    path = os.path.join(out_dir, organ + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7)
    print("DONE", organ, len(made), "parts", sum(len(o.data.polygons) for o, _ in made), "faces",
          sorted({m.name for o,_ in made for m in o.data.materials if m}), os.path.getsize(path)//1024, "KB")
    for ob, n in made:
        bpy.data.objects.remove(ob)
        bpy.data.objects[n + " (source)"].name = n
