"""Реалистичные животные «Шахмат царств»: кошачьи, саванна, приматы, птицы, китообразные, акулы, океан.

Тела — метаболы по «скелету» (плавные органичные формы), шерсть — частицы-волосы с окрасом
(полосы тигра и зебры, розетки ягуара и леопарда, пятна гепарда, светлое брюхо), кожа слона и
носорога — с морщинами, морские животные — гладкие тела-лофты с плавниками.
Ходячие животные получают кадры шага (FRAME=a/b), как и люди.
"""
import math
import os
import random

import bpy
from mathutils import Vector

import blender_real as br
from blender_real import piece, crown, cyl, sph, rod, tube, torus, plate, box, loft, meta_body, MATS

STRIDE = {'0': 0.0, 'a': 1.0, 'b': -1.0}[os.environ.get('FRAME', '0')]


# ============================================================ coat materials
def _coat_color(n, l, base, belly=None, pattern=None, dark=(0.08, 0.06, 0.05), scale=1.0, light=None):
    # world position: fins, ears and legs are separate objects but share one pattern and belly band
    v = n.new('ShaderNodeNewGeometry').outputs['Position']
    nz = br._noise(n, l, v, 9 * scale, 4)
    col = br._ramp(n, l, nz.outputs['Fac'], [(0.35, br._vary(base, 0.85)), (0.7, br._vary(base, 1.1))])
    if belly:
        sep = n.new('ShaderNodeSeparateXYZ'); l.new(v, sep.inputs[0])
        if len(belly) == 3:      # light band between two heights (belly, not the legs)
            lo, hi = belly[1], belly[2]
            m1 = n.new('ShaderNodeMapRange'); m1.inputs['From Min'].default_value = lo - 0.06; m1.inputs['From Max'].default_value = lo + 0.04
            l.new(sep.outputs['Z'], m1.inputs['Value'])
            m2 = n.new('ShaderNodeMapRange'); m2.inputs['From Min'].default_value = hi + 0.05; m2.inputs['From Max'].default_value = hi - 0.05
            l.new(sep.outputs['Z'], m2.inputs['Value'])
            mul = n.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
            l.new(m1.outputs[0], mul.inputs[0]); l.new(m2.outputs[0], mul.inputs[1])
            bf = mul.outputs[0]
        else:
            bf = br._ramp(n, l, sep.outputs['Z'], [(belly[1] - 0.12, (1, 1, 1)), (belly[1] + 0.08, (0, 0, 0))], srgb=False)
        col = br._mixc(n, l, col, tuple((a + b) / 2 for a, b in zip(belly[0], base)), bf)
    if pattern == 'stripes':
        w = n.new('ShaderNodeTexWave'); w.inputs['Scale'].default_value = 3.2 * scale; w.inputs['Distortion'].default_value = 7
        w.inputs['Detail'].default_value = 2; w.inputs['Detail Scale'].default_value = 1.5
        l.new(v, w.inputs['Vector'])
        sf = br._ramp(n, l, w.outputs['Fac'], [(0.62, (0, 0, 0)), (0.7, (1, 1, 1))], srgb=False)
        col = br._mixc(n, l, col, dark, sf)
    elif pattern in ('spots', 'rosettes', 'blotch'):
        vo = n.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = {'spots': 14, 'rosettes': 9, 'blotch': 5}[pattern] * scale
        vo.inputs['Randomness'].default_value = 0.9
        l.new(v, vo.inputs['Vector'])
        if pattern == 'rosettes':
            sf = br._ramp(n, l, vo.outputs['Distance'], [(0.22, (0, 0, 0)), (0.27, (1, 1, 1)), (0.36, (1, 1, 1)), (0.42, (0, 0, 0))], srgb=False)
            inner = br._ramp(n, l, vo.outputs['Distance'], [(0.2, (1, 1, 1)), (0.26, (0, 0, 0))], srgb=False)
            col = br._mixc(n, l, col, br._vary(base, 0.72), inner)
        else:
            sf = br._ramp(n, l, vo.outputs['Distance'], [(0.24 if pattern == 'spots' else 0.33, (1, 1, 1)), (0.3 if pattern == 'spots' else 0.4, (0, 0, 0))], srgb=False)
        col = br._mixc(n, l, col, dark, sf)
    elif pattern == 'rings':  # ring-tailed lemur tail
        sep2 = n.new('ShaderNodeSeparateXYZ'); l.new(v, sep2.inputs[0])
        w = n.new('ShaderNodeTexWave'); w.inputs['Scale'].default_value = 6 * scale; w.bands_direction = 'X'
        l.new(v, w.inputs['Vector'])
        sf = br._ramp(n, l, w.outputs['Fac'], [(0.5, (0, 0, 0)), (0.55, (1, 1, 1))], srgb=False)
        col = br._mixc(n, l, col, dark, sf)
    if light:
        col = br._mixc(n, l, col, light[0], light[1])
    return col


def coat(name, base, belly=None, pattern=None, dark=(0.08, 0.06, 0.05), scale=1.0, rough=0.5, fur=True):
    """Two materials sharing one colour graph: skin under the fur and the fur itself."""
    if name in MATS:
        return name
    m, n, l, b = br._new(name)
    col = _coat_color(n, l, base, belly, pattern, dark, scale)
    l.new(col, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Sheen Weight'].default_value = 0.4
    fine = br._noise(n, l, br._coord(n, l), 80, 6)
    br._bump(n, l, b, fine.outputs['Fac'], 0.15, 0.004)
    MATS[name] = m
    if fur:
        h = bpy.data.materials.new(name + '_fur'); h.use_nodes = True
        nt = h.node_tree
        for nd in list(nt.nodes):
            if nd.type == 'BSDF_PRINCIPLED':
                nt.nodes.remove(nd)
        hb = nt.nodes.new('ShaderNodeBsdfHairPrincipled'); hb.parametrization = 'COLOR'
        hb.inputs['Roughness'].default_value = 0.4; hb.inputs['Radial Roughness'].default_value = 0.6; hb.inputs['Coat'].default_value = 0.1
        c2 = _coat_color(nt.nodes, nt.links, base, belly, pattern, dark, scale)
        nt.links.new(c2, hb.inputs['Color'])
        nt.links.new(hb.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
        MATS[name + '_fur'] = h
    return name


def skinny(name, base, rough=0.75, wrinkle=0.6, belly=None, pattern=None, dark=(0.1, 0.1, 0.1), scale=1.0, coat_=0.0, sss=0.1):
    """Hairless skin: elephant/rhino wrinkles or smooth wet marine skin."""
    if name in MATS:
        return name
    m, n, l, b = br._new(name)
    col = _coat_color(n, l, base, belly, pattern, dark, scale)
    l.new(col, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat_
    b.inputs['Subsurface Weight'].default_value = sss
    b.inputs['Subsurface Radius'].default_value = (1.0, 0.5, 0.4)
    b.inputs['Subsurface Scale'].default_value = 0.03
    v = br._coord(n, l)
    if wrinkle:
        vo = n.new('ShaderNodeTexVoronoi'); vo.feature = 'DISTANCE_TO_EDGE'; vo.inputs['Scale'].default_value = 30
        l.new(v, vo.inputs['Vector'])
        nz = br._noise(n, l, v, 60, 8)
        add = n.new('ShaderNodeMath'); add.operation = 'MULTIPLY_ADD'
        l.new(vo.outputs['Distance'], add.inputs[0]); add.inputs[1].default_value = 2.0; l.new(nz.outputs['Fac'], add.inputs[2])
        br._bump(n, l, b, add.outputs[0], wrinkle, 0.01)
    else:
        nz = br._noise(n, l, v, 40, 4)
        br._bump(n, l, b, nz.outputs['Fac'], 0.05, 0.004)
    MATS[name] = m
    return name


def fur(o, mat, length=0.03, count=12000, children=6, comb=(0.5, 0.0, -0.4), rough=0.004, clump=0.15, vg=None):
    mod = br.hair(o, mat + '_fur', count=count, length=length, children=children, rough=rough, clump=clump, density_vg=vg)
    ps = mod.particle_system.settings
    return mod


def eye(p, r=0.03, iris=(0.55, 0.38, 0.1)):
    sph(p, r, 'iris')
    m = 'eye_' + '_'.join(str(int(c * 99)) for c in iris)
    if m not in MATS:
        MATS[m] = br.plain(m, iris, 0.05, clearcoat=1.0)
    sph((p[0] - r * 0.35, p[1], p[2]), r * 0.7, m)
    sph((p[0] - r * 0.62, p[1], p[2]), r * 0.35, 'iris')


def swing(pts, pivot, ang):
    px, pz = pivot[0], pivot[2]
    c, s = math.cos(ang), math.sin(ang)
    return [(px + (p[0] - px) * c + (p[2] - pz) * s, p[1], pz - (p[0] - px) * s + (p[2] - pz) * c) for p in pts]


def as_mesh(curve_obj):
    bpy.context.view_layer.objects.active = curve_obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    curve_obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


# ============================================================ quadruped
def quad(m, L=1.2, H=0.7, bw=0.22, bh=0.25, chest=1.1, neck=0.35, neck_up=45, head=0.17, muzzle=0.12, mr=0.08,
         leg=0.07, paw=0.065, tail=0.8, tail_r=0.035, tail_up=-30, ears='round', ear=0.06, fur_len=0.03, mane=None,
         hoof=None, skin=False, iris=(0.7, 0.5, 0.1), face=None, hind_bend=0.18, nose=(0.08, 0.06, 0.05), stride_amp=0.35,
         tail_mat=None, tuft=None, front_longer=0.0):
    """Generic four-legged animal facing -X. Returns head centre and body top for props/crowns."""
    zc = H + bh
    sx = -L / 2
    hx = L / 2
    segs = [((hx + 0.05, 0, zc + 0.02), (0.0, 0, zc), (bw * 0.95, bh * 0.95), (bw, bh)),
            ((0.0, 0, zc), (sx, 0, zc + 0.03 + front_longer * 0.3), (bw, bh), (bw * chest, bh * chest))]
    na = math.radians(neck_up)
    n0 = Vector((sx - bw * 0.3, 0, zc + bh * 0.4 + front_longer * 0.3))
    n1 = n0 + Vector((-math.cos(na), 0, math.sin(na))) * neck
    segs.append((tuple(n0), tuple(n1), (bw * 0.75, bh * 0.8), (head * 0.8, head * 0.85)))
    hc = n1 + Vector((-head * 0.4, 0, head * 0.2))
    segs.append((tuple(n1), tuple(hc), head * 0.85, head))
    mz = hc + Vector((-head * 0.7 - muzzle, 0, -head * 0.25))
    segs.append((tuple(hc), tuple(mz), (head * 0.75, head * 0.7), (mr, mr * 0.9)))
    feet = []
    legs = []
    for y in (bw * 0.62, -bw * 0.62):
        side = 1 if y > 0 else -1
        a = stride_amp * STRIDE * side
        # front leg: straight, slight elbow
        top, knee, foot = (sx + 0.05, y, zc - bh * 0.2), (sx + 0.08, y, H * 0.5 - front_longer * 0.2), (sx + 0.03, y, paw * 0.6)
        if front_longer:
            top = (sx + 0.05, y, zc - bh * 0.2 + front_longer * 0.3)
        pts = swing([top, knee, foot], top, a)
        legs.append([(pts[0], pts[1], leg * 1.45, leg), (pts[1], pts[2], leg, leg * 0.8)])
        feet.append(pts[2])
        # hind leg: thigh, hock, foot
        top, knee, hock, foot = (hx - 0.05, y, zc - bh * 0.1), (hx - hind_bend, y, H * 0.62), (hx + hind_bend * 0.5, y, H * 0.32), (hx + hind_bend * 0.35, y, paw * 0.6)
        pts = swing([top, knee, hock, foot], top, -a)
        legs.append([(pts[0], pts[1], leg * 1.7, leg * 1.1), (pts[1], pts[2], leg * 1.05, leg * 0.75), (pts[2], pts[3], leg * 0.75, leg * 0.75)])
        feet.append(pts[3])
    body = meta_body(segs, m, res=min(0.02, leg * 0.35), name='animal', smooth_iter=4)
    leg_objs = [meta_body(lg, m, res=min(0.015, leg * 0.3), name='leg', smooth_iter=3) for lg in legs]
    # paws / hooves
    for f in feet:
        if hoof:
            cyl((f[0], f[1], max(0.03, f[2] - paw * 0.2)), paw * 0.9, paw * 0.8, hoof, r2=paw * 0.75, v=20)
        else:
            sph((f[0] - paw * 0.25, f[1], paw * 0.55), paw, m, scale=(1.35, 1.0, 0.65))
    # face
    e_off = head * 0.55
    for s in (1, -1):
        eye((hc.x - head * 0.72, s * head * 0.48, hc.z + head * 0.2), head * 0.16, iris)
        if ears == 'round':
            sph((hc.x + head * 0.25, s * head * 0.65, hc.z + head * 0.75), ear, m, scale=(0.5, 1.0, 1.0))
        elif ears == 'pointy':
            cyl((hc.x + head * 0.2, s * head * 0.55, hc.z + head * 0.8 + ear * 0.5), ear * 0.7, ear * 1.6, m, r2=0.004, v=12,
                rot=(0.3 * s, 0, 0))
            if tuft:
                rod((hc.x + head * 0.2, s * head * 0.68, hc.z + head * 0.8 + ear * 1.25), (hc.x + head * 0.2, s * head * 0.75, hc.z + head * 0.8 + ear * 1.8), 0.008, 'iris', r2=0.001, v=6, bev=0)
        elif ears == 'horse':
            cyl((hc.x + head * 0.35, s * head * 0.45, hc.z + head * 0.85), ear * 0.5, ear * 1.8, m, r2=0.006, v=12, rot=(0.25 * s, -0.15, 0))
    nm = 'nose_' + '_'.join(str(int(c * 99)) for c in nose)
    if nm not in MATS:
        MATS[nm] = br.plain(nm, nose, 0.35, clearcoat=0.6)
    sph((mz.x - mr * 0.85, 0, mz.z + mr * 0.15), mr * 0.45, nm, scale=(0.7, 1.2, 0.8))
    # tail
    t0 = Vector((hx + 0.05, 0, zc + bh * 0.4))
    ta = math.radians(tail_up)
    t1 = t0 + Vector((math.cos(ta), 0, math.sin(ta))) * tail * 0.5
    t2 = t1 + Vector((0.3, 0, -0.6 if tail_up < 0 else 0.4)).normalized() * tail * 0.5
    tl = None
    if tail > 0:
        tl = as_mesh(tube([tuple(t0), tuple(t1), tuple(t2)], tail_r, tail_mat or m, r_end=tail_r * 0.6))
    if not skin:
        fur(body, m, length=fur_len)
        for lo in leg_objs:
            fur(lo, m, length=fur_len * 0.7, count=2500)
        if tl:
            fur(tl, tail_mat or m, length=fur_len * 1.4, count=3000)
    if mane:
        mm, ml = mane
        mn = sph(tuple(n0 + (n1 - n0) * 0.4 + Vector((0.04, 0, 0.0))), bw * 0.95, mm, scale=(1.2, 0.95, 1.1))
        fur(mn, mm, length=ml * 0.6, count=9000, children=10, rough=0.03, clump=0.5)
        mh = sph(tuple(hc + Vector((head * 0.45, 0, 0.02))), head * 0.95, mm, scale=(0.55, 1.1, 1.1))
        fur(mh, mm, length=ml * 0.55, count=6000, children=10, rough=0.03, clump=0.5)
    return hc, zc + bh


# ============================================================ cats & savanna
LION = ((0.72, 0.52, 0.28), ((0.9, 0.82, 0.66), 0.45))


@piece
def an_lion():
    m = coat('lion', LION[0], (LION[1][0], 0.62, 0.86))
    coat('lion_mane', (0.5, 0.3, 0.13), None)
    hc, top = quad(m, L=1.25, H=0.72, bw=0.24, bh=0.27, head=0.22, muzzle=0.14, mr=0.11, leg=0.08, paw=0.075, tail=0.85,
                   tail_up=-40, fur_len=0.018, mane=('lion_mane', 0.16), iris=(0.75, 0.55, 0.15))
    crown((hc.x + 0.05, 0, hc.z + 0.34), 1.2)


@piece
def an_tiger():
    m = coat('tiger', (0.92, 0.5, 0.15), ((0.95, 0.92, 0.85), 0.62, 0.86), 'stripes', dark=(0.05, 0.04, 0.03), scale=0.7)
    quad(m, L=1.4, H=0.72, bw=0.25, bh=0.27, head=0.2, muzzle=0.12, mr=0.1, leg=0.085, paw=0.08, tail=0.95, tail_up=-30,
         fur_len=0.016, iris=(0.8, 0.65, 0.2))


@piece
def an_jaguar():
    m = coat('jaguar', (0.85, 0.62, 0.3), ((0.94, 0.88, 0.76), 0.52, 0.74), 'rosettes', dark=(0.08, 0.06, 0.04), scale=0.8)
    quad(m, L=1.2, H=0.6, bw=0.25, bh=0.27, head=0.2, muzzle=0.11, mr=0.1, leg=0.09, paw=0.085, tail=0.7, tail_up=-35, fur_len=0.014)


@piece
def an_lynx():
    m = coat('lynx', (0.68, 0.55, 0.42), ((0.9, 0.86, 0.8), 0.52, 0.72), 'spots', dark=(0.35, 0.25, 0.18))
    quad(m, L=0.95, H=0.62, bw=0.2, bh=0.22, head=0.17, muzzle=0.08, mr=0.08, leg=0.07, paw=0.085, tail=0.18, tail_r=0.045,
         tail_up=10, ears='pointy', ear=0.07, tuft=True, fur_len=0.028)


@piece
def an_cheetah():
    m = coat('cheetah', (0.88, 0.7, 0.42), ((0.96, 0.92, 0.82), 0.74, 0.92), 'spots', dark=(0.06, 0.05, 0.04))
    quad(m, L=1.25, H=0.82, bw=0.18, bh=0.2, chest=1.2, head=0.15, muzzle=0.08, mr=0.07, leg=0.055, paw=0.055, tail=0.85,
         tail_r=0.028, tail_up=-20, fur_len=0.012, stride_amp=0.5)


@piece
def an_kitten():
    m = coat('kitten', (0.85, 0.6, 0.35), ((0.97, 0.94, 0.88), 0.25, 0.4), 'stripes', dark=(0.62, 0.38, 0.18), scale=1.6)
    quad(m, L=0.55, H=0.32, bw=0.15, bh=0.15, head=0.19, muzzle=0.04, mr=0.07, leg=0.05, paw=0.05, tail=0.45, tail_r=0.03,
         tail_up=60, ears='pointy', ear=0.07, fur_len=0.03, iris=(0.35, 0.55, 0.85), neck=0.15, neck_up=60)


@piece
def an_leopard():
    m = coat('leopard', (0.88, 0.68, 0.38), ((0.95, 0.9, 0.8), 0.55, 0.76), 'rosettes', dark=(0.06, 0.05, 0.04), scale=1.0)
    quad(m, L=1.2, H=0.62, bw=0.21, bh=0.23, head=0.17, muzzle=0.1, mr=0.085, leg=0.07, paw=0.07, tail=0.95, tail_up=-25, fur_len=0.014)


@piece
def an_rhino():
    m = skinny('rhino', (0.48, 0.46, 0.44), wrinkle=0.7)
    hc, top = quad(m, L=1.7, H=0.55, bw=0.38, bh=0.42, chest=1.05, neck=0.3, neck_up=10, head=0.28, muzzle=0.3, mr=0.17,
                   leg=0.13, paw=0.12, tail=0.35, tail_r=0.025, tail_up=-70, ears='horse', ear=0.08, skin=True, hoof='rhino',
                   iris=(0.12, 0.08, 0.05), stride_amp=0.22)
    tip = hc + Vector((-0.65, 0, -0.08))
    cyl((tip.x, 0, tip.z + 0.22), 0.11, 0.48, skinny('horn', (0.55, 0.5, 0.42), wrinkle=0.2), r2=0.01, rot=(0, -0.35, 0), v=24)
    cyl((tip.x + 0.25, 0, tip.z + 0.2), 0.08, 0.22, 'horn', r2=0.01, rot=(0, -0.2, 0), v=20)


@piece
def an_elephant():
    m = skinny('elephant', (0.52, 0.5, 0.48), wrinkle=0.9)
    MATS['elephant_nail'] = br.plain('elephant_nail', (0.75, 0.7, 0.6), 0.5)
    hc, top = quad(m, L=1.7, H=1.0, bw=0.45, bh=0.55, chest=1.05, neck=0.25, neck_up=20, head=0.42, muzzle=0.12, mr=0.2,
                   leg=0.18, paw=0.19, tail=0.6, tail_r=0.025, tail_up=-75, ears=None, skin=True, hoof='elephant_nail',
                   iris=(0.25, 0.15, 0.08), stride_amp=0.2)
    for s in (1, -1):
        o = sph((hc.x + 0.25, s * 0.45, hc.z - 0.05), 0.5, m, scale=(0.12, 0.85, 1.1), rot=(0, 0, 0.35 * s))
    trunk = tube([(hc.x - 0.4, 0, hc.z - 0.1), (hc.x - 0.62, 0, hc.z - 0.5), (hc.x - 0.65, 0, hc.z - 1.0), (hc.x - 0.55, 0, hc.z - 1.3)], 0.13, m, r_end=0.05)
    ivory = br.plain('ivory2', (0.93, 0.88, 0.75), 0.35, sss=0.2); MATS['ivory2'] = ivory
    for s in (1, -1):
        tube([(hc.x - 0.35, s * 0.18, hc.z - 0.3), (hc.x - 0.62, s * 0.24, hc.z - 0.65), (hc.x - 0.82, s * 0.2, hc.z - 0.6)], 0.05, 'ivory2', r_end=0.015)


def horse_like(m, mane_m, H=1.0, L=1.3, stripes=False):
    hc, top = quad(m, L=L, H=H, bw=0.26, bh=0.32, chest=1.05, neck=0.55, neck_up=55, head=0.16, muzzle=0.32, mr=0.09,
                   leg=0.07, paw=0.07, tail=0.6, tail_r=0.03, tail_up=-60, ears='horse', ear=0.06, skin=False, hoof='boot',
                   fur_len=0.008, hind_bend=0.22, iris=(0.12, 0.08, 0.05))
    return hc


@piece
def an_zebra():
    m = coat('zebra', (0.95, 0.94, 0.9), None, 'stripes', dark=(0.04, 0.04, 0.04), scale=1.5)
    hc = horse_like(m, m)
    crest = tube([(hc.x + 0.65, 0, hc.z - 0.25), (hc.x + 0.35, 0, hc.z + 0.05), (hc.x + 0.08, 0, hc.z + 0.18)], 0.03, m)
    fur(as_mesh(crest), 'zebra', length=0.07, count=1500, comb=(0, 0, 1))


@piece
def an_vervet():
    m = coat('vervet', (0.55, 0.55, 0.45), ((0.9, 0.88, 0.82), 0.32, 0.5))
    hc, top = quad(m, L=0.7, H=0.38, bw=0.15, bh=0.16, head=0.13, muzzle=0.04, mr=0.07, leg=0.045, paw=0.045, tail=0.9,
                   tail_r=0.022, tail_up=40, fur_len=0.02, neck=0.12, neck_up=40, nose=(0.1, 0.1, 0.1))
    sph((hc.x - 0.1, 0, hc.z - 0.01), 0.09, skinny('vervet_face', (0.15, 0.13, 0.12), wrinkle=0.1), scale=(0.6, 1, 1.1))


# ============================================================ primates
def ape(m, face_m, H=1.1, upright=0.35, arm=1.0, leg=0.55, chest=0.3, head=0.17, belly=0.28, iris=(0.35, 0.2, 0.08), knuckle=True,
        fur_len=0.03, crest=False, muzzle=0.06):
    """Ape on knuckles (gorilla) or standing (orangutan/gibbon). Facing -X."""
    hip = Vector((0.15, 0, leg))
    sh = Vector((0.15 - (1 - upright) * 0.7, 0, leg + 0.6 * (0.4 + upright)))
    segs = [(tuple(hip), tuple(sh), (belly, belly * 1.05), (chest, chest * 1.05))]
    hc = sh + Vector((-0.1 - (1 - upright) * 0.15, 0, head + 0.08))
    segs.append((tuple(sh), tuple(hc), chest * 0.5, head))
    for y in (0.17, -0.17):
        s = 1 if y > 0 else -1
        a = 0.3 * STRIDE * s
        # legs
        k = hip + Vector((-0.15, y * 1.2, -leg * 0.5))
        f = Vector((hip.x - 0.05, y * 1.3, 0.06))
        pts = swing([tuple(hip + Vector((0, y, 0))), tuple(k), tuple(f)], tuple(hip), -a)
        segs += [(pts[0], pts[1], 0.13, 0.09), (pts[1], pts[2], 0.09, 0.075)]
        sph((pts[2][0] - 0.06, pts[2][1], 0.04), 0.07, m, scale=(1.6, 0.9, 0.5))
        # arms
        st = sh + Vector((0, y * 1.9, 0))
        el = st + Vector((-0.15 - (0.1 if knuckle else 0), y * 0.3, -arm * 0.48))
        hd = Vector((st.x - 0.25, st.y + y * 0.4, 0.07)) if knuckle else st + Vector((-0.05, y * 0.3, -arm * 0.92))
        pts = swing([tuple(st), tuple(el), tuple(hd)], tuple(st), a)
        segs += [(pts[0], pts[1], 0.11, 0.08), (pts[1], pts[2], 0.08, 0.065)]
        sph(pts[2], 0.07, m, scale=(1.2, 1.0, 0.8))
    body = meta_body(segs, m, res=0.02, name='ape', smooth_iter=4)
    fur(body, m, length=fur_len, comb=(0.2, 0.0, -0.6))
    # face
    fc = hc + Vector((-head * 0.55, 0, -head * 0.1))
    sph(tuple(fc), head * 0.72, face_m, scale=(0.75, 1.0, 1.05))
    sph(tuple(fc + Vector((-head * 0.38, 0, -head * 0.32))), head * 0.38 + muzzle * 0.5, face_m, scale=(1.0 + muzzle * 4, 1.15, 0.8))
    for s in (1, -1):
        eye(tuple(fc + Vector((-head * 0.5, s * head * 0.26, head * 0.12))), head * 0.11, iris)
        sph(tuple(hc + Vector((0.0, s * head * 0.92, 0.02))), head * 0.2, face_m, scale=(0.5, 0.5, 1.0))
    sph(tuple(fc + Vector((-head * 0.55, 0, head * 0.3))), head * 0.5, face_m, scale=(0.4, 1.2, 0.3))  # brow
    if crest:
        sph(tuple(hc + Vector((0.05, 0, head * 0.6))), head * 0.55, m, scale=(1.2, 0.6, 0.8))
    return hc


@piece
def an_gorilla():
    m = coat('gorilla', (0.08, 0.075, 0.07))
    f = skinny('gorilla_face', (0.1, 0.09, 0.09), wrinkle=0.4, rough=0.45)
    hc = ape(m, f, upright=0.35, arm=1.25, leg=0.55, chest=0.36, head=0.2, belly=0.33, crest=True, fur_len=0.035)
    # silver back
    sph((0.0, 0, 1.05), 0.3, coat('silverback', (0.6, 0.6, 0.6)), scale=(1.2, 1.0, 0.45))
    crown((hc.x + 0.02, 0, hc.z + 0.3), 1.2)


@piece
def an_orangutan():
    m = coat('orang', (0.62, 0.28, 0.1))
    f = skinny('orang_face', (0.35, 0.25, 0.2), wrinkle=0.3, rough=0.5)
    ape(m, f, upright=0.5, arm=1.4, leg=0.5, chest=0.3, head=0.19, belly=0.33, knuckle=True, fur_len=0.04)


@piece
def an_baboon():
    m = coat('baboon', (0.6, 0.52, 0.38))
    hc, top = quad(m, L=0.85, H=0.45, bw=0.17, bh=0.19, head=0.15, muzzle=0.17, mr=0.07, leg=0.055, paw=0.05, tail=0.55,
                   tail_r=0.025, tail_up=20, fur_len=0.035, neck=0.12, neck_up=30, nose=(0.12, 0.1, 0.1), front_longer=0.15)


@piece
def an_lemur():
    m = coat('lemur', (0.62, 0.62, 0.6), ((0.95, 0.95, 0.94), 0.28, 0.44))
    coat('lemur_tail', (0.95, 0.95, 0.94), None, 'rings', dark=(0.06, 0.06, 0.06), scale=1.8)
    hc, top = quad(m, L=0.6, H=0.33, bw=0.13, bh=0.14, head=0.12, muzzle=0.09, mr=0.05, leg=0.045, paw=0.045, tail=1.5,
                   tail_r=0.045, tail_up=75, fur_len=0.022, neck=0.1, neck_up=40, ears='pointy', ear=0.05, iris=(0.95, 0.6, 0.1),
                   tail_mat='lemur_tail', nose=(0.05, 0.05, 0.05))
    sph((hc.x - 0.06, 0, hc.z), 0.1, skinny('lemur_mask', (0.95, 0.95, 0.94), wrinkle=0.0), scale=(0.8, 1.0, 1.0))


@piece
def an_gibbon():
    m = coat('gibbon', (0.55, 0.45, 0.32))
    f = skinny('gibbon_face', (0.08, 0.07, 0.07), wrinkle=0.2, rough=0.45)
    hc = ape(m, f, upright=0.55, arm=1.45, leg=0.5, chest=0.22, head=0.15, belly=0.24, knuckle=True, fur_len=0.035, muzzle=0.02)
    torus((hc.x - 0.07, 0, hc.z - 0.01), 0.12, 0.025, 'gibbon', rot=(0, math.pi / 2 - 0.2, 0))


@piece
def an_capuchin():
    m = coat('capu', (0.28, 0.18, 0.1))
    hc, top = quad(m, L=0.6, H=0.34, bw=0.13, bh=0.14, head=0.13, muzzle=0.03, mr=0.07, leg=0.045, paw=0.045, tail=0.9,
                   tail_r=0.025, tail_up=30, fur_len=0.025, neck=0.1, neck_up=45, nose=(0.3, 0.2, 0.15))
    sph((hc.x - 0.08, 0, hc.z), 0.1, skinny('capu_face', (0.9, 0.78, 0.62), wrinkle=0.1), scale=(0.7, 1.0, 1.05))
    sph((hc.x + 0.02, 0, hc.z + 0.1), 0.09, 'capu', scale=(1.0, 1.0, 0.6))


# ============================================================ birds
def feathers(name, base, dark=None, pattern=None, belly=None, scale=1.0):
    if name in MATS:
        return name
    m, n, l, b = br._new(name)
    col = _coat_color(n, l, base, belly, pattern, dark or br._vary(base, 0.5), scale)
    l.new(col, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.6
    b.inputs['Sheen Weight'].default_value = 0.6
    v = br._coord(n, l)
    w = n.new('ShaderNodeTexWave'); w.inputs['Scale'].default_value = 90; w.inputs['Distortion'].default_value = 3
    l.new(v, w.inputs['Vector'])
    br._bump(n, l, b, w.outputs['Fac'], 0.18, 0.004)
    MATS[name] = m
    return name


def wing(base, length, width, m, ang, droop=0.0, open_=0.0, side=1):
    """Fan of layered feathers from a shoulder point."""
    for i in range(9):
        t = i / 8
        L = length * (0.55 + 0.45 * (1 - abs(t - 0.6)))
        if open_:
            d = Vector((0.15 + 0.3 * t, side * (0.7 + 0.3 * t), 0.35 - 0.5 * t)).normalized()
        else:
            d = (Vector(ang) + Vector((0.0, side * (0.1 + 0.06 * t), -0.08 * t))).normalized()
        o = plate([(0, -width * 0.5), (L * 0.85, -width * 0.35), (L, 0), (L * 0.85, width * 0.35), (0, width * 0.5)], 0.008, m, bev=0.002)
        o.location = tuple(Vector(base) + Vector((0, side * 0.01 * i, -0.012 * i)))
        o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = d.to_track_quat('X', 'Z')


def bird(m, H=0.9, body=0.32, neck=0.18, head=0.12, beak=0.12, beak_m='beak_y', leg_m='beak_y', legH=0.35, upright=0.4,
         wing_len=0.55, tail=0.3, iris=(0.8, 0.55, 0.1), hooked=False, feet='talon', walk=True, neck_bend=0.0, wing_open=0.0):
    zb = legH + body
    tilt = math.radians(90 * upright)
    fwd = Vector((-math.cos(tilt), 0, math.sin(tilt)))
    b0 = Vector((0, 0, zb)) - fwd * body * 0.7
    b1 = Vector((0, 0, zb)) + fwd * body * 0.6
    segs = [(tuple(b0), tuple(b1), (body * 0.75, body * 0.72), (body * 0.85, body * 0.8))]
    nb = b1 + fwd * body * 0.2 + Vector((-neck_bend, 0, neck))
    segs.append((tuple(b1), tuple(nb), body * 0.55, head * 0.8))
    hc = nb + Vector((-head * 0.3, 0, head * 0.4))
    segs.append((tuple(nb), tuple(hc), head * 0.8, head))
    tail_end = b0 - fwd * tail
    segs.append((tuple(b0), tuple(tail_end), (body * 0.5, body * 0.25), (body * 0.35, 0.02)))
    bd = meta_body(segs, m, res=0.015, name='bird', smooth_iter=4)
    # beak
    if beak_m not in MATS:
        MATS[beak_m] = br.plain(beak_m, (0.95, 0.75, 0.15) if beak_m == 'beak_y' else (0.15, 0.13, 0.12), 0.35, clearcoat=0.5)
    bb = hc + Vector((-head * 0.85, 0, -head * 0.05))
    if hooked:
        tube([tuple(bb), tuple(bb + Vector((-beak * 0.7, 0, 0.0))), tuple(bb + Vector((-beak, 0, -beak * 0.45)))], head * 0.28, beak_m, r_end=head * 0.05)
    else:
        rod(tuple(bb), tuple(bb + Vector((-beak, 0, -beak * 0.12))), head * 0.3, beak_m, r2=0.004, v=16, bev=0)
    for s in (1, -1):
        eye((hc.x - head * 0.55, s * head * 0.6, hc.z + head * 0.15), head * 0.2, iris)
        wing(tuple(b1 + Vector((0.0, s * body * 0.74, -body * 0.05))), wing_len, body * 0.45, m, tuple(-fwd + Vector((0, 0, -0.25))), droop=0.0, open_=wing_open, side=s)
    # legs
    if legH > 0.02:
        if leg_m not in MATS:
            MATS[leg_m] = br.plain(leg_m, (0.95, 0.75, 0.15), 0.5)
        for s in (1, -1):
            a = 0.35 * STRIDE * s if walk else 0.0
            top = (b0.x * 0.3 + b1.x * 0.7 + 0.05, s * body * 0.35, zb - body * 0.5)
            pts = swing([top, (top[0] + 0.03, top[1], legH * 0.55), (top[0], top[1], 0.03)], top, a)
            rod(pts[0], pts[1], legH * 0.05 + 0.012, leg_m, v=10)
            rod(pts[1], pts[2], legH * 0.04 + 0.01, leg_m, v=10)
            f = pts[2]
            for k in (-0.5, 0, 0.5):
                rod(f, (f[0] - 0.12 * math.cos(k), f[1] + 0.12 * math.sin(k), 0.01), 0.014, leg_m, r2=0.004, v=8, bev=0)
            rod(f, (f[0] + 0.07, f[1], 0.01), 0.012, leg_m, r2=0.004, v=8, bev=0)
    return hc


@piece
def an_eagle():
    m = feathers('eagle', (0.35, 0.22, 0.12), dark=(0.2, 0.12, 0.07))
    hm = feathers('eagle_head', (0.75, 0.55, 0.3))
    hc = bird(m, body=0.3, neck=0.12, head=0.12, beak=0.13, hooked=True, legH=0.25, upright=0.55, wing_len=0.62, tail=0.32, walk=False, wing_open=0.35)
    sph((hc.x, 0, hc.z), 0.13, hm)
    crown((hc.x + 0.02, 0, hc.z + 0.16), 1.0)


@piece
def an_falcon():
    m = feathers('falcon', (0.35, 0.38, 0.45), belly=((0.92, 0.9, 0.85), 0.55))
    hc = bird(m, body=0.24, neck=0.08, head=0.1, beak=0.08, hooked=True, legH=0.22, upright=0.6, wing_len=0.55, tail=0.28, walk=False)
    sph((hc.x - 0.03, 0, hc.z - 0.02), 0.1, feathers('falcon_hood', (0.12, 0.12, 0.15)), scale=(1.0, 1.05, 0.8))


@piece
def an_penguin():
    blk = feathers('penguin', (0.08, 0.08, 0.1))
    wht = feathers('penguin_w', (0.97, 0.96, 0.93))
    MATS.setdefault('beak_dark', br.plain('beak_dark', (0.12, 0.11, 0.1), 0.35, clearcoat=0.5))
    meta_body([((0.05, 0, 0.25), (0.0, 0, 0.75), (0.28, 0.28), (0.25, 0.25)), ((0.0, 0, 0.75), (-0.02, 0, 1.12), (0.25, 0.25), (0.16, 0.16))], blk, res=0.015, name='penguin')
    sph((-0.09, 0, 0.6), 0.27, wht, scale=(0.7, 0.85, 1.35))
    for s_ in (1, -1):
        sph((-0.12, s_ * 0.1, 1.02), 0.06, feathers('penguin_y', (0.98, 0.72, 0.2)), scale=(0.6, 0.5, 1.3))
        eye((-0.14, s_ * 0.08, 1.12), 0.022, (0.15, 0.1, 0.08))
        a = 0.3 * STRIDE * s_
        o = sph((0.02, s_ * 0.28, 0.65), 0.2, blk, scale=(0.35, 0.12, 1.3), rot=(0.25 * s_, -0.2, 0))
        f = swing([(0.0, s_ * 0.12, 0.1)], (0.0, s_ * 0.12, 0.25), a)[0]
        sph((f[0] - 0.08, f[1], 0.03), 0.07, 'beak_o' if 'beak_o' in MATS else 'iris', scale=(1.6, 1.0, 0.35))
    rod((-0.16, 0, 1.08), (-0.34, 0, 1.04), 0.035, 'beak_dark', r2=0.006, v=12, bev=0)
    MATS.setdefault('beak_o', br.plain('beak_o', (0.98, 0.55, 0.1), 0.4, clearcoat=0.5))


@piece
def an_flamingo():
    m = feathers('flamingo', (0.97, 0.55, 0.55))
    bird(m, body=0.26, neck=0.55, head=0.1, beak=0.12, beak_m='beak_dark', leg_m='flamingo_leg', legH=0.95, upright=0.1,
         wing_len=0.4, tail=0.15, neck_bend=0.15)
    MATS['flamingo_leg'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*br.lin((0.9, 0.45, 0.45)), 1)


@piece
def an_owl():
    m = feathers('owl', (0.62, 0.48, 0.32), pattern='spots', dark=(0.3, 0.2, 0.12), scale=2.0)
    hc = bird(m, body=0.3, neck=0.02, head=0.2, beak=0.04, hooked=True, beak_m='beak_dark', leg_m='owl', legH=0.15, upright=0.95,
              wing_len=0.45, tail=0.15, iris=(0.98, 0.7, 0.05), walk=False)
    sph((hc.x - 0.12, 0, hc.z), 0.2, feathers('owl_face', (0.9, 0.82, 0.68)), scale=(0.35, 1.0, 0.95))
    for s in (1, -1):
        eye((hc.x - 0.2, s * 0.08, hc.z + 0.02), 0.045, (0.98, 0.7, 0.05))
        cyl((hc.x + 0.02, s * 0.12, hc.z + 0.2), 0.04, 0.12, m, r2=0.004, v=12, rot=(0.3 * s, 0, 0))


@piece
def an_chick():
    m = coat('chick', (0.98, 0.85, 0.3))
    o = sph((0, 0, 0.42), 0.32, m, scale=(1.1, 1.0, 0.95))
    h = sph((-0.28, 0, 0.75), 0.2, m)
    fur(o, 'chick', length=0.05, count=8000, comb=(0.3, 0, 0.2), rough=0.01)
    fur(h, 'chick', length=0.04, count=4000, comb=(0.3, 0, 0.3), rough=0.01)
    MATS['beak_o'] = br.plain('beak_o', (0.98, 0.55, 0.1), 0.4, clearcoat=0.5)
    rod((-0.45, 0, 0.73), (-0.57, 0, 0.71), 0.045, 'beak_o', r2=0.004, v=12, bev=0)
    for s in (1, -1):
        eye((-0.42, s * 0.09, 0.8), 0.035, (0.1, 0.07, 0.05))
        a = 0.35 * STRIDE * s
        pts = swing([(0.0, s * 0.12, 0.2), (0.0, s * 0.12, 0.02)], (0.0, s * 0.12, 0.2), a)
        rod(pts[0], pts[1], 0.02, 'beak_o', v=8)
        for k in (-0.5, 0, 0.5):
            rod(pts[1], (pts[1][0] - 0.09 * math.cos(k), pts[1][1] + 0.09 * math.sin(k), 0.01), 0.012, 'beak_o', r2=0.003, v=6, bev=0)


# ============================================================ marine animals
def fish_body(m, L, R, H, zc=0.6, tail_h=0.35, tail_m=None, flat=1.0):
    secs = []
    for i in range(14):
        t = i / 13
        r = R * (math.sin(math.pi * min(1.0, t * 1.15 + 0.03)) ** 0.75) * (1 - 0.6 * t) + 0.01
        h = H * (math.sin(math.pi * min(1.0, t * 1.1 + 0.03)) ** 0.7) * (1 - 0.55 * t) + 0.01
        secs.append((-L / 2 + L * t, r * flat, h, zc))
    loft(secs, m, ring=32, subsurf=2)


def fin(pts, m, loc, rot, th=0.02):
    o = plate(pts, th, m, bev=0.006)
    o.location = loc
    o.rotation_euler = rot
    s = o.modifiers.new('ss', 'SUBSURF'); s.levels = 1; s.render_levels = 2
    return o


def whale(m, L=2.0, R=0.3, H=0.32, zc=0.55, fluke=0.5, flipper=0.4, dorsal=0.12, iris=(0.12, 0.1, 0.08), belly_m=None):
    fish_body(m, L, R, H, zc)
    tx = L / 2
    for s in (1, -1):
        fin([(0, 0), (fluke * 0.5, s * fluke * 0.15), (fluke * 0.75, s * fluke), (fluke * 0.35, s * fluke * 0.8), (0, s * 0.05)][::s or 1],
            m, (tx - 0.05, 0, zc), (0, 0.15, 0), 0.03)
        fin([(0, 0), (flipper * 0.3, s * flipper), (flipper * 0.55, s * flipper * 0.95), (flipper * 0.3, 0)], m,
            (-L * 0.2, s * R * 0.6, zc - H * 0.5), (0, 0.3, 0.4 * s), 0.03)
        eye((-L * 0.36, s * R * 0.72, zc - H * 0.1), 0.03, iris)
    if dorsal:
        fin([(0, 0), (dorsal * 1.6, 0), (dorsal * 1.4, dorsal), (dorsal * 0.6, dorsal * 1.3)], m, (L * 0.05, 0, zc + H * 0.78),
            (math.pi / 2, 0, 0), 0.03)
    return zc


@piece
def an_bluewhale():
    m = skinny('bluewhale', (0.38, 0.45, 0.55), wrinkle=0.0, rough=0.35, coat_=0.5, pattern='blotch', dark=(0.3, 0.37, 0.46), belly=((0.6, 0.65, 0.7), 0.4))
    zc = whale(m, L=2.6, R=0.3, H=0.3, fluke=0.55, flipper=0.4, dorsal=0.05)
    crown((-1.05, 0, zc + 0.3), 1.3)


@piece
def an_orca():
    m = skinny('orca', (0.04, 0.04, 0.05), wrinkle=0.0, rough=0.25, coat_=0.8, belly=((0.95, 0.95, 0.95), 0.42))
    zc = whale(m, L=2.0, R=0.3, H=0.33, fluke=0.45, flipper=0.35, dorsal=0.28)
    for s in (1, -1):
        sph((-0.58, s * 0.24, zc + 0.08), 0.12, 'white_plastic', scale=(1.6, 0.25, 0.6))


@piece
def an_sperm():
    m = skinny('sperm', (0.25, 0.24, 0.24), wrinkle=0.5, rough=0.5)
    fish_body(m, 2.2, 0.38, 0.4, 0.6)
    sph((-0.75, 0, 0.62), 0.45, m, scale=(1.4, 0.85, 0.9))
    for s in (1, -1):
        fin([(0, 0), (0.25, s * 0.08), (0.42, s * 0.55), (0.18, s * 0.42), (0, s * 0.05)], m, (1.05, 0, 0.6), (0, 0.15, 0), 0.03)
        eye((-0.55, s * 0.36, 0.5), 0.03)
    rod((-1.05, 0, 0.32), (-0.4, 0, 0.3), 0.06, m, v=16)


@piece
def an_narwhal():
    m = skinny('narwhal', (0.75, 0.75, 0.72), wrinkle=0.0, rough=0.4, pattern='spots', dark=(0.3, 0.32, 0.33), coat_=0.4)
    zc = whale(m, L=1.6, R=0.27, H=0.27, fluke=0.4, flipper=0.25, dorsal=0.0)
    tusk = tube([(-0.85, 0, zc), (-1.4, 0, zc + 0.05), (-2.1, 0, zc + 0.12)], 0.04, 'ivory', r_end=0.008)
    for i in range(10):
        torus((-0.95 - i * 0.11, 0, zc + 0.02 + i * 0.01), 0.04 - i * 0.003, 0.006, 'ivory', rot=(0, math.pi / 2, 0))


@piece
def an_dolphin():
    m = skinny('dolphin', (0.45, 0.5, 0.55), wrinkle=0.0, rough=0.25, coat_=0.8, belly=((0.88, 0.88, 0.9), 0.42))
    zc = whale(m, L=1.7, R=0.22, H=0.24, fluke=0.35, flipper=0.28, dorsal=0.2)
    rod((-0.85, 0, zc - 0.05), (-1.05, 0, zc - 0.08), 0.06, m, r2=0.04, v=16)


@piece
def an_beluga():
    m = skinny('beluga', (0.93, 0.93, 0.9), wrinkle=0.15, rough=0.35, coat_=0.5)
    zc = whale(m, L=1.6, R=0.3, H=0.3, fluke=0.35, flipper=0.28, dorsal=0.0)
    sph((-0.6, 0, zc + 0.1), 0.24, m, scale=(1.1, 1.0, 0.9))


@piece
def an_humpback():
    m = skinny('humpback', (0.12, 0.12, 0.14), wrinkle=0.3, rough=0.4, belly=((0.85, 0.85, 0.85), 0.4))
    zc = whale(m, L=2.2, R=0.34, H=0.34, fluke=0.6, flipper=0.95, dorsal=0.08)
    for i in range(6):
        sph((-0.95 + i * 0.06, 0.0, zc + 0.3), 0.035, 'stone')
    crown((-0.8, 0, zc + 0.42), 1.3)


def shark(m, L=1.9, R=0.25, H=0.3, zc=0.55, dorsal=0.32, tail=0.55, pect=0.4, iris=(0.05, 0.05, 0.05), gills=True):
    fish_body(m, L, R, H, zc)
    tx = L / 2
    fin([(0, 0), (tail * 0.6, tail * 1.0), (tail * 0.75, tail * 0.95), (tail * 0.4, 0.0), (tail * 0.55, -tail * 0.5), (tail * 0.3, -tail * 0.45)], m,
        (tx - 0.08, 0, zc), (math.pi / 2, 0, 0), 0.03)
    fin([(0, 0), (dorsal * 1.3, 0), (dorsal * 1.2, dorsal * 0.2), (dorsal * 0.55, dorsal)], m, (-L * 0.05, 0, zc + H * 0.8), (math.pi / 2, 0, 0), 0.03)
    for s in (1, -1):
        fin([(0, 0), (pect * 0.5, 0), (pect * 0.9, s * pect), (pect * 0.4, s * pect * 0.7)], m, (-L * 0.15, s * R * 0.7, zc - H * 0.45), (0, 0.2, 0.0), 0.025)
        eye((-L * 0.38, s * R * 0.62, zc + H * 0.1), 0.025, iris)
        if gills:
            for k in range(5):
                box((-L * 0.27 + k * 0.035, s * R * 0.83, zc - 0.02), (0.008, 0.01, H * 0.5), 'iris', bev=0)


@piece
def an_whaleshark():
    m = skinny('wshark', (0.22, 0.3, 0.38), wrinkle=0.0, rough=0.35, pattern='spots', dark=(0.9, 0.92, 0.95), belly=((0.85, 0.85, 0.85), 0.42), scale=0.9)
    shark(m, L=2.6, R=0.36, H=0.33, dorsal=0.3, tail=0.7, pect=0.55)
    crown((-0.7, 0, 1.05), 1.3)


@piece
def an_gwshark():
    m = skinny('gwshark', (0.42, 0.45, 0.5), wrinkle=0.0, rough=0.3, coat_=0.4, belly=((0.95, 0.95, 0.95), 0.48))
    shark(m, L=2.0, R=0.3, H=0.33, dorsal=0.38, tail=0.6, pect=0.45)
    tw = br.plain('teeth', (0.97, 0.96, 0.9), 0.3); MATS['teeth'] = tw
    for k in range(9):
        cyl((-0.86 + k * 0.025, 0.12 - k * 0.012, 0.47), 0.012, 0.04, 'teeth', r2=0.001, v=6, rot=(math.pi, 0, 0), bev=0)


@piece
def an_hammerhead():
    m = skinny('hammer', (0.5, 0.5, 0.45), wrinkle=0.0, rough=0.3, belly=((0.92, 0.92, 0.9), 0.45))
    shark(m, L=1.9, R=0.24, H=0.28, dorsal=0.45, tail=0.55, pect=0.4, gills=True)
    sph((-0.98, 0, 0.56), 0.4, m, scale=(0.25, 1.0, 0.1))
    for s in (1, -1):
        eye((-0.98, s * 0.4, 0.57), 0.025)


@piece
def an_sawfish():
    m = skinny('sawfish', (0.55, 0.5, 0.4), wrinkle=0.0, rough=0.45, belly=((0.9, 0.88, 0.82), 0.45))
    shark(m, L=1.8, R=0.32, H=0.22, dorsal=0.25, tail=0.45, pect=0.55, gills=False)
    box((-1.4, 0, 0.53), (0.9, 0.13, 0.03), m, bev=0.01, taper=(1.0, 0.8))
    for k in range(14):
        for s in (1, -1):
            cyl((-1.82 + k * 0.06, s * 0.075, 0.53), 0.008, 0.06, 'teeth' if 'teeth' in MATS else 'bone', r2=0.001, v=6, rot=(math.pi / 2 * s, 0, 0), bev=0)


@piece
def an_manta():
    m = skinny('manta', (0.1, 0.1, 0.12), wrinkle=0.0, rough=0.4, coat_=0.3, belly=((0.95, 0.95, 0.95), 0.0, 0.62))
    segs = [((0.35, 0, 0.7), (-0.35, 0, 0.7), (0.3, 0.13), (0.32, 0.14))]
    for s_ in (1, -1):
        segs.append(((0.0, s_ * 0.2, 0.7), (0.25, s_ * 1.25, 0.82), (0.32, 0.1), (0.04, 0.02)))
    meta_body(segs, m, res=0.025, name='manta', smooth_iter=6)
    for s_ in (1, -1):
        cyl((-0.42, s_ * 0.2, 0.7), 0.05, 0.25, m, rot=(0, math.pi / 2 - 0.25, 0), r2=0.02, v=12)
        eye((-0.36, s_ * 0.32, 0.74), 0.028)
    rod((0.35, 0, 0.7), (1.25, 0, 0.75), 0.02, m, r2=0.004, v=8, bev=0)


@piece
def an_dogfish():
    m = skinny('dogfish', (0.45, 0.45, 0.42), wrinkle=0.0, rough=0.35, pattern='spots', dark=(0.85, 0.85, 0.82), belly=((0.9, 0.9, 0.88), 0.45), scale=1.4)
    shark(m, L=1.4, R=0.15, H=0.16, dorsal=0.18, tail=0.35, pect=0.22)


@piece
def an_turtle():
    sh = skinny('shell', (0.35, 0.3, 0.18), wrinkle=0.0, rough=0.35, pattern='blotch', dark=(0.18, 0.14, 0.08), coat_=0.6)
    sk = skinny('tskin', (0.45, 0.42, 0.32), wrinkle=0.6, rough=0.6, pattern='spots', dark=(0.25, 0.22, 0.15))
    sph((0, 0, 0.45), 0.6, sh, scale=(1.2, 0.95, 0.38))
    sph((0, 0, 0.38), 0.58, skinny('plastron', (0.85, 0.78, 0.55), wrinkle=0.0), scale=(1.15, 0.9, 0.18))
    sph((-0.8, 0, 0.45), 0.16, sk, scale=(1.3, 1.0, 0.9))
    for s in (1, -1):
        eye((-0.95, s * 0.1, 0.5), 0.025)
        a = 0.35 * STRIDE * s
        fin([(0, 0), (0.3, s * 0.15), (0.55, s * 0.9), (0.18, s * 0.8)], sk, (-0.35, s * 0.45, 0.35), (0, 0.2, -0.5 * s + a), 0.06)
        fin([(0, 0), (0.35, s * 0.08), (0.42, s * 0.42), (0.08, s * 0.35)], sk, (0.55, s * 0.4, 0.33), (0, 0.1, 0.3 * s - a), 0.06)


@piece
def an_crab():
    sh = skinny('crab', (0.82, 0.3, 0.15), wrinkle=0.3, rough=0.35, coat_=0.6, belly=((0.95, 0.8, 0.6), 0.4))
    sph((0, 0, 0.42), 0.45, sh, scale=(0.75, 1.0, 0.4))
    for s in (1, -1):
        for k in range(4):
            a = 0.25 * STRIDE * (1 if k % 2 else -1) * s
            x = -0.15 + k * 0.13 + a * 0.3
            p0 = (x, s * 0.38, 0.4)
            p1 = (x + 0.05, s * 0.75, 0.48)
            p2 = (x + 0.1, s * 0.95, 0.02)
            rod(p0, p1, 0.04, sh, v=12); rod(p1, p2, 0.032, sh, r2=0.008, v=12)
        c0 = (-0.3, s * 0.3, 0.45); c1 = (-0.55, s * 0.5, 0.5)
        rod(c0, c1, 0.05, sh, v=12)
        sph((-0.68, s * 0.52, 0.52), 0.12, sh, scale=(1.4, 0.8, 0.9))
        cyl((-0.85, s * 0.5, 0.56), 0.04, 0.14, sh, r2=0.006, rot=(0, math.pi / 2 + 0.3, 0), v=12)
        cyl((-0.83, s * 0.53, 0.47), 0.035, 0.12, sh, r2=0.006, rot=(0, math.pi / 2 - 0.3, 0), v=12)
        rod((-0.25, s * 0.08, 0.55), (-0.3, s * 0.1, 0.68), 0.012, sh, v=8)
        eye((-0.3, s * 0.1, 0.7), 0.03, (0.1, 0.1, 0.1))


@piece
def an_clownfish():
    m = skinny('clown', (0.98, 0.45, 0.08), wrinkle=0.0, rough=0.3, coat_=0.7)
    fish_body(m, 1.0, 0.18, 0.32, 0.6, flat=1.0)
    for x in (-0.25, 0.05, 0.32):
        sph((x, 0, 0.6), 0.3 - abs(x) * 0.35, skinny('clown_w', (0.98, 0.98, 0.96), wrinkle=0.0, coat_=0.7), scale=(0.12, 0.62, 1.05))
    for s in (1, -1):
        eye((-0.36, s * 0.13, 0.65), 0.04, (0.6, 0.3, 0.05))
        fin([(0, 0), (0.18, 0.0), (0.2, s * 0.2), (0.05, s * 0.18)], m, (-0.15, s * 0.13, 0.5), (0, 0.4, 0), 0.015)
    fin([(0, 0), (0.25, 0.25), (0.32, 0.0), (0.25, -0.25)], m, (0.45, 0, 0.6), (math.pi / 2, 0, 0), 0.02)
    fin([(0, 0), (0.5, 0.0), (0.45, 0.12), (0.1, 0.16)], m, (-0.2, 0, 0.88), (math.pi / 2, 0, 0), 0.015)
