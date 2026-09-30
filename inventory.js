/*
 * Inventory, "made" tracking and the computed shopping list.
 *
 * This file is stable across weeks. Each weekly index.html declares
 * `window.WEEK` (recipes and the ingredients they use) and includes this
 * script; everything below is derived from that data plus what's saved on
 * this device.
 *
 * Storage (localStorage, this device only):
 *   mealplan_inventory_v1   { have: {id: qty}, par: {id: qty} }   kept forever
 *   mealplan_week_<id>      { made, bought, ticked }               per week
 *
 * An item with no `have` entry is "not tracked yet". Untracked items are
 * treated as none on hand when shopping, except staples, which are assumed
 * to be in the cupboard.
 */
(function () {
  'use strict';

  var W = window.WEEK;
  if (!W || !W.recipes) return;

  /* ------------------------------------------------------------------ *
   * Catalog: ingredients that recur week to week and can be tracked.
   *   unit   ''  = counted individually; otherwise g, ml, or a named unit
   *   pack   size of what the shop sells, in `unit`; buy rounds up to it
   *   par    restock level: below this, the list suggests buying more
   *   staple assume it's on hand until you start tracking it
   * ------------------------------------------------------------------ */
  var CATALOG = [
    // meat
    { id: 'chicken-thigh', name: 'Chicken thighs, boneless', group: 'meat', unit: 'g' },
    { id: 'chicken-breast', name: 'Chicken breasts', group: 'meat', unit: 'g' },
    { id: 'ground-beef', name: 'Ground beef', group: 'meat', unit: 'g' },
    { id: 'deli-meat', name: 'Deli ham or turkey, sliced', group: 'meat', unit: 'g' },
    // produce
    { id: 'onion', name: 'Onions', group: 'produce', unit: '', par: 2 },
    { id: 'carrot', name: 'Carrots', group: 'produce', unit: 'g', par: 200 },
    { id: 'celery', name: 'Celery', group: 'produce', unit: 'stalk', pack: 8, packName: 'bunch', packPlural: 'bunches' },
    { id: 'bell-pepper', name: 'Bell peppers', group: 'produce', unit: '' },
    { id: 'cucumber', name: 'Cucumbers', group: 'produce', unit: '' },
    { id: 'zucchini', name: 'Zucchini', group: 'produce', unit: '' },
    { id: 'cauliflower', name: 'Cauliflower', group: 'produce', unit: 'g', pack: 600, packName: 'head' },
    { id: 'broccoli', name: 'Broccoli', group: 'produce', unit: 'g' },
    { id: 'baby-spinach', name: 'Baby spinach', group: 'produce', unit: 'g', pack: 150, packName: 'bag' },
    { id: 'potato', name: 'Potatoes', group: 'produce', unit: 'g' },
    { id: 'green-beans', name: 'Green beans', group: 'produce', unit: 'g' },
    { id: 'garlic', name: 'Garlic', group: 'produce', unit: 'clove', pack: 10, packName: 'bulb', par: 5 },
    { id: 'lemon', name: 'Lemons', group: 'produce', unit: '' },
    { id: 'lime', name: 'Limes', group: 'produce', unit: '' },
    { id: 'apple', name: 'Apples', group: 'produce', unit: '' },
    // dairy
    { id: 'milk', name: 'Milk', group: 'dairy', unit: 'ml', pack: 2000, packName: 'jug', par: 1000 },
    { id: 'butter', name: 'Butter', group: 'dairy', unit: 'g', pack: 454, packName: 'block', par: 200 },
    { id: 'cheddar', name: 'Shredded cheddar', group: 'dairy', unit: 'g', pack: 320, packName: 'bag', par: 150 },
    { id: 'mozzarella', name: 'Shredded mozzarella', group: 'dairy', unit: 'g', pack: 320, packName: 'bag' },
    { id: 'parmesan', name: 'Parmesan, grated', group: 'dairy', unit: 'g', pack: 150, packName: 'tub' },
    { id: 'cheese-block', name: 'Firm cheese block', group: 'dairy', unit: 'g', pack: 400, packName: 'block' },
    { id: 'heavy-cream', name: 'Heavy cream', group: 'dairy', unit: 'ml', pack: 473, packName: 'carton' },
    { id: 'greek-yogurt', name: 'Greek yogurt', group: 'dairy', unit: 'g', pack: 650, packName: 'tub' },
    { id: 'dairy-free-yogurt', name: 'Dairy-free yogurt (coconut or oat)', group: 'dairy', unit: 'g', pack: 500, packName: 'tub' },
    { id: 'eggs', name: 'Eggs (parents only)', group: 'dairy', unit: '', pack: 12, packName: 'dozen', packPlural: 'dozen' },
    // dry and canned
    { id: 'flour', name: 'Flour', group: 'dry', unit: 'g', pack: 2500, packName: 'bag', par: 500, staple: true },
    { id: 'bread-flour', name: 'Bread flour', group: 'dry', unit: 'g', pack: 2500, packName: 'bag' },
    { id: 'sugar', name: 'Granulated sugar', group: 'dry', unit: 'g', pack: 2000, packName: 'bag', par: 300, staple: true },
    { id: 'brown-sugar', name: 'Brown sugar', group: 'dry', unit: 'g', pack: 1000, packName: 'bag', par: 200, staple: true },
    { id: 'cornstarch', name: 'Cornstarch', group: 'dry', unit: 'g', pack: 400, packName: 'box', staple: true },
    { id: 'rice', name: 'Rice', group: 'dry', unit: 'g', pack: 2000, packName: 'bag', par: 500 },
    { id: 'macaroni', name: 'Macaroni, egg-free', group: 'dry', unit: 'g', pack: 900, packName: 'bag', par: 200, note: 'Plain dried pasta, not egg pasta.' },
    { id: 'lasagna-noodles', name: 'Lasagna noodles, egg-free', group: 'dry', unit: 'g', pack: 500, packName: 'box', note: 'Plain dried sheets, not fresh or "egg pasta".' },
    { id: 'rolled-oats', name: 'Rolled oats', group: 'dry', unit: 'g', pack: 1000, packName: 'bag', par: 200 },
    { id: 'flaxseed', name: 'Ground flaxseed', group: 'dry', unit: 'g', pack: 425, packName: 'bag', par: 50, note: 'The egg swap: 10 g + 45 ml water per egg.' },
    { id: 'yeast', name: 'Instant yeast', group: 'dry', unit: 'g', pack: 21, packName: 'strip of 3', packPlural: 'strips of 3' },
    { id: 'breadcrumbs', name: 'Breadcrumbs, egg-free', group: 'dry', unit: 'g', pack: 400, packName: 'box' },
    { id: 'chicken-broth', name: 'Chicken broth', group: 'dry', unit: 'ml', pack: 900, packName: 'carton', par: 900 },
    { id: 'black-beans', name: 'Black beans', group: 'dry', unit: 'can', pack: 1, packName: 'can', par: 1 },
    { id: 'kidney-beans', name: 'Kidney beans', group: 'dry', unit: 'can', pack: 1, packName: 'can' },
    { id: 'chickpeas', name: 'Chickpeas', group: 'dry', unit: 'can', pack: 1, packName: 'can' },
    { id: 'diced-tomatoes', name: 'Diced tomatoes', group: 'dry', unit: 'can', pack: 1, packName: 'can', par: 1 },
    { id: 'tomato-paste', name: 'Tomato paste', group: 'dry', unit: 'g', pack: 150, packName: 'tube' },
    { id: 'chocolate-chips', name: 'Chocolate chips, nut-free', group: 'dry', unit: 'g', pack: 300, packName: 'bag' },
    { id: 'raisins', name: 'Raisins', group: 'dry', unit: 'g', pack: 400, packName: 'box' },
    { id: 'sunflower-seeds', name: 'Sunflower seeds', group: 'dry', unit: 'g', pack: 200, packName: 'bag' },
    { id: 'pumpkin-seeds', name: 'Pumpkin seeds', group: 'dry', unit: 'g', pack: 200, packName: 'bag' },
    { id: 'dried-cranberries', name: 'Dried cranberries', group: 'dry', unit: 'g', pack: 170, packName: 'bag' },
    { id: 'mini-marshmallows', name: 'Mini marshmallows', group: 'dry', unit: 'g', pack: 250, packName: 'bag', note: 'Check for a nut warning.' },
    { id: 'rice-cereal', name: 'Crisp rice cereal', group: 'dry', unit: 'g', pack: 340, packName: 'box' },
    // bakery
    { id: 'bread', name: 'Sandwich bread, egg-free', group: 'bakery', unit: 'slice', pack: 20, packName: 'loaf', packPlural: 'loaves' },
    { id: 'tortillas', name: 'Flour tortillas, egg-free', group: 'bakery', unit: '', pack: 10, packName: 'pack' },
    // frozen
    { id: 'frozen-corn', name: 'Frozen corn', group: 'frozen', unit: 'g', pack: 750, packName: 'bag', par: 200 },
    { id: 'frozen-berries', name: 'Frozen berries', group: 'frozen', unit: 'g', pack: 600, packName: 'bag' },
    { id: 'frozen-perogies', name: 'Frozen perogies', group: 'frozen', unit: 'g', pack: 907, packName: 'bag', note: 'Check the dough is egg-free.' }
  ];

  var GROUPS = [
    ['meat', '🥩 Meat'], ['produce', '🥦 Produce'], ['dairy', '🧀 Dairy & eggs'],
    ['dry', '🥫 Dry & canned'], ['bakery', '🍞 Bakery'], ['frozen', '🧊 Frozen'], ['other', '🛒 Other']
  ];

  var INV_KEY = 'mealplan_inventory_v1';
  var WEEK_KEY = 'mealplan_week_' + W.id;
  var VIEW_KEY = 'mealplan_inventory_view';
  var MAX_QTY = 1e6;

  var CAT = {};
  CATALOG.forEach(function (c) { CAT[c.id] = c; });
  // Week-local items: used this week, never tracked in inventory.
  var LOCAL = {};
  Object.keys(W.items || {}).forEach(function (id) {
    if (CAT[id]) return; // catalog wins; a clash would be a typo
    LOCAL[id] = Object.assign({ id: id, group: 'other', unit: '' }, W.items[id]);
  });
  function def(id) { return CAT[id] || LOCAL[id]; }

  /* ---------------- storage ---------------- */
  function load(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v && typeof v === 'object' ? v : null;
    } catch (e) { return null; }
  }
  function store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) && n >= 0 && n <= MAX_QTY ? n : null;
  }
  // Keep only catalog ids with sane numbers, so bad or hand-edited data can't break rendering.
  function cleanMap(m) {
    var out = {};
    if (m && typeof m === 'object') {
      Object.keys(m).forEach(function (id) {
        var n = num(m[id]);
        if (CAT[id] && n !== null) out[id] = n;
      });
    }
    return out;
  }

  var raw = load(INV_KEY) || {};
  var inv = { have: cleanMap(raw.have), par: cleanMap(raw.par) };
  var wraw = load(WEEK_KEY) || {};
  var ws = {
    made: wraw.made && typeof wraw.made === 'object' ? wraw.made : {},
    bought: wraw.bought && typeof wraw.bought === 'object' ? wraw.bought : {},
    ticked: wraw.ticked && typeof wraw.ticked === 'object' ? wraw.ticked : {}
  };
  function saveInv() { store(INV_KEY, inv); }
  function saveWeek() { store(WEEK_KEY, ws); }

  function has(id) { return Object.prototype.hasOwnProperty.call(inv.have, id); }
  function parOf(id) {
    if (Object.prototype.hasOwnProperty.call(inv.par, id)) return inv.par[id];
    return (CAT[id] && CAT[id].par) || 0;
  }
  function round(n) { return Math.round(n * 100) / 100; }

  /* ---------------- formatting ---------------- */
  function trim(n) { return String(round(n)).replace(/\.0+$/, ''); }
  function amt(q, d) {
    var u = d.unit || '';
    if (u === 'g') return q >= 1000 ? trim(q / 1000) + ' kg' : trim(q) + ' g';
    if (u === 'ml') return q >= 1000 ? trim(q / 1000) + ' L' : trim(q) + ' ml';
    if (!u) return trim(q);
    return trim(q) + ' ' + (q === 1 ? u : u + 's');
  }
  function packs(q, d) {
    var n = Math.round(q / d.pack);
    var name = n === 1 ? d.packName : (d.packPlural || d.packName + 's');
    var s = n + ' ' + name;
    if (d.pack > 1) s += ' (' + amt(n * d.pack, d) + ')';
    return s;
  }
  function qtyText(q, d) { return d.pack ? packs(q, d) : amt(q, d); }
  function roundBuy(q, d) {
    if (q <= 0) return 0;
    if (d.pack) return Math.ceil(q / d.pack - 1e-9) * d.pack;
    if (!d.unit || d.unit === 'can' || d.unit === 'stalk' || d.unit === 'clove' || d.unit === 'slice') return Math.ceil(q - 1e-9);
    return Math.ceil(q);
  }

  /* ---------------- core calculations ---------------- */
  function isMade(rid) { return Object.prototype.hasOwnProperty.call(ws.made, rid); }

  // What the rest of the week still needs, with the per-recipe breakdown.
  function needs() {
    var out = {};
    Object.keys(W.recipes).forEach(function (rid) {
      if (isMade(rid)) return;
      var r = W.recipes[rid], uses = r.uses || {};
      Object.keys(uses).forEach(function (id) {
        var q = num(uses[id]);
        if (!q || !def(id)) return;
        if (!out[id]) out[id] = { total: 0, by: [] };
        out[id].total = round(out[id].total + q);
        out[id].by.push([rid, q]);
      });
    });
    return out;
  }

  function toggleMade(rid) {
    var r = W.recipes[rid];
    if (!r) return;
    if (isMade(rid)) {
      // Undo: give back exactly what was taken, even if it had been clamped at zero.
      var taken = ws.made[rid] || {};
      Object.keys(taken).forEach(function (id) {
        var q = num(taken[id]);
        if (q && has(id)) inv.have[id] = round(inv.have[id] + q);
      });
      delete ws.made[rid];
    } else {
      var rec = {};
      Object.keys(r.uses || {}).forEach(function (id) {
        var q = num(r.uses[id]);
        if (!q || !has(id)) return; // untracked items aren't deducted
        var d = Math.min(q, inv.have[id]);
        inv.have[id] = round(inv.have[id] - d);
        rec[id] = round(d);
      });
      ws.made[rid] = rec;
    }
    saveInv(); saveWeek(); renderAll();
  }

  function toggleBought(id, q) {
    var b = ws.bought[id];
    if (b) {
      var a = num(b.a) || 0;
      if (b.u) delete inv.have[id];
      else if (has(id)) inv.have[id] = round(Math.max(0, inv.have[id] - a));
      delete ws.bought[id];
    } else {
      var wasUntracked = !has(id);
      inv.have[id] = round((wasUntracked ? 0 : inv.have[id]) + q);
      ws.bought[id] = { a: q, u: wasUntracked };
    }
    saveInv(); saveWeek(); renderAll();
  }

  /* ---------------- DOM helpers ---------------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function recipeLabel(rid) {
    var r = W.recipes[rid];
    return r.name + (r.when ? ' (' + r.when + ')' : '');
  }

  /* ---------------- "made" controls ---------------- */
  function renderMade() {
    Object.keys(W.recipes).forEach(function (rid) {
      var made = isMade(rid);
      var card = document.getElementById(rid);
      if (card && card.tagName === 'DETAILS') {
        var body = card.querySelector('.cbody');
        var box = card.querySelector('.inv-madebox');
        if (body && !box) {
          box = el('div', 'inv-ui inv-madebox');
          var btn = el('button', 'inv-madebtn');
          btn.type = 'button';
          btn.addEventListener('click', function () { toggleMade(rid); });
          box.appendChild(btn);
          box.appendChild(el('span', 'inv-madehint'));
          body.insertBefore(box, body.firstChild);
        }
        if (box) {
          box.classList.toggle('on', made);
          box.querySelector('.inv-madebtn').textContent = made ? '✓ Made' : '☐ Mark as made';
          box.querySelector('.inv-madehint').textContent = made
            ? 'Ingredients taken out of inventory. Tap again to undo.'
            : 'Takes this recipe’s ingredients out of inventory.';
        }
        var sum = card.querySelector('summary');
        var badge = card.querySelector('.inv-badge');
        if (sum && !badge) {
          badge = el('span', 'inv-ui inv-badge', '✓ made');
          sum.insertBefore(badge, sum.querySelector('.chev'));
        }
        if (badge) badge.hidden = !made;
      }
      var rows = document.querySelectorAll('[data-made="' + rid + '"]');
      Array.prototype.forEach.call(rows, function (row) {
        var b = row.querySelector('.inv-planbtn');
        if (!b) {
          b = el('button', 'inv-ui inv-planbtn');
          b.type = 'button';
          b.addEventListener('click', function (e) { e.stopPropagation(); toggleMade(rid); });
          var anchor = row.querySelector('small');
          row.insertBefore(b, anchor);
        }
        b.classList.toggle('on', made);
        b.textContent = made ? '✓ made' : 'made?';
        b.setAttribute('aria-pressed', made ? 'true' : 'false');
        b.title = made ? 'Marked as made — tap to undo' : 'Mark as made';
      });
    });
  }

  /* ---------------- shopping list ---------------- */
  function shopRow(opts) {
    var item = el('div', 'item inv-shop' + (opts.done ? ' done' : ''));
    var label = el('label');
    var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!opts.done;
    cb.addEventListener('change', opts.onToggle);
    var span = el('span');
    span.appendChild(el('b', null, opts.name));
    span.appendChild(document.createTextNode(' — ' + opts.qty));
    if (opts.extra) span.appendChild(el('span', 'inv-extra', opts.extra));
    label.appendChild(cb); label.appendChild(span);
    item.appendChild(label);
    var frag = document.createDocumentFragment();
    frag.appendChild(item);
    if (opts.detail && opts.detail.length) {
      var info = el('button', 'info', 'For ⓘ'); info.type = 'button';
      item.appendChild(info);
      var det = el('div', 'detail');
      opts.detail.forEach(function (line, i) {
        if (i) det.appendChild(el('br'));
        det.appendChild(document.createTextNode(line));
      });
      info.addEventListener('click', function () { det.classList.toggle('open'); });
      frag.appendChild(det);
    }
    return frag;
  }

  function breakdown(id, n) {
    var d = def(id);
    return 'For: ' + n.by.map(function (p) { return W.recipes[p[0]].name + ' ' + amt(p[1], d); }).join(' · ');
  }

  function renderShop() {
    var host = document.getElementById('inv-shop');
    if (!host) return;
    host.textContent = '';
    var need = needs();
    var buckets = {}, onHand = [], check = [], restock = [];
    GROUPS.forEach(function (g) { buckets[g[0]] = []; });

    function push(group, frag) { (buckets[group] || buckets.other).push(frag); }

    // Items needed this week, plus anything bought this week (so it stays visible, ticked).
    var ids = Object.keys(need);
    Object.keys(ws.bought).forEach(function (id) { if (ids.indexOf(id) < 0 && def(id)) ids.push(id); });

    ids.forEach(function (id) {
      var d = def(id), n = need[id] || { total: 0, by: [] };
      var detail = [];
      if (n.by.length) detail.push(breakdown(id, n));
      if (d.note) detail.push(d.note);

      if (LOCAL[id]) {
        var q = roundBuy(n.total, d);
        push(d.group, shopRow({
          name: d.name, qty: d.text || qtyText(q, d), detail: detail,
          done: !!ws.ticked[id],
          onToggle: function () { ws.ticked[id] = !ws.ticked[id]; saveWeek(); renderShop(); }
        }));
        return;
      }

      var b = ws.bought[id];
      if (b) {
        detail.push('Added ' + amt(num(b.a) || 0, d) + ' to inventory. Untick to take it back out.');
        push(d.group, shopRow({
          name: d.name, qty: 'bought ' + qtyText(num(b.a) || 0, d), detail: detail, done: true,
          onToggle: function () { toggleBought(id); }
        }));
        return;
      }

      var tracked = has(id);
      if (!tracked && d.staple) { check.push([id, n]); return; }
      var h = tracked ? inv.have[id] : 0;
      var short = round(n.total - h);
      if (short <= 0) {
        // Covered this week — but suggest a top-up if cooking will leave it below the restock level.
        var left = h - n.total, lp = parOf(id);
        if (lp > 0 && left < lp) restock.push([id, roundBuy(lp - left, d), n.total]);
        else onHand.push([id, n]);
        return;
      }

      var buy = roundBuy(short, d);
      var extra = '';
      var p = parOf(id);
      if (tracked && p > 0) {
        var after = h + buy - n.total;
        if (after < p) {
          var more = roundBuy(p - after, d);
          if (more > 0) extra = '+' + qtyText(more, d) + ' more to restock, if on sale';
        }
      }
      detail.push('Need ' + amt(n.total, d) + ' · have ' + (tracked ? amt(h, d) : 'none tracked') + '.');
      push(d.group, shopRow({
        name: d.name, qty: qtyText(buy, d), extra: extra, detail: detail, done: false,
        onToggle: function () { toggleBought(id, buy); }
      }));
    });

    // Always-listed local items (e.g. fresh fruit) with no recipe quantity.
    Object.keys(LOCAL).forEach(function (id) {
      var d = LOCAL[id];
      if (!d.always || need[id]) return;
      push(d.group, shopRow({
        name: d.name, qty: d.text || '', detail: d.note ? [d.note] : [], done: !!ws.ticked[id],
        onToggle: function () { ws.ticked[id] = !ws.ticked[id]; saveWeek(); renderShop(); }
      }));
    });

    // Not needed this week, but tracked and below the restock level.
    CATALOG.forEach(function (d) {
      if (need[d.id] || ws.bought[d.id] || !has(d.id)) return;
      var p = parOf(d.id), h = inv.have[d.id];
      if (p > 0 && h < p) restock.push([d.id, roundBuy(p - h, d), 0]);
    });

    var any = false;
    GROUPS.forEach(function (g) {
      if (!buckets[g[0]].length) return;
      any = true;
      var grp = el('div', 'grp');
      grp.appendChild(el('h4', null, g[1]));
      buckets[g[0]].forEach(function (f) { grp.appendChild(f); });
      host.appendChild(grp);
    });
    if (!any) host.appendChild(el('p', 'note', 'Nothing to buy for this week’s recipes — it’s all on hand.'));

    if (restock.length) {
      var rs = el('details', 'grp inv-fold');
      rs.appendChild(el('summary', null, '🏷️ Running low — top up if on sale (' + restock.length + ')'));
      restock.forEach(function (x) {
        var d = CAT[x[0]];
        rs.appendChild(shopRow({
          name: d.name, qty: qtyText(x[1], d),
          detail: ['Have ' + amt(inv.have[d.id], d) + (x[2] ? ', this week uses ' + amt(x[2], d) : ', not needed this week') +
            '. Restock level ' + amt(parOf(d.id), d) + '.'],
          onToggle: function () { toggleBought(d.id, x[1]); }
        }));
      });
      host.appendChild(rs);
    }
    if (check.length) {
      var cs = el('details', 'grp inv-fold');
      cs.appendChild(el('summary', null, '🧂 Staples you probably have — not tracked yet (' + check.length + ')'));
      check.forEach(function (x) {
        var d = CAT[x[0]];
        var row = el('div', 'item inv-plain');
        row.appendChild(el('span', null, d.name + ' — need ' + amt(x[1].total, d)));
        cs.appendChild(row);
      });
      host.appendChild(cs);
    }
    if (onHand.length) {
      var os = el('details', 'grp inv-fold');
      os.appendChild(el('summary', null, '✅ Already on hand (' + onHand.length + ')'));
      onHand.forEach(function (x) {
        var d = CAT[x[0]];
        var row = el('div', 'item inv-plain');
        row.appendChild(el('span', null, d.name + ' — need ' + amt(x[1].total, d) + ', have ' + amt(inv.have[d.id], d)));
        os.appendChild(row);
      });
      host.appendChild(os);
    }
  }

  /* ---------------- inventory tab ---------------- */
  var view = (load(VIEW_KEY) || {}).all ? 'all' : 'week';

  function statusOf(id, need) {
    if (!has(id)) return ['unk', 'not tracked'];
    var h = inv.have[id], n = need[id] ? need[id].total : 0, p = parOf(id);
    if (h < n) return ['short', 'short for this week'];
    if (p > 0 && h - n < p) return ['low', 'below restock level'];
    return ['ok', 'ok'];
  }

  function numInput(value, placeholder, onSet) {
    var i = el('input', 'inv-num');
    i.type = 'number'; i.min = '0'; i.step = 'any'; i.inputMode = 'decimal';
    i.placeholder = placeholder;
    if (value != null) i.value = String(value);
    i.addEventListener('change', function () {
      var s = i.value.trim();
      if (s === '') { onSet(null); return; }
      var n = num(s);
      if (n === null) { i.value = ''; onSet(null); return; }
      onSet(round(n));
    });
    return i;
  }

  function renderInv() {
    var host = document.getElementById('inv-list');
    if (!host) return;
    host.textContent = '';
    var need = needs();
    var tabs = document.querySelectorAll('.inv-view button');
    Array.prototype.forEach.call(tabs, function (b) { b.classList.toggle('active', b.dataset.view === view); });

    GROUPS.forEach(function (g) {
      var items = CATALOG.filter(function (d) {
        return d.group === g[0] && (view === 'all' || need[d.id] || has(d.id));
      });
      if (!items.length) return;
      var grp = el('div', 'grp');
      grp.appendChild(el('h4', null, g[1]));
      items.forEach(function (d) {
        var row = el('div', 'item inv-row');
        var st = statusOf(d.id, need);
        var dot = el('span', 'inv-dot ' + st[0]); dot.title = st[1];
        var main = el('div', 'inv-main');
        main.appendChild(el('div', 'inv-name', d.name));
        var meta = el('div', 'inv-meta');
        meta.textContent = (need[d.id] ? 'This week: ' + amt(need[d.id].total, d) : 'Not used this week') +
          (d.pack && d.pack > 1 ? ' · sold by the ' + d.packName + ' (' + amt(d.pack, d) + ')' : '');
        main.appendChild(meta);

        var unitLabel = d.unit ? (d.unit === 'g' || d.unit === 'ml' ? d.unit : d.unit + 's') : 'count';
        var have = el('label', 'inv-field');
        have.appendChild(el('span', null, 'On hand'));
        var hi = numInput(has(d.id) ? inv.have[d.id] : null, '—', function (v) {
          if (v === null) delete inv.have[d.id]; else inv.have[d.id] = v;
          saveInv();
          var s2 = statusOf(d.id, needs()); dot.className = 'inv-dot ' + s2[0]; dot.title = s2[1];
          renderShop();
        });
        have.appendChild(hi);
        have.appendChild(el('span', 'inv-unit', unitLabel));

        var par = el('label', 'inv-field inv-parf');
        par.appendChild(el('span', null, 'Restock'));
        var pi = numInput(parOf(d.id) || null, '0', function (v) {
          if (v === null || v === (d.par || 0)) delete inv.par[d.id]; else inv.par[d.id] = v;
          if (v === null && d.par) inv.par[d.id] = 0;
          saveInv();
          var s2 = statusOf(d.id, needs()); dot.className = 'inv-dot ' + s2[0]; dot.title = s2[1];
          renderShop();
        });
        par.appendChild(pi);

        row.appendChild(dot); row.appendChild(main);
        var fields = el('div', 'inv-fields'); fields.appendChild(have); fields.appendChild(par);
        row.appendChild(fields);
        grp.appendChild(row);
      });
      host.appendChild(grp);
    });
    if (!host.childNodes.length) host.appendChild(el('p', 'note', 'Nothing tracked yet. Switch to “All items” to start.'));
  }

  function wireInvTools() {
    Array.prototype.forEach.call(document.querySelectorAll('.inv-view button'), function (b) {
      b.addEventListener('click', function () {
        view = b.dataset.view; store(VIEW_KEY, { all: view === 'all' }); renderInv();
      });
    });
    var exp = document.getElementById('inv-export');
    if (exp) exp.addEventListener('click', function () {
      var text = JSON.stringify({ v: 1, have: inv.have, par: inv.par });
      var done = function () { exp.textContent = 'Copied ✓'; setTimeout(function () { exp.textContent = 'Copy backup'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy this backup:', text); });
      } else window.prompt('Copy this backup:', text);
    });
    var imp = document.getElementById('inv-import');
    if (imp) imp.addEventListener('click', function () {
      var text = window.prompt('Paste a backup to replace this device’s inventory:');
      if (!text) return;
      var data;
      try { data = JSON.parse(text); } catch (e) { data = null; }
      if (!data || typeof data !== 'object' || typeof data.have !== 'object') {
        window.alert('That doesn’t look like an inventory backup — nothing was changed.');
        return;
      }
      inv = { have: cleanMap(data.have), par: cleanMap(data.par) };
      saveInv(); renderAll();
      window.alert('Restored ' + Object.keys(inv.have).length + ' items.');
    });
  }

  function renderAll() { renderMade(); renderShop(); renderInv(); }

  wireInvTools();
  renderAll();

  // Exposed for debugging and for the build's sanity checks.
  window.INVENTORY = { catalog: CATALOG, needs: needs, state: function () { return { inv: inv, week: ws }; } };
})();
