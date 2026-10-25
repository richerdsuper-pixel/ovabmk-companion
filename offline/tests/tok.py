"""Тестовые ключи активации: своя пара ключей подписи на каждый запуск тестов (в программу передаётся как window.__TEST_SIGN_PUB)."""
import json, base64, time
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
_k = ec.generate_private_key(ec.SECP256R1())
def _b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()
_n = _k.public_key().public_numbers()
PUB = {"x": _b64(_n.x.to_bytes(32, "big")), "y": _b64(_n.y.to_bytes(32, "big"))}
def token(role, name="Тест Доя", inst="СВП №1", k=None, days=30, iat=None, extra=None, handover=None, uid=None):
    now = int(iat if iat is not None else time.time())
    body = _b64(json.dumps({"v": 1, "uid": uid or ("u-" + role), "role": role, "name": name, "pos": "Доя", "inst": inst, "k": k, "extra": extra or [], "handover": handover or [], "iat": now, "exp": now + days * 86400}, ensure_ascii=False).encode())
    r, s = decode_dss_signature(_k.sign(body.encode(), ec.ECDSA(hashes.SHA256())))
    return body + "." + _b64(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
def init_script(role=None, k=None, now="2026-10-24T10:00:00"):
    """Скрипт для add_init_script: тестовый ключ подписи + (если задана должность) уже введённый ключ активации."""
    js = "window.__NOW='%s';window.__TEST_SIGN_PUB=%s;" % (now, json.dumps(PUB))
    if role: js += "try{if(!localStorage.getItem('ovabmk_tok'))localStorage.setItem('ovabmk_tok',%s)}catch(e){}" % json.dumps(token(role, k=k, iat=time.mktime(time.strptime(now, "%Y-%m-%dT%H:%M:%S"))))
    return js
