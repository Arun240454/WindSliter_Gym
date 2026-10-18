"""Builds a single-file browser demo of the site (API mocked in the page). Run from the repo root: python tools/build_demo.py demo.html"""
import re, json, base64, sys, os
sys.path.insert(0, os.getcwd())
import database
S = "static/"
rd = lambda p: open(S + p, encoding="utf-8").read()
imgs = {}
def uri(m):
    name = m.group(1)
    if name.endswith(".svg"):
        return m.group(0)
    if name not in imgs:
        imgs[name] = "data:image/jpeg;base64," + base64.b64encode(open(S + "images/" + name, "rb").read()).decode()
    return imgs[name]
sub = lambda t: re.sub(r"/images/([\w.-]+)", uri, t)

html = rd("index.html")
head_links = [l for l in re.findall(r"<link[^>]+>", html) if "stylesheet" in l and "fonts.googleapis" in l]
body = re.search(r"<body[^>]*>(.*)</body>", html, re.S).group(1)
body = re.sub(r"<script[^>]*></script>", "", body)
body = sub(body)
css = sub(rd("css/styles.css") + "\n" + rd("css/chatbot.css"))
data = {k: getattr(database, "get_" + k)() for k in ("plans", "trainers", "classes", "testimonials")}
shim = """
(function(){
  var D = %s;
  var realFetch = window.fetch.bind(window);
  function queue(kind, item){
    try {
      var q = JSON.parse(localStorage.getItem("ironpeak-demo-new") || "{}");
      (q[kind] = q[kind] || []).push(item);
      localStorage.setItem("ironpeak-demo-new", JSON.stringify(q));
    } catch(e){}
  }
  function json(b, s){ return Promise.resolve(new Response(JSON.stringify(b), {status: s||200, headers: {"Content-Type":"application/json"}})); }
  window.fetch = function(url, opt){
    var p = typeof url === "string" ? url : url.url, m = (opt && opt.method) || "GET";
    if (p.indexOf("/api/") !== 0) return realFetch(url, opt);
    var key = p.replace("/api/", "");
    if (D[key]) return json(D[key]);
    if (p === "/api/chat/status") return json({enabled:false});
    if (p === "/api/health") return json({status:"ok"});
    var b = {}; try { b = JSON.parse(opt.body); } catch(e){}
    if (p === "/api/contact") {
      var er = {};
      if (!b.name || b.name.trim().length < 2) er.name = "Please enter your name.";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email||"")) er.email = "Please enter a valid email address.";
      if (!b.interest) er.interest = "Please choose what you're interested in.";
      if (!b.message || b.message.trim().length < 10) er.message = "Message should be between 10 and 2000 characters.";
      if (Object.keys(er).length) return json({ok:false, errors:er}, 422);
      queue("inq", {name:b.name.trim(), email:b.email, phone:b.phone||null, interest:b.interest, message:b.message.trim(), created_at:new Date().toISOString().slice(0,19).replace("T"," ")});
      return json({ok:true, message:"Thanks " + b.name.trim().split(" ")[0] + "! A coach will reach out within 24 hours. (Demo: see it in the admin demo.)"}, 201);
    }
    if (p === "/api/newsletter") {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email||"")) return json({ok:false, errors:{email:"Please enter a valid email address."}}, 422);
      queue("sub", {email:b.email, created_at:new Date().toISOString().slice(0,19).replace("T"," ")});
      return json({ok:true, message:"You're on the list! (Demo)"}, 201);
    }
    return json({ok:false, error:"Not available in the demo."}, 404);
  };
})();
""" % json.dumps(data).replace("</", "<\/")
data_js = sub(shim)
# images inside API data (trainer photos)
data_js = sub(data_js)
js = []
for f in ("main.js", "hero3d.js", "chatbot.js"):
    t = sub(rd("js/" + f)).replace("/vendor/three.module.min.js", "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js")
    js.append('<script type="module">\n' + t.replace("</script", "<\/script") + "\n</script>")
out = ["<title>IronPeak Fitness</title>", *head_links, "<style>\n" + css + "\n</style>",
       '<div id="ip-root" class="is-loading-wrap">', body, "</div>",
       "<script>document.body.classList.add('is-loading')</script>",
       "<script>\n" + data_js + "\n</script>", *js]
page = "\n".join(out)
if "--page" in sys.argv:  # standalone page for GitHub Pages
    page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n'
            + out[0] + "\n" + "\n".join(head_links) + "\n</head>\n<body>\n"
            + "\n".join(out[1 + len(head_links):]) + "\n</body>\n</html>\n")
open(sys.argv[1], "w", encoding="utf-8").write(page)
print(len(page) / 1e6, "MB")
