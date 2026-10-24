// Мок supabase-js для проверки интерфейса без сервера. Сценарий задаётся window.__MOCK.
(function () {
  var M = window.__MOCK;
  function res(data, error) { return Promise.resolve({ data: data, error: error || null }); }
  function Q(table) {
    this.t = table; this.f = []; this.op = "select"; this.payload = null; this.single = false; this.sel = null;
  }
  Q.prototype.select = function (s) { if (this.op === "select") this.op = "select"; this.sel = s; return this; };
  Q.prototype.eq = function (k, v) { this.f.push(function (r) { return r[k] === v; }); return this; };
  Q.prototype.in = function (k, v) { this.f.push(function (r) { return v.indexOf(r[k]) >= 0; }); return this; };
  Q.prototype.order = function () { return this; };
  Q.prototype.limit = function () { return this; };
  Q.prototype.maybeSingle = function () { this.single = true; return this; };
  Q.prototype.insert = function (p) { this.op = "insert"; this.payload = p; return this; };
  Q.prototype.delete = function () { this.op = "delete"; return this; };
  Q.prototype.update = function (p) { this.op = "update"; this.payload = p; return this; };
  Q.prototype.then = function (ok, bad) {
    var self = this, err = M.errors && M.errors[this.t];
    if (err) return res(null, { message: err }).then(ok, bad);
    var rows = (M.db[this.t] || []);
    if (this.op === "insert") { M.log.push(["insert", this.t, this.payload]); rows.push(Object.assign({ id: "new" + rows.length, created_at: new Date().toISOString() }, this.payload)); return res(null).then(ok, bad); }
    var hit = rows.filter(function (r) { return self.f.every(function (fn) { return fn(r); }); });
    if (this.op === "update") { M.log.push(["update", this.t, this.payload, hit.map(function (r) { return r.id; })]); hit.forEach(function (r) { Object.assign(r, self.payload); }); return res(hit).then(ok, bad); }
    if (this.op === "delete") { M.log.push(["delete", this.t, hit.length]); M.db[this.t] = rows.filter(function (r) { return hit.indexOf(r) < 0; }); return res(hit).then(ok, bad); }
    return res(this.single ? (hit[0] || null) : hit).then(ok, bad);
  };
  var listeners = [];
  var client = {
    auth: {
      getSession: function () { return res({ session: M.session }); },
      onAuthStateChange: function (cb) { listeners.push(cb); setTimeout(function () { cb("INITIAL_SESSION", M.session); }, 0); return { data: { subscription: { unsubscribe: function () {} } } }; },
      verifyOtp: function () { return res({ session: M.session }); },
      signOut: function () { M.session = null; listeners.forEach(function (cb) { cb("SIGNED_OUT", null); }); return res(null); }
    },
    from: function (t) { return new Q(t); },
    rpc: function (name, args) {
      M.log.push(["rpc", name, args]);
      if (M.rpc && M.rpc[name]) { var v = M.rpc[name](args); return v && v.error ? res(null, v.error) : res(v); }
      return res(null, { message: "no mock for " + name });
    },
    storage: { from: function () { return {
      upload: function (p) { M.log.push(["upload", p]); return res({ path: p }); },
      createSignedUrl: function (p) { return res({ signedUrl: "about:blank#" + p }); },
      remove: function (ps) { M.log.push(["remove", ps]); return res(ps); }
    }; } }
  };
  window.supabase = { createClient: function () { return client; } };
})();
