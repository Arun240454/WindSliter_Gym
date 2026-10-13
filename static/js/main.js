/* =========================================================
   IronPeak Fitness — UI, animation and API wiring
   ========================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "style") node.style.cssText = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child != null) node.append(child);
  }
  return node;
}

function svgIcon(path) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", path);
  svg.append(p);
  return svg;
}
const ICON_ARROW = "M5 12h14M13 6l6 6-6 6";
const ICON_CHECK = "M5 12.5l4.5 4.5L19 7.5";

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.errors) throw new Error(data.error || `Request failed (${res.status})`);
  return { status: res.status, data };
}

/* ---------- Toast ---------- */
const toastEl = $("#toast");
let toastTimer;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 3800);
}

/* =========================================================
   Loader
   ========================================================= */
function initLoader() {
  const loader = $("#loader");
  const bar = $("#loaderBar");
  const count = $("#loaderCount");
  const critical = [$(".hero__bg img")];
  let loaded = 0;
  let shown = 0;
  let target = 10;
  const start = performance.now();

  const bump = () => { loaded++; target = Math.max(target, (loaded / (critical.length + 1)) * 100); };
  critical.forEach((img) => (img.complete ? bump() : (img.addEventListener("load", bump, { once: true }), img.addEventListener("error", bump, { once: true }))));
  // Web fonts get 1.5s at most; system fonts are a fine fallback.
  Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]).then(bump);
  // Never block the page for more than 3.5s, even on very slow connections.
  setTimeout(() => (target = 100), 3500);

  let last = start;
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const minTimeDone = now - start > 900;
    const goal = minTimeDone ? target : Math.min(target, 85);
    shown += (goal - shown) * (1 - Math.exp(-dt * 9));
    if (goal >= 100 && shown > 99.3) shown = 100;
    bar.style.width = `${shown}%`;
    count.textContent = `${Math.round(shown)}%`;
    if (shown >= 100) return finish();
    requestAnimationFrame(tick);
  }
  function finish() {
    loader.classList.add("is-done");
    document.body.classList.remove("is-loading");
    requestAnimationFrame(() => document.body.classList.add("is-ready"));
    window.dispatchEvent(new Event("ironpeak:ready"));
    setTimeout(() => loader.remove(), 1600);
  }
  if (reduceMotion) { target = 100; shown = 100; finish(); } else requestAnimationFrame(tick);
}

/* =========================================================
   Hero title → individual 3D characters
   ========================================================= */
function splitHeroTitle() {
  let index = 0;
  $$(".hero__title .split").forEach((word) => {
    const text = word.textContent;
    word.textContent = "";
    for (const ch of text) {
      word.append(el("span", { class: "char", style: `--d:${index++}`, text: ch }));
    }
  });
}

/* =========================================================
   Navigation
   ========================================================= */
function initNav() {
  const nav = $("#nav");
  const toggle = $("#navToggle");
  const menu = $("#mobileMenu");
  let lastY = window.scrollY;

  const setMenu = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.classList.toggle("is-open", open);
    menu.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("menu-open", open);
  };
  toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
  $$("a", menu).forEach((a) => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => e.key === "Escape" && setMenu(false));

  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    nav.classList.toggle("is-scrolled", y > 40);
    const menuOpen = menu.classList.contains("is-open");
    nav.classList.toggle("is-hidden", !menuOpen && y > lastY && y > 500);
    lastY = y;
  }, { passive: true });

  // Highlight the link for the section currently in view.
  const links = $$(".nav__links a");
  const sections = links.map((a) => $(a.getAttribute("href"))).filter(Boolean);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${entry.target.id}`));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach((s) => io.observe(s));
}

/* =========================================================
   Scroll-driven effects: progress bar + parallax layers
   ========================================================= */
function initScrollEffects() {
  const progress = $("#scrollProgress");
  const parallax = $$("[data-parallax]");
  let ticking = false;

  function update() {
    ticking = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    if (reduceMotion) return;
    const vh = window.innerHeight;
    parallax.forEach((layer) => {
      const rect = layer.parentElement.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > vh) return;
      const speed = parseFloat(layer.dataset.parallax);
      const offset = (rect.top + rect.height / 2 - vh / 2) * -speed;
      layer.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    });
  }
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  update();
}

/* =========================================================
   Custom cursor + magnetic buttons
   ========================================================= */
function initCursor() {
  if (!finePointer || reduceMotion) return;
  const cursor = $("#cursor");
  let x = -100, y = -100, cx = x, cy = y;
  window.addEventListener("pointermove", (e) => {
    if (x === -100) { cx = e.clientX; cy = e.clientY; }
    x = e.clientX; y = e.clientY;
  }, { passive: true });
  (function loop() {
    cx = lerp(cx, x, 0.2); cy = lerp(cy, y, 0.2);
    cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    requestAnimationFrame(loop);
  })();
  document.addEventListener("pointerover", (e) => {
    const t = e.target;
    cursor.classList.toggle("is-hover", !!t.closest("a, button, .coach-card, select, label"));
    cursor.classList.toggle("is-drag", !!t.closest("#galleryStage"));
  });
}

function initMagnetic() {
  if (!finePointer || reduceMotion) return;
  $$(".magnetic").forEach((btn) => {
    btn.addEventListener("pointermove", (e) => {
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      btn.style.transform = `translate(${dx * 0.25}px, ${dy * 0.35}px)`;
    });
    btn.addEventListener("pointerleave", () => (btn.style.transform = ""));
  });
}

/* =========================================================
   3D reveal on scroll (staggered per parent)
   ========================================================= */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const target = entry.target;
    const siblings = $$(":scope > .reveal", target.parentElement).filter((s) => !s.classList.contains("is-visible"));
    const delay = Math.max(0, siblings.indexOf(target)) * 90;
    target.style.transitionDelay = `${delay}ms`;
    target.classList.add("is-visible");
    // Clear the delay afterwards so hover/tilt interactions stay snappy.
    setTimeout(() => (target.style.transitionDelay = ""), delay + 1200);
    revealObserver.unobserve(target);
  });
}, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

function observeReveals(root = document) {
  $$(".reveal:not(.is-visible)", root).forEach((node) => revealObserver.observe(node));
}

/* =========================================================
   Animated counters
   ========================================================= */
function initCounters() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const node = entry.target;
      const end = Number(node.dataset.count);
      const suffix = node.dataset.suffix || "";
      const duration = reduceMotion ? 1 : 1800;
      const t0 = performance.now();
      (function step(now) {
        const p = clamp((now - t0) / duration, 0, 1);
        const eased = 1 - Math.pow(1 - p, 4);
        node.textContent = Math.round(end * eased).toLocaleString() + suffix;
        if (p < 1) requestAnimationFrame(step);
      })(t0);
      io.unobserve(node);
    });
  }, { threshold: 0.6 });
  $$("[data-count]").forEach((n) => io.observe(n));
}

/* =========================================================
   3D tilt with glare
   ========================================================= */
function attachTilt(card, max = 10) {
  if (!finePointer || reduceMotion || card.dataset.tiltBound) return;
  card.dataset.tiltBound = "1";
  card.addEventListener("pointerenter", () => {
    card.style.transition = "transform 0.18s ease-out, box-shadow 0.5s, border-color 0.4s";
  });
  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    card.style.transform = `perspective(1000px) rotateX(${(0.5 - py) * max}deg) rotateY(${(px - 0.5) * max}deg) translateZ(10px)`;
    card.style.setProperty("--gx", `${px * 100}%`);
    card.style.setProperty("--gy", `${py * 100}%`);
  });
  card.addEventListener("pointerleave", () => {
    card.style.transition = "transform 0.9s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.5s, border-color 0.4s";
    card.style.transform = "";
  });
}

/* =========================================================
   About: layered depth parallax (mouse)
   ========================================================= */
function initAboutDepth() {
  const scene = $("[data-tilt-scene]");
  if (!scene || !finePointer || reduceMotion) return;
  const layers = $$("[data-depth]", scene);
  let tx = 0, ty = 0, cx = 0, cy = 0, running = false;
  const loop = () => {
    cx = lerp(cx, tx, 0.08); cy = lerp(cy, ty, 0.08);
    layers.forEach((layer) => {
      const d = Number(layer.dataset.depth);
      layer.style.translate = `${cx * d * 0.25}px ${cy * d * 0.25}px`;
    });
    scene.style.transform = `rotateY(${cx * 6}deg) rotateX(${-cy * 6}deg)`;
    if (Math.abs(cx - tx) + Math.abs(cy - ty) > 0.001) requestAnimationFrame(loop);
    else running = false;
  };
  const kick = () => { if (!running) { running = true; requestAnimationFrame(loop); } };
  scene.addEventListener("pointermove", (e) => {
    const r = scene.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    kick();
  });
  scene.addEventListener("pointerleave", () => { tx = 0; ty = 0; kick(); });
}

/* =========================================================
   Pre-fill contact form from CTAs
   ========================================================= */
function prefillContact(interest, message) {
  const select = $("#interest");
  if (interest) { select.value = interest; select.classList.add("has-value"); }
  if (message) {
    const ta = $("#message");
    ta.value = message;
  }
}
function initInterestLinks() {
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-interest]");
    if (link) prefillContact(link.dataset.interest, link.dataset.message);
  });
  $("#interest").addEventListener("change", (e) => e.target.classList.toggle("has-value", !!e.target.value));
}

/* =========================================================
   Class schedule (from /api/classes)
   ========================================================= */
const DAYS = [
  ["Mon", "Monday"], ["Tue", "Tuesday"], ["Wed", "Wednesday"], ["Thu", "Thursday"],
  ["Fri", "Friday"], ["Sat", "Saturday"], ["Sun", "Sunday"],
];

function formatTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return { time: `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`, suffix };
}

async function initSchedule() {
  const tabs = $("#dayTabs");
  const list = $("#classList");
  const filters = $("#categoryFilters");
  let classes = [];
  try {
    classes = (await api("/api/classes")).data;
  } catch (err) {
    list.replaceChildren(el("p", { class: "schedule__empty", text: "Schedule is unavailable right now. Please try again shortly." }));
    return;
  }

  const todayIdx = (new Date().getDay() + 6) % 7;
  let day = DAYS[todayIdx][0];
  let category = "All";

  const pill = el("span", { class: "day-pill" });
  tabs.append(pill);
  DAYS.forEach(([short, long], i) => {
    const count = classes.filter((c) => c.day === short).length;
    const btn = el("button", { class: "day-tab", role: "tab", "data-day": short, "aria-label": long },
      [short, el("small", { text: i === todayIdx ? "Today" : `${count} classes` })]);
    btn.addEventListener("click", () => { day = short; render(); });
    tabs.append(btn);
  });

  const cats = ["All", ...new Set(classes.map((c) => c.category))];
  cats.forEach((cat) => {
    const chip = el("button", { class: "chip", "data-cat": cat, text: cat });
    chip.addEventListener("click", () => { category = cat; render(); });
    filters.append(chip);
  });

  function movePill() {
    const active = $(".day-tab.is-active", tabs);
    if (!active) return;
    pill.style.left = `${active.offsetLeft}px`;
    pill.style.width = `${active.offsetWidth}px`;
  }

  function render() {
    $$(".day-tab", tabs).forEach((t) => {
      const on = t.dataset.day === day;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", String(on));
    });
    $$(".chip", filters).forEach((c) => c.classList.toggle("is-active", c.dataset.cat === category));
    movePill();

    const rows = classes.filter((c) => c.day === day && (category === "All" || c.category === category));
    if (!rows.length) {
      list.replaceChildren(el("p", { class: "schedule__empty", text: `No ${category === "All" ? "" : category + " "}classes on this day — try another day or category.` }));
      return;
    }
    list.replaceChildren(...rows.map((c, i) => {
      const { time, suffix } = formatTime(c.start_time);
      const bars = el("span", { class: "intensity", title: `Intensity ${c.intensity}/3`, "aria-label": `Intensity ${c.intensity} of 3` },
        [1, 2, 3].map((n) => el("i", { class: n <= c.intensity ? "on" : "" })));
      const book = el("a", {
        href: "#contact", class: "class-row__book", "data-interest": "Group Classes",
        "data-message": `Hi! I'd like to book "${c.name}" on ${DAYS.find((d) => d[0] === c.day)[1]} at ${time} ${suffix}.`,
        text: "Book spot",
      });
      return el("div", { class: "class-row", style: `--i:${i}` }, [
        el("div", { class: "class-row__time" }, [time, el("small", { text: `${suffix} · ${c.duration} min` })]),
        el("div", {}, [
          el("div", { class: "class-row__name", text: c.name }),
          el("div", { class: "class-row__meta", text: `with ${c.trainer} · ${c.spots} spots` }),
        ]),
        el("span", { class: "class-row__cat", text: c.category }),
        el("div", { class: "class-row__right" }, [bars, book]),
      ]);
    }));
  }
  window.addEventListener("resize", movePill);
  render();
  // Fonts can change tab widths after first paint.
  document.fonts && document.fonts.ready.then(movePill);
}

/* =========================================================
   Pricing (from /api/plans)
   ========================================================= */
async function initPricing() {
  const grid = $("#pricingGrid");
  const toggle = $(".billing-toggle");
  const pill = $(".billing-toggle__pill", toggle);
  let billing = "monthly";
  let plans = [];
  try {
    plans = (await api("/api/plans")).data;
  } catch {
    grid.replaceChildren(el("p", { class: "schedule__empty", text: "Pricing is unavailable right now." }));
    return;
  }

  grid.replaceChildren(...plans.map((p) => {
    const amount = el("span", { class: "amount", text: String(Math.round(p.price_monthly)) });
    const card = el("article", { class: `price-card reveal tilt${p.featured ? " price-card--featured" : ""}`, "data-slug": p.slug }, [
      p.featured ? el("span", { class: "price-card__badge", text: "Most popular" }) : null,
      el("h3", { text: p.name }),
      el("p", { class: "price-card__tagline", text: p.tagline }),
      el("div", { class: "price-card__price" }, [el("sup", { text: "$" }), amount]),
      el("p", { class: "price-card__per", text: "per month" }),
      el("ul", {}, p.features.map((f) => el("li", {}, [svgIcon(ICON_CHECK), f]))),
      el("a", {
        href: "#contact", class: "btn btn--primary", "data-interest": "Membership",
        "data-message": `Hi! I'm interested in the ${p.name} membership.`,
      }, [el("span", { text: `Choose ${p.name}` }), svgIcon(ICON_ARROW)]),
      el("span", { class: "tilt__glare" }),
    ]);
    card._plan = p;
    card._amount = amount;
    return card;
  }));
  $$(".price-card", grid).forEach((c) => attachTilt(c, 8));
  observeReveals(grid);

  function movePill() {
    const active = $(".is-active", toggle);
    pill.style.left = `${active.offsetLeft}px`;
    pill.style.width = `${active.offsetWidth}px`;
  }
  function render() {
    $$(".price-card", grid).forEach((card) => {
      const p = card._plan;
      const value = billing === "monthly" ? p.price_monthly : p.price_annual;
      const per = $(".price-card__per", card);
      card._amount.classList.add("is-flipping");
      setTimeout(() => {
        card._amount.textContent = Math.round(value).toLocaleString();
        per.textContent = billing === "monthly" ? "per month" : `per year · $${(p.price_annual / 12).toFixed(2)}/mo`;
        card._amount.classList.remove("is-flipping");
      }, reduceMotion ? 0 : 260);
    });
  }
  $$("button", toggle).forEach((btn) => btn.addEventListener("click", () => {
    if (btn.dataset.billing === billing) return;
    billing = btn.dataset.billing;
    $$("button", toggle).forEach((b) => b.classList.toggle("is-active", b === btn));
    movePill();
    render();
  }));
  movePill();
  window.addEventListener("resize", movePill);
  document.fonts && document.fonts.ready.then(movePill);
}

/* =========================================================
   Coaches (from /api/trainers) — 3D flip cards
   ========================================================= */
async function initCoaches() {
  const grid = $("#coachGrid");
  let trainers = [];
  try {
    trainers = (await api("/api/trainers")).data;
  } catch {
    grid.replaceChildren(el("p", { class: "schedule__empty", text: "Coach profiles are unavailable right now." }));
    return;
  }
  grid.replaceChildren(...trainers.map((t) => {
    const card = el("article", { class: "coach-card reveal", tabindex: "0", "aria-label": `${t.name}, ${t.role}. Press Enter for bio.` }, [
      el("div", { class: "coach-card__inner" }, [
        el("div", { class: "coach-card__face coach-card__front" }, [
          el("img", { src: t.image, alt: `${t.name}, ${t.role} at IronPeak`, loading: "lazy" }),
          el("div", { class: "coach-card__label" }, [el("h3", { text: t.name }), el("p", { text: t.role })]),
        ]),
        el("div", { class: "coach-card__face coach-card__back" }, [
          el("div", { class: "years" }, [String(t.years), el("small", { text: "years coaching" })]),
          el("h3", { text: t.name }),
          el("p", { class: "role", text: t.role }),
          el("p", { class: "bio", text: t.bio }),
          el("div", { class: "tags" }, t.specialties.map((s) => el("span", { text: s }))),
        ]),
      ]),
    ]);
    const flip = () => card.classList.toggle("is-flipped");
    if (!finePointer) card.addEventListener("click", flip);
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
    return card;
  }));
  observeReveals(grid);
}

/* =========================================================
   Gallery — draggable 3D carousel ring + lightbox
   ========================================================= */
function initGallery() {
  const stage = $("#galleryStage");
  const ring = $("#galleryRing");
  const items = $$(".gallery__item", ring);
  const n = items.length;
  const step = 360 / n;
  let radius = 0;
  let angle = 0;          // current rotation (deg)
  let velocity = reduceMotion ? 0 : -0.08;  // deg per frame
  let target = null;      // snap target when using arrows
  let dragging = false, moved = 0, lastX = 0, visible = false;

  function layout() {
    const w = clamp(window.innerWidth * 0.22, 180, 290);
    const h = w * 1.36;
    ring.style.setProperty("--card-w", `${w}px`);
    ring.style.setProperty("--card-h", `${h}px`);
    radius = Math.round((w / 2) / Math.tan(Math.PI / n) * 1.18);
    items.forEach((item, i) => {
      item.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`;
    });
  }

  function frame() {
    if (!visible) return;
    if (!dragging) {
      if (target !== null) {
        angle = lerp(angle, target, 0.09);
        if (Math.abs(target - angle) < 0.05) { angle = target; target = null; velocity = reduceMotion ? 0 : -0.08; }
      } else {
        angle += velocity;
        // Ease any fling velocity back to the gentle auto-spin.
        velocity = lerp(velocity, reduceMotion ? 0 : -0.08, 0.02);
      }
    }
    ring.style.transform = `translateZ(${-radius}px) rotateX(-6deg) rotateY(${angle}deg)`;
    // Dim the cards facing away.
    items.forEach((item, i) => {
      const a = ((i * step + angle) % 360 + 360) % 360;
      const facing = Math.cos((a * Math.PI) / 180);
      item.style.filter = `brightness(${(0.35 + 0.65 * ((facing + 1) / 2)).toFixed(2)})`;
    });
    requestAnimationFrame(frame);
  }

  stage.addEventListener("pointerdown", (e) => {
    dragging = true; moved = 0; lastX = e.clientX; target = null;
    stage.classList.add("is-dragging");
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    moved += Math.abs(dx);
    angle += dx * 0.25;
    velocity = dx * 0.25;
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove("is-dragging");
    if (moved < 6) {
      // Treat as a click: find the card under the pointer.
      stage.releasePointerCapture?.(e.pointerId);
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest(".gallery__item");
      if (hit) openLightbox(items.indexOf(hit));
    }
  };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);

  const snapBy = (dir) => {
    const base = target ?? angle;
    target = Math.round(base / step) * step + dir * step;
  };
  $("#galleryPrev").addEventListener("click", () => snapBy(1));
  $("#galleryNext").addEventListener("click", () => snapBy(-1));

  new IntersectionObserver(([entry]) => {
    const was = visible;
    visible = entry.isIntersecting;
    if (visible && !was) requestAnimationFrame(frame);
  }).observe(stage);

  window.addEventListener("resize", layout);
  layout();

  /* ----- Lightbox ----- */
  const lb = $("#lightbox");
  const lbImg = $("#lightboxImg");
  const lbCap = $("#lightboxCaption");
  let current = 0;
  let lastFocus = null;
  function show(i) {
    current = (i + n) % n;
    const img = $("img", items[current]);
    lbImg.src = img.currentSrc || img.src;
    lbImg.alt = img.alt;
    lbCap.textContent = `${img.alt} — ${current + 1} / ${n}`;
  }
  function openLightbox(i) {
    lastFocus = document.activeElement;
    show(i);
    lb.hidden = false;
    document.body.classList.add("lightbox-open");
    requestAnimationFrame(() => lb.classList.add("is-open"));
    $("#lightboxClose").focus();
  }
  function closeLightbox() {
    lb.classList.remove("is-open");
    document.body.classList.remove("lightbox-open");
    setTimeout(() => (lb.hidden = true), 400);
    lastFocus?.focus();
  }
  $("#lightboxClose").addEventListener("click", closeLightbox);
  $("#lightboxPrev").addEventListener("click", () => show(current - 1));
  $("#lightboxNext").addEventListener("click", () => show(current + 1));
  lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") show(current - 1);
    if (e.key === "ArrowRight") show(current + 1);
  });
}

/* =========================================================
   Testimonials (from /api/testimonials) — 3D coverflow
   ========================================================= */
async function initTestimonials() {
  const stage = $("#testimonialStage");
  const dots = $("#testimonialDots");
  let items = [];
  try {
    items = (await api("/api/testimonials")).data;
  } catch {
    stage.replaceChildren(el("p", { class: "schedule__empty", text: "Testimonials are unavailable right now." }));
    return;
  }
  if (!items.length) return;
  const cards = items.map((t) => el("article", { class: "t-card" }, [
    el("div", { class: "t-card__stars", "aria-label": `${t.rating} out of 5 stars`, text: "★".repeat(t.rating) }),
    el("p", { class: "t-card__quote", text: t.quote }),
    el("div", { class: "t-card__who" }, [
      el("span", { class: "t-card__avatar", "aria-hidden": "true", text: t.name.split(" ").map((w) => w[0]).join("").slice(0, 2) }),
      el("div", {}, [el("strong", { text: t.name }), el("span", { text: t.detail })]),
    ]),
  ]));
  stage.replaceChildren(...cards);
  const dotBtns = items.map((t, i) => {
    const b = el("button", { role: "tab", "aria-label": `Show testimonial from ${t.name}` });
    b.addEventListener("click", () => { go(i); restart(); });
    return b;
  });
  dots.replaceChildren(...dotBtns);

  let index = 0, timer;
  function go(i) {
    index = (i + cards.length) % cards.length;
    cards.forEach((c, k) => {
      c.classList.toggle("is-active", k === index);
      c.classList.toggle("is-prev", k === (index - 1 + cards.length) % cards.length && cards.length > 2);
      c.classList.toggle("is-next", k === (index + 1) % cards.length && cards.length > 1);
      c.setAttribute("aria-hidden", String(k !== index));
    });
    dotBtns.forEach((b, k) => { b.classList.toggle("is-active", k === index); b.setAttribute("aria-selected", String(k === index)); });
  }
  const restart = () => { clearInterval(timer); if (!reduceMotion) timer = setInterval(() => go(index + 1), 6500); };

  // Swipe support
  let sx = null;
  stage.addEventListener("pointerdown", (e) => (sx = e.clientX));
  stage.addEventListener("pointerup", (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    if (Math.abs(dx) > 40) { go(index + (dx < 0 ? 1 : -1)); restart(); }
    sx = null;
  });
  stage.addEventListener("mouseenter", () => clearInterval(timer));
  stage.addEventListener("mouseleave", restart);
  go(0);
  restart();
}

/* =========================================================
   Forms
   ========================================================= */
function initContactForm() {
  const form = $("#contactForm");
  const status = $("#contactStatus");
  const submit = $("#contactSubmit");
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function setErrors(errors) {
    $$(".field", form).forEach((f) => f.classList.remove("has-error"));
    $$(".field__error", form).forEach((e) => (e.textContent = ""));
    Object.entries(errors).forEach(([name, msg]) => {
      const holder = $(`.field__error[data-for="${name}"]`, form);
      if (holder) { holder.textContent = msg; holder.closest(".field").classList.add("has-error"); }
    });
    const first = Object.keys(errors)[0];
    if (first) form.elements[first]?.focus();
  }

  function validate(data) {
    const errors = {};
    if (data.name.length < 2) errors.name = "Please enter your name.";
    if (!EMAIL_RE.test(data.email)) errors.email = "Please enter a valid email address.";
    if (!data.interest) errors.interest = "Please choose what you're interested in.";
    if (data.message.length < 10) errors.message = "Tell us a little more (at least 10 characters).";
    return errors;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(["name", "email", "phone", "interest", "message"].map((k) => [k, (form.elements[k].value || "").trim()]));
    const errors = validate(data);
    setErrors(errors);
    status.textContent = ""; status.className = "form-status";
    if (Object.keys(errors).length) return;

    submit.disabled = true; submit.classList.add("is-loading");
    try {
      const { data: res } = await api("/api/contact", { method: "POST", body: JSON.stringify(data) });
      if (res.ok) {
        form.reset();
        $("#interest").classList.remove("has-value");
        status.textContent = res.message; status.classList.add("is-success");
        toast("Message sent — talk soon! 💪");
      } else {
        setErrors(res.errors || {});
        status.textContent = "Please fix the highlighted fields."; status.classList.add("is-error");
      }
    } catch (err) {
      status.textContent = "Couldn't reach the server. Please try again."; status.classList.add("is-error");
    } finally {
      submit.disabled = false; submit.classList.remove("is-loading");
    }
  });
  form.addEventListener("input", (e) => {
    const field = e.target.closest(".field");
    if (field?.classList.contains("has-error")) {
      field.classList.remove("has-error");
      $(".field__error", field).textContent = "";
    }
  });
}

function initNewsletter() {
  const form = $("#newsletterForm");
  const status = $("#newsletterStatus");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.elements.email.value.trim();
    status.className = "form-status";
    try {
      const { data } = await api("/api/newsletter", { method: "POST", body: JSON.stringify({ email }) });
      if (data.ok) { status.textContent = data.message; status.classList.add("is-success"); form.reset(); }
      else { status.textContent = data.errors?.email || "Please try again."; status.classList.add("is-error"); }
    } catch {
      status.textContent = "Couldn't reach the server."; status.classList.add("is-error");
    }
  });
}

/* =========================================================
   Boot
   ========================================================= */
splitHeroTitle();
initLoader();
initNav();
initScrollEffects();
initCursor();
initMagnetic();
initCounters();
initAboutDepth();
initInterestLinks();
initGallery();
initContactForm();
initNewsletter();
$$(".tilt").forEach((c) => attachTilt(c));
observeReveals();
initSchedule();
initPricing();
initCoaches();
initTestimonials();
$("#year").textContent = new Date().getFullYear();
