(function () {
  "use strict";

  var LIFTS = ["Squat", "Bench Press", "Deadlift", "Overhead Press", "Barbell Row"];
  var TIERS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Iridescent"];
  var TIER_HEX = { Bronze: "#c9803f", Silver: "#c3ccd6", Gold: "#f4c430", Platinum: "#3fd8c8", Diamond: "#5ab0ff", Master: "#b36bff", Iridescent: "#ff7ad9" };
  var TIER_ICON = { Bronze: "🥉", Silver: "🥈", Gold: "🥇", Platinum: "💠", Diamond: "💎", Master: "👑", Iridescent: "🌈" };
  var LB = 2.20462;

  var state = {
    data: null,
    view: "dashboard",
    chartLift: "Squat",
    wait: null,
    pollTimer: null,
    bannerTimer: null,
    confirmDel: null,
    editingProfile: false,
    draft: { sex: "", units: "kg" }
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function units() { return state.data && state.data.profile && state.data.profile.units === "lb" ? "lb" : "kg"; }
  function toDisp(kg) { return units() === "lb" ? kg * LB : kg; }
  function fmt(n) { return String(Math.round(n * 10) / 10); }
  function fmtW(kg) { return fmt(toDisp(kg)) + " " + units(); }
  function tIdx(t) { return TIERS.indexOf(t); }
  function tcls(t) { return t && tIdx(t) >= 0 ? "t-" + t : "t-none"; }
  function todayStr() {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function prettyDate(s) {
    var p = String(s).split("-");
    if (p.length !== 3) return s;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  function entries() { return (state.data && state.data.entries) || []; }
  function ranked() { return entries().filter(function (e) { return e.status === "ranked" && tIdx(e.tier) >= 0; }); }
  function pendingCount() { return entries().filter(function (e) { return e.status !== "ranked"; }).length; }

  // ------------------------------------------------------------------ data
  function load() {
    return make.call("get_my_data", {}).then(function (d) { state.data = d; return d; });
  }
  function errText(e) {
    if (e && e.code === "visitor_signin") return "Your sign-in has ended. Reload the page to sign in again.";
    if (e && e.status === 429) return "Too many requests. Wait a few seconds and try again.";
    return "Something went wrong. Please try again.";
  }

  // ------------------------------------------------------------------ nav
  function go(view) {
    if (!state.data || (!state.data.hasProfile && view !== "profile")) view = "profile";
    state.view = view;
    ["dashboard", "log", "progress", "history", "profile"].forEach(function (v) {
      $("view-" + v).classList.toggle("hidden", v !== view);
    });
    var tabs = document.querySelectorAll(".tab");
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle("on", tabs[i].getAttribute("data-go") === view);
    $("tabbar").classList.toggle("hidden", !state.data.hasProfile);
    if (view === "profile") fillProfile();
    if (view === "log") prepLogForm();
    renderAll();
    window.scrollTo(0, 0);
  }

  function renderAll() {
    if (!state.data || !state.data.hasProfile) return;
    if (state.view === "dashboard") renderDashboard();
    if (state.view === "progress") renderProgress();
    if (state.view === "history") renderHistory();
  }

  // ------------------------------------------------------------------ banner
  function banner(text, done, spin) {
    var b = $("ranking-banner");
    clearTimeout(state.bannerTimer);
    b.classList.remove("hidden");
    b.classList.toggle("done", !!done);
    b.innerHTML = (spin ? '<div class="spinner small"></div>' : "") + "<span>" + esc(text) + "</span>";
  }
  function hideBanner() { $("ranking-banner").classList.add("hidden"); }

  function startWait(pendingOnly) {
    state.wait = { n0: entries().length, p0: pendingCount(), t: Date.now(), pendingOnly: !!pendingOnly };
    banner("Rank Judge is judging your lift…", false, true);
    clearTimeout(state.pollTimer);
    state.pollTimer = setTimeout(poll, 3000);
  }
  function poll() {
    if (!state.wait) return;
    load().then(function () {
      renderAll();
    }, function () { /* try again next tick */ }).then(function () {
      var w = state.wait;
      if (!w) return;
      var done = w.pendingOnly ? pendingCount() === 0 : (entries().length > w.n0 && pendingCount() <= w.p0);
      if (done) {
        state.wait = null;
        banner("Rank updated! 🎉", true, false);
        state.bannerTimer = setTimeout(hideBanner, 6000);
        renderAll();
        return;
      }
      if (Date.now() - w.t > (w.pendingOnly ? 60000 : 150000)) {
        state.wait = null;
        banner("Still working on it. Check the History tab in a minute.", false, false);
        state.bannerTimer = setTimeout(hideBanner, 10000);
        return;
      }
      state.pollTimer = setTimeout(poll, 3500);
    });
  }

  // ------------------------------------------------------------------ profile
  function setSeg(id, value) {
    var btns = $(id).querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("on", btns[i].getAttribute("data-v") === value);
  }
  function heightCmFromField() {
    var v = parseFloat($("p-height").value);
    if (!isFinite(v)) return NaN;
    return state.draft.units === "lb" ? v * 2.54 : v;
  }
  function weightKgFromField() {
    var v = parseFloat($("p-weight").value);
    if (!isFinite(v)) return NaN;
    return state.draft.units === "lb" ? v / LB : v;
  }
  function writeFields(heightCm, weightKg, u) {
    state.draft.units = u;
    setSeg("p-units", u);
    $("p-height-unit").textContent = u === "lb" ? "(inches)" : "(cm)";
    $("p-weight-unit").textContent = u === "lb" ? "(lb)" : "(kg)";
    $("p-height").value = isFinite(heightCm) ? String(Math.round((u === "lb" ? heightCm / 2.54 : heightCm) * 10) / 10) : "";
    $("p-weight").value = isFinite(weightKg) ? String(Math.round((u === "lb" ? weightKg * LB : weightKg) * 10) / 10) : "";
  }
  function fillProfile() {
    var d = state.data, p = d.profile;
    var editing = d.hasProfile;
    state.editingProfile = editing;
    $("profile-title").textContent = editing ? "Your profile" : "Create your lifter profile";
    $("profile-cancel").classList.toggle("hidden", !editing);
    $("profile-error").classList.add("hidden");
    $("p-name").value = p.displayName || "";
    state.draft.sex = p.sex || "";
    setSeg("p-sex", state.draft.sex);
    state.draft.units = p.units === "lb" ? "lb" : "kg";
    writeFields(p.heightCm || NaN, p.bodyweightKg || NaN, state.draft.units);
    $("p-age").value = p.age ? String(p.age) : "";
  }
  function profileError(msg) {
    var el = $("profile-error");
    el.textContent = msg;
    el.classList.remove("hidden");
  }
  function onProfileSubmit(ev) {
    ev.preventDefault();
    var heightCm = Math.round(heightCmFromField() * 10) / 10;
    var weightKg = Math.round(weightKgFromField() * 10) / 10;
    var age = parseInt($("p-age").value, 10);
    if (!state.draft.sex) return profileError("Please choose male or female.");
    if (!isFinite(heightCm) || heightCm < 100 || heightCm > 250) return profileError("Enter a realistic height.");
    if (!isFinite(weightKg) || weightKg < 30 || weightKg > 300) return profileError("Enter a realistic bodyweight.");
    if (isFinite(age) && (age < 13 || age > 100)) return profileError("Age must be between 13 and 100.");
    var btn = $("profile-save");
    btn.disabled = true;
    btn.textContent = "Saving…";
    make.call("save_profile", {
      sex: state.draft.sex,
      heightCm: heightCm,
      bodyweightKg: weightKg,
      age: isFinite(age) ? age : 0,
      units: state.draft.units,
      displayName: $("p-name").value || ""
    }).then(function () {
      return load();
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "Save profile";
      $("who-name").textContent = state.data.profile.displayName || state.data.email;
      go("dashboard");
    }, function (e) {
      btn.disabled = false;
      btn.textContent = "Save profile";
      profileError(errText(e));
    });
  }

  // ------------------------------------------------------------------ dashboard
  function bestFor(lift) {
    var list = ranked().filter(function (e) { return e.lift === lift; });
    if (!list.length) return null;
    list.sort(function (a, b) {
      return (tIdx(b.tier) - tIdx(a.tier)) || (b.tierProgress - a.tierProgress) || (b.est1RMKg - a.est1RMKg);
    });
    return list[0];
  }
  function latestFor(lift) {
    var list = ranked().filter(function (e) { return e.lift === lift; });
    return list.length ? list[list.length - 1] : null;
  }
  function renderDashboard() {
    var any = entries().length > 0;
    $("empty-hint").classList.toggle("hidden", any);
    var bests = [];
    var html = "";
    LIFTS.forEach(function (lift) {
      var b = bestFor(lift);
      if (!b) {
        var pend = entries().some(function (e) { return e.lift === lift && e.status !== "ranked"; });
        html += '<div class="rank-card unranked t-none"><div class="lift-name">' + esc(lift) + '</div>' +
          '<div class="tier tier-name">' + (pend ? "Ranking…" : "Unranked") + '</div>' +
          '<div class="next">' + (pend ? "The Rank Judge is working on it." : "Log a set to earn your first rank.") + '</div></div>';
        return;
      }
      bests.push(b);
      var l = latestFor(lift);
      var next = b.nextTier ? "Next: <b>" + esc(b.nextTier) + "</b>" + (b.nextTierTargetKg > 0 ? " at ~" + esc(fmtW(b.nextTierTargetKg)) + " est. 1RM" : "") : "Max rank reached 🌈";
      html += '<div class="rank-card ' + tcls(b.tier) + '"><div class="glow"></div>' +
        '<div class="lift-name">' + esc(lift) + '</div>' +
        '<div class="tier tier-name">' + (TIER_ICON[b.tier] || "") + " " + esc(b.tier) + '</div>' +
        '<div class="pr">Best est. 1RM <b>' + esc(fmtW(b.est1RMKg)) + '</b></div>' +
        '<div class="bar"><i style="width:' + Math.max(3, Math.min(100, b.tierProgress)) + '%"></i></div>' +
        '<div class="next">' + (b.nextTier ? esc(fmt(b.tierProgress)) + "% to next · " : "") + next + '</div>' +
        (l && l.explanation ? '<div class="why">' + esc(l.explanation) + '</div>' : "") + '</div>';
    });
    $("rank-cards").innerHTML = html;

    // hero
    var heroTier = $("hero-tier");
    if (bests.length) {
      var avg = bests.reduce(function (s, b) { return s + tIdx(b.tier); }, 0) / bests.length;
      var name = TIERS[Math.min(TIERS.length - 1, Math.round(avg))];
      heroTier.textContent = (TIER_ICON[name] || "") + " " + name;
      heroTier.className = "hero-tier " + tcls(name);
      $("hero-sub").textContent = "Average of your " + bests.length + " ranked lift" + (bests.length === 1 ? "" : "s");
    } else {
      heroTier.textContent = "Unranked";
      heroTier.className = "hero-tier t-none";
      $("hero-sub").textContent = "Log a lift to begin your climb";
    }
    var big3 = 0;
    ["Squat", "Bench Press", "Deadlift"].forEach(function (l) { var b = bestFor(l); if (b) big3 += b.est1RMKg; });
    $("hero-stats").innerHTML =
      '<div class="stat"><b>' + entries().length + '</b><span>lifts logged</span></div>' +
      '<div class="stat"><b>' + (big3 > 0 ? esc(fmt(toDisp(big3))) : "—") + '</b><span>big 3 est. total (' + units() + ')</span></div>';
  }

  // ------------------------------------------------------------------ log form
  function prepLogForm() {
    $("l-unit").textContent = "(" + units() + ")";
    if (!$("l-date").value) $("l-date").value = todayStr();
    $("l-date").max = todayStr();
    $("lift-error").classList.add("hidden");
    syncKg();
  }
  function syncKg() {
    var v = parseFloat($("l-weight").value);
    var reps = parseInt($("l-reps").value, 10);
    var kg = isFinite(v) ? Math.round((units() === "lb" ? v / LB : v) * 100) / 100 : NaN;
    $("l-weight-kg").value = isFinite(kg) ? String(kg) : "";
    var pv = $("l-preview");
    if (isFinite(kg) && isFinite(reps) && reps >= 1) {
      var eff = Math.min(reps, 12);
      var est = eff <= 1 ? kg : kg * (1 + eff / 30);
      pv.textContent = "Estimated one-rep max: " + fmtW(est);
    } else {
      pv.textContent = "";
    }
  }
  function bindLogForm() {
    ["l-weight", "l-reps"].forEach(function (id) {
      $(id).addEventListener("input", syncKg);
      $(id).addEventListener("change", syncKg);
    });
    var form = $("lift-form");
    form.addEventListener("submit", function () {
      syncKg();
      $("lift-error").classList.add("hidden");
    });
    form.addEventListener("make:submitted", function (ev) {
      var d = ev.detail || {};
      if (d.ok && (d.routed === "targets" || d.routed === "await")) {
        $("l-weight").value = "";
        syncKg();
        go("dashboard");
        startWait(false);
      } else {
        var el = $("lift-error");
        el.textContent = "Your lift was saved but nothing picked it up to rank it yet. Please try again in a moment.";
        el.classList.remove("hidden");
      }
    });
    form.addEventListener("make:failed", function (ev) {
      var d = (ev && ev.detail) || {};
      var el = $("lift-error");
      el.textContent = d.message || "Could not log that lift. Please try again.";
      el.classList.remove("hidden");
    });
  }

  // ------------------------------------------------------------------ progress
  function renderProgress() {
    var chips = "";
    LIFTS.forEach(function (l) {
      chips += '<button type="button" class="chip' + (l === state.chartLift ? " on" : "") + '" data-lift="' + esc(l) + '">' + esc(l) + "</button>";
    });
    $("lift-chips").innerHTML = chips;

    var list = entries().filter(function (e) { return e.lift === state.chartLift && e.est1RMKg > 0; });
    list.sort(function (a, b) { return a.performedOn < b.performedOn ? -1 : a.performedOn > b.performedOn ? 1 : 0; });
    var wrap = $("chart-wrap");
    if (!list.length) {
      wrap.innerHTML = '<p class="muted center" style="padding:30px 0">No ' + esc(state.chartLift) + " lifts yet. Log one to start your chart.</p>";
      $("chart-stats").innerHTML = "";
      $("tier-timeline").innerHTML = '<p class="muted">Nothing here yet.</p>';
      return;
    }
    var W = 600, H = 260, L = 46, R = 16, T = 16, B = 34;
    var vals = list.map(function (e) { return toDisp(e.est1RMKg); });
    var minV = Math.min.apply(null, vals), maxV = Math.max.apply(null, vals);
    if (maxV - minV < 1) { maxV = maxV + 5; minV = Math.max(0, minV - 5); }
    var pad = (maxV - minV) * 0.12;
    minV = Math.max(0, minV - pad); maxV = maxV + pad;
    var t0 = new Date(list[0].performedOn).getTime();
    var t1 = new Date(list[list.length - 1].performedOn).getTime();
    function X(e) {
      if (t1 === t0) return (L + (W - R)) / 2;
      return L + ((new Date(e.performedOn).getTime() - t0) / (t1 - t0)) * (W - L - R);
    }
    function Y(v) { return T + (1 - (v - minV) / (maxV - minV)) * (H - T - B); }
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Estimated one-rep max over time">';
    for (var g = 0; g <= 3; g++) {
      var gv = minV + ((maxV - minV) * g) / 3;
      var gy = Y(gv);
      svg += '<line class="grid-line" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '"/>';
      svg += '<text class="axis" x="' + (L - 6) + '" y="' + (gy + 4) + '" text-anchor="end">' + Math.round(gv) + "</text>";
    }
    var path = "";
    list.forEach(function (e, i) {
      path += (i === 0 ? "M" : "L") + X(e).toFixed(1) + " " + Y(toDisp(e.est1RMKg)).toFixed(1) + " ";
    });
    if (list.length > 1) svg += '<path d="' + path + '" fill="none" stroke="#ff9a3c" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    list.forEach(function (e) {
      var col = TIER_HEX[e.tier] || "#8d98ad";
      svg += '<circle cx="' + X(e).toFixed(1) + '" cy="' + Y(toDisp(e.est1RMKg)).toFixed(1) + '" r="6" fill="' + col + '" stroke="#0b0e14" stroke-width="2"><title>' +
        esc(prettyDate(e.performedOn) + ": " + fmtW(e.est1RMKg) + (e.tier ? " · " + e.tier : "")) + "</title></circle>";
    });
    svg += '<text class="axis" x="' + L + '" y="' + (H - 10) + '" text-anchor="start">' + esc(prettyDate(list[0].performedOn)) + "</text>";
    if (list.length > 1) svg += '<text class="axis" x="' + (W - R) + '" y="' + (H - 10) + '" text-anchor="end">' + esc(prettyDate(list[list.length - 1].performedOn)) + "</text>";
    svg += "</svg>";
    var seen = {};
    var legend = '<div class="legend">';
    list.forEach(function (e) {
      if (e.tier && !seen[e.tier]) { seen[e.tier] = 1; legend += '<span class="' + tcls(e.tier) + '"><i></i>' + esc(e.tier) + "</span>"; }
    });
    legend += "<span>Estimated 1RM (" + units() + ")</span></div>";
    wrap.innerHTML = svg + legend;

    var first = list[0].est1RMKg, last = list[list.length - 1].est1RMKg;
    var best = Math.max.apply(null, list.map(function (e) { return e.est1RMKg; }));
    var gain = first > 0 ? Math.round(((best - first) / first) * 1000) / 10 : 0;
    $("chart-stats").innerHTML =
      '<div class="stat"><b>' + esc(fmt(toDisp(first))) + '</b><span>first</span></div>' +
      '<div class="stat"><b>' + esc(fmt(toDisp(last))) + '</b><span>latest</span></div>' +
      '<div class="stat"><b>' + esc(fmt(toDisp(best))) + '</b><span>best</span></div>' +
      '<div class="stat"><b>' + (gain >= 0 ? "+" : "") + gain + '%</b><span>growth</span></div>';

    // tier timeline
    var rk = list.filter(function (e) { return e.status === "ranked" && tIdx(e.tier) >= 0; });
    var tl = "";
    var prev = -1;
    rk.forEach(function (e, i) {
      var ti = tIdx(e.tier);
      if (i === 0 || ti !== prev) {
        var label = i === 0 ? "Started at" : (ti > prev ? "Promoted to" : "Dropped to");
        tl += '<div class="timeline-item ' + tcls(e.tier) + '"><span class="dot"></span><div><b class="tier-name">' + (TIER_ICON[e.tier] || "") + " " + esc(e.tier) + '</b> <span class="muted">' + label.toLowerCase() + " · " + esc(prettyDate(e.performedOn)) + " · " + esc(fmtW(e.est1RMKg)) + "</span></div></div>";
      }
      prev = ti;
    });
    $("tier-timeline").innerHTML = tl || '<p class="muted">Waiting for your first rank.</p>';
  }

  // ------------------------------------------------------------------ history
  function renderHistory() {
    var list = entries().slice().sort(function (a, b) {
      if (a.performedOn === b.performedOn) return 0;
      return a.performedOn < b.performedOn ? 1 : -1;
    });
    if (!list.length) { $("history-list").innerHTML = '<p class="muted">Nothing logged yet.</p>'; return; }
    var html = "";
    list.forEach(function (e) {
      var isRanked = e.status === "ranked" && tIdx(e.tier) >= 0;
      var confirming = state.confirmDel === e.id;
      html += '<div class="hist-item ' + tcls(isRanked ? e.tier : "") + '">' +
        '<div class="hist-top"><span class="hist-lift">' + esc(e.lift) + "</span>" +
        (isRanked ? '<span class="badge tier-name ' + tcls(e.tier) + '">' + (TIER_ICON[e.tier] || "") + " " + esc(e.tier) + "</span>" : '<span class="muted small-text">Ranking…</span>') + "</div>" +
        '<div class="hist-sub">' + esc(fmtW(e.weightKg)) + " × " + esc(e.reps) + " · est. 1RM " + esc(fmtW(e.est1RMKg)) + " · " + esc(prettyDate(e.performedOn)) + "</div>" +
        (e.explanation ? '<div class="hist-why">' + esc(e.explanation) + "</div>" : "") +
        '<button type="button" class="link-btn" data-del="' + esc(e.id) + '">' + (confirming ? "Tap again to delete" : "Delete") + "</button></div>";
    });
    $("history-list").innerHTML = html;
  }
  function onDelete(id) {
    if (state.confirmDel !== id) {
      state.confirmDel = id;
      renderHistory();
      setTimeout(function () { if (state.confirmDel === id) { state.confirmDel = null; if (state.view === "history") renderHistory(); } }, 4000);
      return;
    }
    state.confirmDel = null;
    make.call("delete_lift", { entryId: id }).then(load).then(function () { renderAll(); }, function (e) {
      banner(errText(e), false, false);
    });
  }

  // ------------------------------------------------------------------ boot
  function bind() {
    document.addEventListener("click", function (ev) {
      var t = ev.target;
      while (t && t !== document.body) {
        if (t.getAttribute) {
          var go1 = t.getAttribute("data-go");
          if (go1) { go(go1); return; }
          var lift = t.getAttribute("data-lift");
          if (lift) { state.chartLift = lift; renderProgress(); return; }
          var del = t.getAttribute("data-del");
          if (del) { onDelete(del); return; }
        }
        t = t.parentNode;
      }
    });
    var sx = $("p-sex").querySelectorAll("button");
    for (var i = 0; i < sx.length; i++) {
      sx[i].addEventListener("click", function (ev) { state.draft.sex = ev.currentTarget.getAttribute("data-v"); setSeg("p-sex", state.draft.sex); });
    }
    var ux = $("p-units").querySelectorAll("button");
    for (var j = 0; j < ux.length; j++) {
      ux[j].addEventListener("click", function (ev) {
        var u = ev.currentTarget.getAttribute("data-v");
        if (u === state.draft.units) return;
        var h = heightCmFromField(), w = weightKgFromField();
        writeFields(h, w, u);
      });
    }
    $("profile-form").addEventListener("submit", onProfileSubmit);
    $("profile-cancel").addEventListener("click", function () { go("dashboard"); });
    $("refresh").addEventListener("click", function () {
      load().then(function () { renderAll(); }, function (e) { banner(errText(e), false, false); });
    });
    $("signout").addEventListener("click", function () {
      if (window.make && make.signOut) {
        make.signOut().then(function () {
          document.body.innerHTML = '<main><div class="card center"><h2>Signed out</h2><p class="muted">Reload this page to sign in again.</p></div></main>';
        });
      }
    });
    bindLogForm();
  }

  function init() {
    bind();
    load().then(function () {
      $("loading").classList.add("hidden");
      $("who-name").textContent = state.data.profile.displayName || state.data.email || "";
      if (!state.data.hasProfile) { go("profile"); return; }
      go("dashboard");
      if (pendingCount() > 0) startWait(true);
    }, function (e) {
      $("loading").classList.add("hidden");
      var f = $("fatal");
      f.textContent = errText(e);
      f.classList.remove("hidden");
    });
  }

  init();
})();
