"""Builds a single-file browser demo of the admin dashboard with sample data.
Run from the repo root: python tools/build_admin_demo.py admin-demo.html [--page]"""
import re, sys, json

html = open("admin/index.html", encoding="utf-8").read()
style = re.search(r"<style>.*?</style>", html, re.S).group(0)
links = [l for l in re.findall(r"<link[^>]+>", html) if "fonts.googleapis" in l and "stylesheet" in l]
body = re.search(r"<body[^>]*>(.*)</body>", html, re.S).group(1)
body = body.replace('href="/api/admin/', 'href="#demo-csv-unavailable" data-demo="')

INQ = [
    ("Priya Nair", "priya.nair@example.com", "303-555-0111", "Free Trial", "Hi, I'd like to book a free trial session this Saturday morning if there are spots.", "new", "2026-10-18 09:12:00"),
    ("Jordan Teller", "jordan.t@example.com", "", "Membership", "Do you offer a student discount on the Summit plan? I'm at CU Boulder.", "new", "2026-10-17 18:40:00"),
    ("Marco Bianchi", "marco.b@example.com", "720-555-0148", "Personal Training", "Looking for 3 sessions a week focused on strength and nutrition. What are your rates?", "read", "2026-10-16 12:05:00"),
    ("Aisha Khan", "aisha.k@example.com", "303-555-0177", "Group Classes", "Is the Mobility Flow class suitable for complete beginners? I'm recovering from a knee injury.", "read", "2026-10-15 08:30:00"),
    ("Daniel Wright", "dwright@example.com", "", "Corporate", "We're a 40-person company and want a team membership package. Can someone call me?", "done", "2026-10-12 15:22:00"),
    ("Lena Fischer", "lena.f@example.com", "303-555-0190", "Other", "Do you have parking for members, and is the gym open on public holidays?", "done", "2026-10-10 10:02:00"),
]
SUB = ["maya.r@example.com", "chris.o@example.com", "sam.lee@example.com", "nora.v@example.com", "ben.k@example.com"]
inq = [dict(id=i + 1, name=n, email=e, phone=p or None, interest=t, message=m, status=s, created_at=c)
       for i, (n, e, p, t, m, s, c) in enumerate(INQ)][::-1]
sub = [dict(id=i + 1, email=e, created_at="2026-10-%02d 11:00:00" % (18 - i)) for i, e in enumerate(SUB)][::-1]

shim = """
(function(){
  var inq = %s, sub = %s;
  function json(b, s){ return Promise.resolve(new Response(JSON.stringify(b), {status: s||200, headers: {"Content-Type":"application/json"}})); }
  window.fetch = function(url, opt){
    var m = (opt && opt.method) || "GET", x;
    if (url === "/api/admin/inquiries") return json(inq);
    if (url === "/api/admin/subscribers") return json(sub);
    x = /^\/api\/admin\/(inquiries|subscribers)\/(\d+)$/.exec(url);
    if (x) {
      var list = x[1] === "inquiries" ? inq : sub, id = +x[2];
      if (m === "PATCH") list.forEach(function(r){ if (r.id === id) r.status = JSON.parse(opt.body).status; });
      if (m === "DELETE") { var k = list.findIndex(function(r){ return r.id === id; }); if (k > -1) list.splice(k, 1); }
      return json({ok:true});
    }
    return json({ok:false}, 404);
  };
})();
""" % (json.dumps(inq), json.dumps(sub))

banner = ('<div style="background:#2a2208;color:#ffd666;font:600 13px/1.4 Inter,system-ui,sans-serif;'
          'padding:8px 16px;text-align:center">Demo with sample data. Changes reset on reload and nothing is saved. '
          'CSV export is available in the full project.</div>')
body = body.replace("<script>", "<script>" + shim, 1)
out = ["<title>IronPeak Admin Demo</title>", *links, style, banner, body]
page = "\n".join(out)
if "--page" in sys.argv:
    page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n'
            + out[0] + "\n" + "\n".join(links) + "\n" + style + "\n</head>\n<body>\n" + banner + "\n" + body + "\n</body>\n</html>\n")
open(sys.argv[1], "w", encoding="utf-8").write(page)
print(len(page) / 1e3, "KB")
