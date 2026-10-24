/* Графики без внешних библиотек: кольцо, шкала, столбцы, линия с подсказкой.
   Цвет и шрифт берутся из styles.css, текст никогда не красится в цвет данных. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function sv(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function clamp(p) { return Math.max(0, Math.min(100, p)); }
  // Цвет заполнения по доле: ≥80 — норма, 50–79 — внимание, ниже — тревога. Число всегда рядом, цвет не единственный признак.
  function tone(p) { return p >= 80 ? "ok" : p >= 50 ? "warn" : "bad"; }

  // Кольцо с числом в центре. pct: 0..100 или null (нет данных).
  function ring(pct, opts) {
    opts = opts || {};
    var box = el("div", "ring" + (pct === null || pct === undefined ? " none" : " t-" + (opts.tone || tone(pct))));
    var r = 40, c = 2 * Math.PI * r, p = pct === null || pct === undefined ? 0 : clamp(pct);
    var s = sv("svg", { viewBox: "0 0 100 100", "aria-hidden": "true" });
    s.appendChild(sv("circle", { class: "ring-track", cx: 50, cy: 50, r: r, fill: "none", "stroke-width": 10 }));
    var arc = sv("circle", { class: "ring-fill", cx: 50, cy: 50, r: r, fill: "none", "stroke-width": 10, "stroke-linecap": "round",
      "stroke-dasharray": (c * p / 100).toFixed(2) + " " + c.toFixed(2), transform: "rotate(-90 50 50)" });
    if (p > 0) s.appendChild(arc);
    box.appendChild(s);
    box.appendChild(el("span", "ring-n", pct === null || pct === undefined ? "—" : Math.round(p) + "%"));
    if (opts.label) box.setAttribute("role", "img"), box.setAttribute("aria-label", opts.label);
    return box;
  }

  // Горизонтальная шкала. Заполнение — цвет по состоянию, подложка — светлый тон той же гаммы.
  function meter(pct, opts) {
    opts = opts || {};
    var m = el("div", "meter t-" + (opts.tone || tone(pct)));
    var i = el("i"); i.style.width = clamp(pct) + "%"; m.appendChild(i);
    return m;
  }

  // Горизонтальные столбцы: items = [{label, sub, value, text, pct, tone, title, href}]; pct — длина столбца 0..100.
  function hbars(items, opts) {
    opts = opts || {};
    var box = el("div", "hbars");
    if (opts.aria) { box.setAttribute("role", "list"); box.setAttribute("aria-label", opts.aria); }
    items.forEach(function (it) {
      var row = el(it.href ? "a" : "div", "hb");
      row.setAttribute("role", "listitem");
      if (it.href) row.href = it.href;
      if (it.title) row.title = it.title;
      var lab = el("span", "hb-l");
      lab.appendChild(el("b", null, it.label));
      if (it.sub) lab.appendChild(el("span", "hb-s", it.sub));
      var tr = el("span", "hb-t t-" + (it.tone || "acc"));
      var bar = el("i"); bar.style.width = clamp(it.pct) + "%"; tr.appendChild(bar);
      row.appendChild(lab); row.appendChild(tr);
      row.appendChild(el("span", "hb-v", it.text));
      box.appendChild(row);
    });
    return box;
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    var n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * p;
  }
  function compact(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
    return String(Math.round(v * 100) / 100);
  }

  // Линия с областью и подсказкой. points = [{x, y, tip}]; opts: {yMax, yFmt, aria, caption, height}
  function line(points, opts) {
    opts = opts || {};
    var box = el("div", "chart");
    var tip = el("div", "ch-tip"); tip.hidden = true;
    var host = el("div", "ch-host");
    box.appendChild(host); box.appendChild(tip);
    // таблица для чтения с экрана — те же данные
    var tb = el("table", "sr");
    if (opts.caption) tb.appendChild(el("caption", null, opts.caption));
    var tbody = el("tbody");
    points.forEach(function (p) { var tr = el("tr"); tr.appendChild(el("th", null, p.x)); tr.appendChild(el("td", null, p.tip || String(p.y))); tbody.appendChild(tr); });
    tb.appendChild(tbody); box.appendChild(tb);

    var fmt = opts.yFmt || compact;
    function draw() {
      var W = Math.max(260, Math.floor(host.clientWidth || 640)), H = opts.height || (W < 420 ? 190 : 230);
      var mL = 38, mR = 14, mT = 14, mB = 26, iw = W - mL - mR, ih = H - mT - mB;
      var maxY = opts.yMax || Math.max(opts.minMax || 0, niceMax(Math.max.apply(null, points.map(function (p) { return p.y; }).concat([0]))));
      var n = points.length;
      function X(i) { return mL + (n === 1 ? iw / 2 : iw * i / (n - 1)); }
      function Y(v) { return mT + ih - ih * Math.min(v, maxY) / maxY; }
      host.textContent = "";
      var s = sv("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": opts.aria || "" });
      // сетка: 0, середина, максимум
      [0, 0.5, 1].forEach(function (f) {
        var y = Y(maxY * f);
        s.appendChild(sv("line", { class: "ch-grid", x1: mL, x2: W - mR, y1: y, y2: y }));
        var t = sv("text", { class: "ch-ax", x: mL - 8, y: y + 4, "text-anchor": "end" }); t.textContent = fmt(maxY * f); s.appendChild(t);
      });
      // подписи по оси X — не чаще, чем раз в 56px
      var step = Math.max(1, Math.ceil(56 / (n === 1 ? iw : iw / (n - 1))));
      for (var i = 0; i < n; i += 1) {
        if ((n - 1 - i) % step !== 0) continue;
        var tx = sv("text", { class: "ch-ax", x: X(i), y: H - 6, "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle" });
        tx.textContent = points[i].x; s.appendChild(tx);
      }
      var d = points.map(function (p, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.y).toFixed(1); }).join("");
      if (n > 1) s.appendChild(sv("path", { class: "ch-area", d: d + "L" + X(n - 1).toFixed(1) + " " + Y(0) + "L" + X(0).toFixed(1) + " " + Y(0) + "Z" }));
      s.appendChild(sv("path", { class: "ch-line", d: d, fill: "none" }));
      var cross = sv("line", { class: "ch-cross", y1: mT, y2: mT + ih, visibility: "hidden" }); s.appendChild(cross);
      var dots = points.map(function (p, i) {
        var c = sv("circle", { class: "ch-dot", cx: X(i), cy: Y(p.y), r: n > 26 ? 0 : 4 }); s.appendChild(c); return c;
      });
      var last = points.length - 1;
      if (last >= 0 && n > 26) dots[last].setAttribute("r", 4);
      var hit = sv("rect", { x: mL - 6, y: 0, width: iw + 12, height: H, fill: "transparent" }); s.appendChild(hit);
      function show(clientX) {
        var rc = s.getBoundingClientRect(), px = (clientX - rc.left) * (W / rc.width);
        var k = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((px - mL) / (iw / (n - 1)))));
        cross.setAttribute("x1", X(k)); cross.setAttribute("x2", X(k)); cross.setAttribute("visibility", "visible");
        dots.forEach(function (c, j) { c.setAttribute("r", j === k ? 5.5 : (n > 26 ? (j === last ? 4 : 0) : 4)); c.classList.toggle("on", j === k); });
        tip.textContent = ""; tip.appendChild(el("b", null, points[k].tip || String(points[k].y))); tip.appendChild(el("span", null, points[k].x));
        tip.hidden = false;
        var tw = tip.offsetWidth, left = X(k) * (rc.width / W) - tw / 2;
        tip.style.left = Math.max(0, Math.min(rc.width - tw, left)) + "px";
        tip.style.top = Math.max(0, Y(points[k].y) * (rc.height / H) - tip.offsetHeight - 12) + "px";
      }
      function hide() {
        cross.setAttribute("visibility", "hidden"); tip.hidden = true;
        dots.forEach(function (c, j) { c.setAttribute("r", n > 26 ? (j === last ? 4 : 0) : 4); c.classList.remove("on"); });
      }
      hit.addEventListener("pointermove", function (e) { show(e.clientX); });
      hit.addEventListener("pointerdown", function (e) { show(e.clientX); });
      hit.addEventListener("pointerleave", hide);
      host.appendChild(s);
    }
    var lastW = 0;
    function redraw() {
      if (!box.isConnected) { window.removeEventListener("resize", redraw); return; }
      var w = host.clientWidth; if (w === lastW) return; lastW = w; draw();
    }
    window.addEventListener("resize", redraw);
    // рисуем, как только блок попал на страницу и получил ширину
    (function wait(tries) {
      if (box.isConnected && host.clientWidth > 0) { lastW = host.clientWidth; draw(); }
      else if (tries > 0) requestAnimationFrame(function () { wait(tries - 1); });
      else { lastW = 640; draw(); }
    })(30);
    return box;
  }

  window.CH = { ring: ring, meter: meter, hbars: hbars, line: line, tone: tone, compact: compact };
})();
