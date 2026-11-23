"""Реалистичные версии первых семейств: классика (точёные фигуры Стаунтона), цветы, деревья,
шляпочные и удивительные грибы, кокки, палочки, бактериофаги и вирионы.
Подключается из blender_real.py. Имена моделей — ol_*; кому они достаются — REAL_ART в игре.
"""
import math
import random

import bpy
from mathutils import Vector

import blender_real as br
from blender_real import piece, crown, cyl, sph, rod, tube, torus, plate, box, meta_body, hair, MATS
from blender_real_nature import (M, leaf_mat, mushroom, ico, spikes, helix, capsule, leaf, rosette, displace, king, top_z,
                                 stalk, chain_balls)


# ============================================================ classic Staunton pieces
def lathe(profile, m, seg=64, loc=(0, 0, 0)):
    """Turned piece from a (radius, z) profile, like on a wood lathe."""
    import bmesh
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = [bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)]
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    me = bpy.data.meshes.new('lathe'); bm.to_mesh(me); bm.free()
    o = br._obj('lathe', me)
    o.location = loc
    s = o.modifiers.new('ss', 'SUBSURF'); s.levels = 1; s.render_levels = 2
    br.put(o, m)
    return o


def boxwood():
    if 'boxwood' in MATS:
        return 'boxwood'
    m, n, l, b = br._new('boxwood')
    v = br._coord(n, l, (1, 1, 0.25))
    w = n.new('ShaderNodeTexWave'); w.wave_type = 'RINGS'; w.inputs['Scale'].default_value = 6; w.inputs['Distortion'].default_value = 3
    l.new(v, w.inputs['Vector'])
    col = br._ramp(n, l, w.outputs['Fac'], [(0.2, (0.78, 0.6, 0.38)), (0.8, (0.9, 0.74, 0.5))])
    l.new(col, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.22
    b.inputs['Coat Weight'].default_value = 0.8
    b.inputs['Coat Roughness'].default_value = 0.05
    MATS['boxwood'] = m
    return 'boxwood'


BASE = [(0.0, 0.0), (0.36, 0.0), (0.37, 0.05), (0.34, 0.09), (0.3, 0.11), (0.31, 0.15), (0.26, 0.18)]


@piece
def ol_king():
    m = boxwood()
    lathe(BASE + [(0.2, 0.3), (0.15, 0.6), (0.13, 0.9), (0.2, 0.95), (0.13, 1.0), (0.17, 1.12), (0.22, 1.25), (0.2, 1.3), (0.0, 1.31)], m)
    box((0, 0, 1.43), (0.06, 0.06, 0.24), m, bev=0.012)
    box((0, 0, 1.45), (0.2, 0.06, 0.06), m, bev=0.012)


@piece
def ol_queen():
    m = boxwood()
    lathe(BASE + [(0.19, 0.3), (0.14, 0.6), (0.12, 0.85), (0.19, 0.9), (0.12, 0.95), (0.15, 1.05), (0.23, 1.2), (0.0, 1.16)], m)
    for i in range(10):
        a = i * math.pi / 5
        sph((0.2 * math.cos(a), 0.2 * math.sin(a), 1.21), 0.035, m)
    sph((0, 0, 1.25), 0.07, m)


@piece
def ol_rook():
    m = boxwood()
    lathe(BASE + [(0.25, 0.3), (0.22, 0.55), (0.23, 0.72), (0.3, 0.76), (0.3, 0.92), (0.0, 0.92)], m)
    for i in range(5):
        a = i * 2 * math.pi / 5
        box((0.27 * math.cos(a), 0.27 * math.sin(a), 0.96), (0.1, 0.1, 0.1), m, rot=(0, 0, a), bev=0.01)


@piece
def ol_bishop():
    m = boxwood()
    lathe(BASE + [(0.17, 0.3), (0.12, 0.55), (0.11, 0.75), (0.18, 0.8), (0.11, 0.84), (0.17, 0.95), (0.16, 1.08), (0.08, 1.18), (0.0, 1.2)], m)
    box((-0.14, 0, 1.04), (0.06, 0.4, 0.02), 'iris', rot=(0, 0.7, 0), bev=0.0)
    sph((0, 0, 1.24), 0.045, m)


@piece
def ol_knight():
    m = boxwood()
    lathe(BASE + [(0.25, 0.25), (0.0, 0.27)], m)
    segs = [((0.06, 0, 0.25), (0.02, 0, 0.75), (0.2, 0.17), (0.18, 0.14)),
            ((0.02, 0, 0.75), (-0.12, 0, 0.95), (0.17, 0.13), (0.14, 0.11)),
            ((-0.12, 0, 0.95), (-0.32, 0, 0.82), (0.12, 0.1), (0.08, 0.07))]
    meta_body(segs, m, res=0.012, name='knight', smooth_iter=3)
    tube([(0.12, 0, 0.35), (0.16, 0, 0.7), (0.05, 0, 0.98)], 0.045, m)
    for s in (1, -1):
        cyl((0.0, s * 0.06, 1.04), 0.035, 0.12, m, r2=0.005, v=12, rot=(0.2 * s, 0, 0))
        sph((-0.16, s * 0.1, 0.93), 0.022, 'iris')


@piece
def ol_pawn():
    m = boxwood()
    lathe(BASE + [(0.2, 0.25), (0.13, 0.45), (0.1, 0.55), (0.17, 0.58), (0.1, 0.62), (0.0, 0.62)], m)
    sph((0, 0, 0.75), 0.15, m)


# ============================================================ flowers
def petals(c, n, L, W, m, up=0.3, layers=1, cup=0.3):
    for layer in range(layers):
        for k in range(n):
            a = k * 2 * math.pi / n + layer * math.pi / n
            leaf(tuple(c), L * (1 - 0.15 * layer), W, a, up + layer * 0.25, m, curl=cup, thick=0.008)


@piece
def ol_sunflower():
    lm = leaf_mat('sf_leaf', (0.3, 0.55, 0.18))
    stalk(1.8, lm, 0.04)
    for k, z in enumerate((0.5, 0.9, 1.3)):
        leaf((0, 0, z), 0.4, 0.17, k * 2.3, 0.1, lm, curl=-0.3)
    c = Vector((-0.08, 0, 1.95))
    disc = sph(tuple(c), 0.25, M('sf_disc', (0.3, 0.18, 0.08), sss=0.05, bump=0.8, scale=80), scale=(0.35, 1, 1), rot=(0, 0.35, 0))
    displace(disc, 0.015, 0.02)
    pm = leaf_mat('sf_petal', (0.99, 0.75, 0.1), vein=False)
    for k in range(22):
        a = k * 2 * math.pi / 22
        d = Vector((math.sin(0.35) * 0.0, math.cos(a), math.sin(a)))
        o = sph(tuple(c + d * 0.33), 0.09, pm, scale=(0.15, 0.45, 1.3))
        o.rotation_euler = (a + math.pi / 2, 0.35, 0)
    king(top_z() + 0.08)


@piece
def ol_rose():
    lm = leaf_mat('rose_leaf', (0.2, 0.42, 0.15))
    tube([(0, 0, 0), (0.05, 0, 0.6), (0, 0, 1.25)], 0.025, lm)
    for k, z in enumerate((0.4, 0.75)):
        leaf((0.02, 0, z), 0.25, 0.1, k * 2.6, 0.3, lm)
    pm = M('rose_p', (0.75, 0.05, 0.1), sss=0.6, rough=0.4, bump=0.05)
    c = Vector((0, 0, 1.35))
    for ring, (r, n, tilt) in enumerate([(0.05, 3, 0.2), (0.09, 5, 0.45), (0.14, 6, 0.7), (0.18, 7, 0.95)]):
        for k in range(n):
            a = k * 2 * math.pi / n + ring
            o = sph((c.x + r * math.cos(a) * 0.6, c.y + r * math.sin(a) * 0.6, c.z + 0.02 - ring * 0.025), 0.1 + ring * 0.025, pm, scale=(0.95, 0.18, 1.0))
            o.rotation_euler = (0, 0, a + math.pi / 2)
            o.rotation_euler.x = tilt * 0.0
    for k in range(5):
        a = k * 2 * math.pi / 5
        leaf((0, 0, 1.22), 0.12, 0.04, a, -0.6, lm)


@piece
def ol_cactus():
    m = M('cactus', (0.25, 0.48, 0.25), sss=0.2, rough=0.5)
    sp = M('cac_sp', (0.95, 0.92, 0.8), sss=0.0)
    def ribbed(a, b, r):
        o = rod(a, b, r, m, v=24)
        for k in range(12):
            ang = k * math.pi / 6
            rod((a[0] + r * 0.95 * math.cos(ang), a[1] + r * 0.95 * math.sin(ang), a[2] + r), (b[0] + r * 0.95 * math.cos(ang), b[1] + r * 0.95 * math.sin(ang), b[2] - r * 0.3), r * 0.18, m, v=8)
        sph(b, r, m)
    ribbed((0, 0, 0), (0, 0, 1.6), 0.2)
    ribbed((0.0, 0.2, 0.7), (0.0, 0.5, 0.75), 0.11)
    ribbed((0.0, 0.5, 0.75), (0.0, 0.5, 1.2), 0.11)
    ribbed((0.0, -0.2, 0.9), (0.0, -0.45, 0.95), 0.1)
    ribbed((0.0, -0.45, 0.95), (0.0, -0.45, 1.3), 0.1)
    rnd = random.Random(3)
    for k in range(60):
        a = rnd.uniform(0, 2 * math.pi); z = rnd.uniform(0.1, 1.55)
        p = Vector((0.21 * math.cos(a), 0.21 * math.sin(a), z))
        rod(tuple(p), tuple(p * 1.0 + Vector((0.06 * math.cos(a), 0.06 * math.sin(a), 0.02))), 0.003, sp, r2=0.0005, v=4, bev=0)
    sph((0, 0, 1.82), 0.08, M('cac_fl', (0.95, 0.3, 0.45), sss=0.5), scale=(1.2, 1.2, 0.6))


@piece
def ol_tulip():
    lm = leaf_mat('tul_leaf', (0.35, 0.55, 0.35), vein=False)
    stalk(1.2, lm, 0.025)
    for k in range(2):
        leaf((0, 0, 0.05), 0.75, 0.12, k * math.pi + 0.4, 1.1, lm, curl=-0.2)
    pm = M('tul_p', (0.85, 0.08, 0.12), sss=0.6, rough=0.35)
    for k in range(6):
        a = k * math.pi / 3
        o = sph((0.07 * math.cos(a), 0.07 * math.sin(a), 1.38), 0.15, pm, scale=(0.55, 0.3, 1.25))
        o.rotation_euler = (0, 0.12 * (1 if k % 2 else -1), a + math.pi / 2)


@piece
def ol_dandelion():
    lm = leaf_mat('dan_leaf', (0.3, 0.55, 0.2))
    for k in range(7):
        leaf((0, 0, 0.03), 0.45, 0.08, k * 0.9, 0.2, lm, curl=-0.2)
    tube([(0, 0, 0), (0.03, 0, 0.6), (0.0, 0, 1.15)], 0.018, lm)
    c = sph((0.0, 0, 1.3), 0.16, M('dan_c', (0.85, 0.82, 0.7), sss=0.3))
    seedm = M('dan_seed', (0.97, 0.97, 0.95), sss=0.8, rough=0.3)
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(120):
        y = 1 - 2 * (i + 0.5) / 120
        rr = math.sqrt(1 - y * y); a = golden * i
        d = Vector((math.cos(a) * rr, math.sin(a) * rr, y))
        p0 = Vector((0, 0, 1.3)) + d * 0.15
        rod(tuple(p0), tuple(p0 + d * 0.22), 0.003, seedm, v=4, bev=0)
        sph(tuple(p0 + d * 0.23), 0.012, seedm, seg=8)


@piece
def ol_daisy():
    lm = leaf_mat('daisy_leaf', (0.35, 0.58, 0.25))
    for x, h in ((0, 1.1), (0.2, 0.85), (-0.18, 0.75)):
        tube([(x, 0, 0), (x + 0.03, 0, h * 0.6), (x, 0, h)], 0.015, lm)
        c = Vector((x - 0.02, 0, h))
        sph(tuple(c), 0.07, M('daisy_c', (0.98, 0.75, 0.1), sss=0.2, bump=0.6, scale=90), scale=(1, 1, 0.55))
        pm = M('daisy_p', (0.98, 0.98, 0.95), sss=0.5)
        for k in range(18):
            a = k * 2 * math.pi / 18
            o = sph((c.x + 0.13 * math.cos(a), c.y + 0.13 * math.sin(a), c.z - 0.01), 0.07, pm, scale=(1.0, 0.25, 0.05))
            o.rotation_euler = (0, 0, a)


# ============================================================ trees
def canopy(center, R, m, n=14, seed=1, flat=0.8):
    rnd = random.Random(seed)
    segs = []
    c = Vector(center)
    for i in range(n):
        p = c + Vector((rnd.uniform(-R, R) * 0.8, rnd.uniform(-R, R) * 0.8, rnd.uniform(-R, R) * 0.5 * flat))
        segs.append((tuple(p), tuple(p + Vector((0.01, 0, 0))), R * rnd.uniform(0.35, 0.55), R * 0.4))
    o = meta_body(segs, m, res=R * 0.06, name='canopy', smooth_iter=2)
    displace(o, R * 0.08, R * 0.15, 'CLOUDS')
    return o


def bark(name, rgb):
    if name in MATS:
        return name
    m, n, l, b = br._new(name)
    v = br._coord(n, l, (3, 3, 0.4))
    vo = n.new('ShaderNodeTexVoronoi'); vo.feature = 'DISTANCE_TO_EDGE'; vo.inputs['Scale'].default_value = 8
    l.new(v, vo.inputs['Vector'])
    nz = br._noise(n, l, v, 20, 8)
    col = br._ramp(n, l, nz.outputs['Fac'], [(0.3, br._vary(rgb, 0.7)), (0.7, br._vary(rgb, 1.2))])
    l.new(col, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.85
    br._bump(n, l, b, vo.outputs['Distance'], 0.8, 0.02)
    MATS[name] = m
    return name


def leafy(name, rgb):
    return M(name, rgb, sss=0.3, rough=0.6, bump=0.6, scale=40)


@piece
def ol_oak():
    bm = bark('oak_bark', (0.36, 0.3, 0.24))
    tube([(0, 0, 0), (0.05, 0, 0.6), (0.0, 0, 1.1)], 0.16, bm, r_end=0.1)
    for a in (0.5, 2.3, 4.1):
        tube([(0, 0, 0.9), (0.35 * math.cos(a), 0.35 * math.sin(a), 1.3)], 0.06, bm, r_end=0.03)
    canopy((0, 0, 1.55), 0.7, leafy('oak_leaf', (0.25, 0.42, 0.16)), n=18)
    for k in range(5):
        a = k * 1.2
        sph((0.7 * math.cos(a), 0.7 * math.sin(a), 1.4), 0.035, M('acorn', (0.55, 0.4, 0.15)), scale=(1, 1, 1.3))
    king(top_z() + 0.1, s=1.6)


@piece
def ol_sequoia():
    bm = bark('seq_bark', (0.55, 0.28, 0.16))
    tube([(0, 0, 0), (0.0, 0, 1.4), (0.0, 0, 2.8)], 0.2, bm, r_end=0.04)
    lm = leafy('seq_leaf', (0.18, 0.35, 0.2))
    for i in range(9):
        z = 1.0 + i * 0.2
        canopy((0, 0, z), 0.45 - i * 0.035, lm, n=6, seed=i, flat=0.5)


@piece
def ol_baobab():
    bm = bark('bao_bark', (0.58, 0.5, 0.45))
    meta_body([((0, 0, 0.0), (0, 0, 1.2), 0.42, 0.33)], bm, res=0.03, name='bao')
    for a in (0.2, 1.4, 2.6, 3.8, 5.0):
        tube([(0, 0, 1.15), (0.35 * math.cos(a), 0.35 * math.sin(a), 1.45), (0.55 * math.cos(a), 0.55 * math.sin(a), 1.55)], 0.06, bm, r_end=0.025)
        canopy((0.55 * math.cos(a), 0.55 * math.sin(a), 1.62), 0.17, leafy('bao_leaf', (0.35, 0.5, 0.2)), n=4, seed=int(a * 10))


@piece
def ol_spruce():
    bm = bark('spr_bark', (0.35, 0.25, 0.18))
    rod((0, 0, 0), (0, 0, 0.4), 0.07, bm)
    lm = leafy('spr_leaf', (0.1, 0.28, 0.14))
    for i in range(7):
        z = 0.3 + i * 0.27
        r = 0.75 - i * 0.1
        o = cyl((0, 0, z + 0.2), r, 0.42, lm, r2=r * 0.25, v=32)
        displace(o, 0.05, 0.05, 'CLOUDS')
    cyl((0, 0, 2.25), 0.08, 0.3, lm, r2=0.0, v=16)


@piece
def ol_maple():
    bm = bark('map_bark', (0.4, 0.33, 0.27))
    tube([(0, 0, 0), (0.0, 0, 0.9)], 0.12, bm, r_end=0.08)
    for a in (0.3, 2.4, 4.4):
        tube([(0, 0, 0.8), (0.3 * math.cos(a), 0.3 * math.sin(a), 1.15)], 0.05, bm, r_end=0.025)
    canopy((0, 0, 1.4), 0.62, leafy('map_leaf', (0.85, 0.32, 0.08)), n=16, seed=5)
    canopy((0.2, 0.1, 1.55), 0.35, leafy('map_leaf2', (0.95, 0.6, 0.12)), n=6, seed=8)


@piece
def ol_sprout():
    sph((0, 0, 0.02), 0.45, M('soil', (0.35, 0.25, 0.18), sss=0.0, rough=0.95, bump=0.5), scale=(1.2, 1.2, 0.18))
    lm = leaf_mat('sprout_leaf', (0.45, 0.75, 0.3))
    tube([(0, 0, 0.05), (0.03, 0, 0.35), (0.0, 0, 0.6)], 0.025, lm)
    for s in (1, -1):
        leaf((0, 0, 0.6), 0.28, 0.13, math.pi / 2 * s, 0.35, lm, curl=-0.3)
    sph((0.03, 0.02, 0.06), 0.06, M('seedcoat', (0.55, 0.4, 0.2)), scale=(1.3, 1, 0.7))


# ============================================================ cap mushrooms & odd fungi
@piece
def ol_porcini():
    t = mushroom(cap_r=0.55, cap_h=0.38, stem_h=0.65, stem_r=0.24, capc=(0.45, 0.27, 0.13), stemc=(0.9, 0.85, 0.72), gills=None, name='por')
    king(t + 0.1)


@piece
def ol_amanita():
    mushroom(cap_r=0.55, cap_h=0.3, stem_h=1.0, stem_r=0.1, capc=(0.85, 0.08, 0.05), spots=(0.97, 0.96, 0.9), gills=(0.97, 0.96, 0.92), ring=True, volva=True, name='ama')


@piece
def ol_bolete():
    mushroom(cap_r=0.45, cap_h=0.3, stem_h=1.0, stem_r=0.1, capc=(0.5, 0.33, 0.18), stemc=(0.88, 0.86, 0.8), name='bol')
    sm = M('bol_sc', (0.15, 0.13, 0.12), sss=0.0)
    rnd = random.Random(2)
    for k in range(40):
        a = rnd.uniform(0, 2 * math.pi); z = rnd.uniform(0.05, 0.95)
        sph((0.105 * math.cos(a), 0.105 * math.sin(a), z), 0.012, sm, scale=(1, 1, 2))


@piece
def ol_chanterelle():
    for x, h, s in ((0, 0.8, 1.0), (0.28, 0.6, 0.75)):
        mushroom(x, 0, cap_r=0.35 * s, cap_h=0.22 * s, stem_h=h, stem_r=0.08 * s, cap='funnel', capc=(0.98, 0.7, 0.15), stemc=(0.98, 0.72, 0.2), name='chan')


@piece
def ol_ryzhik():
    mushroom(cap_r=0.48, cap_h=0.26, stem_h=0.7, stem_r=0.11, cap='funnel', capc=(0.95, 0.5, 0.15), stemc=(0.95, 0.58, 0.25), name='ryz')
    for r in (0.15, 0.3):
        torus((0, 0, 0.7 + 0.26), r, 0.01, M('ryz_ring', (0.8, 0.35, 0.1)))


@piece
def ol_honey():
    for x, y, h, tl in [(0, 0, 0.9, 0.0), (0.3, 0.12, 0.75, 0.25), (-0.28, -0.1, 0.7, -0.3), (0.12, -0.28, 0.6, 0.15), (-0.1, 0.25, 0.55, -0.2)]:
        mushroom(x, y, cap_r=0.2, cap_h=0.12, stem_h=h, stem_r=0.04, capc=(0.72, 0.52, 0.28), stemc=(0.85, 0.75, 0.55), ring=True, tilt=tl, name='hon')


@piece
def ol_morel():
    mushroom(cap_r=0.32, cap_h=0.55, stem_h=0.5, stem_r=0.15, cap='brain', capc=(0.55, 0.42, 0.28), stemc=(0.92, 0.88, 0.8), name='mor')
    king(top_z() + 0.08)


@piece
def ol_mold():
    base = sph((0, 0, 0.1), 0.6, M('mold_mat', (0.92, 0.95, 0.85), sss=0.3), scale=(1.1, 1.1, 0.25))
    gm = M('mold_g', (0.3, 0.6, 0.35), sss=0.4)
    rnd = random.Random(5)
    for k in range(9):
        x, y = rnd.uniform(-0.45, 0.45), rnd.uniform(-0.45, 0.45)
        h = rnd.uniform(0.5, 1.1)
        rod((x, y, 0.15), (x, y, h), 0.02, M('mold_st', (0.85, 0.92, 0.82), sss=0.5), v=8)
        for j in range(4):
            a = j * math.pi / 2
            for c in range(4):
                sph((x + (0.04 + c * 0.03) * math.cos(a), y + (0.04 + c * 0.03) * math.sin(a), h + 0.05 + c * 0.04), 0.03, gm, seg=10)


@piece
def ol_polypore():
    rod((0.35, 0, 0), (0.35, 0, 1.5), 0.24, bark('birch2', (0.85, 0.83, 0.78)), v=32)
    m = M('poly', (0.55, 0.45, 0.35), sss=0.1, rough=0.8, bump=0.5)
    for z, s in ((0.55, 1.0), (1.0, 0.8)):
        o = cyl((0.08, 0, z), 0.35 * s, 0.3 * s, m, r2=0.2 * s, v=40)
        o.scale = (1.0, 1.25, 1.0)
        for k in range(4):
            torus((0.08, 0, z - 0.1 * s + k * 0.06 * s), 0.33 * s - k * 0.03 * s, 0.015, M('poly_r', (0.4, 0.33, 0.26), rough=0.8), scale=(1, 1.25, 1))


@piece
def ol_hedgehog():
    t = mushroom(cap_r=0.45, cap_h=0.25, stem_h=0.6, stem_r=0.12, capc=(0.95, 0.82, 0.6), stemc=(0.95, 0.88, 0.75), name='hed')
    sm = M('hed_sp', (0.98, 0.88, 0.7), sss=0.3)
    for r in (0.15, 0.25, 0.35):
        for k in range(int(r * 60)):
            a = k * 2 * math.pi / int(r * 60)
            rod((r * math.cos(a), r * math.sin(a), 0.6), (r * math.cos(a), r * math.sin(a), 0.5), 0.012, sm, r2=0.002, v=6, bev=0)


@piece
def ol_puffball():
    o = sph((0, 0, 0.45), 0.45, M('puff', (0.95, 0.93, 0.88), sss=0.2, bump=0.6), scale=(1.0, 1.0, 0.9))
    displace(o, 0.01, 0.02)
    sm = M('puff_sp', (0.85, 0.82, 0.75), sss=0.0)
    rnd = random.Random(4)
    for k in range(70):
        a = rnd.uniform(0, 2 * math.pi); u = rnd.uniform(0.2, 1.0)
        z = 0.45 + 0.4 * u
        r = 0.45 * math.sqrt(max(0, 1 - u * u)) * 0.98
        cyl((r * math.cos(a), r * math.sin(a), z), 0.012, 0.03, sm, r2=0.002, v=6, bev=0)
    sph((0, 0, 0.95), 0.25, M('puff_cloud', (0.75, 0.68, 0.5), sss=0.0, rough=1.0), scale=(1.2, 1.2, 0.6))


@piece
def ol_yeast():
    m = M('yeast', (0.95, 0.88, 0.65), sss=0.5, rough=0.4)
    sph((0, 0, 0.55), 0.45, m, scale=(1.0, 1.0, 1.15))
    sph((-0.35, 0.1, 1.05), 0.2, m)
    sph((0.3, -0.25, 0.35), 0.18, m)
    for k in range(5):
        sph((0.32 * math.cos(k), 0.32 * math.sin(k), 0.62), 0.05, M('yeast_scar', (0.8, 0.7, 0.45)), scale=(1, 1, 0.3))


# ============================================================ cocci & rods
@piece
def ol_staph():
    m = M('staph', (0.95, 0.75, 0.25))
    rnd = random.Random(1)
    pts = []
    for k in range(16):
        p = Vector((rnd.uniform(-0.45, 0.45), rnd.uniform(-0.35, 0.35), rnd.uniform(0.25, 1.0)))
        sph(tuple(p), 0.2, m)
    king(top_z() + 0.08)


@piece
def ol_strepto():
    m = M('strep', (0.55, 0.35, 0.75))
    pts = [(0.5 * math.sin(i * 0.5), 0.2 * math.cos(i * 0.7), 0.15 + i * 0.13) for i in range(12)]
    for p in pts:
        sph(p, 0.11, m)


@piece
def ol_sarcina():
    m = M('sarc', (0.5, 0.75, 0.45))
    for x in (-0.15, 0.15):
        for y in (-0.15, 0.15):
            for z in (0.2, 0.5):
                sph((x, y, z), 0.16, m)


@piece
def ol_diplo():
    m = M('diplo', (0.85, 0.45, 0.5))
    sph((-0.22, 0, 0.4), 0.3, m, scale=(1.0, 1.0, 1.15))
    sph((0.22, 0, 0.4), 0.3, m, scale=(1.0, 1.0, 1.15))


@piece
def ol_pneumo():
    m = M('pneu', (0.4, 0.6, 0.85))
    cap = M('pneu_cap', (0.8, 0.9, 1.0), sss=0.9, rough=0.1, coat=0.8)
    sph((-0.2, 0, 0.45), 0.26, m, scale=(1.2, 1, 1))
    sph((0.2, 0, 0.45), 0.26, m, scale=(1.2, 1, 1))
    o = sph((0, 0, 0.45), 0.55, cap, scale=(1.2, 0.75, 0.75))
    MATS['pneu_cap'].node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value = 0.85


@piece
def ol_coccus():
    sph((0, 0, 0.45), 0.45, M('coccus', (0.95, 0.6, 0.35)))


@piece
def ol_ecoli():
    m = M('ecoli', (0.4, 0.7, 0.6))
    capsule((-0.55, 0, 0.6), (0.55, 0, 0.6), 0.3, m)
    rnd = random.Random(7)
    fl = M('flag', (0.85, 0.95, 0.9), sss=0.5)
    for k in range(6):
        a = rnd.uniform(0, 2 * math.pi)
        p0 = Vector((rnd.uniform(-0.4, 0.4), 0.28 * math.cos(a), 0.6 + 0.28 * math.sin(a)))
        pts = [tuple(p0 + Vector((0.2 * i, 0.08 * math.sin(i * 1.7), 0.08 * math.cos(i * 1.7) - 0.05 * i))) for i in range(6)]
        tube(pts, 0.012, fl)
    king(top_z() + 0.08)


@piece
def ol_vibrio():
    m = M('vibrio', (0.75, 0.5, 0.85))
    tube([(-0.5, 0, 0.4), (0.0, 0, 0.62), (0.5, 0, 0.42)], 0.2, m)
    tube([(0.5, 0, 0.42), (0.9, 0.05, 0.5), (1.2, -0.05, 0.4), (1.5, 0.05, 0.48)], 0.015, M('flag', (0.85, 0.95, 0.9)))


@piece
def ol_bacillus():
    m = M('bacil', (0.85, 0.7, 0.4))
    capsule((-0.6, 0, 0.35), (0.6, 0, 0.35), 0.22, m)
    sph((0.35, 0, 0.36), 0.12, M('spore', (0.98, 0.95, 0.85), sss=0.3), scale=(1.4, 1, 1))


@piece
def ol_spirillum():
    helix((-0.9, 0, 0.6), 3.0, 0.25, 0.6, 0.1, M('spir2', (0.95, 0.55, 0.3)), axis='x')


@piece
def ol_proteus():
    m = M('proteus', (0.55, 0.45, 0.8))
    capsule((-0.45, 0, 0.6), (0.45, 0, 0.6), 0.25, m)
    fl = M('flag', (0.85, 0.95, 0.9))
    rnd = random.Random(9)
    for k in range(14):
        a = rnd.uniform(0, 2 * math.pi); x = rnd.uniform(-0.4, 0.4)
        p0 = Vector((x, 0.24 * math.cos(a), 0.6 + 0.24 * math.sin(a)))
        d = Vector((0, math.cos(a), math.sin(a)))
        tube([tuple(p0), tuple(p0 + d * 0.15 + Vector((0.05, 0, 0))), tuple(p0 + d * 0.3 + Vector((-0.04, 0, 0)))], 0.008, fl)


@piece
def ol_lacto():
    m = M('lacto', (0.95, 0.9, 0.75))
    capsule((-0.7, 0, 0.3), (-0.05, 0, 0.32), 0.15, m)
    capsule((0.05, 0, 0.34), (0.7, 0, 0.38), 0.15, m)


# ============================================================ phages & virions
def phage(m, head_r=0.35, head='ico', tail_len=0.7, tail_r=0.07, sheath=True, legs=6, z0=0.0):
    zt = z0 + 0.05 + 0.55 * (legs > 0)
    tail_top = zt + tail_len
    if head == 'ico':
        ico((0, 0, tail_top + head_r * 0.95), head_r, m, 1)
    elif head == 'long':
        o = ico((0, 0, tail_top + head_r * 1.4), head_r, m, 1)
        o.scale = (1, 1, 1.5)
    else:
        ico((0, 0, tail_top + head_r * 0.95), head_r, m, 2)
    if tail_len:
        tm = M('phage_tail', (0.8, 0.85, 0.9))
        rod((0, 0, zt), (0, 0, tail_top), tail_r * 0.6, tm, v=16)
        if sheath:
            for k in range(int(tail_len / 0.06)):
                torus((0, 0, zt + 0.03 + k * 0.06), tail_r, tail_r * 0.35, tm)
        cyl((0, 0, zt), tail_r * 2.3, 0.05, tm, v=6)
    if legs:
        lm = M('phage_leg', (0.75, 0.8, 0.85))
        for k in range(legs):
            a = k * 2 * math.pi / legs
            knee = (0.35 * math.cos(a), 0.35 * math.sin(a), zt + 0.1)
            rod((0.1 * math.cos(a), 0.1 * math.sin(a), zt), knee, 0.015, lm, v=8)
            rod(knee, (0.55 * math.cos(a), 0.55 * math.sin(a), 0.02), 0.013, lm, v=8)
    return tail_top


@piece
def ol_t4():
    t = phage(M('t4', (0.45, 0.6, 0.9)), head='long', head_r=0.28, tail_len=0.6)
    king(top_z() + 0.1)


@piece
def ol_t7():
    phage(M('t7', (0.95, 0.55, 0.35)), head='ico', head_r=0.45, tail_len=0.15, sheath=False, legs=0)


@piece
def ol_lambda():
    phage(M('lambda', (0.55, 0.8, 0.5)), head='ico', head_r=0.32, tail_len=1.0, tail_r=0.05, sheath=True, legs=0)


@piece
def ol_phix():
    o = ico((0, 0, 0.5), 0.45, M('phix', (0.85, 0.5, 0.8)), 1)
    for v in [(0, 0, 1), (0, 0, -1), (1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0)]:
        d = Vector(v)
        cyl(tuple(Vector((0, 0, 0.5)) + d * 0.47), 0.08, 0.08, M('phix_sp', (0.95, 0.8, 0.95)), v=5)


@piece
def ol_phi29():
    phage(M('phi29', (0.95, 0.8, 0.3)), head='long', head_r=0.25, tail_len=0.25, sheath=False, legs=0)
    for k in range(10):
        a = k * 2 * math.pi / 10
        rod((0, 0, 0.75), (0.3 * math.cos(a), 0.3 * math.sin(a), 0.9), 0.012, M('phi29_f', (0.95, 0.95, 0.8)), v=6, bev=0)


@piece
def ol_ms2():
    ico((0, 0, 0.4), 0.4, M('ms2', (0.35, 0.75, 0.85)), 2, bumps=0.03)


@piece
def ol_adeno():
    m = M('adeno', (0.95, 0.55, 0.25))
    ico((0, 0, 0.8), 0.55, m, 1)
    import bmesh
    for v in [(0.0, 0.5257, 0.8507), (0.0, -0.5257, 0.8507), (0.0, 0.5257, -0.8507), (0.0, -0.5257, -0.8507), (0.5257, 0.8507, 0.0),
              (-0.5257, 0.8507, 0.0), (0.5257, -0.8507, 0.0), (-0.5257, -0.8507, 0.0), (0.8507, 0.0, 0.5257), (-0.8507, 0.0, 0.5257),
              (0.8507, 0.0, -0.5257), (-0.8507, 0.0, -0.5257)]:
        d = Vector(v).normalized()
        p0 = Vector((0, 0, 0.8)) + d * 0.55
        rod(tuple(p0), tuple(p0 + d * 0.35), 0.015, M('adeno_f', (0.98, 0.9, 0.7)), v=6, bev=0)
        sph(tuple(p0 + d * 0.37), 0.04, M('adeno_f', (0.98, 0.9, 0.7)))
    king(top_z() + 0.08)


@piece
def ol_corona():
    m = M('corona', (0.75, 0.75, 0.78))
    o = sph((0, 0, 0.75), 0.5, m)
    displace(o, 0.02, 0.06, 'CLOUDS')
    spikes((0, 0, 0.75), 0.5, M('corona_s', (0.9, 0.2, 0.15)), n=46, length=0.18, head=0.06, thick=0.018)


@piece
def ol_tmv():
    m = M('tmv', (0.45, 0.7, 0.35))
    rod((0, 0, 0.05), (0, 0, 2.0), 0.12, m, v=32)
    helix((0, 0, 0.05), 30, 0.125, 0.065, 0.012, M('tmv_h', (0.65, 0.85, 0.5)), axis='z')


@piece
def ol_rota():
    m = M('rota', (0.85, 0.7, 0.35))
    ico((0, 0, 0.6), 0.55, m, 2)
    for k in range(12):
        a = k * math.pi / 6
        rod((0, 0.0, 0.6), (0.62 * math.cos(a), -0.3, 0.6 + 0.62 * math.sin(a)), 0.03, M('rota_s', (0.98, 0.9, 0.6)), v=6, bev=0)


@piece
def ol_flu():
    m = M('flu', (0.6, 0.55, 0.8))
    o = sph((0, 0, 0.7), 0.5, m)
    spikes((0, 0, 0.7), 0.5, M('flu_h', (0.95, 0.6, 0.2)), n=50, length=0.12, head=0.04, thick=0.02, seed=2)
    spikes((0, 0, 0.7), 0.5, M('flu_n', (0.3, 0.8, 0.5)), n=24, length=0.14, head=0.05, thick=0.012, seed=7)


@piece
def ol_noro():
    o = ico((0, 0, 0.45), 0.42, M('noro', (0.9, 0.4, 0.45)), 2)
    displace(o, 0.06, 0.1)
