"""Люди пяти эпох для «Шахмат царств» (подключается из blender_real.py)."""
import math
from mathutils import Vector
from blender_real import (piece, human, crown, rifle_ak, spear, sword, box, hull, cyl, sph, rod, tube, torus, loft,
                          plate, skin_body, meta_body, hair, since, snapshot, move, put, MATS)


# ----------------------------- modern age ---------------------------------
@piece
def tank():
    # hull: sloped glacis, flat sides
    hull([(-1.0, -0.42, 0.42), (-1.0, 0.42, 0.42), (-0.7, -0.5, 0.62), (-0.7, 0.5, 0.62), (0.95, -0.5, 0.62), (0.95, 0.5, 0.62),
          (1.0, -0.5, 0.36), (1.0, 0.5, 0.36), (-0.85, -0.42, 0.3), (-0.85, 0.42, 0.3), (0.95, -0.42, 0.3), (0.95, 0.42, 0.3)], 'tank', bev=0.02)
    for s in (1, -1):
        y = 0.6 * s
        # road wheels + track
        for i, x in enumerate([-0.72, -0.43, -0.14, 0.15, 0.44, 0.73]):
            cyl((x, y, 0.2), 0.15, 0.1, 'tank_plain', rot=(math.pi / 2, 0, 0), v=40)
            cyl((x, y + 0.055 * s, 0.2), 0.06, 0.02, 'gunmetal', rot=(math.pi / 2, 0, 0), v=20)
            torus((x, y, 0.2), 0.14, 0.022, 'rubber', rot=(math.pi / 2, 0, 0))
        cyl((-0.98, y, 0.34), 0.11, 0.12, 'gunmetal', rot=(math.pi / 2, 0, 0), v=12, bev=0)   # idler
        cyl((0.98, y, 0.3), 0.13, 0.12, 'gunmetal', rot=(math.pi / 2, 0, 0), v=12, bev=0)    # sprocket
        # track links along the loop
        pts = []
        for i in range(56):
            t = i / 56
            pts.append(t)
        path = [(-1.0, 0.34), (-0.85, 0.06), (0.85, 0.06), (1.02, 0.3), (0.88, 0.4), (-0.88, 0.4)]
        segs = list(zip(path, path[1:] + path[:1]))
        total = sum(math.dist(a, b) for a, b in segs)
        n = 70
        for i in range(n):
            d = total * i / n
            for a, b in segs:
                sl = math.dist(a, b)
                if d <= sl:
                    f = d / sl
                    x, z = a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f
                    ang = math.atan2(b[1] - a[1], b[0] - a[0])
                    box((x, y, z), (0.05, 0.17, 0.025), 'iron', rot=(0, -ang, 0), bev=0.004)
                    break
                d -= sl
        # side skirt
        hull([(-0.95, y + 0.1 * s, 0.38), (0.98, y + 0.1 * s, 0.38), (-0.9, y + 0.1 * s, 0.6), (0.98, y + 0.1 * s, 0.6),
              (-0.95, y + 0.13 * s, 0.38), (0.98, y + 0.13 * s, 0.38), (-0.9, y + 0.13 * s, 0.6), (0.98, y + 0.13 * s, 0.6)], 'tank', bev=0.006)
        # fenders + stowage boxes
        box((0.55, 0.62 * s, 0.68), (0.5, 0.18, 0.12), 'tank', bev=0.01)
    # turret: low cast dome
    loft([(-0.55, 0.12, 0.06, 0.74, 2.2), (-0.45, 0.32, 0.14, 0.78, 2.4), (-0.1, 0.46, 0.17, 0.8, 2.6), (0.3, 0.46, 0.16, 0.8, 2.6),
          (0.55, 0.38, 0.13, 0.78, 2.8), (0.62, 0.2, 0.08, 0.76, 2.6)], 'tank', subsurf=2)
    # gun with fume extractor + muzzle
    rod((-0.5, 0, 0.84), (-1.9, 0, 0.88), 0.038, 'tank_plain', v=24)
    cyl((-1.25, 0, 0.865), 0.06, 0.25, 'tank_plain', rot=(0, math.pi / 2 - 0.03, 0), v=24)
    rod((-1.86, 0, 0.879), (-1.98, 0, 0.881), 0.05, 'gunmetal', v=24)
    box((-0.55, 0, 0.82), (0.12, 0.22, 0.14), 'tank', bev=0.02)                            # mantlet
    # ERA bricks on turret front
    for i, y in enumerate((-0.38, -0.27, -0.16, 0.16, 0.27, 0.38)):
        box((-0.42 + abs(y) * 0.25, y, 0.9), (0.14, 0.1, 0.07), 'tank', rot=(0, 0.25, 0), bev=0.008)
    # hatches, MG, periscopes, antenna, tow cable, smoke grenades
    cyl((0.15, -0.2, 0.98), 0.12, 0.04, 'tank', v=32)
    cyl((0.15, 0.2, 0.98), 0.1, 0.04, 'tank', v=32)
    rod((0.1, 0.2, 1.06), (-0.4, 0.2, 1.1), 0.012, 'gunmetal')
    box((0.1, 0.2, 1.04), (0.12, 0.06, 0.06), 'gunmetal', bev=0.006)
    rod((0.45, 0.3, 0.96), (0.62, 0.32, 1.9), 0.004, 'gunmetal', v=8)
    for y in (-0.42, 0.42):
        for j in range(3):
            rod((-0.2 + j * 0.07, y, 0.86), (-0.28 + j * 0.07, y * 1.12, 0.92), 0.022, 'tank_plain', v=12)
    tube([(0.6, -0.52, 0.66), (0.0, -0.53, 0.68), (-0.5, -0.52, 0.66)], 0.014, 'iron')
    # commander in the hatch, at the tank's scale
    h = person('relaxed', outfit='male_worksuit01', outfit_tint=L((0.06, 0.06, 0.06)), shoes=None, hair='short04')
    put_rig(h, (0.15, -0.2, 0.42), 0.36)
    c = hat_at(h, 0.0)
    sph(tuple(c + Vector((0.0, 0, -0.01))), 0.04, 'black_cloth', scale=(1.1, 0.95, 0.85))


@piece
def tech_robot():
    # sleek humanoid android
    joints = [((0, 0, 0.92), 0.1)]
    skin_body([((0, 0, 0.9), (0.09, 0.14)), ((0, 0, 1.12), (0.08, 0.12)), ((0, 0, 1.3), (0.1, 0.16)), ((0, 0, 1.44), (0.1, 0.18)), ((0, 0, 1.53), 0.04)],
              [(0, 1), (1, 2), (2, 3), (3, 4)], 'white_plastic')
    for s in (1, -1):
        skin_body([((0, 0.1 * s, 0.9), 0.07), ((-0.03, 0.1 * s, 0.5), 0.05), ((0.0, 0.1 * s, 0.1), 0.04)], [(0, 1), (1, 2)], 'white_plastic', subsurf=2)
        sph((-0.03, 0.1 * s, 0.5), 0.055, 'carbon')
        box((-0.06, 0.1 * s, 0.04), (0.22, 0.09, 0.07), 'carbon', bev=0.02)
        skin_body([((0.0, 0.2 * s, 1.45), 0.055), ((0.02, 0.26 * s, 1.18), 0.04), ((-0.15, 0.24 * s, 1.0), 0.035)], [(0, 1), (1, 2)], 'white_plastic')
        sph((0.02, 0.26 * s, 1.18), 0.045, 'carbon')
        sph((0.0, 0.2 * s, 1.45), 0.065, 'carbon')
        sph((-0.19, 0.24 * s, 0.97), 0.035, 'carbon')
    box((-0.1, 0, 1.3), (0.03, 0.12, 0.05), 'glow', bev=0.01)
    sph((0.0, 0, 1.69), 0.1, 'white_plastic', scale=(1.1, 0.9, 1.15))
    sph((-0.035, 0, 1.69), 0.09, 'carbon', scale=(0.8, 0.95, 0.65))
    box((-0.105, 0, 1.70), (0.01, 0.12, 0.018), 'glow', bev=0.004)
    rod((0.02, 0.06, 1.78), (0.06, 0.08, 1.92), 0.004, 'steel'); sph((0.06, 0.08, 1.93), 0.012, 'glow_red')


# ----------------------------- MakeHuman-based people ----------------------
import mh_human as MH



def _camo(colors, scale=9.0):
    """Shader snippet: multicam-like pattern for tinted MH clothing."""
    from blender_real import lin

    def build(n, l):
        tc = n.new('ShaderNodeTexCoord')
        nz = n.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = 3
        l.new(tc.outputs['Object'], nz.inputs['Vector'])
        r = n.new('ShaderNodeValToRGB')
        el = r.color_ramp.elements
        r.color_ramp.interpolation = 'CONSTANT'
        while len(el) < len(colors):
            el.new(0.5)
        for i, c in enumerate(colors):
            el[i].position = [0.0, 0.42, 0.52, 0.62][i] if len(colors) == 4 else i / len(colors)
            el[i].color = (*lin(c), 1)
        l.new(nz.outputs['Fac'], r.inputs['Fac'])
        return r.outputs['Color']
    return build


def L(c):
    from blender_real import lin
    return lin(c)


ADULT = {'macrodetails/caucasian-male-young': 1.0, 'macrodetails/universal-male-young-maxmuscle-averageweight': 0.45,
         'macrodetails/height/male-young-averagemuscle-averageweight-maxheight': 0.25}
OLDER = {'macrodetails/caucasian-male-old': 0.45, 'macrodetails/caucasian-male-young': 0.55,
         'macrodetails/universal-male-young-maxmuscle-averageweight': 0.3}


def person(pose='relaxed', **kw):
    kw.setdefault('targets', ADULT)
    h = MH.Human(**kw)
    pose_person(h, pose)
    return h


def fist(h, side, amount=75):
    """Curl fingers of a hand."""
    import bpy
    bpy.context.view_layer.update()
    w = h.pb('wrist.' + side)
    ax = (h.rig.matrix_world.to_3x3() @ w.matrix.to_3x3() @ Vector((1, 0, 0))).normalized()
    for f in range(2, 6):
        for j in (1, 2, 3):
            nm = 'finger%d-%d.%s' % (f, j, side)
            if nm in h.rig.pose.bones:
                h.bend(nm, ax, amount * (1 if side == 'L' else -1) * (0.8 if j == 1 else 1.0))
    nm = 'finger1-2.' + side
    if nm in h.rig.pose.bones:
        h.bend(nm, ax, 35 * (1 if side == 'L' else -1))


def pose_person(h, pose):
    shL, shR = h.head('upperarm01.L'), h.head('upperarm01.R')
    hipL, hipR = h.head('upperleg01.L'), h.head('upperleg01.R')
    V = lambda *a: Vector(a)
    up = V(0, 0, 1)
    if pose == 'relaxed':
        h.arm('L', shL + V(-0.03, -0.1, -0.56), shL + V(0.25, -0.1, -0.3))
        h.arm('R', shR + V(-0.03, 0.1, -0.56), shR + V(0.25, 0.1, -0.3))
    elif pose == 'rifle':
        h.arm('L', shL + V(-0.42, 0.05, -0.18), shL + V(-0.1, -0.2, -0.32))
        h.arm('R', shR + V(-0.12, 0.08, -0.3), shR + V(0.2, 0.2, -0.3))
        fist(h, 'L'); fist(h, 'R')
    elif pose == 'staff':
        h.arm('L', shL + V(-0.3, -0.12, -0.25), shL + V(0.0, -0.3, -0.3))
        h.arm('R', shR + V(-0.03, 0.1, -0.56), shR + V(0.25, 0.1, -0.3))
        fist(h, 'L')
    elif pose == 'salute':
        h.arm('L', shL + V(-0.03, -0.1, -0.56), shL + V(0.25, -0.1, -0.3))
        h.arm('R', shR + V(-0.14, -0.1, 0.18), shR + V(-0.1, 0.35, 0.0))
    elif pose == 'up':
        h.arm('L', shL + V(-0.12, -0.25, 0.52), shL + V(0.0, -0.4, 0.2))
        h.arm('R', shR + V(-0.12, 0.25, 0.52), shR + V(0.0, 0.4, 0.2))
    elif pose == 'bow':
        h.arm('L', shL + V(-0.62, 0.02, 0.04), shL + V(-0.3, -0.3, 0.0))
        h.arm('R', shR + V(-0.1, -0.12, 0.02), shR + V(0.3, 0.2, 0.05))
        fist(h, 'L'); fist(h, 'R', 50)
    elif pose == 'throw':
        h.arm('L', shL + V(-0.45, -0.1, -0.05), shL + V(-0.1, -0.35, -0.2))
        h.arm('R', shR + V(0.25, 0.12, 0.35), shR + V(0.3, 0.3, -0.1))
        fist(h, 'R')
    elif pose == 'shield':
        h.arm('L', shL + V(-0.35, -0.05, -0.28), shL + V(0.05, -0.32, -0.3))
        h.arm('R', shR + V(-0.22, 0.12, -0.32), shR + V(0.2, 0.25, -0.3))
        fist(h, 'L'); fist(h, 'R')
    elif pose == 'ride':
        h.arm('L', shL + V(-0.38, 0.12, -0.32), shL + V(0.0, -0.3, -0.3))
        h.arm('R', shR + V(-0.38, -0.12, -0.3), shR + V(0.0, 0.3, -0.3))
        fist(h, 'L'); fist(h, 'R')
        for s, hp in (('L', hipL), ('R', hipR)):
            sg = -1 if s == 'L' else 1
            h.leg(s, hp + V(-0.12, 0.22 * sg, -0.75), hp + V(-0.45, 0.25 * sg, -0.2))
    elif pose == 'carry':
        h.arm('L', shL + V(-0.3, 0.08, -0.35), shL + V(0.05, -0.3, -0.3))
        h.arm('R', shR + V(-0.3, -0.08, -0.35), shR + V(0.05, 0.3, -0.3))
        fist(h, 'L', 40); fist(h, 'R', 40)
    if pose != 'ride':
        # natural stance: legs almost straight, one foot slightly forward
        for s, dx, dy in (('L', -0.09, -0.03), ('R', 0.05, 0.03)):
            hp = h.head('upperleg01.' + s)
            Lg = (h.head('lowerleg01.' + s) - hp).length + (h.tail('lowerleg02.' + s) - h.head('lowerleg01.' + s)).length
            d = V(dx, dy, -1.0).normalized()
            h.leg(s, hp + d * Lg * 0.99, hp + V(-0.5, 0, -0.45))
    return h


def hand(h, side, along=0.06):
    """World position of the palm centre of a (posed) hand."""
    w = h.head('wrist.' + side); t = h.tail('finger3-1.' + side) if ('finger3-1.' + side) in h.rig.pose.bones else h.tail('wrist.' + side)
    return w + (t - w) * 0.75


# ----------------------------- modern age ---------------------------------
def put_rig(h, loc, scale=1.0, rot_z=0.0):
    import bpy
    h.rig.location = loc
    h.rig.scale = (scale, scale, scale)
    h.rig.rotation_euler = (0, 0, rot_z)
    bpy.context.view_layer.update()


def hat_at(h, drop=0.03):
    top, skull = h.head_top()
    return Vector((top.x, top.y, skull.z - drop))


@piece
def spetsnaz():
    from blender_real import MATS
    h = person('rifle', outfit='male_worksuit01', outfit_camo=_camo([(0.36, 0.33, 0.22), (0.2, 0.22, 0.12), (0.1, 0.09, 0.06), (0.45, 0.41, 0.3)]),
               shoes='shoes06', shoes_tint=L((0.08, 0.07, 0.06)), hair='short04', hair_tint=L((0.1, 0.07, 0.05)))
    c = hat_at(h, 0.035)
    sph(tuple(c + Vector((0.015, 0.025, 0.02))), 0.1, 'red_cloth', scale=(1.12, 1.02, 0.36), rot=(0.22, 0.12, 0))
    torus(tuple(c + Vector((0.0, 0, -0.005))), 0.092, 0.01, 'leather', scale=(1.12, 0.95, 1))
    h.garment(['spine04', 'spine05', 'clavicle.L', 'clavicle.R', 'breast.L', 'breast.R'], offset=0.018,
              mat=MATS['olive2'], thick=0.022, threshold=0.5, name='vest', source=h.parts['outfit'])
    sp = h.head('spine04')
    box(tuple(sp + Vector((0.2, 0, -0.04))), (0.13, 0.26, 0.32), 'olive', bev=0.03)
    pl, pr = hand(h, 'L'), hand(h, 'R')
    d = (pl - pr).normalized()
    rifle_ak(tuple(pr - d * 0.3 + Vector((0, 0, 0.02))), tuple(pl + d * 0.45))


def peaked_cap(h, cloth='greatcoat', band='red_cloth'):
    c = hat_at(h, 0.03)
    cyl(tuple(c + Vector((0, 0, 0.02))), 0.1, 0.06, cloth, bev=0.01)
    sph(tuple(c + Vector((0.01, 0, 0.06))), 0.125, cloth, scale=(1.15, 1.0, 0.3))
    torus(tuple(c + Vector((0, 0, 0.0))), 0.1, 0.012, band)
    box(tuple(c + Vector((-0.115, 0, -0.012))), (0.09, 0.16, 0.01), 'boot', rot=(0, -0.35, 0), bev=0.004)
    sph(tuple(c + Vector((-0.115, 0, 0.04))), 0.016, 'gold')
    return c + Vector((0, 0, 0.1))


@piece
def general():
    h = person('relaxed', targets=OLDER, outfit='male_elegantsuit01', outfit_tint=L((0.33, 0.31, 0.22)), shoes='shoes04',
               shoes_tint=L((0.03, 0.03, 0.03)), hair='short02', hair_tint=L((0.4, 0.38, 0.36)))
    top = peaked_cap(h)
    for s in ('L', 'R'):
        p = h.head('upperarm01.' + s)
        box(tuple(p + Vector((0.01, 0, 0.035))), (0.13, 0.075, 0.015), 'gold', bev=0.005)
    ch = h.head('spine05')
    for i in range(3):
        for j in range(2):
            sph(tuple(ch + Vector((-0.115, -0.05 - i * 0.028, -0.07 - j * 0.035))), 0.011, 'gold' if (i + j) % 2 else 'silver')
    crown(tuple(top + Vector((0, 0, 0.02))), 1.0)


# ----------------------------- stone age ----------------------------------
FUR = (0.33, 0.24, 0.15)


def fur_garment(h, bones, off=0.02, mat='hide', fur='fur_wolf', length=0.05, threshold=0.4, count=4000, extra=None):
    from blender_real import MATS
    g = h.garment(bones, offset=off, mat=MATS[mat], thick=0.01, threshold=threshold, name='fur', extra=extra)
    hair(g, fur, count=count, length=length, children=8, rough=0.01, clump=0.2)
    return g


TORSO = ['spine01', 'spine02', 'spine03', 'spine04', 'spine05', 'pelvis.L', 'pelvis.R', 'root', 'clavicle.L', 'clavicle.R', 'breast.L', 'breast.R']
THIGHS = ['upperleg01.L', 'upperleg01.R', 'upperleg02.L', 'upperleg02.R']




def beard(h, color='hair_dark', length=0.05):
    """Particle beard on the jaw/chin of the body."""
    import bpy
    src = h.body
    me = src.data.copy()
    o = bpy.data.objects.new('beard', me)
    bpy.context.collection.objects.link(o)
    for vg in src.vertex_groups:
        o.vertex_groups.new(name=vg.name)
    for v in src.data.vertices:
        for g in v.groups:
            o.vertex_groups[g.group].add([v.index], g.weight, 'REPLACE')
    gi = {vg.name: vg.index for vg in src.vertex_groups}
    jaw, head = gi.get('jaw'), gi.get('head')
    zs = [v.co.z for v in src.data.vertices if any(g.group == head and g.weight > 0.5 for g in v.groups)]
    ztop = max(zs)
    vg = o.vertex_groups.new(name='beard')
    for v in src.data.vertices:
        wj = sum(g.weight for g in v.groups if g.group == jaw) if jaw is not None else 0
        wh = sum(g.weight for g in v.groups if g.group == head)
        if (wj > 0.25 or (wh > 0.4 and v.co.z < ztop - 0.15)) and v.co.x < -0.01 and v.co.z < ztop - 0.12:
            vg.add([v.index], 1.0, 'REPLACE')
    o.data.materials.clear()
    o.data.materials.append(src.data.materials[0])
    h._attach(o)
    hair(o, color, count=2500, length=length, children=10, rough=0.006, clump=0.35, density_vg='beard')
    return o


MUSCLE = dict(OLDER, **{'macrodetails/universal-male-young-maxmuscle-averageweight': 0.7})


@piece
def stone_chief():
    h = person('staff', targets=MUSCLE, hair='long01', hair_tint=L((0.15, 0.1, 0.06)), shoes=None,
               skin='middleage_caucasian_male', eyebrows='eyebrow010')
    fur_garment(h, TORSO + THIGHS, off=0.04, length=0.08, count=5000)
    fur_garment(h, ['spine05', 'clavicle.L', 'clavicle.R', 'shoulder01.L', 'shoulder01.R', 'neck01'], off=0.07, length=0.1,
                count=3000, threshold=0.5)
    beard(h, 'hair_brown', 0.06)
    pl = hand(h, 'L')
    rod(tuple(pl + Vector((0, 0, -0.95))), tuple(pl + Vector((-0.03, 0, 0.42))), 0.02, 'dark_wood', v=10)
    sph(tuple(pl + Vector((-0.03, 0, 0.47))), 0.06, 'bone', scale=(1.1, 0.9, 1.0))
    nk = h.head('neck01')
    for i in range(7):
        a = -1.0 + i * 0.33
        rod(tuple(nk + Vector((-0.11 * math.cos(a), 0.15 * math.sin(a), -0.08))),
            tuple(nk + Vector((-0.14 * math.cos(a), 0.17 * math.sin(a), -0.14))), 0.009, 'bone', r2=0.002, v=8)
    crown(tuple(hat_at(h, -0.02)), 0.95)


@piece
def stone_shaman():
    h = person('up', targets=OLDER, hair='long01', hair_tint=L((0.3, 0.28, 0.26)), shoes=None, skin='old_caucasian_male')
    fur_garment(h, TORSO + THIGHS, off=0.04, length=0.07, fur='fur_mammoth', count=5000)
    beard(h, 'hair_grey', 0.09)
    c = hat_at(h, 0.02)
    for sgn in (1, -1):
        tube([tuple(c + Vector((0.0, 0.05 * sgn, 0.02))), tuple(c + Vector((-0.02, 0.15 * sgn, 0.16))), tuple(c + Vector((0.03, 0.2 * sgn, 0.3)))], 0.012, 'bone')
        tube([tuple(c + Vector((-0.02, 0.13 * sgn, 0.12))), tuple(c + Vector((-0.1, 0.17 * sgn, 0.22)))], 0.008, 'bone')
    torus(tuple(c + Vector((0, 0, -0.01))), 0.095, 0.015, 'hide', scale=(1.12, 0.95, 1))
    for i, col in enumerate(['feather_red', 'bone', 'feather_red']):
        rod(tuple(c + Vector((0.08, -0.03 + i * 0.03, 0.0))), tuple(c + Vector((0.16, -0.06 + i * 0.06, 0.18))), 0.012, col, r2=0.002, v=8)
    pr = hand(h, 'R')
    rod(tuple(pr + Vector((0, 0, -0.08))), tuple(pr + Vector((0, 0, 0.1))), 0.012, 'wood')
    sph(tuple(pr + Vector((0, 0, 0.16))), 0.05, 'tan_leather', scale=(1, 1, 1.2))


LOIN = ['pelvis.L', 'pelvis.R', 'root', 'spine01'] + THIGHS


@piece
def stone_hunter():
    h = person('throw', targets=MUSCLE, hair='short03', hair_tint=L((0.12, 0.08, 0.05)), shoes=None)
    fur_garment(h, LOIN, off=0.035, length=0.06, count=3000)
    beard(h, 'hair_brown', 0.025)
    pr = hand(h, 'R')
    d = Vector((-1.0, 0.0, 0.18)).normalized()
    spear(tuple(pr - d * 0.6), tuple(pr + d * 0.9))


@piece
def stone_slinger():
    h = person('up', targets=MUSCLE, hair='short01', hair_tint=L((0.1, 0.07, 0.04)), shoes=None, skin='young_african_male')
    fur_garment(h, LOIN, off=0.035, length=0.05, count=3000, fur='fur_mammoth')
    pr = hand(h, 'R')
    tube([tuple(pr), tuple(pr + Vector((0.12, 0.08, 0.15))), tuple(pr + Vector((0.18, 0.15, 0.32)))], 0.005, 'tan_leather')
    sph(tuple(pr + Vector((0.19, 0.16, 0.35))), 0.04, 'flint')


@piece
def stone_gatherer():
    h = person('carry', targets={'macrodetails/caucasian-female-young': 1.0}, hair='braid01', hair_tint=L((0.2, 0.12, 0.06)),
               shoes=None, skin='young_caucasian_female', eyebrows='eyebrow004')
    fur_garment(h, TORSO + THIGHS, off=0.03, length=0.04, count=4000, fur='fur_horse')
    pl, pr = hand(h, 'L'), hand(h, 'R')
    c = (pl + pr) / 2 + Vector((-0.1, 0, 0.0))
    cyl(tuple(c), 0.15, 0.16, 'wood', r2=0.19, v=24)
    for i in range(9):
        a = i * 0.7
        sph(tuple(c + Vector((0.08 * math.cos(a), 0.1 * math.sin(a), 0.09 + 0.02 * (i % 3)))), 0.04, 'feather_red' if i % 2 else 'ruby')


# ---------------------------------------------------------------- animals
def horse(loc=(0, 0, 0), s=1.0, coat='fur_horse', mane='fur_horse2', saddle=True):
    """Realistic-ish horse from a skeleton + short coat and long mane/tail hair. Faces -X."""
    from blender_real import MATS
    import bpy
    before = snapshot()
    import blender_real as br
    if 'horse_coat_' + coat not in MATS:
        base = (0.36, 0.17, 0.07) if coat == 'fur_horse' else (0.05, 0.045, 0.04)
        m, n, l, bs = br._new('horse_coat_' + coat)
        v = br._coord(n, l)
        nz = br._noise(n, l, v, 6, 5)
        col = br._ramp(n, l, nz.outputs['Fac'], [(0.35, br._vary(base, 0.8)), (0.7, br._vary(base, 1.15))])
        l.new(col, bs.inputs['Base Color'])
        bs.inputs['Roughness'].default_value = 0.42
        bs.inputs['Sheen Weight'].default_value = 0.25
        bs.inputs['Coat Weight'].default_value = 0.15
        hairline = br._noise(n, l, br._coord(n, l, (1, 1, 12)), 60, 2)
        br._bump(n, l, bs, hairline.outputs['Fac'], 0.06, 0.003)
        MATS['horse_coat_' + coat] = m
    hm = 'horse_coat_' + coat
    sp = [((1.0, 0, 1.38), (0.72, 0, 1.47), (0.17, 0.2), (0.27, 0.31)), ((0.72, 0, 1.47), (0.3, 0, 1.42), (0.27, 0.31), (0.28, 0.33)),
          ((0.3, 0, 1.42), (-0.1, 0, 1.38), (0.28, 0.33), (0.3, 0.37)), ((-0.1, 0, 1.38), (-0.5, 0, 1.45), (0.3, 0.37), (0.26, 0.33)),
          ((-0.5, 0, 1.45), (-0.72, 0, 1.6), (0.24, 0.3), (0.16, 0.24)), ((-0.72, 0, 1.6), (-0.95, 0, 1.95), (0.15, 0.22), (0.1, 0.14)),
          ((-0.95, 0, 1.95), (-1.05, 0, 2.05), (0.1, 0.13), (0.1, 0.11)), ((-1.05, 0, 2.03), (-1.42, 0, 1.72), (0.1, 0.11), (0.065, 0.075))]
    for y in (0.16, -0.16):
        sp += [((-0.5, y, 1.35), (-0.5, y, 0.98), 0.14, 0.1), ((-0.5, y, 0.98), (-0.52, y, 0.56), 0.085, 0.055), ((-0.52, y, 0.56), (-0.53, y, 0.18), 0.045, 0.04),
               ((-0.53, y, 0.18), (-0.56, y, 0.08), 0.045, 0.05),
               ((0.66, y, 1.35), (0.56, y, 1.0), 0.2, 0.14), ((0.56, y, 1.0), (0.84, y, 0.62), 0.11, 0.06), ((0.84, y, 0.62), (0.79, y, 0.18), 0.05, 0.04),
               ((0.79, y, 0.18), (0.76, y, 0.08), 0.045, 0.05)]
    body = meta_body(sp, hm, res=0.022, name='horse')
    for y in (0.16, -0.16):
        for x in (-0.57, 0.75):
            cyl((x, y, 0.04), 0.06, 0.08, 'boot', r2=0.052, v=24)
        sph((-1.2, y * 0.62, 1.95), 0.026, 'iris')
        sph((-1.4, y * 0.3, 1.7), 0.02, 'boot')
        cyl((-1.0, y * 0.45, 2.15), 0.035, 0.15, hm, r2=0.006, rot=(0.3 * (1 if y > 0 else -1), -0.15, 0), v=12)
    # mane along the top of the neck
    mn = tube([(-0.62, 0, 1.68), (-0.82, 0, 1.92), (-0.98, 0, 2.1)], 0.035, 'leather')
    import bpy as _b
    _b.context.view_layer.objects.active = mn
    mn.select_set(True)
    _b.ops.object.convert(target='MESH')
    mn = _b.context.object
    hair(mn, mane, count=1500, length=0.16, children=10, rough=0.01, clump=0.5)
    # tail
    tl = tube([(1.02, 0, 1.38), (1.12, 0, 1.2), (1.14, 0, 0.95)], 0.045, 'leather')
    _b.context.view_layer.objects.active = tl
    tl.select_set(True)
    _b.ops.object.convert(target='MESH')
    tl = _b.context.object
    hair(tl, mane, count=1200, length=0.4, children=10, rough=0.015, clump=0.6)
    if saddle:
        sph((-0.15, 0, 1.73), 0.24, 'tan_leather', scale=(1.25, 1.2, 0.35))
        sph((-0.12, 0, 1.68), 0.3, 'red_cloth', scale=(1.2, 1.15, 0.18))
        for y in (0.3, -0.3):
            rod((-0.15, y * 0.9, 1.68), (-0.15, y * 1.1, 1.1), 0.008, 'leather', v=6)
            box((-0.15, y * 1.1, 1.06), (0.1, 0.03, 0.05), 'steel', bev=0.008)
        tube([(-1.38, 0.07, 1.72), (-1.0, 0.15, 1.75), (-0.45, 0.12, 1.85)], 0.006, 'leather')
        tube([(-1.38, -0.07, 1.72), (-1.0, -0.15, 1.75), (-0.45, -0.12, 1.85)], 0.006, 'leather')
    objs = since(before)
    move(objs, *loc, s=s)
    return objs


def rider(h, horse_loc=(0, 0, 0), s=1.0):
    put_rig(h, (horse_loc[0] - 0.05 * s, horse_loc[1], horse_loc[2] + 0.72 * s), s)


@piece
def iron_rider():
    horse(coat='fur_horse', mane='fur_horse2')
    h = person('ride', hair='short04', shoes='shoes02', shoes_tint=L((0.2, 0.12, 0.06)))
    tunic(h, 'blue_cloth')
    rider(h)
    from blender_real import MATS
    c = hat_at(h, 0.03)
    sph(tuple(c), 0.112, 'brass', scale=(1.1, 0.95, 0.95))
    cyl(tuple(c + Vector((0, 0, 0.12))), 0.012, 0.1, 'brass')
    pr = hand(h, 'R')
    d = Vector((-1, 0, 0.35)).normalized()
    rod(tuple(pr - d * 0.7), tuple(pr + d * 1.4), 0.016, 'wood', v=10)
    rod(tuple(pr + d * 1.4), tuple(pr + d * 1.6), 0.024, 'iron', r2=0.001, v=6, bev=0)


@piece
def iron_chariot():
    horse((-0.6, 0, 0), 1.0, saddle=False)
    # two-wheeled war chariot behind the horse
    for y in (-0.55, 0.55):
        torus((1.15, y, 0.5), 0.46, 0.03, 'dark_wood', rot=(math.pi / 2, 0, 0))
        for k in range(8):
            a = k * math.pi / 8
            rod((1.15 + 0.45 * math.cos(a), y, 0.5 + 0.45 * math.sin(a)), (1.15 - 0.45 * math.cos(a), y, 0.5 - 0.45 * math.sin(a)), 0.012, 'wood', v=8)
        cyl((1.15, y, 0.5), 0.07, 0.14, 'brass', rot=(math.pi / 2, 0, 0))
        rod((1.15, y * 1.1, 0.5), (1.15, y * 1.45, 0.5), 0.02, 'iron', r2=0.002, v=8, bev=0)   # scythe
    rod((1.15, -0.62, 0.5), (1.15, 0.62, 0.5), 0.03, 'iron')
    box((1.15, 0, 0.62), (0.6, 0.9, 0.05), 'wood', bev=0.01)
    hull([(0.88, -0.45, 0.64), (0.88, 0.45, 0.64), (0.85, -0.45, 1.05), (0.85, 0.45, 1.05), (0.95, -0.4, 1.08), (0.95, 0.4, 1.08), (0.9, 0, 1.15),
          (1.45, -0.45, 0.64), (1.45, 0.45, 0.64), (1.4, -0.45, 0.9), (1.4, 0.45, 0.9)], 'red_paint', bev=0.01)
    rod((0.9, 0, 0.66), (-0.4, 0, 1.25), 0.03, 'dark_wood', v=12)
    h = person('ride', hair='short03', shoes='shoes02', shoes_tint=L((0.2, 0.12, 0.06)))
    pose_person(h, 'relaxed')
    h.arm('L', h.head('upperarm01.L') + Vector((-0.4, 0.1, -0.25)), h.head('upperarm01.L') + Vector((0, -0.3, -0.3)))
    h.arm('R', h.head('upperarm01.R') + Vector((-0.4, -0.1, -0.25)), h.head('upperarm01.R') + Vector((0, 0.3, -0.3)))
    tunic(h, 'white_cloth')
    put_rig(h, (1.2, 0, 0.66), 0.95)
    c = hat_at(h, 0.03)
    sph(tuple(c), 0.105, 'brass', scale=(1.05, 0.95, 1.0))


@piece
def stone_mammoth():
    from blender_real import MATS
    sp = [((0.95, 0, 1.75), (0.4, 0, 2.0), (0.4, 0.45), (0.62, 0.68)), ((0.4, 0, 2.0), (-0.2, 0, 2.2), (0.62, 0.68), (0.64, 0.76)),
          ((-0.2, 0, 2.2), (-0.7, 0, 2.5), (0.6, 0.72), (0.42, 0.5)),                       # shoulder hump
          ((-0.85, 0, 2.55), (-1.15, 0, 2.85), (0.36, 0.4), (0.3, 0.33)),                   # domed skull
          ((-0.85, 0, 2.35), (-1.35, 0, 2.15), (0.38, 0.42), (0.26, 0.3))]                  # face
    for y in (0.44, -0.44):
        for x in (-0.6, 0.62):
            sp += [((x, y, 1.75), (x, y, 1.0), 0.3, 0.24), ((x, y, 1.0), (x - 0.03, y, 0.1), 0.24, 0.26)]
    body = meta_body(sp, 'hide', res=0.04, name='mammoth')
    legs = []
    trunk = tube([(-1.45, 0, 2.15), (-1.72, 0, 1.65), (-1.78, 0, 1.0), (-1.7, 0, 0.55), (-1.55, 0, 0.42)], 0.15, 'hide', r_end=0.05)
    import bpy
    bpy.context.view_layer.objects.active = trunk; trunk.select_set(True)
    bpy.ops.object.convert(target='MESH'); trunk = bpy.context.object
    hair(body, 'fur_mammoth', count=40000, length=0.12, children=12, rough=0.03, clump=0.35)
    hair(trunk, 'fur_mammoth', count=4000, length=0.04, children=6, rough=0.01)
    for y in (0.24, -0.24):
        tube([(-1.38, y, 2.0), (-1.7, y * 1.3, 1.35), (-2.15, y * 1.5, 1.15), (-2.45, y * 1.1, 1.5), (-2.4, y * 0.6, 1.85)], 0.085, 'ivory', r_end=0.025)
        sph((-1.3, y * 1.2, 2.5), 0.035, 'iris')
    for o in legs:
        pass


# --------------------------------------------------------------- iron age
def tunic(h, cloth, length_bones=THIGHS, off=0.02):
    from blender_real import MATS
    return h.garment(TORSO + ['upperarm01.L', 'upperarm01.R', 'shoulder01.L', 'shoulder01.R'] + length_bones,
                     offset=off, mat=MATS[cloth], thick=0.008, threshold=0.35, name='tunic')


def sandals(h):
    for s in ('L', 'R'):
        f = h.head('foot.' + s)
        for z in (0.04, 0.09, 0.14):
            torus(tuple(Vector((f.x, f.y, z))), 0.048, 0.006, 'tan_leather', scale=(0.95, 0.85, 1))


@piece
def iron_king():
    from blender_real import MATS
    h = person('staff', targets=OLDER, hair='short02', hair_tint=L((0.25, 0.15, 0.08)), shoes='shoes02', shoes_tint=L((0.25, 0.13, 0.06)))
    tunic(h, 'blue_cloth', THIGHS + ['lowerleg01.L', 'lowerleg01.R'])
    h.garment(['spine04', 'spine05', 'clavicle.L', 'clavicle.R', 'shoulder01.L', 'shoulder01.R', 'neck01'], offset=0.05,
              mat=MATS['red_cloth'], thick=0.012, threshold=0.4, name='cape')
    beard(h, 'hair_brown', 0.06)
    pl = hand(h, 'L')
    rod(tuple(pl + Vector((0, 0, -0.85))), tuple(pl + Vector((-0.02, 0, 0.5))), 0.016, 'gold', v=12)
    sph(tuple(pl + Vector((-0.02, 0, 0.55))), 0.045, 'gold')
    sph(tuple(pl + Vector((-0.02, 0, 0.6))), 0.025, 'ruby')
    crown(tuple(hat_at(h, -0.025)), 1.0)


def scutum(c, R=0.5, ang=1.25, H=1.0):
    """Curved Roman shield centred at c, convex side facing -X."""
    import bmesh as _bm
    import bpy
    bm = _bm.new()
    rows = []
    for j in range(2):
        z = -H / 2 + H * j
        row = []
        for i in range(13):
            a = -ang / 2 + ang * i / 12
            row.append(bm.verts.new((-R * math.cos(a) + R, R * math.sin(a), z)))
        rows.append(row)
    for i in range(12):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    me = bpy.data.meshes.new('scutum'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('scutum', me); bpy.context.collection.objects.link(o)
    so = o.modifiers.new('so', 'SOLIDIFY'); so.thickness = 0.025
    from blender_real import bevel
    bevel(o, 0.006, 2, 30)
    put(o, 'red_paint')
    o.location = tuple(c)
    sph(tuple(Vector(c) + Vector((-0.012, 0, 0))), 0.07, 'brass', scale=(0.5, 1, 1))
    for z in (-0.42, 0.42):
        box(tuple(Vector(c) + Vector((0.03, 0, z))), (0.03, 0.62, 0.03), 'brass', bev=0.004)
    return o


@piece
def iron_legion():
    from blender_real import MATS
    h = person('shield', targets=MUSCLE, hair='short04', shoes=None)
    tunic(h, 'red_cloth')
    h.garment(['spine02', 'spine03', 'spine04', 'spine05', 'clavicle.L', 'clavicle.R', 'breast.L', 'breast.R'], offset=0.035,
              mat=MATS['steel'], thick=0.01, threshold=0.45, name='lorica')
    sandals(h)
    c = hat_at(h, 0.03)
    sph(tuple(c), 0.112, 'iron', scale=(1.1, 0.95, 0.95))
    box(tuple(c + Vector((0.0, 0, 0.1))), (0.2, 0.03, 0.09), 'red_cloth', bev=0.015)
    for sgn in (1, -1):
        box(tuple(c + Vector((-0.02, 0.1 * sgn, -0.1))), (0.08, 0.012, 0.1), 'iron', bev=0.004)
    pl = hand(h, 'L')
    scutum(pl + Vector((-0.06, -0.02, 0.0)))
    pr = hand(h, 'R')
    rod(tuple(pr + Vector((0.05, 0, -0.75))), tuple(pr + Vector((-0.08, 0, 0.9))), 0.014, 'wood', v=10)
    rod(tuple(pr + Vector((-0.08, 0, 0.9))), tuple(pr + Vector((-0.1, 0, 1.1))), 0.018, 'iron', r2=0.001, v=6, bev=0)


@piece
def iron_archer():
    from blender_real import MATS
    h = person('bow', hair='short03', hair_tint=L((0.2, 0.13, 0.07)), shoes='shoes02', shoes_tint=L((0.2, 0.12, 0.06)))
    tunic(h, 'olive')
    h.garment(['spine03', 'spine04', 'spine05', 'clavicle.L', 'clavicle.R'], offset=0.035, mat=MATS['tan_leather'], thick=0.008, threshold=0.5, name='jerkin')
    pl, pr = hand(h, 'L'), hand(h, 'R')
    top, bot = pl + Vector((0.08, 0, 0.62)), pl + Vector((0.08, 0, -0.62))
    tube([tuple(bot), tuple(pl + Vector((-0.05, 0, -0.35))), tuple(pl), tuple(pl + Vector((-0.05, 0, 0.35))), tuple(top)], 0.014, 'dark_wood', r_end=0.008)
    tube([tuple(top), tuple(pr), tuple(bot)], 0.0025, 'linen')
    d = (pl - pr).normalized()
    rod(tuple(pr), tuple(pl + d * 0.12), 0.006, 'wood', v=8)
    rod(tuple(pl + d * 0.12), tuple(pl + d * 0.2), 0.01, 'iron', r2=0.0, v=6, bev=0)
    sp = h.head('spine04')
    cyl(tuple(sp + Vector((0.16, 0.05, 0.0))), 0.055, 0.5, 'tan_leather', rot=(0.35, 0.15, 0), v=20)
    for k in range(4):
        rod(tuple(sp + Vector((0.16 + 0.015 * k, 0.04, 0.2))), tuple(sp + Vector((0.2 + 0.015 * k, 0.1, 0.4))), 0.01, 'feather_red', r2=0.002, v=6, bev=0)


def masonry():
    """Stone-block wall material (registered as MATS['masonry'])."""
    import blender_real as br
    if 'masonry' in br.MATS:
        return
    m, n, l, b = br._new('masonry')
    v = br._coord(n, l)
    bt = n.new('ShaderNodeTexBrick')
    bt.inputs['Scale'].default_value = 7.0
    bt.inputs['Mortar Size'].default_value = 0.012
    bt.inputs['Color1'].default_value = (*br.lin((0.55, 0.52, 0.47)), 1)
    bt.inputs['Color2'].default_value = (*br.lin((0.42, 0.4, 0.36)), 1)
    bt.inputs['Mortar'].default_value = (*br.lin((0.25, 0.24, 0.22)), 1)
    l.new(v, bt.inputs['Vector'])
    nz = br._noise(n, l, v, 25, 8)
    col = br._mixc(n, l, bt.outputs['Color'], (0.3, 0.3, 0.27), nz.outputs['Fac'], 'MULTIPLY')
    l.new(col, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.88
    add = n.new('ShaderNodeMath'); add.operation = 'MULTIPLY_ADD'
    l.new(nz.outputs['Fac'], add.inputs[0]); add.inputs[1].default_value = 0.3
    l.new(bt.outputs['Fac'], add.inputs[2])
    inv = n.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
    l.new(add.outputs[0], inv.inputs[1])
    br._bump(n, l, b, inv.outputs[0], 0.6, 0.02)
    br.MATS['masonry'] = m


@piece
def iron_tower():
    masonry()
    cyl((0, 0, 0.9), 0.62, 1.8, 'masonry', r2=0.55, v=64, bev=0.01)
    cyl((0, 0, 1.86), 0.66, 0.12, 'masonry', v=64)
    for i in range(10):
        a = i * 2 * math.pi / 10
        box((0.6 * math.cos(a), 0.6 * math.sin(a), 2.03), (0.16, 0.12, 0.22), 'masonry', rot=(0, 0, a), bev=0.01)
    box((-0.6, 0, 0.32), (0.08, 0.3, 0.62), 'dark_wood', bev=0.02)
    cyl((-0.6, 0, 0.62), 0.15, 0.08, 'dark_wood', rot=(0, math.pi / 2, 0), v=32)
    for z in (1.05, 1.45):
        for a in (math.pi - 0.5, math.pi + 0.5, math.pi):
            box((0.59 * math.cos(a), 0.59 * math.sin(a), z), (0.06, 0.05, 0.16), 'boot', rot=(0, 0, a), bev=0.005)
    rod((0, 0, 1.9), (0, 0, 2.9), 0.015, 'dark_wood', v=10)
    fl = plate([(0, 0), (-0.45, 0.02), (-0.42, -0.14), (-0.45, -0.3), (0, -0.28)], 0.008, 'red_cloth', bev=0.002)
    fl.rotation_euler = (math.pi / 2, 0, 0)
    fl.location = (0, 0, 2.85)
    w = fl.modifiers.new('wave', 'SIMPLE_DEFORM'); w.deform_method = 'BEND'; w.deform_axis = 'Z'; w.angle = math.radians(40)
    for a in (0.6, 2.4, 4.0):
        sph((0.7 * math.cos(a), 0.7 * math.sin(a), 0.08), 0.13, 'stone', scale=(1.3, 1, 0.6))


# ---------------------------------------------------------- industrial age
def shako(h, cloth='blue_cloth', plume='red_cloth'):
    c = hat_at(h, 0.03)
    cyl(tuple(c + Vector((0, 0, 0.09))), 0.1, 0.2, cloth, r2=0.115, bev=0.01)
    cyl(tuple(c + Vector((0, 0, 0.2))), 0.117, 0.02, 'boot')
    box(tuple(c + Vector((-0.11, 0, 0.0))), (0.07, 0.15, 0.01), 'boot', rot=(0, -0.3, 0), bev=0.004)
    sph(tuple(c + Vector((-0.115, 0, 0.12))), 0.03, 'brass', scale=(0.4, 1, 1.2))
    sph(tuple(c + Vector((-0.08, 0, 0.27))), 0.035, plume, scale=(1, 1, 1.8))
    return c


def musket(a, b, bayonet=True):
    a, b = Vector(a), Vector(b)
    d = b - a
    rod(tuple(a), tuple(a + d * 0.3), 0.026, 'wood', r2=0.018, v=12)
    rod(tuple(a + d * 0.3), tuple(a + d * 0.85), 0.016, 'wood', v=12)
    rod(tuple(a + d * 0.28), tuple(b), 0.009, 'gunmetal', v=10)
    box(tuple(a + d * 0.32), (0.06, 0.02, 0.03), 'brass', bev=0.004)
    if bayonet:
        dn = d.normalized()
        rod(tuple(b), tuple(b + dn * 0.32), 0.009, 'steel', r2=0.001, v=4, bev=0)


@piece
def ind_rifleman():
    h = person('rifle', outfit='male_elegantsuit01', outfit_tint=L((0.07, 0.12, 0.33)), shoes='shoes04',
               shoes_tint=L((0.03, 0.03, 0.03)), hair='short04')
    shako(h)
    sp, pl = h.head('spine05'), h.head('pelvis.L')
    for sgn in (1, -1):
        tube([tuple(h.head('clavicle.L' if sgn > 0 else 'clavicle.R') + Vector((-0.09, 0, 0.02))), tuple(sp + Vector((-0.14, 0, -0.12))),
              tuple(h.head('pelvis.R' if sgn > 0 else 'pelvis.L') + Vector((-0.1, 0, 0.05)))], 0.018, 'white_cloth')
    pl, pr = hand(h, 'L'), hand(h, 'R')
    d = (pl - pr).normalized()
    musket(tuple(pr - d * 0.32), tuple(pl + d * 0.62))


@piece
def ind_emperor():
    from blender_real import MATS
    h = person('staff', targets=OLDER, outfit='male_elegantsuit01', outfit_tint=L((0.05, 0.08, 0.24)), shoes='shoes04',
               shoes_tint=L((0.03, 0.03, 0.03)), hair='short02', hair_tint=L((0.15, 0.1, 0.06)))
    cape = h.garment(['spine04', 'spine05', 'clavicle.L', 'clavicle.R', 'shoulder01.L', 'shoulder01.R', 'neck01', 'spine03'],
                     offset=0.06, mat=MATS['red_cloth'], thick=0.015, threshold=0.35, name='cape', source=h.parts['outfit'])
    collar = h.garment(['neck01', 'clavicle.L', 'clavicle.R', 'spine05'], offset=0.08, mat=MATS['white_cloth'], thick=0.02, threshold=0.6, name='ermine', source=h.parts['outfit'])
    hair(collar, 'hair_grey', count=2500, length=0.025, children=6)
    sp = h.head('spine05')
    tube([tuple(h.head('clavicle.R') + Vector((-0.1, 0, 0.0))), tuple(sp + Vector((-0.15, 0, -0.15))), tuple(h.head('pelvis.L') + Vector((-0.12, 0, 0.0)))], 0.03, 'red_cloth')
    sph(tuple(sp + Vector((-0.14, -0.06, -0.05))), 0.03, 'gold')
    for s in ('L', 'R'):
        box(tuple(h.head('upperarm01.' + s) + Vector((0.01, 0, 0.035))), (0.13, 0.08, 0.016), 'gold', bev=0.005)
    pl = hand(h, 'L')
    rod(tuple(pl + Vector((0, 0, -0.2))), tuple(pl + Vector((0, 0, 0.3))), 0.015, 'gold', v=12)
    sph(tuple(pl + Vector((0, 0, 0.34))), 0.05, 'gold')
    crown(tuple(hat_at(h, -0.02)), 1.05)


@piece
def ind_cavalry():
    horse(coat='fur_horse2', mane='hair_dark')
    h = person('ride', outfit='male_elegantsuit01', outfit_tint=L((0.5, 0.06, 0.05)), shoes='shoes04', shoes_tint=L((0.03, 0.03, 0.03)), hair='short04')
    rider(h)
    shako(h, 'boot', 'white_cloth')
    pr = hand(h, 'R')
    sword(tuple(pr), (-0.6, 0.15, 0.8), 0.85)


@piece
def ind_train():
    # armoured steam locomotive
    cyl((-0.35, 0, 0.95), 0.36, 1.45, 'loco', rot=(0, math.pi / 2, 0), v=48)
    for x in (-1.0, -0.6, -0.2, 0.2):
        torus((x, 0, 0.95), 0.36, 0.018, 'brass', rot=(0, math.pi / 2, 0))
    cyl((-1.1, 0, 0.95), 0.33, 0.06, 'gunmetal', rot=(0, math.pi / 2, 0), v=48)
    sph((-1.15, 0, 1.2), 0.08, 'glass', scale=(0.5, 1, 1)); cyl((-1.12, 0, 1.2), 0.09, 0.06, 'brass', rot=(0, math.pi / 2, 0))
    cyl((-0.95, 0, 1.45), 0.1, 0.4, 'loco', r2=0.14, v=24)
    cyl((-0.95, 0, 1.68), 0.15, 0.06, 'loco', v=24)
    sph((-0.35, 0, 1.33), 0.12, 'brass', scale=(1, 1, 0.8))
    # cab, armoured
    hull([(0.4, -0.5, 0.6), (0.4, 0.5, 0.6), (1.2, -0.5, 0.6), (1.2, 0.5, 0.6), (0.4, -0.5, 1.6), (0.4, 0.5, 1.6), (1.2, -0.5, 1.6), (1.2, 0.5, 1.6),
          (0.55, -0.4, 1.75), (0.55, 0.4, 1.75), (1.1, -0.4, 1.75), (1.1, 0.4, 1.75)], 'tank_plain', bev=0.015)
    for y in (-0.505, 0.505):
        box((0.8, y, 1.3), (0.3, 0.01, 0.06), 'boot', bev=0.003)
        for x in (0.5, 0.7, 0.9, 1.1):
            for z in (0.7, 1.5):
                sph((x, y, z), 0.012, 'iron')
    cyl((0.8, 0, 1.9), 0.25, 0.18, 'tank_plain', v=40)
    rod((0.6, 0, 1.92), (0.05, 0, 1.95), 0.03, 'gunmetal', v=16)
    box((-0.2, 0, 0.55), (1.9, 1.0, 0.12), 'dark_paint', bev=0.01)
    box((-1.35, 0, 0.42), (0.25, 0.9, 0.3), 'dark_paint', bev=0.02)
    for y in (-0.35, 0.35):
        cyl((-1.5, y, 0.45), 0.08, 0.06, 'iron', rot=(0, math.pi / 2, 0))
    hull([(-1.48, -0.45, 0.28), (-1.48, 0.45, 0.28), (-1.75, 0, 0.1), (-1.48, -0.4, 0.1), (-1.48, 0.4, 0.1), (-1.6, 0, 0.3)], 'red_paint', bev=0.01)
    for x in (-0.85, -0.3, 0.25, 0.85):
        for y in (-0.42, 0.42):
            r = 0.3 if abs(x) < 0.6 else 0.2
            cyl((x, y, r + 0.02), r, 0.06, 'dark_paint', rot=(math.pi / 2, 0, 0), v=40)
            torus((x, y, r + 0.02), r, 0.02, 'iron', rot=(math.pi / 2, 0, 0))
            cyl((x, y * 1.08, r + 0.02), 0.04, 0.03, 'gunmetal', rot=(math.pi / 2, 0, 0))
    for y in (-0.47, 0.47):
        rod((-0.3, y, 0.42), (0.25, y, 0.42), 0.02, 'steel')


@piece
def ind_armored():
    # early armoured car with twin turrets
    hull([(-1.0, -0.42, 0.45), (-1.0, 0.42, 0.45), (-1.05, -0.35, 0.8), (-1.05, 0.35, 0.8), (1.0, -0.48, 0.45), (1.0, 0.48, 0.45),
          (1.0, -0.48, 1.2), (1.0, 0.48, 1.2), (-0.35, -0.48, 1.2), (-0.35, 0.48, 1.2), (-0.6, -0.4, 0.95), (-0.6, 0.4, 0.95)], 'tank_plain', bev=0.012)
    for y in (-0.22, 0.22):
        cyl((0.35, y, 1.32), 0.2, 0.25, 'tank_plain', v=40)
        cyl((0.35, y, 1.46), 0.18, 0.04, 'tank_plain', v=40)
        rod((0.25, y * 1.4, 1.32), (-0.25, y * 1.6, 1.32), 0.025, 'gunmetal', v=12)
        cyl((-0.25, y * 1.6, 1.32), 0.04, 0.12, 'gunmetal', rot=(0, math.pi / 2, 0))
    for x in (-0.65, 0.65):
        for y in (-0.5, 0.5):
            cyl((x, y, 0.36), 0.33, 0.12, 'rubber', rot=(math.pi / 2, 0, 0), v=40)
            cyl((x, y * 1.08, 0.36), 0.2, 0.03, 'dark_paint', rot=(math.pi / 2, 0, 0), v=40)
            for k in range(10):
                a = k * math.pi / 10
                rod((x + 0.19 * math.cos(a), y * 1.09, 0.36 + 0.19 * math.sin(a)), (x - 0.19 * math.cos(a), y * 1.09, 0.36 - 0.19 * math.sin(a)), 0.012, 'dark_paint', v=6)
        box((x, 0, 0.73), (0.7, 1.15, 0.03), 'dark_paint', bev=0.006)
    box((-1.06, 0, 0.6), (0.04, 0.6, 0.25), 'dark_paint', bev=0.004)
    for z in (0.52, 0.58, 0.64, 0.7):
        box((-1.08, 0, z), (0.01, 0.55, 0.02), 'iron', bev=0.002)
    for y in (-0.3, 0.3):
        sph((-1.07, y, 0.82), 0.06, 'brass', scale=(0.6, 1, 1)); sph((-1.1, y, 0.82), 0.045, 'glass', scale=(0.4, 1, 1))
    box((-0.75, 0, 1.0), (0.02, 0.5, 0.06), 'boot', rot=(0, 0.6, 0), bev=0.002)


@piece
def ind_airship():
    import blender_real as br
    br.MATS['envelope'] = br.fabric('envelope', (0.72, 0.72, 0.7), rough=0.55, weave=60, sheen=0.2)
    secs = []
    for i in range(15):
        t = i / 14
        x = -1.6 + t * 3.2
        r = 0.42 * (1 - (2 * t - 1) ** 2) ** 0.5 if 0 < t < 1 else 0.02
        r = max(r, 0.03)
        secs.append((x, r * (1.0 if t > 0.12 else 1.0), r, 1.5))
    loft(secs, 'envelope', ring=40, subsurf=2)
    for k in range(9):
        x = -1.2 + k * 0.3
        t = (x + 1.6) / 3.2
        r = 0.42 * max(0.0, 1 - (2 * t - 1) ** 2) ** 0.5
        torus((x, 0, 1.5), r + 0.003, 0.006, 'iron', rot=(0, math.pi / 2, 0))
    for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
        f = plate([(0, 0), (0.45, 0), (0.45, 0.32), (0.15, 0.1)], 0.02, 'red_paint', bev=0.004)
        f.rotation_euler = (a + math.pi / 2, 0, 0)
        f.location = (1.05, 0, 1.5)
    loft([(-0.42, 0.06, 0.06, 0.9, 2.4), (-0.3, 0.14, 0.11, 0.9, 3.0), (0.3, 0.14, 0.11, 0.9, 3.0), (0.45, 0.06, 0.06, 0.9, 2.4)], 'dark_wood', subsurf=1)
    for x in (-0.3, -0.1, 0.1, 0.3):
        box((x, -0.141, 0.93), (0.1, 0.005, 0.05), 'glass', bev=0.002)
    for x in (-0.3, 0.3):
        rod((x, 0, 1.0), (x * 1.2, 0, 1.13), 0.012, 'iron')
    for y in (-0.35, 0.35):
        rod((0.0, y * 0.4, 1.12), (0.1, y, 1.15), 0.015, 'iron')
        cyl((0.15, y, 1.15), 0.06, 0.2, 'gunmetal', rot=(0, math.pi / 2, 0))
        for k in range(2):
            b = box((0.27, y, 1.15), (0.01, 0.3, 0.035), 'dark_wood', rot=(k * math.pi / 2, 0, 0), bev=0.004)
    sph((-0.42, 0, 0.9), 0.04, 'brass')


# -------------------------------------------------------- modern vehicles
@piece
def jet():
    import blender_real as br
    loft([(-1.55, 0.01, 0.01, 0.8), (-1.35, 0.07, 0.07, 0.8), (-1.0, 0.14, 0.15, 0.82), (-0.6, 0.18, 0.2, 0.84, 2.4), (-0.2, 0.3, 0.2, 0.82, 2.8),
          (0.4, 0.33, 0.18, 0.8, 3.0), (0.9, 0.3, 0.16, 0.8, 3.0), (1.3, 0.22, 0.14, 0.8, 2.6), (1.45, 0.2, 0.13, 0.8, 2.2)], 'grey_paint', subsurf=2)
    sph((-0.62, 0, 0.98), 0.17, 'tinted', scale=(2.3, 0.75, 0.62))
    for sgn in (1, -1):
        w = plate([(-0.45, 0.0), (0.75, 0.0), (0.85, 1.05), (0.65, 1.1)], 0.035, 'grey_paint', bev=0.006)
        w.location = (0, 0.25 * sgn, 0.78); w.scale = (1, sgn, 1)
        st = plate([(0.95, 0.0), (1.4, 0.0), (1.45, 0.55), (1.3, 0.57)], 0.025, 'grey_paint', bev=0.004)
        st.location = (0, 0.18 * sgn, 0.8); st.scale = (1, sgn, 1)
        fin = plate([(0.85, 0.0), (1.4, 0.0), (1.48, 0.62), (1.28, 0.64)], 0.025, 'grey_paint', bev=0.004)
        fin.rotation_euler = (math.pi / 2 - 0.25 * sgn, 0, 0); fin.location = (0, 0.15 * sgn, 0.92)
        box((-0.35, 0.3 * sgn, 0.72), (0.6, 0.16, 0.22), 'grey_paint', bev=0.03)
        cyl((-0.65, 0.3 * sgn, 0.72), 0.085, 0.04, 'boot', rot=(0, math.pi / 2, 0))
        cyl((1.52, 0.11 * sgn, 0.8), 0.11, 0.2, 'gunmetal', rot=(0, math.pi / 2, 0), r2=0.1, v=32)
        sph((1.6, 0.11 * sgn, 0.8), 0.08, 'flame', scale=(0.4, 1, 1))
        for k, wy in enumerate((0.55, 0.85)):
            rod((0.0, wy * sgn, 0.7), (0.6, wy * sgn, 0.7), 0.04, 'white_plastic', v=16)
            rod((-0.15, wy * sgn, 0.7), (0.0, wy * sgn, 0.7), 0.04, 'white_plastic', r2=0.001, v=16)
        sp = plate([(0, 0), (0.08, 0), (0.12, 0.08), (0.02, 0.08)], 0.004, 'star_red', bev=0)
        sp.location = (1.2, 0.165 * sgn, 1.25); sp.rotation_euler = (math.pi / 2, 0, 0)
    for x, y in ((-0.9, 0), (0.25, 0.25), (0.25, -0.25)):
        rod((x, y, 0.6), (x, y, 0.3), 0.025, 'steel', v=12)
        cyl((x, y, 0.22), 0.09, 0.07, 'rubber', rot=(math.pi / 2, 0, 0))
    rod((-1.55, 0, 0.8), (-1.85, 0, 0.8), 0.008, 'steel', v=8)


@piece
def helicopter():
    loft([(-1.15, 0.05, 0.08, 0.85), (-1.0, 0.18, 0.22, 0.85, 2.4), (-0.6, 0.26, 0.32, 0.9, 2.6), (-0.1, 0.32, 0.38, 0.95, 2.8),
          (0.4, 0.3, 0.35, 1.0, 2.8), (0.8, 0.18, 0.2, 1.05, 2.4), (1.2, 0.08, 0.1, 1.1), (2.0, 0.05, 0.06, 1.15)], 'tank', subsurf=2)
    sph((-0.85, 0, 1.06), 0.2, 'tinted', scale=(1.2, 0.9, 0.8))
    sph((-0.5, 0, 1.22), 0.2, 'tinted', scale=(1.3, 0.95, 0.8))
    box((0.0, 0, 1.36), (0.7, 0.42, 0.18), 'tank', bev=0.04)
    for y in (-0.13, 0.13):
        cyl((-0.15, y, 1.4), 0.1, 0.5, 'tank', rot=(0, math.pi / 2, 0), v=24)
        cyl((-0.42, y, 1.4), 0.08, 0.03, 'boot', rot=(0, math.pi / 2, 0))
    cyl((0.1, 0, 1.55), 0.06, 0.2, 'gunmetal')
    cyl((0.1, 0, 1.66), 0.1, 0.05, 'gunmetal')
    for k in range(5):
        a = k * 2 * math.pi / 5 + 0.3
        b = box((0.1 + 1.3 * math.cos(a), 1.3 * math.sin(a), 1.68), (2.6, 0.12, 0.018), 'dark_paint', rot=(0.05, 0, a), bev=0.004)
    fin = plate([(1.75, 0.0), (2.1, 0.0), (2.2, 0.5), (2.0, 0.5)], 0.03, 'tank', bev=0.005)
    fin.rotation_euler = (math.pi / 2, 0, 0); fin.location = (0, 0.015, 1.12)
    for k in range(3):
        a = k * 2 * math.pi / 3
        box((2.1 + 0.25 * math.cos(a), -0.06, 1.4 + 0.25 * math.sin(a)), (0.5, 0.012, 0.06), 'dark_paint', rot=(0, -a, 0), bev=0.003)
    for sgn in (1, -1):
        w = plate([(-0.25, 0.0), (0.15, 0.0), (0.1, 0.55), (-0.15, 0.55)], 0.04, 'tank', bev=0.006)
        w.location = (0, 0.25 * sgn, 0.95); w.scale = (1, sgn, 1); w.rotation_euler = (0.15 * sgn, 0, 0)
        for wy in (0.5, 0.72):
            cyl((-0.08, wy * sgn, 0.85), 0.07, 0.5, 'tank_plain', rot=(0, math.pi / 2, 0), v=24)
            cyl((-0.34, wy * sgn, 0.85), 0.06, 0.02, 'boot', rot=(0, math.pi / 2, 0))
        rod((-0.5, 0.28 * sgn, 0.6), (-0.5, 0.36 * sgn, 0.25), 0.025, 'steel')
        cyl((-0.5, 0.38 * sgn, 0.2), 0.12, 0.08, 'rubber', rot=(math.pi / 2, 0, 0))
    rod((1.5, 0, 0.9), (1.55, 0, 0.75), 0.015, 'steel'); cyl((1.55, 0, 0.72), 0.05, 0.03, 'rubber', rot=(math.pi / 2, 0, 0))
    rod((-1.05, 0, 0.75), (-1.3, 0, 0.72), 0.02, 'gunmetal', v=12)
    sph((-1.02, 0, 0.75), 0.08, 'gunmetal')


@piece
def apc():
    hull([(-1.25, -0.48, 0.55), (-1.25, 0.48, 0.55), (-1.05, -0.5, 0.95), (-1.05, 0.5, 0.95), (1.2, -0.6, 0.55), (1.2, 0.6, 0.55),
          (1.2, -0.48, 1.05), (1.2, 0.48, 1.05), (-0.5, -0.48, 1.08), (-0.5, 0.48, 1.08), (-1.15, -0.6, 0.62), (-1.15, 0.6, 0.62),
          (1.15, -0.62, 0.75), (1.15, 0.62, 0.75), (-1.0, -0.62, 0.75), (-1.0, 0.62, 0.75), (-1.2, -0.3, 0.35), (-1.2, 0.3, 0.35), (1.2, -0.3, 0.35), (1.2, 0.3, 0.35)],
         'tank', bev=0.015)
    for x in (-0.85, -0.3, 0.3, 0.85):
        for y in (-0.6, 0.6):
            torus((x, y, 0.33), 0.22, 0.1, 'rubber', rot=(math.pi / 2, 0, 0))
            cyl((x, y, 0.33), 0.2, 0.15, 'tank_plain', rot=(math.pi / 2, 0, 0), v=32)
            for k in range(8):
                a = k * math.pi / 4
                sph((x + 0.12 * math.cos(a), y * 1.13, 0.33 + 0.12 * math.sin(a)), 0.015, 'gunmetal')
            cyl((x, y * 1.13, 0.33), 0.05, 0.03, 'gunmetal', rot=(math.pi / 2, 0, 0))
    cyl((-0.35, 0, 1.2), 0.26, 0.24, 'tank', r2=0.2, v=40)
    rod((-0.55, 0, 1.22), (-1.4, 0, 1.24), 0.028, 'gunmetal', v=16)
    rod((-0.5, 0.08, 1.2), (-0.8, 0.08, 1.2), 0.012, 'gunmetal', v=10)
    for x in (-0.95, -0.85):
        box((x, 0, 0.98), (0.12, 0.25, 0.03), 'glass', rot=(0, 0.6, 0), bev=0.004)
    for x in (0.0, 0.5):
        cyl((x, -0.22, 1.08), 0.15, 0.04, 'tank', v=24)
        cyl((x, 0.22, 1.08), 0.15, 0.04, 'tank', v=24)
    for x in (-0.6, -0.4, 0.4, 0.6):
        box((x, -0.5, 0.92), (0.06, 0.01, 0.04), 'glass', bev=0.002)
    rod((0.9, 0.35, 1.05), (1.0, 0.4, 2.0), 0.005, 'gunmetal', v=6)
    box((0.9, 0, 1.07), (0.35, 0.6, 0.05), 'tank_plain', bev=0.01)


# ------------------------------------------------------- technology age
@piece
def tech_exo():
    from blender_real import MATS
    h = person('rifle', outfit='male_worksuit01', outfit_tint=L((0.07, 0.07, 0.08)), shoes='shoes06', shoes_tint=L((0.05, 0.05, 0.05)), hair='short04')
    # exoskeleton struts along the limbs
    for s in ('L', 'R'):
        for a, b in (('upperleg01.', 'lowerleg01.'), ('lowerleg01.', 'foot.'), ('upperarm01.', 'lowerarm01.'), ('lowerarm01.', 'wrist.')):
            pa, pb = h.head(a + s), h.head(b + s)
            off = Vector((0, 0.07 if s == 'R' else -0.07, 0))
            rod(tuple(pa + off), tuple(pb + off), 0.022, 'carbon', v=12)
            sph(tuple(pb + off), 0.035, 'white_plastic')
    h.garment(['spine03', 'spine04', 'spine05', 'clavicle.L', 'clavicle.R', 'breast.L', 'breast.R', 'shoulder01.L', 'shoulder01.R'],
              offset=0.025, mat=MATS['white_plastic'], thick=0.02, threshold=0.5, name='armor', source=h.parts['outfit'])
    sp = h.head('spine04')
    box(tuple(sp + Vector((0.17, 0, 0.0))), (0.12, 0.3, 0.38), 'carbon', bev=0.03)
    for y in (-0.08, 0.08):
        cyl(tuple(sp + Vector((0.25, y, -0.2))), 0.04, 0.1, 'glow', v=16)
    c = hat_at(h, 0.04)
    sph(tuple(c + Vector((0.0, 0, -0.04))), 0.135, 'white_plastic', scale=(1.1, 0.95, 1.05))
    sph(tuple(c + Vector((-0.05, 0, -0.08))), 0.12, 'tinted', scale=(0.95, 0.9, 0.55))
    box(tuple(c + Vector((-0.15, 0, -0.08))), (0.01, 0.14, 0.012), 'glow', bev=0.003)
    pl, pr = hand(h, 'L'), hand(h, 'R')
    d = (pl - pr).normalized()
    a, b = pr - d * 0.25, pl + d * 0.5
    rod(tuple(a), tuple(b), 0.035, 'white_plastic', v=16)
    rod(tuple(b), tuple(b + d * 0.15), 0.02, 'carbon', v=12)
    cyl(tuple(b + d * 0.16), 0.022, 0.01, 'glow', rot=(0, math.pi / 2, 0))
    box(tuple((a + b) / 2 + Vector((0, 0, 0.05))), (0.18, 0.05, 0.05), 'carbon', bev=0.01)


@piece
def tech_drone():
    sph((0, 0, 0.75), 0.25, 'carbon', scale=(1.4, 0.9, 0.38))
    sph((0, 0, 0.84), 0.2, 'white_plastic', scale=(1.3, 0.85, 0.35))
    sph((-0.3, 0, 0.66), 0.07, 'tinted')
    cyl((-0.3, 0, 0.66), 0.075, 0.06, 'gunmetal', rot=(0, math.pi / 2, 0))
    for a in (0.6, 2.54, 3.74, 5.68):
        x, y = 0.62 * math.cos(a), 0.62 * math.sin(a)
        rod((0, 0, 0.78), (x, y, 0.8), 0.028, 'carbon', v=12)
        cyl((x, y, 0.84), 0.05, 0.08, 'gunmetal', v=24)
        import blender_real as br
        br.MATS.setdefault('prop_blur', br.plain('prop_blur', (0.5, 0.5, 0.52), 0.2, transmission=0.97))
        cyl((x, y, 0.9), 0.3, 0.004, 'prop_blur', v=48, bev=0)
        for k in range(2):
            box((x, y, 0.895), (0.55, 0.035, 0.006), 'carbon', rot=(0, 0, a * 3 + k * math.pi), bev=0.002)
        sph((x * 1.08, y * 1.08, 0.78), 0.012, 'glow' if x < 0 else 'glow_red')
    for y in (-0.16, 0.16):
        rod((-0.1, y, 0.66), (-0.12, y * 1.2, 0.42), 0.012, 'carbon')
        rod((0.12, y, 0.66), (0.14, y * 1.2, 0.42), 0.012, 'carbon')
        rod((-0.18, y * 1.2, 0.42), (0.2, y * 1.2, 0.42), 0.012, 'carbon')


@piece
def tech_mech():
    for y in (-0.32, 0.32):
        hull([(x, y + dy, z) for x in (-0.12, 0.12) for dy in (-0.09, 0.09) for z in (0.95, 1.4)], 'grey_paint', bev=0.02)
        rod((0.0, y, 1.0), (0.22, y, 0.55), 0.08, 'gunmetal', v=16)
        sph((0.22, y, 0.55), 0.1, 'gunmetal')
        hull([(x, y + dy, z) for x in (0.12, 0.32) for dy in (-0.08, 0.08) for z in (0.55, 0.9)], 'grey_paint', bev=0.015)
        rod((0.22, y, 0.55), (-0.05, y, 0.12), 0.07, 'gunmetal', v=16)
        hull([(-0.35, y - 0.12, 0.0), (-0.35, y + 0.12, 0.0), (0.2, y - 0.12, 0.0), (0.2, y + 0.12, 0.0), (-0.25, y - 0.1, 0.12), (-0.25, y + 0.1, 0.12),
              (0.15, y - 0.1, 0.15), (0.15, y + 0.1, 0.15)], 'dark_paint', bev=0.015)
        rod((0.0, y * 0.5, 1.45), (0.25, y * 0.5, 1.15), 0.04, 'steel', v=12)
    hull([(-0.45, -0.42, 1.45), (-0.45, 0.42, 1.45), (0.4, -0.45, 1.4), (0.4, 0.45, 1.4), (-0.55, -0.35, 1.9), (-0.55, 0.35, 1.9),
          (0.35, -0.42, 2.0), (0.35, 0.42, 2.0), (-0.2, -0.3, 2.15), (-0.2, 0.3, 2.15), (0.2, -0.35, 2.15), (0.2, 0.35, 2.15)], 'grey_paint', bev=0.03)
    box((-0.52, 0, 1.85), (0.06, 0.5, 0.1), 'tinted', rot=(0, 0.35, 0), bev=0.01)
    box((-0.55, 0, 1.84), (0.02, 0.42, 0.025), 'glow', rot=(0, 0.35, 0), bev=0.004)
    for y in (-0.55, 0.55):
        sph((0, y, 1.92), 0.15, 'gunmetal')
        hull([(x, y + dy, z) for x in (-0.25, 0.2) for dy in (-0.1, 0.1) for z in (1.6, 1.95)], 'grey_paint', bev=0.02)
        for dz in (-0.05, 0.05):
            rod((-0.2, y, 1.75 + dz), (-0.95, y, 1.75 + dz), 0.035, 'gunmetal', v=16)
        cyl((-0.95, y, 1.75), 0.05, 0.1, 'gunmetal', rot=(0, math.pi / 2, 0))
    box((0.4, 0, 1.75), (0.25, 0.5, 0.45), 'dark_paint', bev=0.03)
    for z in (1.6, 1.7, 1.8, 1.9):
        box((0.53, 0, z), (0.01, 0.4, 0.04), 'iron', bev=0.002)
    rod((0.3, 0.3, 2.1), (0.4, 0.35, 2.6), 0.008, 'steel', v=8)
    sph((0.4, 0.35, 2.62), 0.02, 'glow_red')


@piece
def tech_laser():
    cyl((0, 0, 0.15), 0.62, 0.3, 'grey_paint', r2=0.55, v=64)
    cyl((0, 0, 0.36), 0.45, 0.12, 'gunmetal', v=64)
    for k in range(8):
        a = k * math.pi / 4
        box((0.58 * math.cos(a), 0.58 * math.sin(a), 0.12), (0.12, 0.08, 0.1), 'dark_paint', rot=(0, 0, a), bev=0.01)
    sph((0, 0, 0.62), 0.42, 'grey_paint', scale=(1.1, 1, 0.72))
    box((0.05, 0, 0.62), (0.5, 0.86, 0.24), 'grey_paint', bev=0.04)
    for y in (-0.47, 0.47):
        cyl((0.05, y, 0.62), 0.14, 0.1, 'gunmetal', rot=(math.pi / 2, 0, 0), v=32)
    rod((-0.3, 0, 0.66), (-1.25, 0, 0.72), 0.06, 'gunmetal', v=24)
    for k in range(4):
        cyl((-0.55 - k * 0.18, 0, 0.675 + k * 0.012), 0.085, 0.04, 'brass', rot=(0, math.pi / 2 - 0.06, 0), v=24)
    cyl((-1.27, 0, 0.72), 0.075, 0.04, 'glow_red', rot=(0, math.pi / 2, 0), v=24)
    sph((-1.3, 0, 0.72), 0.04, 'glow_red')
    box((-0.15, -0.44, 0.75), (0.2, 0.02, 0.06), 'glow', bev=0.004)
    box((-0.15, 0.44, 0.75), (0.2, 0.02, 0.06), 'glow', bev=0.004)
    rod((0.2, 0.25, 0.9), (0.25, 0.28, 1.4), 0.006, 'steel', v=8)


@piece
def tech_ai():
    cyl((0, 0, 0.12), 0.55, 0.24, 'carbon', r2=0.48, v=64)
    cyl((0, 0, 0.3), 0.4, 0.12, 'grey_paint', r2=0.32, v=64)
    for k in range(12):
        a = k * math.pi / 6
        box((0.5 * math.cos(a), 0.5 * math.sin(a), 0.2), (0.04, 0.12, 0.02), 'glow', rot=(0, 0, a), bev=0.004)
    import blender_real as br
    br.MATS['core'] = br.plain('core', (0.3, 0.8, 1.0), 0.05, emission=((0.25, 0.75, 1.0), 9.0))
    sph((0, 0, 1.0), 0.42, 'glass')
    sph((0, 0, 1.0), 0.2, 'core')
    for k in range(6):
        a = k * math.pi / 3
        rod((0.21 * math.cos(a), 0.21 * math.sin(a), 1.0), (0.38 * math.cos(a), 0.38 * math.sin(a), 1.0 + 0.1 * math.sin(3 * a)), 0.008, 'core', v=6)
    for i, (rx, ry) in enumerate(((0.4, 0.2), (1.1, 0.9), (0.3, 1.5))):
        torus((0, 0, 1.0), 0.56 + i * 0.07, 0.016, 'silver', rot=(rx, ry, 0))
    for k in range(3):
        a = k * 2 * math.pi / 3
        rod((0.35 * math.cos(a), 0.35 * math.sin(a), 0.34), (0.3 * math.cos(a), 0.3 * math.sin(a), 0.68), 0.03, 'grey_paint', v=12)
    crown((0, 0, 1.47), 1.25)
