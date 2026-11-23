"""Новые семейства «Шахмат царств» (по 3 у растений, грибов, бактерий и вирусов) — реалистичные модели.

Подключается из blender_real.py, как и blender_real_humans.py. Микроорганизмы показаны «как под
электронным микроскопом в цвете»: полупрозрачные материалы с подповерхностным рассеянием.
"""
import math
import random

import bpy
import bmesh
from mathutils import Vector

import blender_real as br
from blender_real import piece, crown, cyl, sph, rod, tube, torus, plate, box, meta_body, hair, MATS


def M(name, rgb, rough=0.45, sss=0.35, bump=0.15, scale=18, coat=0.2, kind='micro'):
    """Organic material: colour noise, subsurface scattering, fine bump."""
    if name in MATS:
        return name
    m, n, l, b = br._new(name)
    v = br._coord(n, l)
    nz = br._noise(n, l, v, scale * 0.3, 5)
    col = br._ramp(n, l, nz.outputs['Fac'], [(0.3, br._vary(rgb, 0.78)), (0.72, br._vary(rgb, 1.15))])
    l.new(col, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Subsurface Weight'].default_value = sss
    b.inputs['Subsurface Radius'].default_value = (1.0, 0.7, 0.5)
    b.inputs['Subsurface Scale'].default_value = 0.06
    b.inputs['Coat Weight'].default_value = coat
    fine = br._noise(n, l, v, scale, 8)
    br._bump(n, l, b, fine.outputs['Fac'], bump, 0.01)
    MATS[name] = m
    return name


def leaf_mat(name, rgb, vein=True):
    if name in MATS:
        return name
    m, n, l, b = br._new(name)
    v = br._coord(n, l)
    nz = br._noise(n, l, v, 6, 4)
    col = br._ramp(n, l, nz.outputs['Fac'], [(0.3, br._vary(rgb, 0.8)), (0.75, br._vary(rgb, 1.15))])
    if vein:
        w = n.new('ShaderNodeTexWave'); w.inputs['Scale'].default_value = 22; w.inputs['Distortion'].default_value = 1.5
        l.new(v, w.inputs['Vector'])
        vr = br._ramp(n, l, w.outputs['Fac'], [(0.85, (0, 0, 0)), (0.95, (1, 1, 1))], srgb=False)
        col = br._mixc(n, l, col, br._vary(rgb, 1.35), vr)
    l.new(col, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.42
    b.inputs['Subsurface Weight'].default_value = 0.25
    b.inputs['Subsurface Radius'].default_value = (0.4, 1.0, 0.3)
    b.inputs['Subsurface Scale'].default_value = 0.03
    b.inputs['Coat Weight'].default_value = 0.25
    fine = br._noise(n, l, v, 40, 6)
    br._bump(n, l, b, fine.outputs['Fac'], 0.08, 0.005)
    MATS[name] = m
    return name


def displace(o, strength=0.04, size=0.12, kind='VORONOI'):
    tx = bpy.data.textures.new('d', kind)
    if kind == 'VORONOI':
        tx.noise_scale = size
    else:
        tx.noise_scale = size
    d = o.modifiers.new('disp', 'DISPLACE'); d.texture = tx; d.strength = strength; d.mid_level = 0.5
    return o


def ico(loc, r, m, sub=2, bumps=0.0, faceted=True):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    me = bpy.data.meshes.new('ico'); bm.to_mesh(me); bm.free()
    o = br._obj('ico', me)
    o.location = loc
    br.put(o, m)
    if faceted:
        for p in o.data.polygons:
            p.use_smooth = False
        br.bevel(o, r * 0.03, 2, 20)
    if bumps:
        displace(o, bumps, r * 0.25)
    return o


def spikes(center, r, m, n=40, length=0.2, head=0.05, thick=0.015, seed=1):
    rnd = random.Random(seed)
    c = Vector(center)
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        y = 1 - 2 * (i + 0.5) / n
        rr = math.sqrt(1 - y * y)
        a = golden * i
        d = Vector((math.cos(a) * rr, math.sin(a) * rr, y))
        d = (d + Vector((rnd.uniform(-0.08, 0.08),) * 3)).normalized()
        p0 = c + d * r * 0.98
        p1 = c + d * (r + length)
        rod(tuple(p0), tuple(p1), thick, m, v=8, bev=0)
        if head:
            sph(tuple(p1), head, m, seg=12)


def helix(base, turns, radius, pitch, thick, m, axis='x', taper=None, n=None):
    n = n or int(turns * 16) + 2
    pts = []
    for i in range(n):
        t = i / (n - 1)
        a = t * turns * 2 * math.pi
        along = t * turns * pitch
        if axis == 'x':
            pts.append((base[0] + along, base[1] + radius * math.cos(a), base[2] + radius * math.sin(a)))
        else:
            pts.append((base[0] + radius * math.cos(a), base[1] + radius * math.sin(a), base[2] + along))
    return tube(pts, thick, m, r_end=taper)


def capsule(a, b, r, m, bumps=0.0):
    a, b = Vector(a), Vector(b)
    L = (b - a).length
    segs = [((a.x, a.y, a.z), (b.x, b.y, b.z), r, r)]
    o = meta_body(segs, m, res=r * 0.25, name='capsule', smooth_iter=2)
    if bumps:
        displace(o, bumps, r * 0.6, 'CLOUDS')
    return o


def lift(z=0.0):
    """Shift everything so it stands on z=0 (with a little air for floating microbes)."""
    objs = [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE')]
    bpy.context.view_layer.update()
    lo = min((o.matrix_world @ Vector(c)).z for o in objs for c in o.bound_box)
    for o in objs:
        o.location.z += z - lo


def king(z_top, x=0.0, y=0.0, s=1.3):
    crown((x, y, z_top), s)


def top_z():
    bpy.context.view_layer.update()
    objs = [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE')]
    return max((o.matrix_world @ Vector(c)).z for o in objs for c in o.bound_box)


# =========================================================== viruses
@piece
def nv_mimi():
    m = M('mimi', (0.55, 0.42, 0.75))
    ico((0, 0, 1.0), 0.62, m, 2)
    core = ico((0, 0, 1.0), 0.66, M('mimi_fib', (0.82, 0.7, 0.95), sss=0.6), 3, faceted=False)
    MATS['fib_mimi'] = br.hair_mat('fib_mimi', (0.85, 0.75, 0.95))
    hair(core, 'fib_mimi', count=2500, length=0.16, children=4, rough=0.01)
    king(1.85)


@piece
def nv_pandora():
    m = M('pandora', (0.75, 0.6, 0.38))
    o = sph((0, 0, 1.0), 0.45, m, scale=(1.0, 1.0, 1.9))
    displace(o, 0.03, 0.1, 'CLOUDS')
    cyl((0, 0, 1.9), 0.12, 0.08, M('pandora_lid', (0.45, 0.32, 0.2)), v=32)


@piece
def nv_mega():
    m = M('mega', (0.38, 0.6, 0.7))
    ico((0, 0, 0.9), 0.75, m, 2, bumps=0.03)
    for k in range(5):
        a = k * 2 * math.pi / 5
        sph((0.55 * math.cos(a), 0.55 * math.sin(a), 1.4), 0.08, M('mega_v', (0.9, 0.8, 0.4)))


@piece
def nv_pitho():
    m = M('pitho', (0.62, 0.52, 0.42))
    o = sph((0, 0, 1.0), 0.48, m, scale=(1.0, 1.0, 2.0))
    displace(o, 0.02, 0.06, 'CLOUDS')
    for z in (0.3, 0.6, 1.4, 1.7):
        rr = 0.48 * math.sqrt(max(0.0, 1 - ((z - 1.0) / 0.96) ** 2))
        torus((0, 0, z), rr, 0.015, M('pitho_r', (0.45, 0.36, 0.28)))
    cyl((0, 0, 1.97), 0.14, 0.06, M('pitho_cork', (0.9, 0.78, 0.55)), v=24)


@piece
def nv_mama():
    m = M('mama', (0.45, 0.7, 0.55))
    ico((0, 0, 1.0), 0.6, m, 2)
    core = ico((0, 0, 1.0), 0.64, M('mama_f', (0.75, 0.95, 0.8), sss=0.6), 3, faceted=False)
    MATS['fib_mama'] = br.hair_mat('fib_mama', (0.75, 0.95, 0.8))
    hair(core, 'fib_mama', count=2000, length=0.12, children=4)
    ico((0.62, -0.55, 1.45), 0.13, M('sputnik', (0.95, 0.55, 0.3)), 1)


@piece
def nv_sputnik():
    ico((0, 0, 0.7), 0.42, M('sputnik', (0.95, 0.55, 0.3)), 1, bumps=0.02)


@piece
def nv_cmv():
    ico((0, 0, 0.9), 0.7, M('cmv', (0.45, 0.75, 0.35)), 2, bumps=0.05)
    king(1.75)


@piece
def nv_tulip():
    # flexible filament curling like a ribbon, striped like the flame tulips it causes
    pts = [(math.sin(t * 0.9) * 0.45, math.cos(t * 1.3) * 0.25, 0.15 + t * 0.2) for t in [i * 0.5 for i in range(16)]]
    tube(pts, 0.07, M('tulipv', (0.9, 0.3, 0.45), sss=0.5))
    sph(pts[-1], 0.1, M('tulipv2', (0.98, 0.85, 0.3)))


@piece
def nv_pvx():
    tube([(0, 0, 0.1), (0.15, 0.1, 0.6), (-0.1, -0.05, 1.1), (0.12, 0.08, 1.6), (0.0, 0.0, 2.0)], 0.06, M('pvx', (0.55, 0.45, 0.8), sss=0.5))
    helix((0, 0, 0.1), 22, 0.065, 0.085, 0.012, M('pvx2', (0.75, 0.65, 0.95)), axis='z')


@piece
def nv_bydv():
    ico((0, 0, 0.6), 0.5, M('bydv', (0.9, 0.8, 0.25)), 2, bumps=0.04)


@piece
def nv_tbsv():
    o = ico((0, 0, 0.75), 0.6, M('tbsv', (0.85, 0.35, 0.25)), 3, faceted=False)
    displace(o, 0.06, 0.12)


@piece
def nv_viroid():
    pts = []
    for i in range(48):
        a = i / 47 * 2 * math.pi
        pts.append((0.55 * math.cos(a), 0.12 * math.sin(a * 7), 0.75 + 0.55 * math.sin(a)))
    tube(pts, 0.05, M('viroid', (0.95, 0.55, 0.75), sss=0.55))
    for i in range(0, 48, 4):
        a = i / 47 * 2 * math.pi
        rod((0.55 * math.cos(a), 0, 0.75 + 0.55 * math.sin(a)), (0.45 * math.cos(a), 0, 0.75 + 0.45 * math.sin(a)), 0.02, 'glow', v=6, bev=0)


@piece
def nv_bottle():
    m = M('bottle', (0.65, 0.55, 0.85))
    o = sph((0, 0, 0.75), 0.42, m, scale=(1, 1, 1.25))
    cyl((0, 0, 1.45), 0.18, 0.6, m, r2=0.1, v=32)
    for k in range(10):
        a = k * 2 * math.pi / 10
        rod((0.1 * math.cos(a), 0.1 * math.sin(a), 0.25), (0.25 * math.cos(a), 0.25 * math.sin(a), 0.0), 0.012, M('bottle_h', (0.9, 0.85, 0.95)), v=6, bev=0)
    king(1.9)


@piece
def nv_twotail():
    m = M('twotail', (0.95, 0.75, 0.3))
    sph((0, 0, 1.0), 0.32, m, scale=(1.6, 1, 1))
    tube([(-0.5, 0, 1.0), (-0.85, 0.05, 1.12), (-1.2, -0.03, 1.02)], 0.05, m, r_end=0.02)
    tube([(0.5, 0, 1.0), (0.85, -0.05, 0.9), (1.2, 0.03, 1.0)], 0.05, m, r_end=0.02)


@piece
def nv_sirv():
    m = M('sirv', (0.45, 0.65, 0.85))
    rod((0, 0, 0.15), (0, 0, 1.95), 0.11, m, v=24)
    for z in (0.12, 1.98):
        for k in range(8):
            a = k * math.pi / 4
            rod((0, 0, z), (0.22 * math.cos(a), 0.22 * math.sin(a), z + (0.1 if z > 1 else -0.08)), 0.01, M('sirv_h', (0.85, 0.9, 1.0)), v=6, bev=0)


@piece
def nv_filament():
    pts = [(0.4 * math.sin(i * 0.7), 0.3 * math.cos(i * 0.5), 0.1 + i * 0.13) for i in range(15)]
    tube(pts, 0.05, M('filv', (0.75, 0.45, 0.85), sss=0.5))


@piece
def nv_spindle():
    m = M('spindle', (0.55, 0.85, 0.65))
    sph((0, 0, 0.85), 0.38, m, scale=(1, 1, 1.9))
    tube([(0, 0, 0.12), (0.06, 0.0, -0.05), (0.0, 0.04, -0.15)], 0.03, m)
    lift(0.0)


@piece
def nv_droplet():
    m = M('droplet', (0.4, 0.75, 0.95), sss=0.6)
    sph((0, 0, 0.55), 0.38, m)
    cyl((0, 0, 1.0), 0.32, 0.55, m, r2=0.02, v=32)
    for k in range(6):
        a = k * math.pi / 3
        rod((0, 0, 1.25), (0.15 * math.cos(a), 0.15 * math.sin(a), 1.5), 0.01, M('droplet_h', (0.9, 0.95, 1.0)), v=6, bev=0)


# =========================================================== bacteria
def chain_balls(pts, r, m):
    segs = [(a, b, r, r) for a, b in zip(pts, pts[1:])]
    return meta_body(segs, m, res=r * 0.25, name='chain', smooth_iter=2)


@piece
def nb_nostoc():
    m = M('nostoc_gel', (0.35, 0.6, 0.35), sss=0.8, rough=0.15, coat=0.8)
    g = sph((0, 0, 0.75), 0.75, m)
    MATS['nostoc_gel'].node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value = 0.6
    cell = M('nostoc_c', (0.15, 0.45, 0.25))
    for k in range(5):
        pts = [(0.5 * math.sin(i * 0.6 + k), 0.5 * math.cos(i * 0.5 + 2 * k), 0.75 + 0.45 * math.sin(i * 0.4 + k * 1.3)) for i in range(9)]
        for p in pts:
            sph(p, 0.07, cell)
    king(1.55)


@piece
def nb_spirulina():
    helix((-0.9, 0, 0.8), 4.5, 0.32, 0.4, 0.09, M('spir', (0.15, 0.55, 0.45), sss=0.5), axis='x')


@piece
def nb_anabaena():
    m = M('anab', (0.3, 0.65, 0.35))
    pts = [(-0.9 + i * 0.2, 0.08 * math.sin(i), 0.35 + 0.25 * math.sin(i * 0.5)) for i in range(10)]
    for i, p in enumerate(pts):
        sph(p, 0.13 if i != 5 else 0.17, m if i != 5 else M('anab_h', (0.75, 0.75, 0.35)))


@piece
def nb_oscillatoria():
    m = M('osc', (0.25, 0.5, 0.45))
    pts = [(-0.9 + i * 0.25, 0.1 * math.sin(i * 0.8), 0.3 + 0.1 * i + 0.25 * math.sin(i * 0.6)) for i in range(9)]
    tube(pts, 0.1, m)
    for i in range(1, 30):
        pass


@piece
def nb_prochloro():
    sph((0, 0, 0.5), 0.45, M('prochl', (0.3, 0.7, 0.5)), scale=(1.1, 1, 1))


@piece
def nb_synecho():
    capsule((-0.45, 0, 0.35), (0.45, 0, 0.35), 0.3, M('syn', (0.25, 0.6, 0.6)))


@piece
def nb_borrelia():
    helix((-0.9, 0, 0.9), 6, 0.18, 0.3, 0.05, M('borr', (0.75, 0.35, 0.55), sss=0.5), axis='x')
    king(1.25)


@piece
def nb_lepto():
    o = helix((-0.8, 0, 0.7), 12, 0.07, 0.13, 0.03, M('lepto', (0.55, 0.4, 0.8), sss=0.5), axis='x')
    tube([(-0.8, 0.07, 0.7), (-0.95, 0.1, 0.9), (-0.85, 0.05, 1.0)], 0.03, M('lepto', (0.55, 0.4, 0.8)))
    tube([(0.76, 0.0, 0.77), (0.9, 0.0, 0.95), (0.8, 0.0, 1.05)], 0.03, M('lepto', (0.55, 0.4, 0.8)))


@piece
def nb_trepo():
    helix((0, 0, 0.1), 10, 0.06, 0.19, 0.025, M('trepo', (0.85, 0.45, 0.35), sss=0.5), axis='z')


@piece
def nb_spirochaeta():
    helix((-0.9, 0, 0.6), 7, 0.13, 0.26, 0.04, M('spch', (0.45, 0.55, 0.8), sss=0.5), axis='x')


@piece
def nb_cristispira():
    m = M('crist', (0.8, 0.6, 0.35), sss=0.5)
    helix((-0.9, 0, 0.7), 3, 0.25, 0.6, 0.11, m, axis='x')
    helix((-0.9, 0, 0.7), 3, 0.36, 0.6, 0.02, M('crist2', (0.95, 0.85, 0.6)), axis='x')


@piece
def nb_brachy():
    helix((-0.45, 0, 0.45), 2.2, 0.15, 0.42, 0.08, M('brachy', (0.65, 0.5, 0.75), sss=0.5), axis='x')


def branchy(m, seed=3, n=7, z0=0.15, height=1.6):
    rnd = random.Random(seed)
    tips = [Vector((0, 0, z0))]
    for i in range(n):
        p = rnd.choice(tips)
        a = rnd.uniform(0, 2 * math.pi)
        q = p + Vector((0.35 * math.cos(a), 0.35 * math.sin(a), rnd.uniform(0.15, 0.35)))
        mid = (p + q) / 2 + Vector((rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08), 0.05))
        tube([tuple(p), tuple(mid), tuple(q)], 0.035, m)
        tips.append(q)
    return tips


@piece
def nb_strepto():
    m = M('strepto', (0.85, 0.82, 0.7))
    tips = branchy(m, 3, 12)
    sp = M('strepto_sp', (0.55, 0.5, 0.75))
    for t in tips[-6:]:
        for k in range(5):
            sph(tuple(t + Vector((0, 0, 0.07 * k))), 0.045, sp)
    king(top_z() + 0.12)


@piece
def nb_myco():
    capsule((-0.55, 0, 0.35), (0.55, 0, 0.42), 0.22, M('myco', (0.9, 0.55, 0.45), sss=0.3, rough=0.25, coat=0.9), bumps=0.02)


@piece
def nb_coryne():
    m = M('coryne', (0.6, 0.75, 0.45))
    segs = [((-0.55, 0, 0.35), (0.0, 0, 0.35), 0.24, 0.16), ((0.0, 0, 0.35), (0.55, 0, 0.35), 0.16, 0.24)]
    meta_body(segs, m, res=0.04, name='coryne', smooth_iter=2)


@piece
def nb_bifido():
    m = M('bifido', (0.95, 0.75, 0.55))
    segs = [((0, 0, 0.15), (0, 0, 0.75), 0.13, 0.13), ((0, 0, 0.75), (-0.35, 0, 1.25), 0.13, 0.15), ((0, 0, 0.75), (0.35, 0, 1.2), 0.13, 0.15)]
    meta_body(segs, m, res=0.03, name='bifido', smooth_iter=2)


@piece
def nb_nocardia():
    m = M('nocard', (0.8, 0.55, 0.65))
    branchy(m, 7, 9)


@piece
def nb_micrococ():
    m = M('microc', (0.95, 0.8, 0.25))
    for p in [(-0.22, -0.22, 0.25), (0.22, -0.22, 0.25), (-0.22, 0.22, 0.25), (0.22, 0.22, 0.25)]:
        sph(p, 0.23, m)


# =========================================================== fungi
def mushroom(x=0.0, y=0.0, cap_r=0.5, cap_h=0.3, stem_h=0.9, stem_r=0.1, cap='convex', capc=(0.5, 0.3, 0.15), stemc=(0.9, 0.86, 0.78),
             gills=None, spots=None, ring=False, volva=False, tilt=0.0, name='m'):
    cm = M(name + '_cap', capc, sss=0.25, rough=0.5, bump=0.2)
    sm = M(name + '_stem', stemc, sss=0.25, rough=0.65, bump=0.25, scale=30)
    top = stem_h
    cx = x + math.sin(tilt) * stem_h
    tube([(x, y, 0.0), (x + math.sin(tilt) * stem_h * 0.5, y, stem_h * 0.5), (cx, y, stem_h)], stem_r, sm, r_end=stem_r * 0.85)
    if cap == 'convex':
        sph((cx, y, top), cap_r, cm, scale=(1, 1, cap_h / cap_r))
    elif cap == 'flat':
        sph((cx, y, top), cap_r, cm, scale=(1, 1, cap_h / cap_r * 0.6))
    elif cap == 'bell':
        sph((cx, y, top + cap_h * 0.3), cap_r * 0.8, cm, scale=(1, 1, cap_h / cap_r * 1.6))
    elif cap == 'funnel':
        cyl((cx, y, top + cap_h * 0.5), stem_r * 1.3, cap_h, cm, r2=cap_r, v=40)
        torus((cx, y, top + cap_h), cap_r * 0.97, cap_h * 0.12, cm, scale=(1, 1, 0.8))
        sph((cx, y, top + cap_h * 0.95), cap_r * 0.9, M(name + '_in', br._vary(capc, 0.8)), scale=(1, 1, 0.12))
    elif cap == 'brain':
        o = sph((cx, y, top + cap_h * 0.4), cap_r, cm, scale=(1, 1, cap_h / cap_r * 1.3))
        displace(o, 0.08, 0.08, 'VORONOI')
    if gills:
        gm = M(name + '_gill', gills, sss=0.2, rough=0.7)
        for k in range(36):
            a = k * math.pi / 18
            box((cx + cap_r * 0.5 * math.cos(a), y + cap_r * 0.5 * math.sin(a), top - cap_h * 0.12), (cap_r * 0.85, 0.006, cap_h * 0.18), gm,
                rot=(0, 0, a), bev=0)
    if spots:
        sm2 = M(name + '_spot', spots, sss=0.1, rough=0.8)
        rnd = random.Random(5)
        for k in range(22):
            a = rnd.uniform(0, 2 * math.pi); r = rnd.uniform(0.0, 0.85)
            zz = top + cap_h * math.sqrt(max(0.0, 1 - r * r))
            sph((cx + cap_r * r * math.cos(a), y + cap_r * r * math.sin(a), zz), cap_r * 0.07, sm2, scale=(1, 1, 0.5))
    if ring:
        torus((x + math.sin(tilt) * stem_h * 0.75, y, stem_h * 0.75), stem_r * 1.25, stem_r * 0.25, M(name + '_ring', stemc), scale=(1, 1, 0.5))
    if volva:
        cyl((x, y, 0.08), stem_r * 1.8, 0.18, M(name + '_volva', stemc), r2=stem_r * 1.3, v=24)
    return top + cap_h


@piece
def nf_deathcap():
    t = mushroom(cap_r=0.55, cap_h=0.32, stem_h=1.1, stem_r=0.1, capc=(0.72, 0.75, 0.55), stemc=(0.92, 0.92, 0.86), gills=(0.95, 0.95, 0.92), ring=True, volva=True, name='dc')
    king(t + 0.12)


@piece
def nf_panther():
    mushroom(cap_r=0.55, cap_h=0.28, stem_h=1.0, stem_r=0.1, capc=(0.45, 0.32, 0.2), spots=(0.95, 0.93, 0.88), gills=(0.95, 0.94, 0.9), ring=True, volva=True, name='pan')


@piece
def nf_satan():
    mushroom(cap_r=0.6, cap_h=0.35, stem_h=0.7, stem_r=0.24, capc=(0.82, 0.8, 0.74), stemc=(0.75, 0.25, 0.2), name='sat')


@piece
def nf_falsechant():
    mushroom(cap_r=0.45, cap_h=0.3, stem_h=0.8, stem_r=0.08, cap='funnel', capc=(0.95, 0.5, 0.12), stemc=(0.92, 0.55, 0.2), name='fch')


@piece
def nf_gyromitra():
    mushroom(cap_r=0.42, cap_h=0.45, stem_h=0.6, stem_r=0.15, cap='brain', capc=(0.45, 0.2, 0.12), stemc=(0.88, 0.84, 0.78), name='gyr')


@piece
def nf_falsehoney():
    for i, (x, y, h, tl) in enumerate([(0, 0, 0.9, 0.0), (0.3, 0.15, 0.75, 0.25), (-0.28, -0.1, 0.7, -0.3), (0.12, -0.3, 0.6, 0.15)]):
        mushroom(x, y, cap_r=0.22, cap_h=0.13, stem_h=h, stem_r=0.045, capc=(0.85, 0.7, 0.25), stemc=(0.9, 0.8, 0.45), gills=(0.55, 0.6, 0.35), tilt=tl, name='fh')


def log(m='dark_wood', L=1.6, r=0.3, z=0.3):
    cyl((0, 0, z), r, L, m, rot=(0, math.pi / 2, 0), v=40)
    cyl((-L / 2, 0, z), r * 0.92, 0.02, M('logend', (0.75, 0.6, 0.4), sss=0.0, rough=0.8), rot=(0, math.pi / 2, 0), v=40)


@piece
def nf_shiitake():
    log()
    for x, s in ((-0.4, 1.0), (0.2, 0.8), (0.55, 0.6)):
        o = sph((x, 0, 0.75 + 0.12 * s), 0.28 * s, M('shii', (0.45, 0.25, 0.14), sss=0.2), scale=(1, 1, 0.45))
        rod((x, 0, 0.55), (x, 0, 0.75), 0.05 * s, M('shii_st', (0.85, 0.78, 0.65)))
    king(1.2)


@piece
def nf_maitake():
    m = M('maitake', (0.5, 0.4, 0.3), sss=0.2)
    edge = M('maitake_e', (0.32, 0.24, 0.17), sss=0.1)
    rnd = random.Random(2)
    sph((0, 0, 0.25), 0.4, M('maitake_b', (0.88, 0.84, 0.74)), scale=(1.2, 1.2, 0.6))
    for k in range(34):
        a = rnd.uniform(0, 2 * math.pi); r = rnd.uniform(0.1, 0.6); z = 0.25 + (0.65 - r) * rnd.uniform(0.6, 1.1)
        sph((r * math.cos(a), r * math.sin(a), z), rnd.uniform(0.14, 0.22), m if k % 3 else edge, scale=(1.0, 0.75, 0.22),
            rot=(rnd.uniform(-0.2, 0.2), -0.35 - r * 0.4, a))


@piece
def nf_champignon():
    mushroom(cap_r=0.55, cap_h=0.42, stem_h=0.6, stem_r=0.16, capc=(0.95, 0.93, 0.88), stemc=(0.95, 0.93, 0.9), gills=(0.75, 0.55, 0.5), ring=True, name='cha')


@piece
def nf_oyster():
    m = M('oyster', (0.55, 0.55, 0.58), sss=0.25)
    rod((0.35, 0, 0), (0.35, 0, 1.5), 0.2, 'dark_wood', v=24)
    for z, s in ((0.5, 1.0), (0.85, 0.85), (1.15, 0.7)):
        o = sph((0.05, 0, z), 0.35 * s, m, scale=(1.2, 1, 0.28))


@piece
def nf_enoki():
    rnd = random.Random(4)
    for k in range(18):
        a = rnd.uniform(0, 2 * math.pi); r = rnd.uniform(0, 0.12)
        mushroom(r * math.cos(a), r * math.sin(a), cap_r=0.05, cap_h=0.04, stem_h=rnd.uniform(0.9, 1.3), stem_r=0.02, tilt=rnd.uniform(-0.25, 0.25),
                 capc=(0.97, 0.95, 0.86), stemc=(0.97, 0.96, 0.9), name='eno')


@piece
def nf_truffle():
    o = sph((0, 0, 0.4), 0.4, M('truffle', (0.18, 0.14, 0.12), sss=0.05, rough=0.85, bump=0.6), scale=(1.1, 1, 0.95))
    displace(o, 0.05, 0.05)
    sph((0.0, 0.0, 0.05), 0.55, M('soil', (0.35, 0.25, 0.18), sss=0.0, rough=0.95, bump=0.5), scale=(1.3, 1.2, 0.18))


@piece
def nf_reishi():
    rod((0.35, 0, 0), (0.35, 0, 1.4), 0.22, 'dark_wood', v=24)
    m = M('reishi', (0.55, 0.12, 0.08), sss=0.1, rough=0.12, coat=1.0)
    for z, s in ((0.55, 1.0), (1.0, 0.75)):
        o = sph((0.0, 0, z), 0.45 * s, m, scale=(1.0, 1.1, 0.22))
        torus((0.0, 0, z), 0.4 * s, 0.03, M('reishi_e', (0.95, 0.85, 0.6), rough=0.3), scale=(1.0, 1.1, 0.5))
    king(1.35, s=1.1)


@piece
def nf_chaga():
    rod((0.25, 0, 0), (0.25, 0, 1.7), 0.25, M('birch', (0.92, 0.9, 0.85), sss=0.0, rough=0.7, bump=0.3), v=32)
    for z in (0.3, 0.75, 1.2):
        box((0.0, 0.1, z), (0.01, 0.15, 0.03), 'boot', bev=0)
    o = sph((0.0, 0, 0.95), 0.32, M('chaga', (0.08, 0.06, 0.05), sss=0.0, rough=0.95, bump=0.8), scale=(0.9, 1.1, 1.2))
    displace(o, 0.08, 0.06)


@piece
def nf_sulphur():
    rod((0.4, 0, 0), (0.4, 0, 1.5), 0.22, 'dark_wood', v=24)
    m = M('sulph', (0.98, 0.75, 0.15), sss=0.3)
    for z, s in ((0.4, 1.0), (0.7, 0.9), (1.0, 0.8), (1.25, 0.65)):
        sph((0.08, 0, z), 0.4 * s, m, scale=(1.1, 1.2, 0.2))
        torus((0.08, 0, z), 0.36 * s, 0.025, M('sulph_e', (0.98, 0.5, 0.15)), scale=(1.1, 1.2, 0.5))


@piece
def nf_woodear():
    m = M('woodear', (0.35, 0.15, 0.12), sss=0.7, rough=0.2, coat=0.6)
    rod((0.35, 0, 0), (0.35, 0, 1.3), 0.2, 'dark_wood', v=24)
    for z, s in ((0.5, 1.0), (0.95, 0.75)):
        o = sph((0.1, 0, z), 0.3 * s, m, scale=(0.4, 1.0, 1.1))
        displace(o, 0.05, 0.15, 'CLOUDS')


@piece
def nf_cordyceps():
    m = M('cater', (0.65, 0.5, 0.3), sss=0.3)
    pts = [(-0.5 + i * 0.12, 0.05 * math.sin(i), 0.12) for i in range(9)]
    for p in pts:
        sph(p, 0.12, m)
    tube([(0.45, 0, 0.15), (0.5, 0.05, 0.6), (0.42, -0.05, 1.0), (0.5, 0.0, 1.3)], 0.05, M('cord', (0.95, 0.55, 0.15), sss=0.4), r_end=0.03)
    sph((0.5, 0.0, 1.33), 0.07, M('cord', (0.95, 0.55, 0.15)))


@piece
def nf_splitgill():
    rod((0.3, 0, 0), (0.3, 0, 1.1), 0.2, 'dark_wood', v=24)
    m = M('split', (0.85, 0.82, 0.78), sss=0.2)
    for z, y in ((0.35, -0.12), (0.6, 0.1), (0.85, -0.05)):
        o = sph((0.08, y, z), 0.18, m, scale=(0.6, 1.0, 0.8))
        hair(o, 'hair_grey', count=600, length=0.03, children=4)


# =========================================================== plants
def leaf(base, length, width, ang_z, pitch, m, curl=0.0, thick=0.012):
    """Leaf as a smooth strip: pointed tip, widest near the middle, arching by `curl` (negative droops)."""
    n = 18
    verts, faces = [], []
    for i in range(n + 1):
        t = i / n
        w = width * (math.sin(math.pi * min(1.0, t * 1.05)) ** 0.7) * (1 - 0.25 * t)
        z = curl * 0.35 * length * t * t
        verts += [(length * t, -w, z), (length * t, 0.0, z + width * 0.25), (length * t, w, z)]
    for i in range(n):
        a0 = i * 3
        faces += [(a0, a0 + 3, a0 + 4, a0 + 1), (a0 + 1, a0 + 4, a0 + 5, a0 + 2)]
    me = bpy.data.meshes.new('leaf'); me.from_pydata(verts, [], faces)
    o = br._obj('leaf', me)
    so = o.modifiers.new('so', 'SOLIDIFY'); so.thickness = thick
    ss = o.modifiers.new('ss', 'SUBSURF'); ss.levels = 1; ss.render_levels = 2
    o.location = base
    o.rotation_euler = (0, -pitch, ang_z)
    br.put(o, m)
    return o


def stalk(top, m, r=0.025, bend=0.0):
    return tube([(0, 0, 0), (bend * 0.3, 0, top * 0.5), (bend, 0, top)], r, m)


def ear(center, length, r, m, rows=8, grain=None):
    """Grain ear: rows of grains along a short axis."""
    c = Vector(center)
    for i in range(rows):
        t = i / max(1, rows - 1)
        z = c.z + length * (t - 0.5)
        for k in range(4):
            a = k * math.pi / 2 + i * 0.4
            sph((c.x + r * math.cos(a), c.y + r * math.sin(a), z), r * 0.7, m, scale=(1, 1, 1.4), seg=12)


@piece
def nt_corn():
    lm = leaf_mat('corn_leaf', (0.35, 0.6, 0.2))
    stalk(1.9, lm, 0.05)
    for k, z in enumerate((0.3, 0.6, 0.9, 1.2, 1.5)):
        leaf((0, 0, z), 0.8, 0.07, k * 2.2, 0.15, lm, curl=-0.35)
    cob = sph((-0.12, 0, 1.0), 0.09, M('cob', (0.98, 0.8, 0.2), sss=0.3, bump=0.5, scale=60), scale=(1, 1, 2.6))
    displace(cob, 0.02, 0.02)
    sph((-0.12, 0, 0.98), 0.1, lm, scale=(1.05, 1.05, 2.4))
    king(2.0, s=1.1)


@piece
def nt_bamboo():
    lm = leaf_mat('bamboo_leaf', (0.35, 0.62, 0.22))
    sm = M('bamboo', (0.55, 0.7, 0.3), sss=0.1, rough=0.3, coat=0.5)
    for x, h in ((0, 2.0), (0.22, 1.7), (-0.2, 1.5)):
        rod((x, 0, 0), (x, 0, h), 0.06, sm, v=20)
        for z in [0.35 * i for i in range(1, int(h / 0.35) + 1)]:
            torus((x, 0, z), 0.062, 0.012, sm)
        for k in range(5):
            leaf((x, 0, h - 0.1 - k * 0.12), 0.35, 0.05, k * 1.3 + x, 0.6, lm)


@piece
def nt_cane():
    lm = leaf_mat('cane_leaf', (0.4, 0.6, 0.25))
    sm = M('cane', (0.55, 0.45, 0.25), sss=0.1, rough=0.35, coat=0.4)
    for x in (-0.12, 0.12):
        rod((x, 0, 0), (x * 1.3, 0, 1.9), 0.05, sm, v=16)
        for z in [0.25 * i for i in range(1, 8)]:
            torus((x * (1 + 0.3 * z / 1.9), 0, z), 0.052, 0.01, M('cane_n', (0.35, 0.28, 0.15)))
        for k in range(4):
            leaf((x * 1.3, 0, 1.75 + k * 0.05), 0.7, 0.05, k * 1.6 + x * 5, 0.3, lm, curl=-0.3)


@piece
def nt_rice():
    lm = leaf_mat('rice_leaf', (0.42, 0.62, 0.25))
    gm = M('rice_g', (0.88, 0.78, 0.45), sss=0.2)
    for k in range(5):
        a = k * 1.25
        bx = 0.25 * math.cos(a) * 0.3
        tube([(0, 0, 0), (bx, 0.05 * math.sin(a), 0.7), (bx - 0.35, 0.1 * math.sin(a), 1.05)], 0.015, lm)
        for i in range(8):
            t = i / 7
            sph((bx - 0.35 * t - 0.02, 0.1 * math.sin(a) + 0.03 * ((i % 2) * 2 - 1), 1.05 - 0.35 * t), 0.025, gm, scale=(1, 1, 1.8), seg=12)
        leaf((0, 0, 0.1), 0.6, 0.03, a, 1.0, lm)


@piece
def nt_oat():
    lm = leaf_mat('oat_leaf', (0.5, 0.65, 0.3))
    gm = M('oat_g', (0.88, 0.85, 0.6), sss=0.2)
    stalk(1.3, lm, 0.02)
    for i in range(9):
        z = 1.1 + i * 0.05
        a = i * 0.9
        tube([(0, 0, z), (0.18 * math.cos(a), 0.18 * math.sin(a), z + 0.02), (0.22 * math.cos(a), 0.22 * math.sin(a), z - 0.12)], 0.006, lm)
        sph((0.22 * math.cos(a), 0.22 * math.sin(a), z - 0.16), 0.035, gm, scale=(1, 1, 2.0), seg=12)
    for k in range(3):
        leaf((0, 0, 0.2 + k * 0.25), 0.45, 0.03, k * 2.1, 0.5, lm)


@piece
def nt_wheat():
    lm = leaf_mat('wheat_leaf', (0.75, 0.68, 0.32), vein=False)
    gm = M('wheat_g', (0.85, 0.65, 0.28), sss=0.2)
    for x in (-0.12, 0.0, 0.12):
        stalk(1.2 + abs(x), lm, 0.018, bend=-x)
        ear((-x, 0, 1.32 + abs(x)), 0.28, 0.035, gm, rows=9)
        for k in range(8):
            rod((-x, 0.02 * (k % 2), 1.32 + abs(x) + k * 0.03), (-x + 0.05, 0.02 * (k % 2), 1.6 + abs(x) + k * 0.03), 0.003, gm, v=4, bev=0)


@piece
def nt_nepenthes():
    lm = leaf_mat('nep_leaf', (0.35, 0.55, 0.2))
    pm = M('pitcher', (0.6, 0.22, 0.18), sss=0.4, rough=0.3, coat=0.5)
    tube([(0.3, 0, 0), (0.35, 0.05, 0.9), (0.2, 0, 1.7)], 0.03, lm)
    for k, z in enumerate((0.6, 1.1, 1.5)):
        leaf((0.32, 0, z), 0.4, 0.09, 2.8 + k, 0.3, lm)
    o = sph((-0.15, 0, 0.55), 0.24, pm, scale=(1, 1, 1.8))
    torus((-0.15, 0, 0.95), 0.15, 0.035, M('peristome', (0.75, 0.15, 0.12), rough=0.15, coat=1.0))
    sph((-0.1, 0, 1.06), 0.14, pm, scale=(1.1, 1, 0.3), rot=(0, -0.5, 0))
    tube([(0.3, 0, 0.6), (0.05, 0, 0.45), (-0.15, 0, 0.2)], 0.012, lm)
    king(1.85)


@piece
def nt_flytrap():
    lm = leaf_mat('fly_leaf', (0.4, 0.62, 0.22))
    tm = M('trap_in', (0.8, 0.15, 0.12), sss=0.5)
    for k in range(5):
        a = k * 2 * math.pi / 5
        tube([(0, 0, 0.05), (0.25 * math.cos(a), 0.25 * math.sin(a), 0.25 + 0.15 * (k % 2)), (0.4 * math.cos(a), 0.4 * math.sin(a), 0.45 + 0.25 * (k % 2))], 0.03, lm)
        c = Vector((0.45 * math.cos(a), 0.45 * math.sin(a), 0.55 + 0.25 * (k % 2)))
        for side in (-1, 1):
            o = sph(tuple(c + Vector((0, 0, 0.05 * side))), 0.15, tm, scale=(1, 1, 0.3), rot=(0.6 * side, 0, a))
            for j in range(9):
                b_ = -0.8 + j * 0.2
                rod(tuple(c + Vector((0.14 * math.cos(a + b_), 0.14 * math.sin(a + b_), 0.06 * side))),
                    tuple(c + Vector((0.2 * math.cos(a + b_), 0.2 * math.sin(a + b_), 0.18 * side))), 0.006, lm, v=4, bev=0)


@piece
def nt_sarracenia():
    pm = M('sarr', (0.75, 0.6, 0.25), sss=0.4)
    vm = M('sarr_v', (0.7, 0.15, 0.12), sss=0.4)
    for k, (x, y, h) in enumerate([(0, 0, 1.6), (0.18, 0.1, 1.3), (-0.15, 0.12, 1.1), (0.1, -0.18, 1.4)]):
        cyl((x, y, h / 2), 0.03, h, pm, r2=0.09, v=24)
        sph((x - 0.04, y, h + 0.05), 0.11, vm, scale=(1, 1, 0.5), rot=(0, -0.6, 0))


@piece
def nt_sundew():
    lm = leaf_mat('sund', (0.6, 0.35, 0.2), vein=False)
    dm = M('dew', (1.0, 0.95, 0.95), sss=0.1, rough=0.02, coat=1.0)
    MATS['dew'].node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value = 1.0
    tm = M('tent', (0.8, 0.12, 0.1), sss=0.4)
    for k in range(7):
        a = k * 2 * math.pi / 7
        L = 0.5
        tube([(0, 0, 0.02), (L * 0.5 * math.cos(a), L * 0.5 * math.sin(a), 0.25), (L * math.cos(a), L * math.sin(a), 0.4)], 0.012, lm)
        c = Vector((L * math.cos(a), L * math.sin(a), 0.42))
        sph(tuple(c), 0.06, lm, scale=(1, 1, 0.4))
        for j in range(10):
            b_ = j * 0.63
            d = Vector((math.cos(b_), math.sin(b_), 0.9)).normalized()
            rod(tuple(c), tuple(c + d * 0.12), 0.006, tm, v=4, bev=0)
            sph(tuple(c + d * 0.13), 0.014, dm, seg=10)
    tube([(0, 0, 0), (0.05, 0, 0.6), (0.0, 0, 1.1)], 0.01, lm)
    for i in range(3):
        sph((0.02, 0, 1.0 + i * 0.05), 0.04, M('sund_f', (0.98, 0.92, 0.95), sss=0.5))


@piece
def nt_butterwort():
    lm = leaf_mat('butter', (0.6, 0.78, 0.35))
    MATS['butter'].node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = 1.0
    for k in range(7):
        leaf((0, 0, 0.05), 0.42, 0.13, k * 0.9, 0.15, lm, curl=0.4)
    tube([(0, 0, 0), (0.02, 0, 0.5), (-0.08, 0, 0.75)], 0.012, lm)
    sph((-0.12, 0, 0.75), 0.07, M('butter_f', (0.6, 0.35, 0.85), sss=0.5), scale=(1.3, 1, 0.8))


@piece
def nt_bladderwort():
    lm = leaf_mat('bladder', (0.45, 0.7, 0.35), vein=False)
    bm = M('bladder_b', (0.6, 0.8, 0.6), sss=0.7, rough=0.15, coat=0.6)
    rnd = random.Random(8)
    for k in range(9):
        a = k * 0.7
        p0 = (0, 0, 0.3)
        p1 = (0.45 * math.cos(a), 0.45 * math.sin(a), 0.3 + rnd.uniform(-0.15, 0.15))
        tube([p0, p1], 0.012, lm)
        sph(p1, 0.06, bm)
    tube([(0, 0, 0.3), (0.02, 0, 0.9), (-0.03, 0, 1.2)], 0.012, lm)
    sph((-0.06, 0, 1.22), 0.09, M('bladder_f', (0.98, 0.85, 0.15), sss=0.5), scale=(1.2, 1, 0.9))


def rosette(n, L, W, m, rise=0.6, spines=False, curl=0.0, z=0.05, layers=2):
    for layer in range(layers):
        for k in range(n):
            a = k * 2 * math.pi / n + layer * math.pi / n
            pitch = rise - layer * 0.25
            o = leaf((0, 0, z + layer * 0.05), L * (1 - 0.25 * layer), W * (1 - 0.2 * layer), a, pitch, m, curl=curl, thick=0.05)
            if spines:
                tip = Vector((math.cos(a) * math.cos(pitch), math.sin(a) * math.cos(pitch), math.sin(pitch))) * L * (1 - 0.25 * layer)
                rod(tuple(tip + Vector((0, 0, z))), tuple(tip * 1.06 + Vector((0, 0, z))), 0.012, M('spine', (0.35, 0.2, 0.1)), r2=0.001, v=6, bev=0)


@piece
def nt_agave():
    m = leaf_mat('agave', (0.45, 0.6, 0.55), vein=False)
    rosette(9, 1.0, 0.16, m, rise=0.75, spines=True)
    tube([(0, 0, 0.3), (0.0, 0, 1.4), (0.05, 0, 2.2)], 0.04, M('agave_st', (0.5, 0.5, 0.25)))
    king(2.3)


@piece
def nt_aloe():
    m = leaf_mat('aloe', (0.4, 0.58, 0.35), vein=False)
    rosette(8, 0.9, 0.12, m, rise=0.95, spines=False, curl=0.3)
    tube([(0, 0, 0.3), (0.05, 0, 1.2), (0.0, 0, 1.55)], 0.02, m)
    for i in range(8):
        sph((0.0 + 0.02 * (i % 2), 0, 1.3 + i * 0.04), 0.03, M('aloe_f', (0.95, 0.45, 0.15), sss=0.5), scale=(1, 1, 1.8))


@piece
def nt_opuntia():
    m = leaf_mat('opun', (0.42, 0.62, 0.3), vein=False)
    sp = M('opun_sp', (0.9, 0.88, 0.75))
    fr = M('opun_fr', (0.75, 0.15, 0.35), sss=0.4)
    pads = [((0, 0, 0.45), 0.0, 1.0), ((0.25, 0, 1.0), 0.5, 0.75), ((-0.22, 0.05, 0.95), -0.45, 0.7), ((0.05, 0.0, 1.45), 0.1, 0.55)]
    for (x, y, z), tilt, s in pads:
        o = sph((x, y, z), 0.32 * s, m, scale=(1, 0.28, 1.3), rot=(0, tilt, 0.4))
        for k in range(10):
            a = k * 0.63
            sph((x + 0.25 * s * math.cos(a), y - 0.09 * s, z + 0.35 * s * math.sin(a)), 0.012, sp, seg=8)
    for x in (0.3, 0.15):
        sph((x, 0, 1.6 - x), 0.05, fr, scale=(1, 1, 1.3))


@piece
def nt_echeveria():
    m = leaf_mat('echev', (0.6, 0.72, 0.72), vein=False)
    rosette(10, 0.45, 0.15, m, rise=0.8, curl=0.2, layers=3)


@piece
def nt_lithops():
    m = M('lithops', (0.72, 0.62, 0.52), sss=0.4, rough=0.5)
    w = M('lith_win', (0.55, 0.5, 0.45), sss=0.6, rough=0.15, coat=0.8)
    for x in (-0.17, 0.17):
        cyl((x, 0, 0.25), 0.17, 0.5, m, r2=0.15, v=32)
        sph((x, 0, 0.5), 0.15, w, scale=(1, 1, 0.3))
    sph((0, 0, 0.02), 0.45, M('soil', (0.45, 0.38, 0.3), sss=0.0, rough=0.95, bump=0.5), scale=(1.2, 1, 0.12))


@piece
def nt_crassula():
    m = leaf_mat('crass', (0.35, 0.55, 0.3), vein=False)
    MATS['crass'].node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = 0.9
    tm = M('crass_t', (0.45, 0.4, 0.25), sss=0.1)
    tube([(0, 0, 0), (0.02, 0, 0.5), (0.0, 0, 0.8)], 0.06, tm)
    for k in range(6):
        a = k * 1.05
        end = (0.35 * math.cos(a), 0.35 * math.sin(a), 0.9 + 0.12 * (k % 2))
        tube([(0, 0, 0.6), end], 0.025, tm)
        for j in range(3):
            sph((end[0] + 0.05 * math.cos(a + j), end[1] + 0.05 * math.sin(a + j), end[2] + 0.03 * j), 0.08, m, scale=(1, 0.4, 0.8), rot=(0, 0, a + j))
    cyl((0, 0, 0.12), 0.25, 0.24, M('pot', (0.7, 0.35, 0.2), sss=0.0, rough=0.7), r2=0.3, v=40)
