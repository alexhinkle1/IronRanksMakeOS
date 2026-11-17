(function () {
  'use strict';
  var SB = 'https://yqadckmauiqehwhfgmzl.supabase.co';
  var KEY = 'sb_publishable_RHCcXXMAO-bIxJK-raWbuA_XsO7OKYJ';
  var sb = window.supabase.createClient(SB, KEY);

  function overlay() {
    if (document.getElementById('signin')) return;
    var d = document.createElement('div');
    d.id = 'signin';
    d.style.cssText = 'position:fixed;inset:0;z-index:100;background:#0b0e14;display:flex;align-items:center;justify-content:center;padding:20px';
    d.innerHTML = '<div class="card center" style="max-width:380px;width:100%"><div style="font-size:42px">⚔️</div><h2>Iron Ranks</h2><p class="muted">Sign in to track your lifts and earn your rank.</p><button id="google-btn" class="btn primary wide" type="button">Sign in with Google</button><p id="signin-err" class="form-error hidden"></p></div>';
    document.body.appendChild(d);
    document.getElementById('google-btn').onclick = function () {
      sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }).then(function (r) {
        if (r.error) {
          var e = document.getElementById('signin-err');
          e.textContent = r.error.message;
          e.classList.remove('hidden');
        }
      });
    };
  }

  function session() {
    return sb.auth.getSession().then(function (r) {
      if (r.data && r.data.session) return r.data.session;
      overlay();
      return new Promise(function () {});
    });
  }

  function check(r) {
    if (r.error) throw r.error;
    return r.data;
  }

  var calls = {
    get_my_data: function (s) {
      var uid = s.user.id;
      return Promise.all([
        sb.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
        sb.from('lift_entries').select('*').eq('user_id', uid).order('performed_on', { ascending: true }).order('created_at', { ascending: true })
      ]).then(function (rs) {
        var p = check(rs[0]);
        var rows = check(rs[1]) || [];
        var meta = s.user.user_metadata || {};
        var name = meta.full_name || meta.name || s.user.email || '';
        var profile = p
          ? { sex: p.sex, heightCm: Number(p.height_cm), bodyweightKg: Number(p.bodyweight_kg), age: p.age || 0, units: p.units || 'kg', displayName: p.display_name || name }
          : { sex: '', heightCm: 0, bodyweightKg: 0, age: 0, units: 'kg', displayName: name };
        return {
          hasProfile: !!p,
          email: s.user.email || '',
          profile: profile,
          entries: rows.map(function (r) {
            return {
              id: r.id,
              lift: r.lift,
              weightKg: Number(r.weight_kg),
              reps: r.reps,
              performedOn: String(r.performed_on).slice(0, 10),
              est1RMKg: Number(r.est_1rm_kg) || 0,
              bodyweightKg: Number(r.bodyweight_kg) || 0,
              status: r.status,
              tier: r.tier || '',
              tierProgress: Number(r.tier_progress) || 0,
              nextTier: r.next_tier || '',
              nextTierTargetKg: Number(r.next_tier_target_kg) || 0,
              explanation: r.explanation || ''
            };
          })
        };
      });
    },
    save_profile: function (s, a) {
      return sb.from('profiles').upsert({
        user_id: s.user.id,
        display_name: a.displayName || null,
        sex: a.sex,
        height_cm: a.heightCm,
        bodyweight_kg: a.bodyweightKg,
        age: a.age > 0 ? a.age : null,
        units: a.units,
        updated_at: new Date().toISOString()
      }).then(function (r) { check(r); return { ok: true }; });
    },
    delete_lift: function (s, a) {
      return sb.from('lift_entries').delete().eq('id', a.entryId).then(function (r) { check(r); return { ok: true }; });
    }
  };

  window.make = {
    call: function (name, args) {
      return session().then(function (s) { return calls[name](s, args || {}); });
    },
    signOut: function () { return sb.auth.signOut(); }
  };

  var form = document.getElementById('lift-form');
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    setTimeout(function () {
      var btn = document.getElementById('lift-submit');
      btn.disabled = true;
      session().then(function (s) {
        return fetch('/api/log-lift', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.access_token },
          body: JSON.stringify({
            lift: form.elements.lift.value,
            reps: Number(form.elements.reps.value),
            weightKg: Number(form.elements.weightKg.value),
            performedOn: form.elements.performedOn.value
          })
        });
      }).then(function (r) {
        btn.disabled = false;
        if (r.ok) {
          return r.json().then(function (j) {
            form.dispatchEvent(new CustomEvent('make:submitted', { detail: { ok: true, routed: j.routed || 'targets' } }));
          });
        }
        return r.json().catch(function () { return {}; }).then(function (j) {
          form.dispatchEvent(new CustomEvent('make:failed', { detail: { message: j.error || 'Could not log that lift. Please try again.' } }));
        });
      }, function () {
        btn.disabled = false;
        form.dispatchEvent(new CustomEvent('make:failed', { detail: { message: 'Network error. Please try again.' } }));
      });
    }, 0);
  });
})();
