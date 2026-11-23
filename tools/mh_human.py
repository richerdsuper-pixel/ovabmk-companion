"""Реалистичные люди для рендеров «Шахмат царств»: тело, скелет, одежда и волосы MakeHuman.

Данные — пакет npm `ara3d-data` (MakeHuman, CC0 1.0; см. его assets/LICENSE.txt):
    npm pack ara3d-data && tar xzf ara3d-data-*.tgz
    MH_ASSETS=<путь>/package/assets bl/bin/python tools/blender_real.py <папка>
Формат *.pack: gzip → "MHP1" + uint32 длина JSON-заголовка + JSON {meta, arrays} + двоичные массивы.

Используются только данные (вершины, грани, UV, веса, текстуры), без кода ara3d.
"""
import gzip
import json
import os
import struct

import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.environ.get('MH_ASSETS', '')
_T = {'Float32Array': np.float32, 'Uint32Array': np.uint32, 'Uint16Array': np.uint16, 'Int16Array': np.int16,
      'Int32Array': np.int32, 'Uint8Array': np.uint8, 'Int8Array': np.int8}
_CACHE = {}

# MakeHuman (x right, y up, z forward, decimetres) -> Blender (front = -X, Z up, metres; feet on z=0)
_R = np.array([[0, 0, -1], [-1, 0, 0], [0, 1, 0]], dtype=np.float64)


def available():
    return bool(ROOT) and os.path.exists(os.path.join(ROOT, 'base.pack'))


def load(rel):
    if rel in _CACHE:
        return _CACHE[rel]
    b = open(os.path.join(ROOT, rel), 'rb').read()
    if b[:2] == b'\x1f\x8b':
        b = gzip.decompress(b)
    assert b[:4] == b'MHP1', rel
    n = struct.unpack('<I', b[4:8])[0]
    hdr = json.loads(b[8:8 + n])
    blob = b[8 + n:]
    arrs = {a['name']: np.frombuffer(blob, dtype=_T[a['type']], count=a['length'], offset=a['offset']) for a in hdr['arrays']}
    _CACHE[rel] = (hdr['meta'], arrs)
    return _CACHE[rel]


def morph(targets):
    """Base vertex positions (MH space) with macro/detail targets applied: {name: weight}."""
    meta, a = load('base.pack')
    P = a['positions'].reshape(-1, 3).astype(np.float64).copy()
    tm, ta = load('targets.pack')
    for name, w in targets.items():
        if not w or name not in tm['targets']:
            continue
        start, count, scale = tm['targets'][name]
        if not count:
            continue
        sl = slice(start, start + count)
        # indices and int16 deltas are both delta-coded along the list
        idx = np.cumsum(ta['idx'][sl].astype(np.int64))
        d = np.stack([np.cumsum((ta[k + 'lo'][sl].astype(np.uint16) | (ta[k + 'hi'][sl].astype(np.uint16) << 8)).view(np.int16).astype(np.int64)).astype(np.int16)
                      for k in 'xyz'], 1)
        P[idx] += d.astype(np.float64) * scale * w
    return P


def to_bl(P):
    Q = (P @ _R.T) * 0.1
    return Q


def _image(name):
    if not name:
        return None
    img = bpy.data.images.get(name)
    if img is None:
        img = bpy.data.images.load(os.path.join(ROOT, 'textures', name))
    return img


def tex_material(name, mat, tint=None, keep_detail=0.85, sss=0.0, rough=None, normal=True, camo=None):
    """Material from an MH texture; tint recolours it while keeping folds and seams."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    n, l = nt.nodes, nt.links
    b = n['Principled BSDF']
    b.inputs['Roughness'].default_value = rough if rough is not None else mat.get('roughness', 0.6)
    img = _image(mat.get('diffuse'))
    col = None
    if img:
        tx = n.new('ShaderNodeTexImage'); tx.image = img
        col = tx.outputs['Color']
        if mat.get('alpha') in ('mask', 'blend'):
            l.new(tx.outputs['Alpha'], b.inputs['Alpha'])
            try:
                m.blend_method = 'HASHED'
            except Exception:  # noqa: BLE001
                pass
        if tint is not None or camo is not None:
            bw = n.new('ShaderNodeRGBToBW'); l.new(col, bw.inputs[0])
            # contrast curve around the texture's mean so a light or dark garment both keep detail
            mr = n.new('ShaderNodeMapRange')
            mr.inputs['From Min'].default_value = 0.0; mr.inputs['From Max'].default_value = 0.6
            mr.inputs['To Min'].default_value = 1 - keep_detail; mr.inputs['To Max'].default_value = 1.15
            l.new(bw.outputs[0], mr.inputs['Value'])
            mul = n.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
            mul.inputs[0].default_value = 1.0
            l.new(mr.outputs[0], mul.inputs[6])
            if camo is not None:
                l.new(camo(n, l), mul.inputs[7])
            else:
                mul.inputs[7].default_value = (*tint, 1)
            col = mul.outputs[2]
        l.new(col, b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value = (*(tint or (0.8, 0.8, 0.8)), 1)
    if normal and mat.get('normal'):
        ni = n.new('ShaderNodeTexImage'); ni.image = _image(mat['normal']); ni.image.colorspace_settings.name = 'Non-Color'
        nm = n.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 1.0
        l.new(ni.outputs['Color'], nm.inputs['Color']); l.new(nm.outputs['Normal'], b.inputs['Normal'])
    if sss:
        b.inputs['Subsurface Weight'].default_value = sss
        b.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2)
        b.inputs['Subsurface Scale'].default_value = 0.012
    return m


def _mesh(name, verts, faces, uvs=None, face_uvs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    if uvs is not None:
        uvl = me.uv_layers.new(name='UV')
        k = 0
        flat = []
        for f in faces:
            for _ in f:
                u = face_uvs[k]; k += 1
                flat += [uvs[u * 2], uvs[u * 2 + 1]]
        uvl.data.foreach_set('uv', flat)
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return o


class Human:
    """One posable MakeHuman character in the current Blender scene."""

    def __init__(self, targets=None, skin='young_caucasian_male', hair='short02', hair_tint=None, eyebrows='eyebrow001',
                 eyes='brown', outfit=None, outfit_tint=None, outfit_camo=None, shoes='shoes06', shoes_tint=None,
                 hide_body=True, extra_outfits=()):
        meta, a = load('base.pack')
        self.meta = meta
        P = morph(targets or {'macrodetails/caucasian-male-young': 1.0})
        self.P = P
        self.objects = []
        self.parts = {}
        fv = a['faceVerts'].astype(np.int64)
        fuv = a['faceUVs'].astype(np.int64)
        used = np.unique(fv)
        remap = -np.ones(len(P), dtype=np.int64); remap[used] = np.arange(len(used))
        self.used, self.remap = used, remap
        V = to_bl(P)
        self.lift = -V[used][:, 2].min()
        V[:, 2] += self.lift
        self.V = V
        # skeleton
        bones = meta['bones']
        self.bone_names = [b['name'] for b in bones]
        J = {k: V[np.array(v)].mean(0) for k, v in meta['joints'].items()}
        arm = bpy.data.armatures.new('rig')
        rig = bpy.data.objects.new('rig', arm)
        bpy.context.collection.objects.link(rig)
        bpy.context.view_layer.objects.active = rig
        rig.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        eb = {}
        for b in bones:
            e = arm.edit_bones.new(b['name'])
            e.head = Vector(J[b['head']]); e.tail = Vector(J[b['tail']])
            if (e.tail - e.head).length < 1e-4:
                e.tail = e.head + Vector((0, 0, 0.01))
            eb[b['name']] = e
        for b in bones:
            if b.get('parent'):
                eb[b['name']].parent = eb[b['parent']]
        bpy.ops.object.mode_set(mode='OBJECT')
        self.rig = rig
        # skin weights (CSR)
        wOff, wBone, wVal = a['wOff'].astype(np.int64), a['wBone'].astype(np.int64), a['wVal']
        self.W = (wOff, wBone, wVal)
        # body
        delete = set()
        for rel in ([outfit] if outfit else []) + list(extra_outfits):
            if rel:
                pm, pa = load('proxies/outfit_%s.pack' % rel)
                delete |= set(pa['deleteVerts'].tolist())
        faces = fv.reshape(-1, 4)
        keep = [i for i, f in enumerate(faces) if not (hide_body and delete and any(int(x) in delete for x in f))]
        bf = [[int(remap[x]) for x in faces[i]] for i in keep]
        buv = np.concatenate([fuv.reshape(-1, 4)[i] for i in keep]) if keep else fuv
        skin_mat = tex_material('skin', {'diffuse': 'skin_%s.jpg' % skin, 'roughness': 0.5}, sss=0.18)
        body = _mesh('body', V[used], bf, a['uvs'], buv)
        body.data.materials.append(skin_mat)
        self._weights(body, lambda i: [int(used[i])])
        self._attach(body)
        self.body = body
        # eyes, brows, hair, clothes
        self.proxy('proxies/eyes_high-poly.pack', {'diffuse': 'eyes_%s.png' % eyes, 'roughness': 0.08}, name='eyes')
        if eyebrows:
            self.proxy('proxies/eyebrows_%s.pack' % eyebrows, None, name='brows')
        self.proxy('proxies/eyelashes_eyelashes01.pack', None, name='lashes')
        if hair:
            self.proxy('proxies/hair_%s.pack' % hair, None, name='hair', tint=hair_tint)
        if outfit:
            self.proxy('proxies/outfit_%s.pack' % outfit, None, name='outfit', tint=outfit_tint, camo=outfit_camo)
        for rel in extra_outfits:
            self.proxy('proxies/outfit_%s.pack' % rel, None, name='outfit2', tint=outfit_tint, camo=outfit_camo)
        if shoes:
            self.proxy('proxies/shoes_%s.pack' % shoes, None, name='shoes', tint=shoes_tint)

    # ------------------------------------------------------------------
    def _weights(self, o, refs_of, wts_of=None):
        wOff, wBone, wVal = self.W
        groups = {}
        for i in range(len(o.data.vertices)):
            acc = {}
            refs = refs_of(i)
            ws = wts_of(i) if wts_of else [1.0] * len(refs)
            for r, w in zip(refs, ws):
                for k in range(wOff[r], wOff[r + 1]):
                    acc[int(wBone[k])] = acc.get(int(wBone[k]), 0.0) + float(wVal[k]) * w
            for bi, w in acc.items():
                if w > 1e-4:
                    groups.setdefault(bi, []).append((i, w))
        for bi, lst in groups.items():
            vg = o.vertex_groups.new(name=self.bone_names[bi])
            for i, w in lst:
                vg.add([i], w, 'REPLACE')

    def _attach(self, o):
        mod = o.modifiers.new('arm', 'ARMATURE')
        mod.object = self.rig
        o.parent = self.rig
        self.objects.append(o)

    def proxy(self, rel, mat=None, name='proxy', tint=None, camo=None):
        pm, pa = load(rel)
        n = pm['vertexCount']
        refs = pa['refs'].astype(np.int64).reshape(n, 3)
        w = pa['weights'].reshape(n, 3).astype(np.float64)
        off = pa['offsets'].reshape(n, 3).astype(np.float64)
        P = self.P
        sc = np.ones(3)
        for ax, (i0, i1, den) in enumerate(pm['scale']):
            sc[ax] = abs(P[i0, ax] - P[i1, ax]) / den
        Pm = (P[refs] * w[..., None]).sum(1) + off * sc
        V = to_bl(Pm)
        V[:, 2] += self.lift
        sizes = pa['faceSizes']
        fvv = pa['faceVerts'].astype(np.int64)
        faces, k = [], 0
        for s in sizes.tolist():
            faces.append([int(x) for x in fvv[k:k + s]]); k += s
        o = _mesh(name, V, faces, pa['uvs'], pa['faceUVs'].astype(np.int64))
        m = tex_material(name, mat or pm.get('material', {}), tint=tint, camo=camo,
                         rough=None, sss=0.0)
        o.data.materials.append(m)
        self._weights(o, lambda i: refs[i].tolist(), lambda i: w[i].tolist())
        self._attach(o)
        self.parts[name] = o
        return o

    # ------------------------------------------------------------------
    def pb(self, name):
        return self.rig.pose.bones[name]

    def head(self, name):
        bpy.context.view_layer.update()
        return self.rig.matrix_world @ self.pb(name).head

    def tail(self, name):
        bpy.context.view_layer.update()
        return self.rig.matrix_world @ self.pb(name).tail

    def aim(self, name, direction, roll=None):
        """Rotate a bone so it points along `direction` (world space), keeping its twist."""
        bpy.context.view_layer.update()
        p = self.pb(name)
        M = p.matrix.copy()
        y = (M.to_3x3() @ Vector((0, 1, 0))).normalized()
        q = y.rotation_difference(Vector(direction).normalized())
        R = q.to_matrix().to_4x4() @ Matrix(M.to_3x3()).to_4x4()
        R.translation = M.translation
        p.matrix = R
        bpy.context.view_layer.update()

    def bend(self, name, axis, deg):
        """Extra local rotation (e.g. bend knee/elbow) in degrees about a world axis."""
        bpy.context.view_layer.update()
        p = self.pb(name)
        M = p.matrix.copy()
        R = Matrix.Rotation(np.radians(deg), 4, Vector(axis)) @ Matrix(M.to_3x3()).to_4x4()
        R.translation = M.translation
        p.matrix = R
        bpy.context.view_layer.update()

    def limb(self, upper, lower, target, hint):
        """Two-segment IK: upper/lower are bone chains, e.g. ['upperarm01.L','upperarm02.L']."""
        S = self.head(upper[0]); E = self.head(lower[0]); W = self.tail(lower[-1])
        L1, L2 = (E - S).length, (W - E).length
        T = Vector(target)
        d = T - S
        D = min(d.length, (L1 + L2) * 0.995)
        dn = d.normalized()
        hv = Vector(hint) - S
        side = hv - dn * hv.dot(dn)
        side = side.normalized() if side.length > 1e-6 else Vector((0, 0, 1))
        a = (L1 * L1 + D * D - L2 * L2) / (2 * D)
        h = max(0.0, L1 * L1 - a * a) ** 0.5
        Ep = S + dn * a + side * h
        for nm in upper:
            self.aim(nm, Ep - S)
        for nm in lower:
            self.aim(nm, S + dn * D - Ep)

    def arm(self, side, hand, elbow):
        s = side
        self.limb(['upperarm01.' + s, 'upperarm02.' + s], ['lowerarm01.' + s, 'lowerarm02.' + s], hand, elbow)

    def leg(self, side, ankle, knee):
        s = side
        self.limb(['upperleg01.' + s, 'upperleg02.' + s], ['lowerleg01.' + s, 'lowerleg02.' + s], ankle, knee)

    def evaluated(self, obj, group=None, min_w=0.5):
        """World-space vertices of a posed part (optionally only those weighted to `group`)."""
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        ev = obj.evaluated_get(dg)
        me = ev.to_mesh()
        mw = obj.matrix_world
        out = []
        gi = obj.vertex_groups[group].index if group and group in obj.vertex_groups else None
        src = obj.data.vertices
        for i, v in enumerate(me.vertices):
            if gi is not None:
                if i >= len(src) or not any(g.group == gi and g.weight >= min_w for g in src[i].groups):
                    continue
            out.append(mw @ v.co)
        ev.to_mesh_clear()
        return out

    def head_top(self):
        pts = self.evaluated(self.body, 'head')
        top = max(pts, key=lambda p: p.z)
        cx = sum(p.x for p in pts) / len(pts); cy = sum(p.y for p in pts) / len(pts)
        hair = self.parts.get('hair')
        z = top.z
        if hair:
            hz = max(p.z for p in self.evaluated(hair))
            z = max(z, hz - 0.01)
        return Vector((cx, cy, z)), Vector((cx, cy, top.z))

    def garment(self, bones, offset=0.012, mat=None, thick=0.006, threshold=0.35, name='garment', subsurf=1, extra=None, source=None):
        """Clothing shell grown from the body (or a worn outfit) over the given bones; follows the pose."""
        import bmesh as _bm
        src = source or self.body
        me = src.data.copy()
        o = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(o)
        for vg in src.vertex_groups:
            o.vertex_groups.new(name=vg.name)
        # copy weights
        idx = {vg.name: vg.index for vg in o.vertex_groups}
        for v in src.data.vertices:
            for g in v.groups:
                o.vertex_groups[g.group].add([v.index], g.weight, 'REPLACE')
        keep = set()
        names = {src.vertex_groups[i].name: i for i in range(len(src.vertex_groups))}
        bset = {names[b] for b in bones if b in names}
        for v in src.data.vertices:
            w = sum(g.weight for g in v.groups if g.group in bset)
            if w >= threshold or (extra and extra(v.co)):
                keep.add(v.index)
        bm = _bm.new(); bm.from_mesh(me)
        bm.verts.ensure_lookup_table()
        _bm.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context='VERTS')
        bm.to_mesh(me); bm.free()
        dsp = o.modifiers.new('inflate', 'DISPLACE'); dsp.strength = offset; dsp.mid_level = 0.0
        so = o.modifiers.new('thick', 'SOLIDIFY'); so.thickness = thick; so.offset = 1.0
        if subsurf:
            ss = o.modifiers.new('ss', 'SUBSURF'); ss.levels = subsurf; ss.render_levels = subsurf
        o.data.materials.clear()
        if mat is not None:
            o.data.materials.append(mat)
        self._attach(o)
        # armature after the shell modifiers
        return o

    def chain(self, names, direction):
        for nm in names:
            self.aim(nm, direction)

    def apply(self):
        """Bake pose into the meshes so props can be placed against final geometry."""
        bpy.context.view_layer.update()
        return self.objects
