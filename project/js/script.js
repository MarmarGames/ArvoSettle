// ════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════
var state = {
  mode: 'simple',
  arvMode: 'base',
  selectedProfile: null
};

// ════════════════════════════════════════════
// PROFILES
// ════════════════════════════════════════════
var PROFILES = [
  {
    id: 'standard',
    name: 'Standard Flip',
    desc: '6% sell / 3% close / 4-month hold / 10% overrun',
    closing: 3, selling: 6, months: 4, monthly: 0,
    overrun: 10, delayBuf: 1,
    finEnabled: false, loanAmt: 0, intRate: 10, points: 2, loanType: 'io', amTerm: 30
  },
  {
    id: 'hard-money',
    name: 'Hard Money Financed',
    desc: '10% rate / 2pts / IO / 6% sell / 3% close',
    closing: 3, selling: 6, months: 5, monthly: 500,
    overrun: 15, delayBuf: 1,
    finEnabled: true, loanAmt: 225000, intRate: 10, points: 2, loanType: 'io', amTerm: 30
  },
  {
    id: 'conservative',
    name: 'Conservative Underwrite',
    desc: '7% sell / 4% close / 25% overrun / 2-month buffer',
    closing: 4, selling: 7, months: 6, monthly: 800,
    overrun: 25, delayBuf: 2,
    finEnabled: false, loanAmt: 0, intRate: 12, points: 3, loanType: 'io', amTerm: 30
  },
  {
    id: 'brrrr-profile',
    name: 'BRRRR Refinance',
    desc: 'Long hold / amortizing / lower sell costs',
    closing: 3.5, selling: 3, months: 8, monthly: 1200,
    overrun: 15, delayBuf: 2,
    finEnabled: true, loanAmt: 140000, intRate: 7.5, points: 1, loanType: 'am', amTerm: 30
  }
];

// ════════════════════════════════════════════
// PRESETS
// ════════════════════════════════════════════
var PRESETS = {
  cosmetic: { purchase:180000, arv:240000, rehab:12000, holding:3500, desired:20000 },
  full:     { purchase:250000, arv:380000, rehab:55000, holding:8000, desired:35000 },
  brrrr:    { purchase:120000, arv:195000, rehab:35000, holding:5000, desired:15000 }
};

// ════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════
function c$(id){ return document.getElementById(id); }
function g(id){ return parseFloat(c$(id).value) || 0; }
function gStr(id){ return c$(id).value; }
function money(n){ return '$' + Math.abs(Math.round(n)).toLocaleString('en-US'); }
function pct(n){   return (Math.round(n * 10) / 10) + '%'; }

function fmt(n){
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
}

function threeColor(val, good, warn){
  if(val >= good) return 'var(--green)';
  if(val >= warn) return 'var(--yellow)';
  return 'var(--red)';
}

// ════════════════════════════════════════════
// FINANCING MODEL
// ════════════════════════════════════════════
function computeFinancingCost(loanAmt, annualRate, points, loanType, amTerm, months){
  if(!loanAmt || loanAmt <= 0) return 0;
  var monthlyRate = annualRate / 100 / 12;
  var pointsCost  = loanAmt * (points / 100);
  var interestCost = 0;

  if(loanType === 'io'){
    interestCost = loanAmt * monthlyRate * months;
  } else {
    if(monthlyRate === 0){
      interestCost = 0;
    } else {
      var n = amTerm * 12;
      var payment = loanAmt * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
      var balance = loanAmt;
      for(var m = 0; m < months; m++){
        var interestPortion = balance * monthlyRate;
        interestCost += interestPortion;
        balance -= (payment - interestPortion);
        if(balance < 0) break;
      }
    }
  }
  return pointsCost + interestCost;
}

// ════════════════════════════════════════════
// GRADE
// ════════════════════════════════════════════
function computeGrade(roi, margin){
  var s = 0;
  if(roi >= 25) s += 45; else if(roi >= 15) s += 35; else if(roi >= 8) s += 20; else if(roi > 0) s += 8;
  if(margin >= 20) s += 35; else if(margin >= 12) s += 25; else if(margin >= 6) s += 12; else if(margin > 0) s += 5;
  if(roi >= 20 && margin >= 15) s += 20;
  s = Math.min(100, Math.max(0, Math.round(s)));
  if(s >= 80) return { l:'A', txt:'Excellent', bg:'var(--green-bg)', clr:'var(--green)', b:'var(--green-b)' };
  if(s >= 60) return { l:'B', txt:'Good',      bg:'var(--yellow-bg)',clr:'var(--yellow)',b:'var(--yellow-b)' };
  if(s >= 35) return { l:'C', txt:'Risky',     bg:'var(--red-bg)',   clr:'var(--red)',   b:'var(--red-b)' };
  return             { l:'D', txt:'Walk Away', bg:'var(--red-bg)',   clr:'var(--red)',   b:'var(--red-b)' };
}

// ════════════════════════════════════════════
// CORE CALCULATION
// ════════════════════════════════════════════
function computeScenario(baseInputs, arvFactor){
  var effectiveArv = baseInputs.rawArv * arvFactor;
  var closingAmt   = baseInputs.purchase * (baseInputs.closingPct / 100);
  var sellingAmt   = effectiveArv * (baseInputs.sellingPct / 100);
  var carrying     = baseInputs.months * baseInputs.monthly;
  var delayCarry   = baseInputs.delayBuf * baseInputs.monthly;
  var rehabOverrun = baseInputs.rehab * (baseInputs.overrunPct / 100);
  var totalRehab   = baseInputs.rehab + rehabOverrun;
  var finCost = baseInputs.finEnabled
    ? computeFinancingCost(baseInputs.loanAmt, baseInputs.intRate, baseInputs.points, baseInputs.loanType, baseInputs.amTerm, baseInputs.months + baseInputs.delayBuf)
    : 0;

  var totalCosts = baseInputs.purchase + totalRehab + baseInputs.holding + closingAmt + sellingAmt + carrying + delayCarry + finCost;
  var profit      = effectiveArv - totalCosts;
  var totalInvest = baseInputs.purchase + totalRehab + baseInputs.holding + closingAmt + carrying + delayCarry + finCost;
  var roi         = totalInvest > 0 ? (profit / totalInvest) * 100 : 0;
  var margin      = effectiveArv > 0 ? (profit / effectiveArv) * 100 : 0;

  return {
    effectiveArv, closingAmt, sellingAmt, carrying, delayCarry,
    rehabOverrun, totalRehab, finCost, totalCosts,
    profit, totalInvest, roi, margin
  };
}

// ════════════════════════════════════════════
// ARV BREAK-EVEN
// ════════════════════════════════════════════
function computeArvBreakEven(baseInputs, totalFixedCosts, sellingPct){
  var selFrac = sellingPct / 100;
  if(selFrac >= 1) return Infinity;
  return totalFixedCosts / (1 - selFrac);
}

// ════════════════════════════════════════════
// OFFER CALCULATIONS
// ════════════════════════════════════════════
function computeOffers(baseInputs, sc){
  var bufPct = g('safeBuf') / 100;
  var safetyBuffer = sc.totalCosts * bufPct;
  var conservative = sc.effectiveArv - sc.totalCosts - baseInputs.desired - safetyBuffer + baseInputs.purchase;

  var cp = 1 + baseInputs.closingPct / 100;
  var roi = baseInputs.targetRoi / 100;
  var fixed = sc.totalRehab + baseInputs.holding + sc.sellingAmt + sc.carrying + sc.delayCarry + sc.finCost;
  var roiOffer = (sc.effectiveArv - fixed * (1 + roi)) / (cp * (1 + roi));

  var aggressiveFixed = baseInputs.rehab + baseInputs.holding + baseInputs.purchase * (baseInputs.closingPct/100) + sc.sellingAmt + sc.carrying + sc.finCost;
  var aggressive = sc.effectiveArv - aggressiveFixed - baseInputs.desired;

  return { conservative, roiOffer, aggressive };
}

// ════════════════════════════════════════════
// VALIDATION
// ════════════════════════════════════════════
function validateInputs(inp){
  var arvState = '', arvMsg = '';
  if(inp.effectiveArv > 0 && inp.purchase > 0){
    if(inp.effectiveArv <= inp.purchase){
      arvState = 'error'; arvMsg = 'ARV should exceed purchase price';
    } else if(inp.effectiveArv < inp.purchase * 1.1){
      arvState = 'warn'; arvMsg = 'ARV is less than 10% above purchase — thin margin';
    }
  }
  setFS('arv', arvState, arvMsg);

  var rehabState = '', rehabMsg = '';
  if(inp.effectiveArv > 0 && inp.rehab > inp.effectiveArv * 0.5){
    rehabState = 'warn'; rehabMsg = 'Rehab exceeds 50% of ARV — verify estimate';
  }
  setFS('rehab', rehabState, rehabMsg);
}

function setFS(id, st, msg){
  var el = c$(id), me = c$('msg-' + id);
  if(!el) return;
  el.classList.remove('inp-warn','inp-error');
  if(st === 'warn')  el.classList.add('inp-warn');
  if(st === 'error') el.classList.add('inp-error');
  if(me){ me.className = 'field-msg' + (st ? ' show ' + st : ''); me.textContent = msg; }
}

// ════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════
function renderUI(inp, sc, offers, grade, breakEven){
  var { profit, roi, margin, effectiveArv } = sc;

  /* Verdict */
  var v = c$('verdict'), em = c$('verdictEmoji'), vt = c$('verdictTxt'), vs = c$('verdictSub');
  if(roi >= 20 && profit >= inp.desired){
    v.style.cssText = 'background:var(--green-bg);border-color:var(--green-b)';
    em.textContent = '🟢'; vt.textContent = 'Buy this property'; vt.style.color = 'var(--green)';
    vs.textContent = 'Strong ROI and profit — deal works. Move fast.';
  } else if(profit > 0 && roi > 0){
    v.style.cssText = 'background:var(--yellow-bg);border-color:var(--yellow-b)';
    em.textContent = '🟡'; vt.textContent = 'Negotiate'; vt.style.color = 'var(--yellow)';
    vs.textContent = 'Marginal returns. Push for a lower purchase price before committing.';
  } else {
    v.style.cssText = 'background:var(--red-bg);border-color:var(--red-b)';
    em.textContent = '🔴'; vt.textContent = 'Walk away'; vt.style.color = 'var(--red)';
    vs.textContent = 'Negative or insufficient return at this price. Pass or renegotiate significantly.';
  }

  /* Hero */
  var hc = profit >= 0 ? 'var(--green)' : 'var(--red)';
  c$('heroVal').textContent = fmt(profit); c$('heroVal').style.color = hc;
  c$('heroLbl').style.color = hc; c$('heroBar').style.background = hc;

  /* ROI */
  var rc = threeColor(roi, 20, 10);
  c$('roiVal').textContent = pct(roi); c$('roiVal').style.color = rc;
  c$('roiSub').textContent = roi >= 20 ? 'Strong return' : roi >= 10 ? 'Moderate return' : roi > 0 ? 'Low return' : 'Negative';
  c$('roiSub').style.color = rc;

  /* Grade */
  c$('gradeVal').textContent = grade.l; c$('gradeVal').style.color = grade.clr;
  var badge = c$('gradeBadge');
  badge.style.cssText = 'background:' + grade.bg + ';color:' + grade.clr + ';border-color:' + grade.b;
  badge.textContent = 'Grade ' + grade.l + ' · ' + grade.txt;

  /* Margin */
  var mc = threeColor(margin, 15, 8);
  c$('marginVal').textContent = pct(margin); c$('marginVal').style.color = mc;
  c$('marginSub').style.color = mc;

  /* Insight */
  var ins = c$('insightTxt');
  if(breakEven === Infinity){
    ins.innerHTML = 'Selling costs are <strong>≥ 100% of ARV</strong> — this deal cannot break even under any ARV.';
  } else if(effectiveArv > 0){
    var dropPct = Math.round((1 - breakEven / effectiveArv) * 100);
    if(dropPct > 0){
      ins.innerHTML = 'Break-even ARV is <strong>' + money(breakEven) + '</strong> — a ' + dropPct + '% decline from estimate. ' +
        (dropPct < 8 ? 'Very little cushion.' : dropPct < 15 ? 'Moderate cushion.' : 'Good downside protection.');
    } else {
      ins.innerHTML = 'Already <strong>below break-even</strong>. ARV must reach at least <strong>' + money(breakEven) + '</strong> to cover all costs.';
    }
  } else {
    ins.textContent = 'Enter your deal numbers to see the ARV break-even insight.';
  }

  /* Offers */
  function renderBox(boxId, valId, noteId, val, noteStr){
    var box = c$(boxId), velEl = c$(valId), noteEl = c$(noteId);
    if(val <= 0){
      box.classList.add('invalid'); velEl.textContent = 'No viable offer'; velEl.style.color = 'var(--red)';
      if(noteEl) noteEl.textContent = 'Unworkable at these constraints';
    } else {
      box.classList.remove('invalid');
      velEl.textContent = money(val);
      velEl.style.color = val >= inp.purchase ? 'var(--green)' : 'var(--red)';
      if(noteEl) noteEl.textContent = noteStr;
    }
  }
  var bufPct = g('safeBuf');
  renderBox('offerCBox','offerCVal','offerCNote', offers.conservative, 'Guarantees ' + money(inp.desired) + ' profit + ' + bufPct + '% cost buffer');
  renderBox('offerRBox','offerRVal','offerRNote', offers.roiOffer, 'Targets ' + inp.targetRoi + '% ROI');
  renderBox('offerABox','offerAVal', null, offers.aggressive, '');

  /* Breakdown */
  c$('bPurchase').textContent = '-' + money(inp.purchase);
  c$('bRehab').textContent    = '-' + money(inp.rehab);
  var hasOverrun = sc.rehabOverrun > 0;
  c$('bRehabOverrunLbl').style.display = hasOverrun ? '' : 'none';
  c$('bRehabOverrun').style.display    = hasOverrun ? '' : 'none';
  if(hasOverrun) c$('bRehabOverrun').textContent = '-' + money(sc.rehabOverrun);
  c$('bHolding').textContent  = '-' + money(inp.holding);
  c$('bClosing').textContent  = '-' + money(sc.closingAmt);
  c$('bSelling').textContent  = '-' + money(sc.sellingAmt);
  var totalCarry = sc.carrying + sc.delayCarry;
  c$('bCarrying').textContent = totalCarry > 0 ? '-' + money(totalCarry) : '$0';
  var carryDetail = [];
  if(inp.monthly > 0) carryDetail.push(inp.months + 'mo × ' + money(inp.monthly));
  if(sc.delayCarry > 0) carryDetail.push('+' + inp.delayBuf + 'mo buffer');
  c$('bCarryDetail').textContent = carryDetail.join(' ');
  c$('bFinRow').style.display = sc.finCost > 0 ? '' : 'none';
  if(sc.finCost > 0){
    c$('bFin').textContent = '-' + money(sc.finCost);
    c$('bFinDetail').textContent = inp.loanType === 'io' ? 'IO ' + inp.intRate + '% + ' + inp.points + 'pts' : 'Amort ' + inp.intRate + '%';
  }
  var bp = c$('bProfit');
  bp.textContent = fmt(profit); bp.style.color = profit >= 0 ? 'var(--green)' : 'var(--red)';

  /* Risk scenarios */
  ['bull','base','bear'].forEach(function(s){
    var f = s === 'bull' ? 1.07 : s === 'bear' ? 0.90 : 1.00;
    var sc2 = computeScenario(inp, f);
    c$('rs-' + s + '-arv').textContent    = money(sc2.effectiveArv);
    c$('rs-' + s + '-profit').textContent = fmt(sc2.profit);
    c$('rs-' + s + '-roi').textContent    = pct(sc2.roi);
    c$('rs-' + s + '-margin').textContent = pct(sc2.margin);
    c$('rs-' + s + '-profit').style.color = sc2.profit >= 0 ? 'var(--green)' : 'var(--red)';
  });

  /* Assumptions chips */
  c$('asmSelling').textContent = inp.sellingPct + '% selling';
  c$('asmClosing').textContent = inp.closingPct + '% closing';
  c$('asmMonths').textContent  = inp.months + '-month hold' + (inp.delayBuf > 0 ? ' +' + inp.delayBuf + 'mo buffer' : '');
  c$('asmArv').textContent     = state.arvMode === 'base' ? 'Base ARV' : state.arvMode === 'bear' ? 'Bear ARV −10%' : 'Bull ARV +7%';
  c$('asmFin').textContent     = inp.finEnabled ? (inp.loanType === 'io' ? 'IO @ ' + inp.intRate + '%, ' + inp.points + 'pts' : 'Amort @ ' + inp.intRate + '%') : 'No financing';
  c$('asmOverrun').textContent = inp.overrunPct + '% rehab overrun reserve';
}

// ════════════════════════════════════════════
// MAIN ORCHESTRATOR
// ════════════════════════════════════════════
function calc(){
  var rawArv    = g('arv');
  var arvFactor = state.arvMode === 'bear' ? 0.90 : state.arvMode === 'bull' ? 1.07 : 1.00;
  var isPro     = state.mode === 'pro';
  var finOn     = c$('finEnabled').checked;

  var inp = {
    purchase:    g('purchase'),
    rawArv:      rawArv,
    effectiveArv: rawArv * arvFactor,
    rehab:       g('rehab'),
    holding:     g('holding'),
    desired:     g('desired'),
    closingPct:  g('closing'),
    sellingPct:  g('selling'),
    months:      g('months') || 4,
    monthly:     g('monthly'),
    overrunPct:  isPro ? g('overrun') : 0,
    delayBuf:    isPro ? g('delayBuf') : 0,
    finEnabled:  isPro && finOn,
    loanAmt:     g('loanAmt'),
    intRate:     g('intRate'),
    points:      g('points'),
    loanType:    gStr('loanType'),
    amTerm:      g('amTerm') || 30,
    targetRoi:   g('targetRoi') || 15,
  };

  validateInputs(inp);

  var sc      = computeScenario(inp, arvFactor);
  var offers  = computeOffers(inp, sc);
  var grade   = computeGrade(sc.roi, sc.margin);

  var fixedNonSell = inp.purchase * (1 + inp.closingPct / 100) + sc.totalRehab + inp.holding + sc.carrying + sc.delayCarry + sc.finCost;
  var breakEven = computeArvBreakEven(inp, fixedNonSell, inp.sellingPct);

  renderUI(inp, sc, offers, grade, breakEven);
}

// ════════════════════════════════════════════
// PROFILE MODAL
// ════════════════════════════════════════════
function renderProfileList(){
  var list = c$('profileList');
  list.innerHTML = '';
  PROFILES.forEach(function(p){
    var el = document.createElement('div');
    el.className = 'profile-item' + (state.selectedProfile === p.id ? ' active' : '');
    el.onclick = function(){ state.selectedProfile = p.id; renderProfileList(); };
    el.innerHTML = '<div><div class="profile-item-name">' + p.name + '</div><div class="profile-item-desc">' + p.desc + '</div></div>'
      + (state.selectedProfile === p.id ? '<span class="profile-item-check">✓</span>' : '');
    list.appendChild(el);
  });
}

function openProfiles(){ state.selectedProfile = null; renderProfileList(); c$('profileModal').classList.add('show'); }
function closeProfiles(){ c$('profileModal').classList.remove('show'); }

function applyProfile(){
  var p = PROFILES.find(function(x){ return x.id === state.selectedProfile; });
  if(!p){ closeProfiles(); return; }
  c$('closing').value  = p.closing;
  c$('selling').value  = p.selling;
  c$('months').value   = p.months;
  c$('monthly').value  = p.monthly;
  c$('overrun').value  = p.overrun;
  c$('delayBuf').value = p.delayBuf;
  c$('finEnabled').checked = p.finEnabled;
  c$('loanAmt').value  = p.loanAmt;
  c$('intRate').value  = p.intRate;
  c$('points').value   = p.points;
  c$('loanType').value = p.loanType;
  c$('amTerm').value   = p.amTerm;
  updateAmField();
  setMode('pro');
  openSection('financing');
  openSection('risk');
  closeProfiles();
  calc();
}

c$('profileModal').addEventListener('click', function(e){ if(e.target === c$('profileModal')) closeProfiles(); });

// ════════════════════════════════════════════
// UI: SECTIONS
// ════════════════════════════════════════════
function toggleSec(id){
  var el = c$('sec-' + id);
  el.classList.toggle('open');
}
function openSection(id){
  c$('sec-' + id).classList.add('open');
}

// ════════════════════════════════════════════
// UI: MODE
// ════════════════════════════════════════════
function setMode(m){
  state.mode = m;
  c$('btnSimple').classList.toggle('active', m === 'simple');
  c$('btnPro').classList.toggle('active', m === 'pro');
  var proSecs = ['sec-financing','sec-risk','sec-arv'];
  proSecs.forEach(function(id){
    c$(id).style.display = m === 'pro' ? '' : 'none';
  });
  calc();
}

function setArvMode(m){
  state.arvMode = m;
  ['bear','base','bull'].forEach(function(k){ c$('arv-tab-' + k).classList.toggle('active', k === m); });
  var notes = { bear:'Modeling ARV at −10%', base:'Using your ARV as entered', bull:'Modeling ARV at +7%' };
  c$('arvModeNote').textContent = notes[m];
  calc();
}

function updateAmField(){
  c$('amField').style.display = gStr('loanType') === 'am' ? '' : 'none';
}
c$('loanType').addEventListener('change', function(){ updateAmField(); calc(); });

// ════════════════════════════════════════════
// UI: TOGGLES
// ════════════════════════════════════════════
function toggleAsm(){ c$('asmToggle').classList.toggle('open'); c$('asmBody').classList.toggle('show'); }
function toggleBrk(){
  c$('brkToggle').classList.toggle('open'); c$('brkBody').classList.toggle('show');
  c$('brkLabel').textContent = c$('brkBody').classList.contains('show') ? 'Hide cost breakdown' : 'Show cost breakdown';
}
function toggleRisk(){
  c$('riskToggle').classList.toggle('open'); c$('riskBody').classList.toggle('show');
}
function updateBufLabel(){
  var v = g('safeBuf');
  c$('bufVal').textContent = v + '%';
  c$('bufNote').textContent = 'Conservative offer deducts ' + v + '% of costs as a negotiation / contingency reserve';
}

// ════════════════════════════════════════════
// PRESETS
// ════════════════════════════════════════════
function applyPreset(key){
  var p = PRESETS[key];
  if(!p) return;
  Object.keys(p).forEach(function(id){ if(c$(id)) c$(id).value = p[id]; });
  if(key === 'brrrr') applyProfile_byId('brrrr-profile');
  calc();
}
function applyProfile_byId(id){
  state.selectedProfile = id;
  applyProfile();
}

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════
document.querySelectorAll('input[type=number], select').forEach(function(el){
  el.addEventListener('input', calc);
});

['sec-financing','sec-risk','sec-arv'].forEach(function(id){ c$(id).style.display = 'none'; });

setMode('simple');
updateAmField();
