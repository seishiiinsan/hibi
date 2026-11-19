"""Hibi · Jardin — avatar « Pousse », pets et cosmétiques : modèles 3D + calques 2D.

  /Applications/Blender.app/Contents/MacOS/Blender -b -P assets/3d/build_hibi_3d.py

Produit :
  assets/3d/hibi_jardin.blend        la scène complète (tous les objets)
  apps/web/public/avatar/*.webp      un calque transparent par pièce, même caméra
                                     (l'app les empile : back < body < neck < head < face < held)

Chaque calque est rendu avec le corps de l'avatar (ou du pet) en « holdout » : un objet
passe donc devant/derrière le corps exactement comme en 3D, sans chevauchement bizarre
au compositing. Le catalogue (ids, couleurs alternatives) doit rester aligné avec
packages/domain/src/avatar.ts ; le test du domaine vérifie que chaque fichier existe.

Palette = tokens de apps/web/src/styles.css (thème clair) ; les teintes dérivées
(ventre, pieds) sont des mélanges de ces tokens.
"""
import math
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "apps", "web", "public", "avatar"))
os.makedirs(OUT, exist_ok=True)

# ── Tokens Jardin ──────────────────────────────────────────
C = {
    "bg": "#eef3ee", "sunken": "#e3eae3", "ink": "#3d302b", "accent": "#5e7f5b",
    "lilac": "#dcd2f5", "sky": "#cfe2f0", "butter": "#f8e7a8", "sage": "#9dbf9e",
    "leaf2": "#b9d7b6", "stem": "#6e9c6a", "pot": "#f2b48f", "pot_rim": "#e9a27a",
    "peach": "#f2b48f", "white": "#ffffff", "cream": "#f6efe3", "coral": "#e8847c",
}
BODIES = ["sage", "lilac", "butter", "sky", "peach"]


def hex2rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def mix(a, b, t):
    """Mélange sRGB de deux clés/hex de palette : t = part de b."""
    ra, rb = hex2rgb(C.get(a, a)), hex2rgb(C.get(b, b))
    return "#" + "".join(f"{round((x * (1 - t) + y * t) * 255):02x}" for x, y in zip(ra, rb))


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgba(h):
    return tuple(lin(v) for v in hex2rgb(C.get(h, h))) + (1,)


_mats = {}


def mat(key):
    """Matériau mat et doux. `key` = clé de palette ou hex."""
    if key not in _mats:
        m = bpy.data.materials.new("Jardin_" + key)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = rgba(key)
        b.inputs["Roughness"].default_value = 0.75
        _mats[key] = m
    return _mats[key]


def holdout_mat():
    if "holdout" not in _mats:
        m = bpy.data.materials.new("Holdout")
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        h = nt.nodes.new("ShaderNodeHoldout")
        o = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(h.outputs[0], o.inputs[0])
        _mats["holdout"] = m
    return _mats["holdout"]


# ── Primitives ─────────────────────────────────────────────
def finish(o, key, parent, name):
    o.name = name
    o.data.materials.append(mat(key))
    for p in o.data.polygons:
        p.use_smooth = True
    if parent:
        o.parent = parent
    return o


def sphere(name, key, loc, scale, parent=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = scale
    return finish(o, key, parent, name)


def cyl(name, key, loc, r, h, parent=None, rot=(0, 0, 0), bevel=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r, depth=h, location=loc, rotation=rot)
    o = bpy.context.object
    if bevel:
        b = o.modifiers.new("b", "BEVEL")
        b.width = min(r, h) * 0.25
        b.segments = 4
    return finish(o, key, parent, name)


def cone(name, key, loc, r1, r2, h, parent=None, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=r1, radius2=r2, depth=h, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = scale
    return finish(o, key, parent, name)


def torus(name, key, loc, R, r, parent=None, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=64, minor_segments=20,
                                     location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = scale
    return finish(o, key, parent, name)


def box(name, key, loc, size, parent=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    b = o.modifiers.new("b", "BEVEL")
    b.width = min(size) * 0.3
    b.segments = 4
    return finish(o, key, parent, name)


def root(name, loc, rot=(0, 0, 0), scale=(1, 1, 1)):
    e = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(e)
    e.location, e.rotation_euler, e.scale = loc, rot, scale
    return e


def bow(p, c, y, z, s, x=0):
    """Nœud : deux ailes aplaties + un noyau, face à la caméra (−Y)."""
    for sx in (-1, 1):
        sphere("aile_noeud", c, (x + sx * s * 1.1, y, z), (s * 1.15, s * 0.4, s * 0.85), p, rot=(0, sx * 0.35, 0))
    sphere("noeud", mix(c, "ink", 0.2), (x, y - s * 0.1, z), (s * 0.5, s * 0.45, s * 0.5), p)


A = (0.45, 0, 0)            # origine de l'avatar dans la scène des calques
PET = (-0.9, 0, 0)          # origine du pet
BODY_PARTS = []             # (objet, rôle) du corps de l'avatar : recolorés par couleur


# ── Avatar « Pousse » (corps seul) ─────────────────────────
def avatar_body():
    p = root("Avatar_Corps", A)

    def part(o, role):
        BODY_PARTS.append((o, role))
        return o

    part(sphere("corps", "sage", (0, 0, 0.62), (0.55, 0.5, 0.62), p), "body")
    part(sphere("ventre", "sage", (0, -0.28, 0.5), (0.34, 0.25, 0.4), p), "belly")
    for s in (-1, 1):
        part(sphere("bras", "sage", (s * 0.56, -0.02, 0.58), (0.14, 0.14, 0.26), p, rot=(0, s * 0.35, 0)), "body")
        part(sphere("pied", "sage", (s * 0.24, -0.08, 0.06), (0.2, 0.26, 0.11), p), "feet")
        part(sphere("joue", "pot", (s * 0.34, -0.44, 0.76), (0.09, 0.036, 0.054), p), "blush")
    return p


MOODS = ["sleepy", "neutral", "happy"]


def avatar_face(mood):
    """Yeux et bouche d'une humeur ; le reste du visage (joues) fait partie du corps."""
    p = root(f"Avatar_Visage_{mood}", A)
    for s in (-1, 1):
        x = s * 0.2
        if mood == "sleepy":      # yeux clos, bouche toute petite
            sphere("paupiere", "ink", (x, -0.45, 0.87), (0.085, 0.03, 0.02), p, rot=(0, s * 0.12, 0))
        elif mood == "happy":     # grands yeux brillants
            sphere("oeil", "ink", (x, -0.45, 0.88), (0.085, 0.05, 0.1), p)
            sphere("reflet", "white", (x + 0.026, -0.485, 0.925), (0.025, 0.025, 0.025), p)
            sphere("reflet2", "white", (x - 0.02, -0.485, 0.85), (0.012, 0.012, 0.012), p)
        else:
            sphere("oeil", "ink", (x, -0.45, 0.88), (0.075, 0.045, 0.086), p)
            sphere("reflet", "white", (x + 0.022, -0.48, 0.92), (0.021, 0.021, 0.021), p)
    if mood == "sleepy":
        sphere("bouche", "ink", (0, -0.5, 0.73), (0.035, 0.025, 0.014), p)
    elif mood == "happy":         # bouche ouverte, langue
        sphere("bouche", "ink", (0, -0.5, 0.735), (0.105, 0.035, 0.065), p)
        sphere("langue", "pot", (0, -0.52, 0.71), (0.055, 0.02, 0.03), p)
    else:
        sphere("bouche", "ink", (0, -0.5, 0.74), (0.07, 0.03, 0.035), p)
    return p


def paint_body(color):
    base = C[color]
    roles = {"body": base, "belly": mix(base, "white", 0.5), "feet": mix(base, "ink", 0.3),
             "blush": C["coral"] if color == "peach" else C["pot"]}
    for o, role in BODY_PARTS:
        o.data.materials[0] = mat(roles[role])


# ── Pets ───────────────────────────────────────────────────
def pet_lapin():
    p = root("Pet_Lapin", PET, rot=(0, 0, math.radians(28)))
    sphere("corps", "lilac", (0, 0, 0.32), (0.34, 0.32, 0.3), p)
    sphere("tete", "lilac", (0, -0.12, 0.7), (0.27, 0.25, 0.23), p)
    for s in (-1, 1):
        sphere("oreille", "lilac", (s * 0.12, -0.08, 1.02), (0.065, 0.045, 0.24), p, rot=(0, s * 0.18, 0))
        sphere("oreille_int", "pot", (s * 0.12, -0.115, 1.02), (0.032, 0.02, 0.17), p, rot=(0, s * 0.18, 0))
        sphere("oeil", "ink", (s * 0.1, -0.34, 0.74), (0.045, 0.027, 0.052), p)
        sphere("reflet", "white", (s * 0.1 + 0.014, -0.357, 0.762), (0.013,) * 3, p)
    sphere("nez", "pot_rim", (0, -0.37, 0.67), (0.04, 0.025, 0.03), p)
    sphere("queue", "white", (0, 0.32, 0.3), (0.1, 0.1, 0.1), p)
    return p


def pet_escargot():
    p = root("Pet_Escargot", PET, rot=(0, 0, math.radians(50)))
    sphere("corps", "butter", (0, -0.08, 0.1), (0.2, 0.55, 0.1), p)
    sphere("tete", "butter", (0, -0.58, 0.2), (0.14, 0.14, 0.14), p)
    for s in (-1, 1):
        cyl("antenne", "butter", (s * 0.07, -0.62, 0.42), 0.015, 0.22, p)
        sphere("bout", "ink", (s * 0.07, -0.62, 0.54), (0.03,) * 3, p)
        sphere("oeil", "ink", (s * 0.06, -0.7, 0.22), (0.025, 0.015, 0.03), p)
    sphere("coquille", "pot", (0, 0.12, 0.38), (0.26, 0.26, 0.28), p)
    for sx in (-1, 1):  # spirale sur les deux flancs
        torus("spirale", "pot_rim", (sx * 0.245, 0.12, 0.38), 0.15, 0.028, p, rot=(0, math.pi / 2, 0))
        torus("spirale2", "pot_rim", (sx * 0.262, 0.12, 0.38), 0.075, 0.025, p, rot=(0, math.pi / 2, 0))
    return p


def pet_oiseau():
    p = root("Pet_Oiseau", PET, rot=(0, 0, math.radians(28)))
    sphere("corps", "sky", (0, 0, 0.4), (0.36, 0.34, 0.36), p)
    sphere("ventre", "white", (0, -0.2, 0.3), (0.22, 0.18, 0.24), p)
    for s in (-1, 1):
        sphere("aile", "sky", (s * 0.36, 0.02, 0.4), (0.06, 0.2, 0.2), p, rot=(0.2, 0, s * 0.3))
        cyl("patte", "pot_rim", (s * 0.1, -0.05, 0.03), 0.018, 0.1, p)
        sphere("oeil", "ink", (s * 0.12, -0.31, 0.5), (0.05, 0.03, 0.057), p)
        sphere("reflet", "white", (s * 0.12 + 0.015, -0.33, 0.525), (0.014,) * 3, p)
    cone("bec", "butter", (0, -0.38, 0.43), 0.06, 0.008, 0.14, p, rot=(-math.pi / 2, 0, 0))
    for x in (-0.05, 0, 0.05):
        sphere("huppe", "sky", (x, 0, 0.8 + (0.04 if x == 0 else 0)), (0.025, 0.025, 0.09), p)
    return p


PET_BOW = {  # (rotation du pet en degrés, position locale du nœud, taille, couleur)
    "lapin": (28, (0.17, -0.28, 0.86), 0.06, "pot"),
    "escargot": (50, (0.07, -0.66, 0.32), 0.05, "sky"),
    "oiseau": (28, (0.19, -0.25, 0.68), 0.055, "pot"),
}


def pet_bow(name):
    rot, (x, y, z), s, c = PET_BOW[name]
    p = root(f"PetAcc_{name}", PET, rot=(0, 0, math.radians(rot)))
    bow(p, c, y, z, s, x)
    return p


# ── Cosmétiques (repère de l'avatar) ───────────────────────
def head_pousse():
    p = root("Tete_Pousse", A)
    cyl("tige", "stem", (0, 0, 1.3), 0.035, 0.22, p)
    for s in (-1, 1):
        sphere("feuille", "leaf2", (s * 0.14, 0, 1.45), (0.17, 0.05, 0.09), p, rot=(0, s * -0.5, 0))
    return p


def head_chapeau(c):
    p = root("Tete_Chapeau", (A[0], 0, 1.07))
    cyl("bord", c, (0, 0, 0.04), 0.5, 0.07, p)
    cyl("calotte", c, (0, 0, 0.22), 0.28, 0.3, p)
    cyl("ruban", "accent", (0, 0, 0.12), 0.295, 0.08, p)
    return p


def head_bonnet(c):
    p = root("Tete_Bonnet", A)
    sphere("dome", c, (0, 0.02, 1.03), (0.4, 0.38, 0.3), p)
    torus("revers", "white", (0, 0.02, 1.0), 0.37, 0.07, p, scale=(1, 0.95, 1))
    sphere("pompon", "white", (0, 0.02, 1.36), (0.1, 0.1, 0.1), p)
    return p


def head_couronne():
    p = root("Tete_Couronne", A, rot=(-0.12, 0, 0))
    torus("anneau", "stem", (0, 0, 1.13), 0.31, 0.04, p)
    cols = ["pot", "butter", "lilac", "white", "pot", "butter", "lilac", "white"]
    for i, fc in enumerate(cols):
        a = i * math.tau / len(cols) + 0.3
        x, y = 0.31 * math.cos(a), 0.31 * math.sin(a)
        sphere("fleur", fc, (x, y, 1.15), (0.07, 0.07, 0.06), p)
        sphere("coeur", "butter" if fc != "butter" else "pot_rim", (x, y, 1.19), (0.028, 0.028, 0.02), p)
    return p


def face_lunettes():
    p = root("Visage_Lunettes", (A[0], -0.47, 0.68))
    for s in (-1, 1):
        torus("verre", "ink", (s * 0.2, 0, 0.2), 0.125, 0.02, p, rot=(math.pi / 2, 0, 0))
        cyl("branche", "ink", (s * 0.325, 0.15, 0.2), 0.014, 0.3, p, rot=(math.pi / 2, 0, 0), bevel=False)
    cyl("pont", "ink", (0, 0, 0.23), 0.014, 0.12, p, rot=(0, math.pi / 2, 0), bevel=False)
    return p


def face_soleil():
    p = root("Visage_Soleil", (A[0], -0.47, 0.68))
    for s in (-1, 1):
        cyl("verre", "ink", (s * 0.2, 0, 0.2), 0.135, 0.03, p, rot=(math.pi / 2, 0, 0))
        torus("monture", "accent", (s * 0.2, -0.012, 0.2), 0.135, 0.02, p, rot=(math.pi / 2, 0, 0))
        cyl("branche", "accent", (s * 0.335, 0.15, 0.2), 0.014, 0.3, p, rot=(math.pi / 2, 0, 0), bevel=False)
        sphere("reflet", "white", (s * 0.2 - 0.04, -0.03, 0.25), (0.03, 0.006, 0.014), p, rot=(0, -0.5, 0))
    cyl("pont", "accent", (0, 0, 0.23), 0.014, 0.12, p, rot=(0, math.pi / 2, 0), bevel=False)
    return p


def neck_echarpe(c):
    p = root("Cou_Echarpe", (A[0], 0, 0.52))
    d = mix(c, "ink", 0.14)
    torus("tour", c, (0, 0, 0), 0.585, 0.085, p, rot=(0.2, 0, 0), scale=(1, 0.93, 1.25))
    sphere("noeud", d, (0.3, -0.53, -0.02), (0.1, 0.09, 0.1), p)
    box("pan", c, (0.32, -0.55, -0.26), (0.17, 0.07, 0.34), p, rot=(0, 0.12, 0))
    for k in range(3):
        box("rayure", d, (0.322, -0.59, -0.34 + k * 0.09), (0.175, 0.075, 0.03), p, rot=(0, 0.12, 0))
    return p


def neck_noeud(c):
    p = root("Cou_Noeud", (A[0], 0, 0))
    bow(p, c, -0.52, 0.58, 0.1)
    return p


def held_arrosoir(c):
    p = root("Main_Arrosoir", (A[0] + 0.74, -0.2, 0.3), scale=(-0.62, 0.62, 0.62))
    cyl("cuve", c, (0, 0, 0.22), 0.22, 0.38, p)
    torus("anse", "accent", (0.2, 0, 0.3), 0.14, 0.022, p, rot=(math.pi / 2, 0, 0))
    cyl("bec", "accent", (-0.33, 0, 0.36), 0.03, 0.34, p, rot=(0, math.pi / 2 + 0.5, 0))
    sphere("pomme", "accent", (-0.5, 0, 0.5), (0.07, 0.07, 0.04), p)
    return p


def held_livre(c):
    p = root("Main_Livre", (A[0] + 0.74, -0.24, 0.5), rot=(0, 0.25, 0))
    box("pages", "cream", (0, 0.01, 0), (0.24, 0.07, 0.32), p)
    box("couverture", c, (0, -0.03, 0), (0.26, 0.03, 0.34), p)
    box("etiquette", "cream", (0, -0.05, 0.05), (0.14, 0.02, 0.08), p)
    box("dos", mix(c, "ink", 0.15), (-0.125, 0, 0), (0.025, 0.09, 0.34), p)
    return p


def held_fleur(c):
    p = root("Main_Fleur", (A[0] + 0.7, -0.2, 0.34), rot=(0, 0.12, 0))
    cyl("tige", "stem", (0, 0, 0.25), 0.014, 0.5, p, bevel=False)
    sphere("feuille", "leaf2", (0.06, 0, 0.18), (0.07, 0.015, 0.035), p, rot=(0, -0.5, 0))
    for i in range(6):
        a = i * math.tau / 6
        sphere("petale", c, (0.075 * math.cos(a), -0.015, 0.54 + 0.075 * math.sin(a)), (0.05, 0.025, 0.05), p)
    sphere("coeur", "butter", (0, -0.03, 0.54), (0.045, 0.03, 0.045), p)
    return p


def back_ailes(c):
    p = root("Dos_Ailes", A)
    for s in (-1, 1):
        sphere("aile", c, (s * 0.7, 0.28, 0.92), (0.32, 0.04, 0.13), p, rot=(0, s * -0.55, s * 0.1))
        sphere("aile2", c, (s * 0.66, 0.28, 0.6), (0.24, 0.04, 0.1), p, rot=(0, s * 0.45, 0))
    return p


def back_cape(c):
    p = root("Dos_Cape", A)
    cone("cape", c, (0, 0.36, 0.5), 0.66, 0.32, 0.86, p, scale=(1, 0.22, 1))
    return p


# ── Scène ──────────────────────────────────────────────────
def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    for name in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = name
            break
        except TypeError:
            pass
    sc.render.resolution_x, sc.render.resolution_y = 1200, 750
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "WEBP"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.quality = 92
    sc.view_settings.view_transform = "Standard"

    w = bpy.data.worlds.new("W")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = rgba("bg")
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.55
    sc.world = w

    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), 0, math.radians(-25)))
    bpy.context.object.data.energy = 2.0
    bpy.context.object.data.angle = math.radians(25)
    bpy.ops.object.light_add(type="AREA", location=(0, -6, 5))
    bpy.context.object.data.energy = 80
    bpy.context.object.data.size = 8

    bpy.ops.object.camera_add(location=(0.1, -16, 0.9), rotation=(math.radians(90), 0, 0))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 3.2
    sc.camera = cam


def descendants(o):
    return [o] + list(o.children_recursive)


def render(path, roots, holdouts):
    """Rend `roots` ; `holdouts` masquent (corps) sans apparaître."""
    show = {x for r in roots for x in descendants(r)}
    hold = {x for r in holdouts for x in descendants(r)}
    saved = {}
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = not (o in show or o in hold)
            if o in hold and o not in show:
                saved[o] = list(o.data.materials)
                for i in range(len(o.data.materials)):
                    o.data.materials[i] = holdout_mat()
    bpy.context.scene.render.filepath = os.path.join(OUT, path + ".webp")
    bpy.ops.render.render(write_still=True)
    for o, ms in saved.items():
        for i, m in enumerate(ms):
            o.data.materials[i] = m


def main():
    setup()
    body = avatar_body()
    pets = {"lapin": pet_lapin(), "escargot": pet_escargot(), "oiseau": pet_oiseau()}

    # (id, constructeur, couleur par défaut, couleur alternative | None)
    items = {
        "head": [("pousse", head_pousse, None, None), ("chapeau", head_chapeau, "butter", "pot"),
                 ("bonnet", head_bonnet, "lilac", "sky"), ("couronne", head_couronne, None, None)],
        "face": [("lunettes", face_lunettes, None, None), ("soleil", face_soleil, None, None)],
        "neck": [("echarpe", neck_echarpe, "pot", "sky"), ("noeud", neck_noeud, "lilac", "pot")],
        "held": [("arrosoir", held_arrosoir, "sky", "pot"), ("livre", held_livre, "pot", "sky"),
                 ("fleur", held_fleur, "pot", "lilac")],
        "back": [("ailes", back_ailes, "leaf2", "butter"), ("cape", back_cape, "accent", None)],
    }

    built = []
    for slot, lst in items.items():
        for iid, fn, c1, c2 in lst:
            for variant, col in (("", c1), ("-alt", c2)):
                if variant and col is None:
                    continue
                obj = fn(col) if col else fn()
                built.append((f"{slot}-{iid}{variant}", obj))

    pet_bows = {n: pet_bow(n) for n in pets}

    faces = {m: avatar_face(m) for m in MOODS}
    for c in BODIES:  # un calque de corps par couleur et par humeur, sans holdout
        paint_body(c)
        for m in MOODS:
            render(f"body-{c}" + ("" if m == "neutral" else f"-{m}"), [body, faces[m]], [])
    paint_body("sage")

    for name, obj in built:  # le corps de l'avatar masque ce qui passe derrière
        render(name, [obj], [body, faces["neutral"]])

    for n, p in pets.items():
        render(f"pet-{n}", [p], [])
        render(f"petacc-{n}-noeud", [pet_bows[n]], [p])

    for o in bpy.data.objects:  # .blend : tout visible
        o.hide_render = False
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "hibi_jardin.blend"))


main()
