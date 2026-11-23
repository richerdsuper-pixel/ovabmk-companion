"""Реалистичные фигурки «Шахмат царств» в Blender (bpy, Cycles).

Запуск:  python3 -m venv bl && bl/bin/pip install bpy==5.3.0
         ONLY=tank,modern_soldier bl/bin/python tools/blender_real.py <папка>
Каждая фигура — PNG 512×512 с прозрачным фоном и мягкой тенью; смотрит влево.

Отличие от игрушечных моделей (blender_army.py):
* тела людей и животных строятся по «скелету» модификатором Skin — с суставами и
  нормальными пропорциями, а не из капсул;
* материалы процедурные: ткань с переплетением, кожа с подповерхностным рассеянием,
  крашеный металл с потёртостями на рёбрах и грязью в углублениях, камуфляж,
  дерево с волокнами, камень, мех и волосы частицами;
* студийный свет (ключевой, заполняющий, контровой) и AgX-цветокоррекция.
"""
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

OUT = os.path.abspath(sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'docs/chess/units')
os.makedirs(OUT, exist_ok=True)
SAMPLES = int(os.environ.get('SAMPLES', '128'))


# =====================================================================
#  materials
# =====================================================================
MATS = {}


def _new(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    return m, nt.nodes, nt.links, nt.nodes['Principled BSDF']


def _coord(nodes, links, scale=(1, 1, 1)):
    tc = nodes.new('ShaderNodeTexCoord')
    mp = nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = scale
    links.new(tc.outputs['Object'], mp.inputs['Vector'])
    return mp.outputs['Vector']


def _noise(nodes, links, vec, scale, detail=6, rough=0.6):
    n = nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    links.new(vec, n.inputs['Vector'])
    return n


def lin(c):
    """sRGB (as picked on screen) -> linear values Blender expects."""
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c[:3])


def _ramp(nodes, links, src, stops, srgb=True):
    r = nodes.new('ShaderNodeValToRGB')
    el = r.color_ramp.elements
    while len(el) < len(stops):
        el.new(0.5)
    for e, (p, c) in zip(el, stops):
        e.position = p
        c = lin(c) if srgb else c[:3]
        e.color = (*c, 1)
    links.new(src, r.inputs['Fac'])
    return r.outputs['Color']


def _mixc(nodes, links, a, b, fac, blend='MIX'):
    """Colour mix that always uses the RGBA sockets of ShaderNodeMix."""
    mx = nodes.new('ShaderNodeMix')
    mx.data_type = 'RGBA'
    mx.blend_type = blend
    fa, A, B = mx.inputs[0], mx.inputs[6], mx.inputs[7]
    for x, sock in ((fac, fa), (a, A), (b, B)):
        if isinstance(x, (int, float)):
            sock.default_value = x
        elif isinstance(x, tuple):
            sock.default_value = (*lin(x), 1)
        else:
            links.new(x, sock)
    return mx.outputs[2]


def _bump(nodes, links, bsdf, height, strength=0.3, dist=0.02):
    b = nodes.new('ShaderNodeBump')
    b.inputs['Strength'].default_value = strength
    b.inputs['Distance'].default_value = dist
    links.new(height, b.inputs['Height'])
    links.new(b.outputs['Normal'], bsdf.inputs['Normal'])
    return b


def _ao(nodes, links):
    """Cavity/grime factor: 0 in crevices, 1 on open surfaces."""
    ao = nodes.new('ShaderNodeAmbientOcclusion')
    ao.samples = 8
    ao.inputs['Distance'].default_value = 0.12
    return ao.outputs['AO']


def _vary(rgb, k):
    return tuple(max(0.0, min(1.0, c * k)) for c in rgb)


def fabric(name, rgb, rough=0.88, weave=260, sheen=0.4):
    m, n, l, b = _new(name)
    v = _coord(n, l)
    blot = _noise(n, l, v, 7, 4)
    col = _ramp(n, l, blot.outputs['Fac'], [(0.3, _vary(rgb, 0.78)), (0.7, _vary(rgb, 1.12))])
    ao = _ao(n, l)
    inv = n.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
    l.new(ao, inv.inputs[1])
    col2 = _mixc(n, l, col, _vary(rgb, 0.35), inv.outputs[0])
    l.new(col2, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Sheen Weight'].default_value = sheen
    w1 = n.new('ShaderNodeTexWave'); w1.inputs['Scale'].default_value = weave; w1.wave_profile = 'SIN'
    w1.inputs['Distortion'].default_value = 0.4
    l.new(v, w1.inputs['Vector'])
    w2 = n.new('ShaderNodeTexWave'); w2.inputs['Scale'].default_value = weave; w2.bands_direction = 'Y'
    l.new(v, w2.inputs['Vector'])
    add = n.new('ShaderNodeMath'); add.operation = 'ADD'
    l.new(w1.outputs['Fac'], add.inputs[0]); l.new(w2.outputs['Fac'], add.inputs[1])
    wr = _noise(n, l, v, 18, 3)
    add2 = n.new('ShaderNodeMath'); add2.operation = 'MULTIPLY_ADD'
    l.new(wr.outputs['Fac'], add2.inputs[0]); add2.inputs[1].default_value = 3.0
    l.new(add.outputs[0], add2.inputs[2])
    _bump(n, l, b, add2.outputs[0], 0.12, 0.01)
    return m


def skin_mat(name, rgb=(0.72, 0.47, 0.34)):
    m, n, l, b = _new(name)
    v = _coord(n, l)
    blot = _noise(n, l, v, 25, 6)
    col = _ramp(n, l, blot.outputs['Fac'], [(0.35, _vary(rgb, 0.9)), (0.7, (rgb[0] * 1.08, rgb[1] * 0.95, rgb[2] * 0.95))])
    l.new(col, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.48
    b.inputs['Subsurface Weight'].default_value = 0.25
    b.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.18)
    b.inputs['Subsurface Scale'].default_value = 0.03
    pores = _noise(n, l, v, 220, 2)
    _bump(n, l, b, pores.outputs['Fac'], 0.05, 0.005)
    return m


def painted(name, rgb, camo=None, wear=0.55, mud=0.0, rough=0.62, metal_under=(0.35, 0.35, 0.33)):
    """Painted steel: optional camouflage, worn edges, grime in crevices, mud low down."""
    m, n, l, b = _new(name)
    v = _coord(n, l)
    if camo:
        cn = _noise(n, l, _coord(n, l, (1, 1, 1.6)), 2.2, 3, 0.45)
        cn2 = _noise(n, l, v, 3.1, 2, 0.5)
        stops = [(0.0, camo[0]), (0.44, camo[0]), (0.45, camo[1]), (0.58, camo[1]), (0.59, camo[2]), (1.0, camo[2])]
        col = _ramp(n, l, cn.outputs['Fac'], stops[:2] + stops[2:])
        col = _mixc(n, l, col, camo[3] if len(camo) > 3 else camo[0],
                    _ramp(n, l, cn2.outputs['Fac'], [(0.62, (0, 0, 0)), (0.63, (1, 1, 1))]))
    else:
        blot = _noise(n, l, v, 5, 5)
        col = _ramp(n, l, blot.outputs['Fac'], [(0.35, _vary(rgb, 0.85)), (0.65, _vary(rgb, 1.1))])
    # fine streaks of dirt
    streak = _noise(n, l, _coord(n, l, (6, 6, 0.8)), 6, 6)
    col = _mixc(n, l, col, (0.12, 0.1, 0.07), _ramp(n, l, streak.outputs['Fac'], [(0.55, (0, 0, 0)), (0.8, (0.35, 0.35, 0.35))]))
    # grime in crevices
    ao = _ao(n, l)
    inv = n.new('ShaderNodeMath'); inv.operation = 'POWER'; inv.inputs[1].default_value = 3.0
    l.new(ao, inv.inputs[0])
    cav = n.new('ShaderNodeMath'); cav.operation = 'SUBTRACT'; cav.inputs[0].default_value = 1.0
    l.new(inv.outputs[0], cav.inputs[1])
    col = _mixc(n, l, col, (0.05, 0.045, 0.035), cav.outputs[0])
    if mud:
        sep = n.new('ShaderNodeSeparateXYZ')
        l.new(v, sep.inputs[0])
        mn = _noise(n, l, v, 9, 6)
        h = n.new('ShaderNodeMath'); h.operation = 'MULTIPLY_ADD'
        l.new(mn.outputs['Fac'], h.inputs[0]); h.inputs[1].default_value = 0.25
        l.new(sep.outputs['Z'], h.inputs[2])
        mf = _ramp(n, l, h.outputs[0], [(mud - 0.05, (1, 1, 1)), (mud + 0.12, (0, 0, 0))])
        col = _mixc(n, l, col, (0.2, 0.14, 0.08), mf)
    # worn edges -> bare metal
    geo = n.new('ShaderNodeNewGeometry')
    en = _noise(n, l, v, 40, 4)
    p4 = n.new('ShaderNodeMath'); p4.operation = 'MULTIPLY_ADD'
    l.new(geo.outputs['Pointiness'], p4.inputs[0]); p4.inputs[1].default_value = 5.0; p4.inputs[2].default_value = -2.5
    e = n.new('ShaderNodeMath'); e.operation = 'MULTIPLY_ADD'
    l.new(en.outputs['Fac'], e.inputs[0]); e.inputs[1].default_value = 0.5
    l.new(p4.outputs[0], e.inputs[2])
    t0 = 0.62 + (1 - wear) * 0.3
    ef = _ramp(n, l, e.outputs[0], [(t0, (0, 0, 0)), (min(1.0, t0 + 0.06), (1, 1, 1))])
    col = _mixc(n, l, col, metal_under, ef)
    l.new(col, b.inputs['Base Color'])
    sp = n.new('ShaderNodeSeparateColor'); l.new(ef, sp.inputs[0])
    l.new(sp.outputs[0], b.inputs['Metallic'])
    rn = _noise(n, l, v, 14, 4)
    rr = _ramp(n, l, rn.outputs['Fac'], [(0.3, (rough - 0.12,) * 3), (0.7, (rough + 0.12,) * 3)], srgb=False)
    l.new(rr, b.inputs['Roughness'])
    cast = _noise(n, l, v, 60, 8)
    _bump(n, l, b, cast.outputs['Fac'], 0.08, 0.01)
    return m


def metal(name, rgb, rough=0.3, scratches=True):
    m, n, l, b = _new(name)
    v = _coord(n, l)
    b.inputs['Base Color'].default_value = (*lin(rgb), 1)
    b.inputs['Metallic'].default_value = 1.0
    rn = _noise(n, l, v, 9, 6)
    rr = _ramp(n, l, rn.outputs['Fac'], [(0.3, (rough * 0.6,) * 3), (0.75, (rough * 1.5,) * 3)], srgb=False)
    l.new(rr, b.inputs['Roughness'])
    if scratches:
        sc = _noise(n, l, _coord(n, l, (1, 1, 30)), 25, 2)
        _bump(n, l, b, sc.outputs['Fac'], 0.06, 0.005)
    return m


def wood(name, rgb=(0.36, 0.2, 0.09)):
    m, n, l, b = _new(name)
    v = _coord(n, l, (1, 1, 0.15))
    w = n.new('ShaderNodeTexWave'); w.wave_type = 'RINGS'; w.inputs['Scale'].default_value = 9
    w.inputs['Distortion'].default_value = 6; w.inputs['Detail'].default_value = 4
    l.new(v, w.inputs['Vector'])
    col = _ramp(n, l, w.outputs['Fac'], [(0.2, _vary(rgb, 0.6)), (0.8, _vary(rgb, 1.25))])
    l.new(col, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.62
    _bump(n, l, b, w.outputs['Fac'], 0.15, 0.01)
    return m


def stone(name, rgb=(0.45, 0.43, 0.4), scale=6):
    m, n, l, b = _new(name)
    v = _coord(n, l)
    vo = n.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = scale
    l.new(v, vo.inputs['Vector'])
    nz = _noise(n, l, v, 30, 8)
    col = _ramp(n, l, nz.outputs['Fac'], [(0.3, _vary(rgb, 0.7)), (0.7, _vary(rgb, 1.2))])
    l.new(col, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.85
    add = n.new('ShaderNodeMath'); add.operation = 'MULTIPLY_ADD'
    l.new(vo.outputs['Distance'], add.inputs[0]); add.inputs[1].default_value = 1.5
    l.new(nz.outputs['Fac'], add.inputs[2])
    _bump(n, l, b, add.outputs[0], 0.5, 0.03)
    return m


def plain(name, rgb, rough=0.5, metal_=0.0, clearcoat=0.0, emission=None, transmission=0.0, sss=0.0):
    m, n, l, b = _new(name)
    b.inputs['Base Color'].default_value = (*lin(rgb), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal_
    b.inputs['Coat Weight'].default_value = clearcoat
    b.inputs['Transmission Weight'].default_value = transmission
    if sss:
        b.inputs['Subsurface Weight'].default_value = sss
        b.inputs['Subsurface Radius'].default_value = (1, 0.5, 0.3)
        b.inputs['Subsurface Scale'].default_value = 0.05
    if emission:
        b.inputs['Emission Color'].default_value = (*lin(emission[0]), 1)
        b.inputs['Emission Strength'].default_value = emission[1]
    return m


def hair_mat(name, rgb, rough=0.35):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    out = nt.nodes['Material Output']
    for nd in list(nt.nodes):
        if nd.type == 'BSDF_PRINCIPLED':
            nt.nodes.remove(nd)
    h = nt.nodes.new('ShaderNodeBsdfHairPrincipled')
    h.parametrization = 'COLOR'
    h.inputs['Color'].default_value = (*lin(rgb), 1)
    h.inputs['Roughness'].default_value = rough
    h.inputs['Radial Roughness'].default_value = 0.6
    h.inputs['Coat'].default_value = 0.15
    nt.links.new(h.outputs[0], out.inputs['Surface'])
    return m


def build_materials():
    MATS.clear()
    MATS['skin'] = skin_mat('skin')
    MATS['skin_dark'] = skin_mat('skin_dark', (0.45, 0.28, 0.18))
    MATS['olive'] = fabric('olive', (0.17, 0.2, 0.1))
    MATS['olive2'] = fabric('olive2', (0.12, 0.14, 0.08))
    MATS['khaki'] = fabric('khaki', (0.42, 0.37, 0.24))
    MATS['greatcoat'] = fabric('greatcoat', (0.3, 0.28, 0.2), weave=180)
    MATS['red_cloth'] = fabric('red_cloth', (0.45, 0.04, 0.03))
    MATS['blue_cloth'] = fabric('blue_cloth', (0.05, 0.1, 0.32))
    MATS['white_cloth'] = fabric('white_cloth', (0.75, 0.73, 0.68))
    MATS['linen'] = fabric('linen', (0.62, 0.55, 0.42), weave=140)
    MATS['black_cloth'] = fabric('black_cloth', (0.03, 0.03, 0.035))
    MATS['multicam'] = painted('multicam', (0.3, 0.3, 0.2), camo=[(0.32, 0.3, 0.2), (0.2, 0.22, 0.12), (0.1, 0.09, 0.06), (0.42, 0.38, 0.26)], wear=0.0, rough=0.85)
    MATS['leather'] = plain('leather', (0.16, 0.08, 0.04), 0.55)
    MATS['boot'] = plain('boot', (0.04, 0.035, 0.03), 0.42, clearcoat=0.3)
    MATS['tan_leather'] = plain('tan_leather', (0.35, 0.2, 0.09), 0.6)
    MATS['hide'] = fabric('hide', (0.33, 0.22, 0.12), rough=0.9, weave=40, sheen=0.8)
    MATS['tank'] = painted('tank', (0.2, 0.23, 0.12), camo=[(0.2, 0.23, 0.12), (0.12, 0.13, 0.07), (0.06, 0.06, 0.05), (0.33, 0.3, 0.18)], mud=0.45)
    MATS['tank_plain'] = painted('tank_plain', (0.18, 0.21, 0.11), mud=0.4)
    MATS['grey_paint'] = painted('grey_paint', (0.32, 0.35, 0.37), wear=0.35, rough=0.5)
    MATS['dark_paint'] = painted('dark_paint', (0.08, 0.085, 0.08), wear=0.5)
    MATS['loco'] = painted('loco', (0.04, 0.045, 0.05), wear=0.7, rough=0.4)
    MATS['rubber'] = plain('rubber', (0.025, 0.025, 0.025), 0.75)
    MATS['steel'] = metal('steel', (0.55, 0.56, 0.58), 0.28)
    MATS['gunmetal'] = metal('gunmetal', (0.12, 0.12, 0.13), 0.38)
    MATS['iron'] = metal('iron', (0.36, 0.35, 0.34), 0.5)
    MATS['brass'] = metal('brass', (0.9, 0.62, 0.3), 0.25)
    MATS['gold'] = metal('gold', (1.0, 0.74, 0.32), 0.18, scratches=False)
    MATS['silver'] = metal('silver', (0.9, 0.9, 0.92), 0.15, scratches=False)
    MATS['ruby'] = plain('ruby', (0.6, 0.0, 0.02), 0.05, transmission=0.6, clearcoat=1)
    MATS['glass'] = plain('glass', (0.6, 0.75, 0.8), 0.04, transmission=1.0)
    MATS['tinted'] = plain('tinted', (0.25, 0.32, 0.3), 0.05, clearcoat=1.0, metal_=0.3)
    MATS['wood'] = wood('wood')
    MATS['dark_wood'] = wood('dark_wood', (0.18, 0.09, 0.04))
    MATS['stone'] = stone('stone')
    MATS['flint'] = stone('flint', (0.25, 0.24, 0.26), 14)
    MATS['bone'] = plain('bone', (0.82, 0.76, 0.62), 0.55, sss=0.2)
    MATS['ivory'] = plain('ivory', (0.9, 0.85, 0.72), 0.35, sss=0.2)
    MATS['eye_white'] = plain('eye_white', (0.85, 0.83, 0.8), 0.15)
    MATS['iris'] = plain('iris', (0.04, 0.025, 0.015), 0.1)
    MATS['lips'] = plain('lips', (0.5, 0.22, 0.2), 0.4, sss=0.3)
    MATS['white_plastic'] = plain('white_plastic', (0.82, 0.84, 0.86), 0.3, clearcoat=0.5)
    MATS['carbon'] = plain('carbon', (0.03, 0.03, 0.035), 0.3, clearcoat=0.6)
    MATS['glow'] = plain('glow', (0.2, 0.8, 1.0), 0.2, emission=((0.15, 0.75, 1.0), 6.0))
    MATS['glow_red'] = plain('glow_red', (1.0, 0.2, 0.05), 0.2, emission=((1.0, 0.25, 0.05), 6.0))
    MATS['flame'] = plain('flame', (1.0, 0.5, 0.1), 0.2, emission=((1.0, 0.45, 0.08), 12.0))
    MATS['canvas'] = fabric('canvas', (0.66, 0.62, 0.52), weave=90)
    MATS['feather_red'] = plain('feather_red', (0.6, 0.05, 0.03), 0.6, sss=0.3)
    MATS['hair_dark'] = hair_mat('hair_dark', (0.06, 0.04, 0.03))
    MATS['hair_brown'] = hair_mat('hair_brown', (0.22, 0.12, 0.06))
    MATS['hair_grey'] = hair_mat('hair_grey', (0.55, 0.52, 0.5))
    MATS['fur_mammoth'] = hair_mat('fur_mammoth', (0.2, 0.09, 0.04), 0.45)
    MATS['fur_horse'] = hair_mat('fur_horse', (0.26, 0.12, 0.05), 0.3)
    MATS['fur_horse2'] = hair_mat('fur_horse2', (0.05, 0.04, 0.035), 0.3)
    MATS['fur_wolf'] = hair_mat('fur_wolf', (0.35, 0.28, 0.2), 0.45)
    MATS['red_paint'] = painted('red_paint', (0.5, 0.04, 0.03), wear=0.3, rough=0.4)
    MATS['star_red'] = plain('star_red', (0.55, 0.02, 0.02), 0.4)


def put(o, mname):
    o.data.materials.clear()
    o.data.materials.append(MATS[mname])
    for p in o.data.polygons:
        p.use_smooth = True
    return o


# =====================================================================
#  geometry helpers
# =====================================================================
def _link(o):
    bpy.context.collection.objects.link(o)
    return o


def _obj(name, mesh):
    return _link(bpy.data.objects.new(name, mesh))


def bevel(o, w=0.012, seg=3, angle=40):
    mod = o.modifiers.new('bev', 'BEVEL')
    mod.width = w
    mod.segments = seg
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle)
    mod.harden_normals = False
    return o


def box(loc, size, m, rot=(0, 0, 0), bev=0.012, taper=None):
    """Hard-surface box: size = full dimensions; taper=(sx, sy) shrinks the top face."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
        if taper and v.co.z > 0:
            v.co.x *= taper[0]; v.co.y *= taper[1]
    me = bpy.data.meshes.new('box'); bm.to_mesh(me); bm.free()
    o = _obj('box', me)
    o.location = loc; o.rotation_euler = rot
    if bev:
        bevel(o, bev)
    return put(o, m)


def hull(points, m, bev=0.015, loc=(0, 0, 0)):
    """Convex hull of the given points — for armour plates, hulls, turrets."""
    bm = bmesh.new()
    for p in points:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts, edges=bm.edges)
    me = bpy.data.meshes.new('hull'); bm.to_mesh(me); bm.free()
    o = _obj('hull', me)
    o.location = loc
    if bev:
        bevel(o, bev)
    put(o, m)
    for p in o.data.polygons:
        p.use_smooth = False
    return o


def cyl(loc, r, h, m, rot=(0, 0, 0), v=32, r2=None, bev=0.006, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=v, radius1=r, radius2=r if r2 is None else r2, depth=h)
    me = bpy.data.meshes.new('cyl'); bm.to_mesh(me); bm.free()
    o = _obj('cyl', me)
    o.location = loc; o.rotation_euler = rot
    if bev and (r2 is None or r2 > 0.001):
        bevel(o, min(bev, r * 0.3, h * 0.3), 2, 50)
    put(o, m)
    if not smooth:
        for p in o.data.polygons:
            p.use_smooth = False
    return o


def sph(loc, r, m, scale=(1, 1, 1), seg=40, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    me = bpy.data.meshes.new('sph'); bm.to_mesh(me); bm.free()
    o = _obj('sph', me)
    o.location = loc; o.scale = scale; o.rotation_euler = rot
    return put(o, m)


def torus(loc, R, r, m, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(location=loc, rotation=rot, major_radius=R, minor_radius=r, major_segments=48, minor_segments=16)
    o = bpy.context.object
    o.scale = scale
    return put(o, m)


def rod(a, b, r, m, r2=None, v=20, bev=0.004):
    a, b = Vector(a), Vector(b)
    d = b - a
    o = cyl((0, 0, 0), r, d.length, m, v=v, r2=r2, bev=bev)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    o.location = (a + b) / 2
    return o


def tube(points, r, m, v=12, r_end=None):
    """Curved tube through points (cables, straps, tails)."""
    cu = bpy.data.curves.new('tube', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = 4
    cu.use_fill_caps = True
    sp = cu.splines.new('NURBS')
    sp.points.add(len(points) - 1)
    for i, p in enumerate(points):
        sp.points[i].co = (*p, 1)
        if r_end is not None:
            sp.points[i].radius = 1 + (r_end / r - 1) * i / (len(points) - 1)
    sp.use_endpoint_u = True
    sp.order_u = min(4, len(points))
    o = _link(bpy.data.objects.new('tube', cu))
    o.data.materials.append(MATS[m])
    return o


def loft(sections, m, ring=32, cap=True, subsurf=1):
    """Smooth body from cross-sections: (x, half-width y, half-height z, z-centre[, squareness])."""
    bm = bmesh.new()
    rings = []
    for sec in sections:
        x, ry, rz, zc = sec[:4]
        sq = sec[4] if len(sec) > 4 else 2.0
        r = []
        for i in range(ring):
            a = 2 * math.pi * i / ring
            c, s = math.cos(a), math.sin(a)
            # superellipse for boxy (sq>2) or round (sq=2) sections
            cy = math.copysign(abs(c) ** (2 / sq), c)
            sz = math.copysign(abs(s) ** (2 / sq), s)
            r.append(bm.verts.new((x, ry * cy, zc + rz * sz)))
        rings.append(r)
    for a, b in zip(rings, rings[1:]):
        for i in range(ring):
            j = (i + 1) % ring
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('loft'); bm.to_mesh(me); bm.free()
    o = _obj('loft', me)
    if subsurf:
        s = o.modifiers.new('s', 'SUBSURF'); s.levels = subsurf; s.render_levels = subsurf
    return put(o, m)


def plate(outline, thick, m, loc=(0, 0, 0), rot=(0, 0, 0), bev=0.004, axis='Z'):
    """Flat plate from a 2D outline (wings, fins, blades, shields)."""
    bm = bmesh.new()
    vs = [bm.verts.new((p[0], p[1], 0)) for p in outline]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    for e in r['geom']:
        if isinstance(e, bmesh.types.BMVert):
            e.co.z += thick
    for v in bm.verts:
        v.co.z -= thick / 2
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('plate'); bm.to_mesh(me); bm.free()
    o = _obj('plate', me)
    if axis == 'Y':
        o.rotation_euler = (math.pi / 2, 0, 0)
    o.location = loc
    if rot != (0, 0, 0):
        o.rotation_euler = rot
    if bev:
        bevel(o, bev, 2, 30)
    put(o, m)
    for p in o.data.polygons:
        p.use_smooth = False
    return o


def skin_body(joints, edges, m, root=0, subsurf=2, name='body'):
    """Organic body from a skeleton: joints = [(co, (rx, ry))], edges = [(i, j)]."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([j[0] for j in joints], edges, [])
    o = _obj(name, me)
    sk = o.modifiers.new('skin', 'SKIN')
    sk.use_smooth_shade = True
    sk.branch_smoothing = 0.6
    data = me.skin_vertices[0].data
    for i, j in enumerate(joints):
        rr = j[1] if isinstance(j[1], tuple) else (j[1], j[1])
        data[i].radius = rr
        data[i].use_root = (i == root)
    ss = o.modifiers.new('ss', 'SUBSURF'); ss.levels = subsurf; ss.render_levels = subsurf
    return put(o, m)


def meta_body(segments, m, res=0.02, name='meta', smooth_iter=6):
    """Organic body from metaballs: segments = [(a, b, ra, rb)], radius r or (ry, rz) half-sizes.

    The chain of balls blends into one smooth surface (calibrated: surface ≈ 0.695 × element radius).
    Returned as a regular mesh so it can take hair and materials."""
    mb = bpy.data.metaballs.new(name)
    mb.resolution = res; mb.render_resolution = res; mb.threshold = 0.6
    o = bpy.data.objects.new(name, mb)
    bpy.context.collection.objects.link(o)
    for a, b, ra, rb in segments:
        a, b = Vector(a), Vector(b)
        ra = ra if isinstance(ra, tuple) else (ra, ra)
        rb = rb if isinstance(rb, tuple) else (rb, rb)
        L = (b - a).length
        rmin = min(min(ra), min(rb))
        n = max(1, int(L / (0.3 * rmin / 0.695)) + 1)
        horiz = abs((b - a).z) < 0.7 * L if L > 0 else True
        for i in range(n + 1):
            t = i / n
            p = a + (b - a) * t
            ry, rz = ra[0] + (rb[0] - ra[0]) * t, ra[1] + (rb[1] - ra[1]) * t
            r = max(ry, rz)
            e = mb.elements.new()
            e.co = p
            e.radius = r / 0.695
            if abs(ry - rz) > 1e-4:
                e.type = 'ELLIPSOID'
                if horiz:
                    e.size_x, e.size_y, e.size_z = 1.0, ry / r, rz / r
                else:
                    e.size_x, e.size_y, e.size_z = rz / r, ry / r, 1.0
            else:
                e.type = 'BALL'
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    bpy.data.objects.remove(o)
    ob = _obj(name, me)
    if smooth_iter:
        sm = ob.modifiers.new('sm', 'SMOOTH'); sm.factor = 0.6; sm.iterations = smooth_iter
    return put(ob, m)


def hair(o, mat, count=3000, length=0.05, children=6, rough=0.02, clump=0.0, density_vg=None, kink=0.0):
    mod = o.modifiers.new('hair', 'PARTICLE_SYSTEM')
    ps = mod.particle_system.settings
    ps.type = 'HAIR'
    ps.count = count
    ps.hair_length = length
    ps.use_advanced_hair = True
    ps.use_rotations = True
    ps.render_type = 'PATH'
    ps.child_type = 'INTERPOLATED' if children else 'NONE'
    ps.rendered_child_count = children
    for k_ in ('child_percent', 'child_nbr', 'child_display_percent'):
        if hasattr(ps, k_):
            setattr(ps, k_, children); break
    ps.roughness_1 = rough
    ps.roughness_endpoint = rough * 1.5
    ps.clump_factor = clump
    ps.kink = 'CURL' if kink else 'NO'
    if kink:
        ps.kink_amplitude = kink
    ps.root_radius = 1.0
    ps.radius_scale = 0.004
    ps.tip_radius = 0.0
    ps.use_close_tip = True
    ps.effector_weights.gravity = 0.0
    if density_vg:
        mod.particle_system.vertex_group_density = density_vg
    o.data.materials.append(MATS[mat])
    ps.material = len(o.data.materials)
    return mod


def group(objs):
    return objs


def move(objs, dx=0, dy=0, dz=0, s=1.0, pivot=(0, 0, 0)):
    pv = Vector(pivot)
    for o in objs:
        o.location = pv + (o.location - pv) * s + Vector((dx, dy, dz))
        o.scale = o.scale * s
        if o.type == 'CURVE':
            pass
    return objs


def since(before):
    return [o for o in bpy.context.scene.objects if o not in before and o.type in ('MESH', 'CURVE')]


def snapshot():
    return set(bpy.context.scene.objects)


# =====================================================================
#  crown (marks the king of every army)
# =====================================================================
def crown(loc, s=1.0):
    x, y, z = loc
    torus((x, y, z), 0.105 * s, 0.018 * s, 'gold', scale=(1, 1, 1.4))
    cyl((x, y, z + 0.04 * s), 0.105 * s, 0.07 * s, 'gold', r2=0.12 * s, bev=0.002)
    for i in range(8):
        a = i * math.pi / 4
        px, py = x + 0.115 * s * math.cos(a), y + 0.115 * s * math.sin(a)
        cyl((px, py, z + 0.11 * s), 0.018 * s, 0.07 * s, 'gold', r2=0.004 * s, v=10, bev=0)
        sph((px, py, z + 0.15 * s), 0.012 * s, 'gold')
        if i % 2 == 0:
            sph((x + 0.112 * s * math.cos(a), y + 0.112 * s * math.sin(a), z + 0.035 * s), 0.016 * s, 'ruby', scale=(1, 1, 1.2))
    sph((x, y, z + 0.14 * s), 0.035 * s, 'ruby')


# =====================================================================
#  realistic human
# =====================================================================
# front faces -X. Height ~1.8 m (7.5 heads).
POSES = {
    'stand':  dict(lel=(0.03, 0.27, 1.18), lwr=(0.0, 0.27, 0.92), rel=(0.03, -0.27, 1.18), rwr=(0.0, -0.27, 0.92)),
    'rifle':  dict(lel=(-0.12, 0.27, 1.12), lwr=(-0.3, 0.1, 1.18), rel=(0.02, -0.28, 1.12), rwr=(-0.14, -0.16, 1.08)),
    'hold':   dict(lel=(-0.08, 0.27, 1.13), lwr=(-0.28, 0.22, 1.05), rel=(-0.08, -0.27, 1.13), rwr=(-0.28, -0.22, 1.05)),
    'salute': dict(lel=(-0.12, 0.3, 1.5), lwr=(-0.12, 0.13, 1.66), rel=(0.03, -0.27, 1.18), rwr=(0.0, -0.27, 0.92)),
    'staff':  dict(lel=(0.03, 0.27, 1.18), lwr=(0.0, 0.27, 0.92), rel=(-0.1, -0.29, 1.2), rwr=(-0.3, -0.3, 1.12)),
    'up':     dict(lel=(-0.05, 0.36, 1.68), lwr=(-0.1, 0.38, 1.92), rel=(-0.05, -0.36, 1.68), rwr=(-0.1, -0.38, 1.92)),
    'throw':  dict(lel=(-0.1, 0.32, 1.25), lwr=(-0.3, 0.3, 1.32), rel=(0.12, -0.33, 1.62), rwr=(0.2, -0.3, 1.88)),
    'bow':    dict(lel=(-0.3, 0.2, 1.43), lwr=(-0.55, 0.12, 1.44), rel=(-0.12, -0.24, 1.4), rwr=(-0.05, -0.05, 1.45)),
    'ride':   dict(lel=(-0.12, 0.27, 1.13), lwr=(-0.32, 0.12, 1.05), rel=(-0.08, -0.27, 1.15), rwr=(-0.3, -0.18, 1.1)),
}


def human(coat='olive', trousers='olive2', boots='boot', skin='skin', pose='stand', stride=0.0,
          long_coat=0.0, belt='leather', hairc='hair_brown', hair_len=0.03, beard=0.0, bare_legs=False,
          bare_arms=False, sleeve=None, bulk=1.0, sit=False, gloves=None):
    """Returns list of created objects. Feet at z=0, facing -X."""
    before = snapshot()
    P = POSES[pose]
    k = bulk
    # ---- legs ----
    leg_objs = []
    for side in (1, -1):
        y = 0.1 * side
        f = stride * side
        if sit:
            hip, knee, ank, toe = (0, y, 0.92), (-0.42, y * 1.9, 0.86), (-0.45, y * 2.1, 0.42), (-0.6, y * 2.1, 0.36)
        else:
            hip = (0, y, 0.92)
            knee = (-0.03 - f * 0.18, y, 0.5)
            ank = (0.02 - f * 0.3, y, 0.09)
            toe = (-0.14 - f * 0.3, y, 0.035)
        legm = skin if bare_legs else trousers
        leg = skin_body([(hip, (0.085 * k, 0.09 * k)), ((hip[0] - 0.015, y, 0.72), 0.072 * k), (knee, 0.056 * k),
                         ((knee[0] * 0.5 + ank[0] * 0.5 + 0.02, y, (knee[2] + ank[2]) / 2 + 0.05), 0.055 * k), (ank, 0.042)],
                        [(0, 1), (1, 2), (2, 3), (3, 4)], legm, name='leg')
        leg_objs.append(leg)
        # boot
        bt = skin_body([((ank[0] + 0.02, y, ank[2] + 0.1), 0.05), (ank, (0.05, 0.048)), ((toe[0] + 0.04, y, 0.035), (0.045, 0.05)), (toe, (0.03, 0.045))],
                       [(0, 1), (1, 2), (2, 3)], 'skin' if boots == 'bare' else boots, name='boot')
        box((ank[0] - 0.05, y, 0.012), (0.27, 0.1, 0.024), 'rubber' if boots != 'bare' else skin, bev=0.008)
    # ---- torso ----
    tor = skin_body([((0, 0, 0.9), (0.1 * k, 0.16 * k)), ((0.005, 0, 1.08), (0.095 * k, 0.15 * k)), ((0.0, 0, 1.28), (0.11 * k, 0.17 * k)),
                     ((0.005, 0, 1.44), (0.1 * k, 0.19 * k)), ((0.01, 0, 1.52), (0.05, 0.06))],
                    [(0, 1), (1, 2), (2, 3), (3, 4)], coat, name='torso')
    sph((-0.01, 0, 0.92), 0.1, trousers, scale=(1.05 * k, 1.65 * k, 0.9))               # pelvis
    # ---- arms ----
    for side, key in ((1, 'l'), (-1, 'r')):
        sh = (0.01, 0.2 * side * k, 1.45)
        el = Vector(P[key + 'el']); wr = Vector(P[key + 'wr'])
        am = skin if bare_arms else coat
        skin_body([(sh, 0.062 * k), ((sh[0] * 0.5 + el.x * 0.5, sh[1] * 0.5 + el.y * 0.5, (sh[2] + el.z) / 2), 0.053 * k),
                   (tuple(el), 0.045 * k), (tuple((el + wr) / 2), 0.042 * k), (tuple(wr), 0.032)],
                  [(0, 1), (1, 2), (2, 3), (3, 4)], am, name='arm')
        if sleeve and not bare_arms:
            cuff = el + (wr - el) * 0.82
            rod(tuple(cuff), tuple(el + (wr - el) * 0.95), 0.04, sleeve, v=16)
        # hand: palm + thumb + fingers block
        d = (wr - el).normalized()
        palm = wr + d * 0.05
        hm = gloves or skin
        sph(tuple(palm), 0.042, hm, scale=(1, 0.7, 1.15)).rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        rod(tuple(palm + d * 0.02), tuple(palm + d * 0.075), 0.022, hm, r2=0.016, v=12)
        rod(tuple(palm + Vector((-0.02, 0, 0))), tuple(palm + Vector((-0.045, -0.02 * side, 0.01)) + d * 0.02), 0.012, hm, v=10)
    # ---- neck & head ----
    cyl((0.01, 0, 1.56), 0.052, 0.12, skin, bev=0)
    head_c = Vector((0.0, 0, 1.69))
    sph(tuple(head_c), 0.1, skin, scale=(1.08, 0.9, 1.12))                               # cranium
    sph((-0.055, 0, 1.635), 0.068, skin, scale=(0.9, 1.05, 0.95))                          # jaw / cheeks
    sph((-0.07, 0, 1.605), 0.035, skin, scale=(1, 1.3, 0.8))                               # chin
    rod((-0.1, 0, 1.69), (-0.125, 0, 1.655), 0.015, skin, r2=0.011, v=12)                  # nose
    sph((-0.118, 0, 1.652), 0.013, skin)
    for s in (1, -1):
        sph((0.005, 0.094 * s, 1.68), 0.024, skin, scale=(0.6, 0.35, 1))                     # ears
        sph((-0.082, 0.036 * s, 1.705), 0.017, 'eye_white')                                  # eyes
        sph((-0.096, 0.036 * s, 1.705), 0.008, 'iris')
        box((-0.092, 0.038 * s, 1.728), (0.02, 0.035, 0.007), 'leather', bev=0.002, rot=(0.1 * s, 0, 0))  # brows
    box((-0.103, 0, 1.623), (0.006, 0.035, 0.006), 'lips', bev=0.002)
    # hair cap
    if hair_len:
        sc = sph((0.012, 0, 1.72), 0.103, skin, scale=(1.08, 0.92, 1.05))
        _scalp_groups(sc)
        hair(sc, hairc, count=1800, length=hair_len, children=8, rough=0.004, clump=0.3, density_vg='scalp')
    if beard:
        bd = sph((-0.06, 0, 1.62), 0.07, skin, scale=(0.95, 1.1, 1.0))
        _beard_groups(bd)
        hair(bd, hairc, count=1500, length=beard, children=8, rough=0.01, clump=0.4, density_vg='beard')
    # ---- belt ----
    if belt:
        torus((0, 0, 0.96), 0.1, 0.022, belt, scale=(1.05 * k, 1.62 * k, 1.1))
        box((-0.112 * k, 0, 0.96), (0.02, 0.05, 0.04), 'brass', bev=0.003)
    # ---- skirt of a long coat / tunic ----
    if long_coat:
        _skirt(long_coat, coat, k)
    return since(before)


def _skirt(length, m, k=1.0):
    """Cone-like coat skirt from waist (z≈0.98) down to 0.98-length, flaring out."""
    bm = bmesh.new()
    ring = 36
    rows = []
    for t in range(5):
        f = t / 4
        z = 0.98 - length * f
        rx = (0.11 + 0.07 * f) * k
        ry = (0.17 + 0.08 * f) * k
        row = []
        for i in range(ring):
            a = 2 * math.pi * i / ring
            wob = 1 + 0.03 * math.sin(a * 7 + f * 3) * f
            row.append(bm.verts.new((rx * math.cos(a) * wob + 0.01, ry * math.sin(a) * wob, z)))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        for i in range(ring):
            j = (i + 1) % ring
            bm.faces.new((a[i], a[j], b[j], b[i]))
    me = bpy.data.meshes.new('skirt'); bm.to_mesh(me); bm.free()
    o = _obj('skirt', me)
    so = o.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.012
    ss = o.modifiers.new('ss', 'SUBSURF'); ss.levels = 1; ss.render_levels = 2
    return put(o, m)


def _scalp_groups(o):
    vg = o.vertex_groups.new(name='scalp')
    for v in o.data.vertices:
        w = 1.0 if (v.co.z > -0.02 and not (v.co.x < -0.06 and v.co.z < 0.06)) else 0.0
        if v.co.x < -0.075:
            w = 0.0
        vg.add([v.index], w, 'REPLACE')


def _beard_groups(o):
    vg = o.vertex_groups.new(name='beard')
    for v in o.data.vertices:
        w = 1.0 if (v.co.x < -0.01 and v.co.z < 0.02) else 0.0
        vg.add([v.index], w, 'REPLACE')


# ---- props ----
def rifle_ak(a, b):
    """Assault rifle along a->b (a = butt, b = muzzle)."""
    a, b = Vector(a), Vector(b)
    d = (b - a)
    L = d.length
    q = d.to_track_quat('Z', 'Y')
    def at(t, off=(0, 0, 0)):
        return tuple(a + d * t + q @ Vector(off))
    objs = [rod(at(0.0), at(0.28), 0.022, 'wood', v=12),                   # stock
            rod(at(0.26), at(0.62), 0.026, 'gunmetal', v=12),              # receiver
            rod(at(0.6), at(0.78), 0.018, 'wood', v=12),                   # handguard
            rod(at(0.62), at(1.0), 0.008, 'gunmetal', v=10),               # barrel
            rod(at(0.45, (0.0, 0.0, 0.0)), at(0.45, (0.09, 0, 0.0)), 0.016, 'gunmetal', v=10)]   # magazine
    return objs


def spear(a, b, head='flint'):
    rod(a, b, 0.012, 'wood', v=10)
    d = (Vector(b) - Vector(a)).normalized()
    tip = Vector(b) + d * 0.14
    rod(b, tuple(tip), 0.028, head, r2=0.001, v=6, bev=0)
    tube([tuple(Vector(b) - d * 0.03), tuple(Vector(b) + d * 0.01)], 0.016, 'leather')


def sword(hand, d=(0, 0, 1), L=0.75):
    h = Vector(hand); d = Vector(d).normalized()
    rod(tuple(h - d * 0.08), tuple(h + d * 0.04), 0.014, 'leather', v=10)
    rod(tuple(h + d * 0.04 - Vector((0, 0.08, 0))), tuple(h + d * 0.04 + Vector((0, 0.08, 0))), 0.01, 'brass', v=8)
    bl = rod(tuple(h + d * 0.05), tuple(h + d * L), 0.022, 'steel', r2=0.004, v=4, bev=0)
    bl.scale = (1, 0.25, 1)


# =====================================================================
#  scene, light, camera, render
# =====================================================================
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build_materials()
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 8
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    for vt, look in (('AgX', 'AgX - Medium High Contrast'), ('Filmic', 'Medium High Contrast')):
        try:
            sc.view_settings.view_transform = vt
            try:
                sc.view_settings.look = look
            except Exception:  # noqa: BLE001
                pass
            break
        except Exception:  # noqa: BLE001
            continue
    sc.view_settings.exposure = float(os.environ.get('EXPOSURE', '-0.3'))
    print('view transform', sc.view_settings.view_transform, sc.view_settings.look)
    world = bpy.data.worlds.new('w'); sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes['Background']
    grad = nt.nodes.new('ShaderNodeTexGradient')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value = (0, math.pi / 2, 0)
    nt.links.new(tc.outputs['Generated'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], grad.inputs['Vector'])
    rp = nt.nodes.new('ShaderNodeValToRGB')
    rp.color_ramp.elements[0].color = (0.95, 0.97, 1.0, 1)
    rp.color_ramp.elements[1].color = (0.32, 0.3, 0.27, 1)
    nt.links.new(grad.outputs['Fac'], rp.inputs['Fac'])
    nt.links.new(rp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.6

    def area(loc, rot, energy, size, color=(1, 1, 1)):
        bpy.ops.object.light_add(type='AREA', location=loc, rotation=[math.radians(r) for r in rot])
        L = bpy.context.object.data
        L.energy = energy; L.size = size; L.color = color
    area((-4.0, -4.5, 5.0), (48, 0, -40), 1500, 3.5, (1.0, 0.96, 0.9))     # key
    area((-4.5, 4.0, 2.0), (70, 0, -130), 350, 5.0, (0.85, 0.9, 1.0))      # fill
    area((4.5, 1.5, 4.5), (-55, 0, -70), 1100, 2.0, (1.0, 0.95, 0.88))     # rim


def frame_camera(margin=1.04):
    objs = [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE') and o.name != 'floor']
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centre = (lo + hi) / 2
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.lens = 85
    d = Vector((-0.42, -1.0, 0.36)).normalized()
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = (-d).to_track_quat('-Z', 'Y')
    bpy.context.scene.camera = cam
    # fit: project bbox corners onto the camera plane
    rot = cam.rotation_quaternion.to_matrix()
    right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    ext = max(max(abs((p - centre).dot(right)), abs((p - centre).dot(up))) for p in pts)
    fov = 2 * math.atan(cam.data.sensor_width / 2 / cam.data.lens)
    dist = ext * margin / math.tan(fov / 2) + (hi - lo).length / 2
    cam.location = centre + d * dist
    cam.data.clip_end = dist * 4


ANIMATED = {'stone_chief', 'stone_shaman', 'stone_hunter', 'stone_slinger', 'stone_gatherer', 'stone_mammoth', 'iron_king', 'iron_archer',
            'iron_legion', 'iron_rider', 'iron_chariot', 'ind_emperor', 'ind_rifleman', 'ind_cavalry', 'general', 'spetsnaz',
            'tech_exo', 'tech_robot', 'tech_mech',
            'an_lion', 'an_tiger', 'an_jaguar', 'an_lynx', 'an_cheetah', 'an_kitten', 'an_leopard', 'an_rhino', 'an_elephant', 'an_zebra',
            'an_vervet', 'an_gorilla', 'an_orangutan', 'an_baboon', 'an_lemur', 'an_gibbon', 'an_capuchin', 'an_penguin', 'an_flamingo',
            'an_chick', 'an_turtle', 'an_crab'}


def render(name, build):
    import json
    reset()
    build()
    bpy.context.view_layer.update()
    fr = os.environ.get('FRAME', '0')
    cam_file = os.path.join(OUT, name + '.cam.json')
    if fr != '0' and os.path.exists(cam_file):
        c = json.load(open(cam_file))
        bpy.ops.object.camera_add()
        cam = bpy.context.object
        cam.data.lens = c['lens']; cam.data.clip_end = c['clip']
        cam.location = c['loc']; cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = c['rot']
        bpy.context.scene.camera = cam
    else:
        frame_camera(margin=1.04 if name not in ANIMATED else 1.22)
        cam = bpy.context.scene.camera
        json.dump({'lens': cam.data.lens, 'clip': cam.data.clip_end, 'loc': list(cam.location), 'rot': list(cam.rotation_quaternion)}, open(cam_file, 'w'))
    fr = os.environ.get('FRAME', '0')
    bpy.context.scene.render.filepath = os.path.join(OUT, name + ('' if fr == '0' else '_' + fr) + '.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', name, flush=True)


PIECES = {}


def piece(fn):
    PIECES[fn.__name__] = fn
    return fn


if __name__ == '__main__':
    import importlib.util
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, here)
    for extra in ('blender_real_humans.py', 'blender_real_nature.py', 'blender_real_animals.py'):
        p = os.path.join(here, extra)
        if os.path.exists(p):
            spec = importlib.util.spec_from_file_location(extra[:-3], p)
            mod = importlib.util.module_from_spec(spec)
            sys.modules['blender_real'] = sys.modules[__name__]
            spec.loader.exec_module(mod)
    sel = os.environ.get('ONLY')
    for name, build in PIECES.items():
        if sel and name not in sel.split(','):
            continue
        render(name, build)
