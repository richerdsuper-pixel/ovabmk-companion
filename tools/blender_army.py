"""Рендер фигурок армии «Люди» для «Шахмат царств» в Blender (bpy).

Запуск:  python3 -m venv bl && bl/bin/pip install bpy==5.3.0
         bl/bin/python tools/blender_army.py docs/chess/units
Получаются PNG с прозрачным фоном: general, tank, fortress, helicopter, para, soldier.
Фигурки — как пластмассовые игрушечные солдатики, смотрят влево (как остальные армии).
"""
import math
import os
import sys

import bpy
from mathutils import Vector

OUT = os.path.abspath(sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'docs/chess/units')
os.makedirs(OUT, exist_ok=True)

# ---------- materials ----------
def mat(name, rgb, rough=0.38, metal=0.0, emit=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m

M = {}
def materials():
    M['olive'] = mat('olive', (0.16, 0.24, 0.08))
    M['olive2'] = mat('olive2', (0.11, 0.17, 0.05))
    M['khaki'] = mat('khaki', (0.42, 0.36, 0.2))
    M['dark'] = mat('dark', (0.03, 0.035, 0.03), 0.5)
    M['skin'] = mat('skin', (0.78, 0.52, 0.36), 0.5)
    M['gold'] = mat('gold', (1.0, 0.66, 0.12), 0.25, 1.0)
    M['red'] = mat('red', (0.7, 0.04, 0.03), 0.4)
    M['glass'] = mat('glass', (0.25, 0.5, 0.75), 0.08)
    M['stone'] = mat('stone', (0.42, 0.42, 0.38), 0.7)
    M['white'] = mat('white', (0.85, 0.85, 0.8), 0.5)

def put(obj, m):
    obj.data.materials.clear()
    obj.data.materials.append(M[m])
    bpy.ops.object.shade_smooth()
    return obj

def cube(loc, scale, m, rot=(0, 0, 0), bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        mod = o.modifiers.new('b', 'BEVEL'); mod.width = bevel; mod.segments = 3
    return put(o, m)

def cyl(loc, r, h, m, rot=(0, 0, 0), v=32, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=v)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, location=loc, rotation=rot, vertices=v)
    return put(bpy.context.object, m)

def sph(loc, r, m, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=32, ring_count=16)
    o = bpy.context.object
    o.scale = scale
    return put(o, m)

def between(a, b, r, m):
    a, b = Vector(a), Vector(b)
    d = b - a
    o = cyl((a + b) / 2, r, d.length, m)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    return o

def crown(z, s=1.0):
    cyl((0, 0, z), 0.16 * s, 0.09 * s, 'gold')
    for i in range(5):
        a = i * 2 * math.pi / 5
        cyl((0.15 * s * math.cos(a), 0.15 * s * math.sin(a), z + 0.1 * s), 0.035 * s, 0.14 * s, 'gold', r2=0.0, v=12)
    sph((0, 0, z + 0.16 * s), 0.04 * s, 'red')

# ---------- figures (front = -X, so they look left in the picture) ----------
def person(coat='olive', helmet=True, arms='rifle'):
    for y in (-0.11, 0.11):
        cyl((0, y, 0.36), 0.085, 0.72, 'olive2')
        cube((-0.05, y, 0.03), (0.15, 0.08, 0.05), 'dark')
    cube((0, 0, 0.98), (0.2, 0.26, 0.32), coat)
    cube((0, 0, 0.7), (0.2, 0.27, 0.05), 'dark', bevel=0.02)           # belt
    cyl((0, 0, 1.33), 0.07, 0.1, 'skin')
    sph((0, 0, 1.47), 0.15, 'skin')
    sph((-0.13, -0.05, 1.5), 0.02, 'dark'); sph((-0.13, 0.05, 1.5), 0.02, 'dark')
    if helmet:
        sph((0, 0, 1.53), 0.18, coat, scale=(1.06, 1.06, 0.8))
        cyl((0, 0, 1.47), 0.21, 0.03, coat)
    if arms == 'rifle':
        between((0, -0.3, 1.22), (-0.22, -0.3, 0.95), 0.07, coat)
        between((0, 0.3, 1.22), (-0.24, 0.22, 0.98), 0.07, coat)
        between((-0.3, -0.26, 0.85), (-0.12, -0.2, 1.7), 0.035, 'dark')  # rifle
        sph((-0.24, -0.3, 0.93), 0.06, 'skin'); sph((-0.25, 0.2, 1.0), 0.06, 'skin')
    elif arms == 'up':
        between((0, -0.3, 1.22), (-0.05, -0.36, 1.75), 0.07, coat)
        between((0, 0.3, 1.22), (-0.05, 0.36, 1.75), 0.07, coat)
        sph((-0.05, -0.36, 1.78), 0.06, 'skin'); sph((-0.05, 0.36, 1.78), 0.06, 'skin')
    else:  # salute / at ease
        between((0, -0.3, 1.22), (-0.05, -0.32, 0.78), 0.07, coat)
        between((0, 0.3, 1.22), (-0.2, 0.18, 1.5), 0.07, coat)
        sph((-0.05, -0.32, 0.74), 0.06, 'skin'); sph((-0.2, 0.14, 1.55), 0.06, 'skin')

def soldier():
    person()

def general():
    person(coat='khaki', helmet=False, arms='salute')
    cyl((0, 0, 0.55), 0.3, 0.6, 'khaki', r2=0.22)                     # long coat
    cyl((0, 0, 1.62), 0.19, 0.12, 'khaki')                            # peaked cap
    cyl((0, 0, 1.68), 0.22, 0.05, 'khaki')
    cube((-0.17, 0, 1.56), (0.08, 0.15, 0.015), 'dark', bevel=0.01)   # visor
    sph((-0.2, 0, 1.64), 0.035, 'gold')
    for y in (-0.27, 0.27):
        cube((0, y, 1.28), (0.12, 0.07, 0.03), 'gold', bevel=0.02)    # epaulettes
    for i, y in enumerate((-0.12, -0.04, 0.04)):
        sph((-0.21, y, 1.08 - i * 0.02), 0.03, 'gold' if i != 1 else 'red')
    crown(1.76, 1.0)

def tank():
    cube((0, 0, 0.42), (0.78, 0.42, 0.18), 'olive')                     # hull
    cube((-0.72, 0, 0.36), (0.12, 0.38, 0.12), 'olive', rot=(0, 0.6, 0))
    for y in (-0.48, 0.48):
        cube((0, y, 0.24), (0.86, 0.12, 0.2), 'dark', bevel=0.12)       # tracks
        for x in (-0.6, -0.3, 0, 0.3, 0.6):
            cyl((x, y * 1.18, 0.22), 0.13, 0.05, 'olive2', rot=(math.pi / 2, 0, 0))
    cyl((0.08, 0, 0.72), 0.36, 0.24, 'olive', r2=0.3)                   # turret
    sph((0.08, 0, 0.84), 0.12, 'olive2', scale=(1, 1, 0.5))
    between((-0.2, 0, 0.74), (-1.25, 0, 0.82), 0.05, 'olive2')          # barrel
    cyl((-1.25, 0, 0.82), 0.075, 0.12, 'dark', rot=(0, math.pi / 2, 0))
    between((0.2, 0.2, 0.84), (0.55, 0.25, 1.35), 0.012, 'dark')        # antenna
    cyl((0.2, -0.18, 0.9), 0.1, 0.06, 'olive2')                          # hatch
    sph((0.2, -0.18, 1.0), 0.08, 'skin')                                 # commander's head
    sph((0.2, -0.18, 1.05), 0.09, 'olive', scale=(1, 1, 0.7))

def fortress():
    cyl((0, 0, 0.62), 0.5, 1.24, 'stone', r2=0.44, v=48)
    cyl((0, 0, 1.3), 0.56, 0.14, 'stone', v=48)
    for i in range(8):
        a = i * 2 * math.pi / 8
        cube((0.5 * math.cos(a), 0.5 * math.sin(a), 1.47), (0.1, 0.1, 0.1), 'stone', rot=(0, 0, a))
    cube((-0.46, 0, 0.28), (0.06, 0.16, 0.26), 'dark', bevel=0.05)      # door
    for z in (0.8,):
        cube((-0.47, 0, z), (0.04, 0.06, 0.12), 'dark', bevel=0.02)     # loophole
    cyl((0, 0, 1.85), 0.018, 0.8, 'dark')                                 # flagpole
    cube((-0.17, 0, 2.08), (0.17, 0.01, 0.1), 'red', bevel=0.01)
    for a in (0.6, 2.2, 3.8):
        cube((0.42 * math.cos(a), 0.42 * math.sin(a), 0.12), (0.18, 0.1, 0.1), 'khaki', rot=(0, 0, a), bevel=0.05)  # sandbags

def helicopter():
    sph((0, 0, 0.82), 0.5, 'olive', scale=(1.45, 0.82, 0.8))           # body
    sph((-0.48, 0, 0.9), 0.3, 'glass', scale=(1, 1.1, 0.9))            # cockpit
    between((0.55, 0, 0.88), (1.45, 0, 1.02), 0.09, 'olive')           # tail boom
    cube((1.48, 0, 1.12), (0.08, 0.02, 0.2), 'olive', bevel=0.02)       # fin
    cyl((1.48, 0.06, 1.12), 0.22, 0.015, 'dark', rot=(math.pi / 2, 0, 0))  # tail rotor
    cyl((0, 0, 1.28), 0.05, 0.2, 'dark')                                 # mast
    for a in (0.35, 0.35 + math.pi / 2):
        cube((0, 0, 1.38), (1.35, 0.06, 0.012), 'dark', rot=(0, 0, a), bevel=0.01)
    for y in (-0.36, 0.36):
        between((-0.6, y, 0.22), (0.6, y, 0.22), 0.03, 'dark')          # skids
        between((-0.25, y, 0.22), (-0.2, y * 0.6, 0.5), 0.022, 'dark')
        between((0.25, y, 0.22), (0.2, y * 0.6, 0.5), 0.022, 'dark')
    sph((-0.46, 0, 0.98), 0.08, 'skin')                                  # pilot

def para():
    person(arms='up')
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(0, 0, 2.15), segments=48, ring_count=24)
    dome = bpy.context.object
    dome.scale = (0.9, 0.9, 0.5)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for v in dome.data.vertices:
        v.select = v.co.z < -0.05
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')
    sol = dome.modifiers.new('s', 'SOLIDIFY'); sol.thickness = 0.03
    put(dome, 'olive')
    for i in range(8):
        a = i * 2 * math.pi / 8
        between((-0.05, 0.36 * (1 if math.sin(a) > 0 else -1), 1.78), (0.86 * math.cos(a), 0.86 * math.sin(a), 2.14), 0.006, 'dark')
    for i in range(8):                                                     # panel seams
        a = i * 2 * math.pi / 8
        sph((0.62 * math.cos(a), 0.62 * math.sin(a), 2.47), 0.05, 'olive2', scale=(1, 1, 0.4))

PIECES = {'soldier': soldier, 'general': general, 'tank': tank, 'fortress': fortress, 'helicopter': helicopter, 'para': para}

# ---------- scene ----------
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials()
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('w'); sc.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.9, 0.93, 1, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(50), math.radians(-25), math.radians(-35)))
    bpy.context.object.data.energy = 3.2
    bpy.ops.object.light_add(type='AREA', location=(-3, -4, 4))
    bpy.context.object.data.energy = 300; bpy.context.object.data.size = 4
    bpy.context.object.rotation_euler = (math.radians(45), 0, math.radians(-35))

def frame_camera():
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centre = (lo + hi) / 2
    size = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = size * 1.35
    d = Vector((-0.38, -1.0, 0.42)).normalized()
    cam.location = centre + d * 10
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = (-d).to_track_quat('-Z', 'Y')
    bpy.context.scene.camera = cam

for name, build in PIECES.items():
    reset()
    build()
    bpy.context.view_layer.update()
    frame_camera()
    bpy.context.scene.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', name, flush=True)
