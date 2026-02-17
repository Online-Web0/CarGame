/* ============================
   ADD: in-game menu + host settings + host rename
   Paste these changes into your existing script.js.
   Nothing else needs to change.
   ============================ */

/* ------------------------------------------------
   1) ADD THESE NEW VARS
   Find:
     var startRef = null;

   Add RIGHT AFTER it:
-------------------------------------------------- */
  var hostKeyRef = null;
  var settingsRef = null;
  var resetRef = null;

  var hostKey = null;

  // room-controlled settings (defaults)
  var ROOM_INFINITE_NITRO = false;
  var ROOM_SPEED_MULT = 1.0;     // accel multiplier
  var ROOM_TOPSPEED_MULT = 1.0;  // top speed multiplier
  var ROOM_PLAYER_COLLISIONS = true;

  // in-game menu UI
  var menuBtnEl = null;
  var gameMenuEl = null;
  var gameMenuVisible = false;
  var menuDirty = true;

  // reset signal
  var lastResetAt = 0;


/* ------------------------------------------------
   2) ADD THESE FUNCTIONS
   Put them anywhere inside the IIFE (recommended:
   just AFTER hideAllMenusForGameplay() or near UI helpers).
-------------------------------------------------- */
  function amHost() {
    // SOLO => host; Multiplayer => hostKey matches meKey
    if (!ROOM) return true;
    return (meKey && hostKey && meKey === hostKey);
  }

  function sanitizeName(nm) {
    nm = (nm || "").toString().trim();
    nm = nm.replace(/[<>]/g, ""); // simple injection safety
    if (nm.length > 16) nm = nm.slice(0, 16);
    return nm;
  }

  function applyRoomSettings(obj) {
    obj = obj || {};

    ROOM_INFINITE_NITRO = !!obj.infiniteNitro;

    var sm = parseFloat(obj.speedMult);
    if (!isFinite(sm)) sm = 1.0;
    ROOM_SPEED_MULT = clamp(sm, 0.25, 3.0);

    var tm = parseFloat(obj.topSpeedMult);
    if (!isFinite(tm)) tm = 1.0;
    ROOM_TOPSPEED_MULT = clamp(tm, 0.25, 3.0);

    // default true unless explicitly false
    ROOM_PLAYER_COLLISIONS = (obj.playerCollisions !== false);

    menuDirty = true;
  }

  function setRoomSetting(key, val) {
    // only host writes in multiplayer
    if (ROOM && !amHost()) return;

    // multiplayer
    if (ROOM && settingsRef) {
      var patch = {};
      patch[key] = val;
      settingsRef.update(patch);
      return;
    }

    // solo fallback
    var local = {
      infiniteNitro: ROOM_INFINITE_NITRO,
      speedMult: ROOM_SPEED_MULT,
      topSpeedMult: ROOM_TOPSPEED_MULT,
      playerCollisions: ROOM_PLAYER_COLLISIONS
    };
    local[key] = val;
    applyRoomSettings(local);
  }

  function signalResetRace() {
    if (ROOM) {
      if (!amHost() || !resetRef) return;
      resetRef.set(firebase.database.ServerValue.TIMESTAMP);
      return;
    }
    // solo: reset immediately
    resetMyCarToSpawn();
  }

  function resetMyCarToSpawn() {
    if (!me || !me.data) return;

    me.data.x = spawnX;
    me.data.y = spawnY;
    me.data.xv = 0;
    me.data.yv = 0;
    me.data.dir = spawnDir;
    me.data.lap = 1;
    me.data.checkpoint = 0;

    // nitro state reset
    nitroArmed = false;
    nitroLock = false;
    nitroActive = false;
    if (!ROOM_INFINITE_NITRO) nitroFuel = NITRO_MAX;
    else nitroFuel = NITRO_MAX;

    // apply to model immediately
    if (me.model) {
      var yawOff = (me.model.userData && me.model.userData.yawOffset) ? me.model.userData.yawOffset : 0;
      me.model.position.x = me.data.x;
      me.model.position.z = me.data.y;
      me.model.rotation.y = me.data.dir + yawOff;
    }

    // sync to firebase
    if (me.ref) {
      me.data.lastSeen = Date.now();
      me.ref.set(me.data);
    }
  }

  function setupGameMenuUIOnce() {
    if (setupGameMenuUIOnce._did) return;
    setupGameMenuUIOnce._did = true;

    // styles
    if (!document.getElementById("gmStyle")) {
      var st = document.createElement("style");
      st.id = "gmStyle";
      st.textContent =
        "#gamemenubtn{position:fixed;top:12px;left:12px;z-index:100001;" +
        "font-family:'Press Start 2P',monospace;font-size:12px;line-height:12px;" +
        "padding:10px 12px;background:rgba(0,0,0,.55);border:2px solid rgba(255,255,255,.85);" +
        "color:#fff;border-radius:12px;cursor:pointer;user-select:none;display:none}" +

        "#gamemenu{position:fixed;top:56px;left:12px;width:420px;max-width:calc(100vw - 24px);" +
        "max-height:calc(100vh - 72px);overflow:auto;z-index:100002;" +
        "background:rgba(0,0,0,.75);border:2px solid rgba(255,255,255,.85);border-radius:16px;" +
        "padding:14px 14px 10px 14px;display:none;color:#fff;" +
        "font-family:'Press Start 2P',monospace}" +

        ".gmRow{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0}" +
        ".gmTitle{font-size:12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}" +
        ".gmClose{cursor:pointer;padding:6px 8px;border:2px solid rgba(255,255,255,.65);border-radius:10px;" +
        "background:rgba(255,255,255,.10)}" +

        ".gmSection{margin-top:12px;padding-top:10px;border-top:2px solid rgba(255,255,255,.18)}" +
        ".gmH{font-size:11px;margin:0 0 10px 0;opacity:.95}" +

        ".gmSmall{font-size:10px;opacity:.85}" +
        ".gmBtn{cursor:pointer;padding:8px 10px;border:2px solid rgba(255,255,255,.65);" +
        "border-radius:12px;background:rgba(255,255,255,.10);color:#fff;font-family:'Press Start 2P',monospace;" +
        "font-size:10px}" +

        ".gmInput{width:100%;padding:8px 10px;border-radius:12px;border:2px solid rgba(255,255,255,.45);" +
        "background:rgba(0,0,0,.35);color:#fff;font-family:'Press Start 2P',monospace;font-size:10px}" +

        ".gmRange{width:190px}" +
        ".gmTag{font-size:10px;opacity:.85;margin-left:8px}" +
        ".gmPlayerLine{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 0}" +
        ".gmPName{font-size:10px;opacity:.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px}" +
        ".gmEdit{cursor:pointer;font-size:10px;padding:6px 8px;border-radius:10px;border:2px solid rgba(255,255,255,.45);" +
        "background:rgba(255,255,255,.10)}";
      document.head.appendChild(st);
    }

    // button
    menuBtnEl = document.getElementById("gamemenubtn");
    if (!menuBtnEl) {
      menuBtnEl = document.createElement("div");
      menuBtnEl.id = "gamemenubtn";
      menuBtnEl.textContent = "MENU";
      document.body.appendChild(menuBtnEl);
    }

    // panel
    gameMenuEl = document.getElementById("gamemenu");
    if (!gameMenuEl) {
      gameMenuEl = document.createElement("div");
      gameMenuEl.id = "gamemenu";

      // header
      var hdr = document.createElement("div");
      hdr.className = "gmTitle";
      var ttl = document.createElement("div");
      ttl.textContent = "GAME MENU";
      var close = document.createElement("div");
      close.className = "gmClose";
      close.textContent = "X";
      close.onclick = function () { setGameMenuVisible(false); };
      hdr.appendChild(ttl);
      hdr.appendChild(close);
      gameMenuEl.appendChild(hdr);

      // info
      var info = document.createElement("div");
      info.id = "gm_info";
      info.className = "gmSmall";
      gameMenuEl.appendChild(info);

      // players
      var secP = document.createElement("div");
      secP.className = "gmSection";
      var hP = document.createElement("div");
      hP.className = "gmH";
      hP.textContent = "PLAYERS";
      var list = document.createElement("div");
      list.id = "gm_players";
      secP.appendChild(hP);
      secP.appendChild(list);
      gameMenuEl.appendChild(secP);

      // settings
      var secS = document.createElement("div");
      secS.className = "gmSection";
      var hS = document.createElement("div");
      hS.className = "gmH";
      hS.textContent = "SETTINGS";
      var sWrap = document.createElement("div");
      sWrap.id = "gm_settings";
      secS.appendChild(hS);
      secS.appendChild(sWrap);
      gameMenuEl.appendChild(secS);

      document.body.appendChild(gameMenuEl);
    }

    function shouldIgnoreToggleKey() {
      var ae = document.activeElement;
      if (!ae) return false;
      var tag = (ae.tagName || "").toUpperCase();
      return (tag === "INPUT" || tag === "TEXTAREA" || ae.isContentEditable);
    }

    function toggleMenu() {
      setGameMenuVisible(!gameMenuVisible);
    }

    menuBtnEl.onclick = toggleMenu;

    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape" || e.key === "Tab") {
        if (shouldIgnoreToggleKey()) return;
        e.preventDefault();
        toggleMenu();
      }
      if (e.key === "m" || e.key === "M") {
        if (shouldIgnoreToggleKey()) return;
        toggleMenu();
      }
    });
  }

  function setGameMenuVisible(v) {
    gameMenuVisible = !!v;
    if (!gameMenuEl) return;
    gameMenuEl.style.display = gameMenuVisible ? "block" : "none";
    menuDirty = true;
  }

  function refreshGameMenu() {
    if (!gameMenuEl) return;

    // show button only in gameplay
    if (menuBtnEl) menuBtnEl.style.display = (gameStarted ? "block" : "none");

    // update info
    var info = document.getElementById("gm_info");
    if (info) {
      var roomText = ROOM ? ROOM : "SOLO";
      var hostName = "Unknown";
      if (!ROOM && me && me.data) hostName = me.data.name || "Player";
      if (ROOM && hostKey && players[hostKey] && players[hostKey].data) hostName = players[hostKey].data.name || "Host";
      info.textContent = "ROOM: " + roomText + " | HOST: " + hostName;
    }

    // players list
    var list = document.getElementById("gm_players");
    if (list) {
      while (list.firstChild) list.removeChild(list.firstChild);

      // stable-ish ordering: me first, then others by name
      var keys = [];
      for (var k in players) if (players.hasOwnProperty(k)) keys.push(k);

      keys.sort(function (a, b) {
        if (a === meKey) return -1;
        if (b === meKey) return 1;
        var an = (players[a] && players[a].data && players[a].data.name) ? players[a].data.name : a;
        var bn = (players[b] && players[b].data && players[b].data.name) ? players[b].data.name : b;
        return an.localeCompare(bn);
      });

      for (var i = 0; i < keys.length; i++) {
        (function (key) {
          var p = players[key];
          if (!p || !p.data) return;

          var line = document.createElement("div");
          line.className = "gmPlayerLine";

          var nm = document.createElement("div");
          nm.className = "gmPName";

          var tag = "";
          if (key === meKey) tag += " (YOU)";
          if (ROOM && hostKey && key === hostKey) tag += " (HOST)";
          if (!ROOM && key === meKey) tag += " (HOST)";

          nm.textContent = (p.data.name || "Player") + tag;

          line.appendChild(nm);

          // host rename button
          if (amHost() && (ROOM ? true : true)) {
            var edit = document.createElement("div");
            edit.className = "gmEdit";
            edit.textContent = "RENAME";
            edit.onclick = function () {
              var cur = (p.data.name || "Player");
              var nn = prompt("New name for " + cur + ":", cur);
              nn = sanitizeName(nn);
              if (!nn) return;

              // local update
              p.data.name = nn;
              if (p.label) p.label.textContent = nn;

              // firebase update for multiplayer
              if (ROOM && playersRef) {
                playersRef.child(key).child("name").set(nn);
              } else if (me && key === meKey) {
                // solo: keep me.data in sync
                me.data.name = nn;
                if (me.label) me.label.textContent = nn;
              }

              menuDirty = true;
            };
            line.appendChild(edit);
          }

          list.appendChild(line);
        })(keys[i]);
      }
    }

    // settings
    var sWrap = document.getElementById("gm_settings");
    if (sWrap) {
      while (sWrap.firstChild) sWrap.removeChild(sWrap.firstChild);

      function rowLabel(txt) {
        var d = document.createElement("div");
        d.className = "gmSmall";
        d.textContent = txt;
        return d;
      }

      function mkRow() {
        var r = document.createElement("div");
        r.className = "gmRow";
        return r;
      }

      var host = amHost();

      // Infinite nitro
      var r1 = mkRow();
      r1.appendChild(rowLabel("INFINITE NITRO"));
      var cb1 = document.createElement("input");
      cb1.type = "checkbox";
      cb1.checked = !!ROOM_INFINITE_NITRO;
      cb1.disabled = !host;
      cb1.onchange = function () { setRoomSetting("infiniteNitro", !!cb1.checked); };
      r1.appendChild(cb1);
      sWrap.appendChild(r1);

      // Speed mult
      var r2 = mkRow();
      r2.appendChild(rowLabel("SPEED"));
      var rng = document.createElement("input");
      rng.type = "range";
      rng.min = "0.50";
      rng.max = "2.00";
      rng.step = "0.05";
      rng.value = String(ROOM_SPEED_MULT);
      rng.className = "gmRange";
      rng.disabled = !host;
      var tag2 = document.createElement("span");
      tag2.className = "gmTag";
      tag2.textContent = ROOM_SPEED_MULT.toFixed(2) + "x";
      rng.oninput = function () { tag2.textContent = parseFloat(rng.value).toFixed(2) + "x"; };
      rng.onchange = function () { setRoomSetting("speedMult", parseFloat(rng.value)); };
      r2.appendChild(rng);
      r2.appendChild(tag2);
      sWrap.appendChild(r2);

      // Top speed mult
      var r3 = mkRow();
      r3.appendChild(rowLabel("TOP SPEED"));
      var rng2 = document.createElement("input");
      rng2.type = "range";
      rng2.min = "0.50";
      rng2.max = "2.00";
      rng2.step = "0.05";
      rng2.value = String(ROOM_TOPSPEED_MULT);
      rng2.className = "gmRange";
      rng2.disabled = !host;
      var tag3 = document.createElement("span");
      tag3.className = "gmTag";
      tag3.textContent = ROOM_TOPSPEED_MULT.toFixed(2) + "x";
      rng2.oninput = function () { tag3.textContent = parseFloat(rng2.value).toFixed(2) + "x"; };
      rng2.onchange = function () { setRoomSetting("topSpeedMult", parseFloat(rng2.value)); };
      r3.appendChild(rng2);
      r3.appendChild(tag3);
      sWrap.appendChild(r3);

      // Player collisions
      var r4 = mkRow();
      r4.appendChild(rowLabel("PLAYER COLLISIONS"));
      var cb2 = document.createElement("input");
      cb2.type = "checkbox";
      cb2.checked = !!ROOM_PLAYER_COLLISIONS;
      cb2.disabled = !host;
      cb2.onchange = function () { setRoomSetting("playerCollisions", !!cb2.checked); };
      r4.appendChild(cb2);
      sWrap.appendChild(r4);

      // Reset button (host only)
      var r5 = mkRow();
      var b = document.createElement("button");
      b.className = "gmBtn";
      b.textContent = "RESET RACE";
      b.disabled = !host;
      b.onclick = function () { signalResetRace(); };
      r5.appendChild(b);

      // extra: copy room code (host only, multiplayer only)
      if (ROOM) {
        var b2 = document.createElement("button");
        b2.className = "gmBtn";
        b2.textContent = "COPY CODE";
        b2.disabled = !host;
        b2.onclick = function () {
          if (!host) return;
          var txt = ROOM;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).catch(function(){});
          } else {
            prompt("Copy room code:", txt);
          }
        };
        r5.appendChild(b2);
      }

      sWrap.appendChild(r5);

      if (!host) {
        var note = document.createElement("div");
        note.className = "gmSmall";
        note.style.marginTop = "10px";
        note.textContent = "Only the host can change settings / names.";
        sWrap.appendChild(note);
      }
    }
  }


/* ------------------------------------------------
   3) MODIFY detachRoomListeners()
   Find:
     function detachRoomListeners() {
       try {
         if (playersRef) playersRef.off();
         if (startRef) startRef.off();
       } catch (e) {}
     }

   Replace with:
-------------------------------------------------- */
  function detachRoomListeners() {
    try {
      if (playersRef) playersRef.off();
      if (startRef) startRef.off();
      if (hostKeyRef) hostKeyRef.off();
      if (settingsRef) settingsRef.off();
      if (resetRef) resetRef.off();
    } catch (e) {}
    hostKeyRef = null;
    settingsRef = null;
    resetRef = null;
  }


/* ------------------------------------------------
   4) MODIFY connectToRoom(...)
   Inside connectToRoom AFTER:
     startRef = roomRef.child("startedAt");

   Add:
-------------------------------------------------- */
    hostKeyRef = roomRef.child("hostKey");
    settingsRef = roomRef.child("settings");
    resetRef = roomRef.child("resetAt");

    hostKeyRef.on("value", function (snap) {
      hostKey = snap.val() || null;
      menuDirty = true;
    });

    settingsRef.on("value", function (snap) {
      var s = snap.val();
      if (!s) {
        // default apply even if missing
        applyRoomSettings({
          infiniteNitro: false,
          speedMult: 1.0,
          topSpeedMult: 1.0,
          playerCollisions: true
        });
        return;
      }
      applyRoomSettings(s);
    });

    resetRef.on("value", function (snap) {
      var v = snap.val();
      if (!v) return;
      if (v <= lastResetAt) return;
      lastResetAt = v;
      resetMyCarToSpawn();
      menuDirty = true;
    });

    menuDirty = true;


/* ------------------------------------------------
   5) MODIFY createLocalPlayerFirebase()
   Inside createLocalPlayerFirebase(), AFTER:
     meKey = ref.key;

   Add:
-------------------------------------------------- */
    // If I'm hosting, claim hostKey (only if empty) and set default settings once.
    if (isHost && hostKeyRef) {
      hostKeyRef.transaction(function (cur) { return cur || meKey; });
      if (settingsRef) {
        settingsRef.transaction(function (cur) {
          return cur || {
            infiniteNitro: false,
            speedMult: 1.0,
            topSpeedMult: 1.0,
            playerCollisions: true
          };
        });
      }
    }


/* ------------------------------------------------
   6) MODIFY soloFlow()
   Inside soloFlow(), after:
     isHost = false;

   Replace that ONE line with:
-------------------------------------------------- */
    isHost = true;   // solo acts as host for menu settings
    hostKey = "solo";
    applyRoomSettings({
      infiniteNitro: false,
      speedMult: 1.0,
      topSpeedMult: 1.0,
      playerCollisions: true
    });
    menuDirty = true;


/* ------------------------------------------------
   7) MODIFY upsertPlayer() and removePlayer()
   Add ONE line at the end of each function:
     menuDirty = true;
-------------------------------------------------- */


/* ------------------------------------------------
   8) MODIFY ensureEngine()
   Inside ensureEngine(), near the end AFTER you create UI
   elements and styles (anywhere after foreEl/titleEl are found),
   add:
-------------------------------------------------- */
    setupGameMenuUIOnce();
    menuDirty = true;


/* ------------------------------------------------
   9) MODIFY collideWithPlayers()
   At the very top of collideWithPlayers(), add:
-------------------------------------------------- */
    if (!ROOM_PLAYER_COLLISIONS) return;


/* ------------------------------------------------
   10) MODIFY updateMePhysics(...) to use settings
   Make ONLY these targeted edits:

   A) Right before your Nitro state block (before:
        // Nitro state
      ), add:
-------------------------------------------------- */
    if (ROOM_INFINITE_NITRO) {
      nitroFuel = NITRO_MAX;
      nitroLock = false;
      if (nitro) nitroArmed = true; // allow boost whenever held
    }


/* ------------------------------------------------
   B) Replace your Nitro state section with this block.
   Find this whole block:

    // Nitro state
    nitroActive = false;
    if (nitro && nitroArmed && !nitroLock && nitroFuel > 0) {
      nitroActive = true;
      nitroFuel -= NITRO_DRAIN * dtSec;

      if (nitroFuel <= 0) {
        nitroFuel = 0;
        nitroLock = true;
        nitroArmed = false;
        nitroActive = false;
      }
    } else {
      nitroFuel = Math.min(NITRO_MAX, nitroFuel + NITRO_REGEN * dtSec);
    }

   Replace with:
-------------------------------------------------- */
    // Nitro state (room settings aware)
    nitroActive = false;

    if (ROOM_INFINITE_NITRO) {
      // Infinite: boost while Shift held; fuel stays full.
      nitroFuel = NITRO_MAX;
      nitroLock = false;
      if (nitro) nitroArmed = true;
      if (nitro && nitroArmed) nitroActive = true;
    } else {
      if (nitro && nitroArmed && !nitroLock && nitroFuel > 0) {
        nitroActive = true;
        nitroFuel -= NITRO_DRAIN * dtSec;

        if (nitroFuel <= 0) {
          nitroFuel = 0;
          nitroLock = true;
          nitroArmed = false;
          nitroActive = false;
        }
      } else {
        nitroFuel = Math.min(NITRO_MAX, nitroFuel + NITRO_REGEN * dtSec);
      }
    }


/* ------------------------------------------------
   C) In Classic physics section, change accel and cap:
   Find:
      var accel = SPEED;

   Change to:
-------------------------------------------------- */
      var accel = SPEED * ROOM_SPEED_MULT;

/* ------------------------------------------------
   Find:
      var cap = CLASSIC_MAX_SPEED;

   Change to:
-------------------------------------------------- */
      var cap = CLASSIC_MAX_SPEED * ROOM_TOPSPEED_MULT;


/* ------------------------------------------------
   11) MODIFY renderLoop(ts)
   Near the bottom of renderLoop, before:
     renderer.render(scene, camera);

   Add:
-------------------------------------------------- */
    if (menuDirty) {
      refreshGameMenu();
      menuDirty = false;
    }
