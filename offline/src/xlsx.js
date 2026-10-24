// Чтение и запись .xlsx без внешних библиотек (всё работает в браузере, без интернета).
var XL = (function () {
  var td = new TextDecoder("utf-8"), te = new TextEncoder();

  async function inflateRaw(u8) {
    var ds = new DecompressionStream("deflate-raw"), w = ds.writable.getWriter();
    w.write(u8); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  function unzip(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf), e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("не архив .xlsx");
    var n = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true), files = {};
    for (var i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      files[td.decode(u8.subarray(p + 46, p + 46 + nl))] = { method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), lho: dv.getUint32(p + 42, true) };
      p += 46 + nl + xl + cl;
    }
    return { u8: u8, dv: dv, files: files };
  }
  async function entry(z, name) {
    var f = z.files[name]; if (!f) return null;
    var p = f.lho, start = p + 30 + z.dv.getUint16(p + 26, true) + z.dv.getUint16(p + 28, true);
    var data = z.u8.subarray(start, start + f.csize);
    if (f.method === 0) return data;
    if (f.method === 8) return inflateRaw(data);
    throw new Error("неподдерживаемое сжатие");
  }
  function xml(u8) {
    var d = new DOMParser().parseFromString(td.decode(u8), "application/xml");
    if (d.getElementsByTagName("parsererror").length) throw new Error("повреждённый XML");
    return d;
  }
  function colNum(ref) { var m = /^([A-Z]+)/.exec(ref), n = 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + m[1].charCodeAt(i) - 64; return n - 1; }
  function textOf(el) {
    var t = "", c = el.childNodes;
    for (var i = 0; i < c.length; i++) {
      var k = c[i]; if (k.nodeType !== 1) continue;
      if (k.localName === "t") t += k.textContent;
      else if (k.localName === "r") { var tt = k.getElementsByTagName("t"); for (var j = 0; j < tt.length; j++) t += tt[j].textContent; }
    }
    return t;
  }
  var BUILTIN_DATE = {};
  [14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58].forEach(function (i) { BUILTIN_DATE[i] = 1; });
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function serialToStr(v) {
    var ms = Math.round((v - 25569) * 86400000), d = new Date(ms);
    var s = d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
    var t = Math.round((v % 1) * 1440);
    if (v % 1 > 1e-6 && Math.abs(v % 1 - 1) > 1e-6) s += " " + pad(Math.floor(t / 60) % 24) + ":" + pad(t % 60);
    return s;
  }

  async function read(buf) {
    var z = unzip(buf);
    var wbx = await entry(z, "xl/workbook.xml"); if (!wbx) throw new Error("нет xl/workbook.xml");
    var wbd = xml(wbx), rels = {}, relx = await entry(z, "xl/_rels/workbook.xml.rels");
    if (relx) Array.prototype.forEach.call(xml(relx).getElementsByTagName("Relationship"), function (r) { rels[r.getAttribute("Id")] = r.getAttribute("Target"); });
    var sheets = {}, names = [];
    Array.prototype.forEach.call(wbd.getElementsByTagName("sheet"), function (s) {
      var rid = s.getAttribute("r:id"), tg = rels[rid] || "", path = tg.charAt(0) === "/" ? tg.slice(1) : "xl/" + tg;
      sheets[s.getAttribute("name")] = path; names.push(s.getAttribute("name"));
    });
    var sst = [], sx = await entry(z, "xl/sharedStrings.xml");
    if (sx) Array.prototype.forEach.call(xml(sx).getElementsByTagName("si"), function (si) { sst.push(textOf(si)); });
    var xfDate = [], stx = await entry(z, "xl/styles.xml");
    if (stx) {
      var sd = xml(stx), custom = {};
      Array.prototype.forEach.call(sd.getElementsByTagName("numFmt"), function (n) { custom[n.getAttribute("numFmtId")] = n.getAttribute("formatCode"); });
      var xfs = sd.getElementsByTagName("cellXfs")[0];
      if (xfs) Array.prototype.forEach.call(xfs.getElementsByTagName("xf"), function (x) {
        var id = +x.getAttribute("numFmtId"), isd = !!BUILTIN_DATE[id];
        if (custom[id] != null) { var f = custom[id].replace(/"[^"]*"|\[[^\]]*\]|\\./g, ""); isd = /[dmyhs]/i.test(f) && !/^general$/i.test(f); }
        xfDate.push(isd);
      });
    }
    return {
      names: names,
      has: function (n) { return !!sheets[n]; },
      sheet: async function (name) {
        var path = sheets[name], data = path && await entry(z, path);
        if (!data) return [];
        var d = xml(data), rows = [], rowEls = d.getElementsByTagName("row");
        for (var i = 0; i < rowEls.length; i++) {
          var re = rowEls[i], ri = (+re.getAttribute("r") || i + 1) - 1, cells = re.getElementsByTagName("c"), arr = null;
          for (var j = 0; j < cells.length; j++) {
            var c = cells[j], t = c.getAttribute("t"), ve = c.getElementsByTagName("v")[0], val = "";
            if (t === "inlineStr") { var is = c.getElementsByTagName("is")[0]; val = is ? textOf(is) : ""; }
            else if (ve) {
              var raw = ve.textContent;
              if (t === "s") val = sst[+raw] || "";
              else if (t === "str") val = raw;
              else if (t === "b") val = raw === "1" ? "Да" : "Нет";
              else if (t === "e") val = "";
              else { var num = +raw; val = isNaN(num) ? raw : (xfDate[+c.getAttribute("s")] ? serialToStr(num) : +num.toPrecision(12)); }
            }
            if (val === "" || val == null) continue;
            if (!arr) arr = [];
            arr[colNum(c.getAttribute("r"))] = val;
          }
          if (arr) rows[ri] = arr;
        }
        return rows;
      }
    };
  }

  // ----- запись простого .xlsx (несжатый zip)
  var crcT = null;
  function crc32(u8) {
    if (!crcT) { crcT = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } }
    var c2 = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c2 = crcT[(c2 ^ u8[i]) & 255] ^ (c2 >>> 8);
    return (c2 ^ 0xFFFFFFFF) >>> 0;
  }
  function esc(s) { return String(s).replace(/[&<>"\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, function (ch) { return ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : ""; }); }
  function colName(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function zipStore(files) {
    var parts = [], central = [], off = 0;
    files.forEach(function (f) {
      var name = te.encode(f.name), data = typeof f.data === "string" ? te.encode(f.data) : f.data, crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      var ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (a, p) { return a + p.length; }, 0);
    var e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  // sheets: [{name, rows:[[...]]}], первая строка выводится жирным
  function write(sheets) {
    var files = [
      { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") + "</Types>" },
      { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map(function (s, i) { return '<sheet name="' + esc(s.name.replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") + "</sheets></workbook>" },
      { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: "xl/styles.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' }
    ];
    sheets.forEach(function (s, i) {
      var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
      s.rows.forEach(function (row, r) {
        x += '<row r="' + (r + 1) + '">';
        for (var c = 0; c < row.length; c++) {
          var v = row[c]; if (v === "" || v == null) continue;
          var ref = colName(c) + (r + 1), st = r === 0 ? ' s="1"' : "";
          if (typeof v === "number" && isFinite(v)) x += '<c r="' + ref + '"' + st + "><v>" + v + "</v></c>";
          else x += '<c r="' + ref + '" t="inlineStr"' + st + '><is><t xml:space="preserve">' + esc(v) + "</t></is></c>";
        }
        x += "</row>";
      });
      files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: x + "</sheetData></worksheet>" });
    });
    return zipStore(files);
  }
  return { read: read, write: write };
})();
