(function(){
'use strict';

const G = {
  players: [],
  deck: [],
  community: [],
  pot: 0,
  currentBet: 0,
  lastRaiseAmount: 20,
  stage: 'preflop',
  dealerIndex: 0,
  currentPlayerIndex: 0,
  smallBlind: 1,
  bigBlind: 2,
  tableMode: 'nano',
  tableLabel: 'Nano',
  handNumber: 0,
  totalPlayers: 6,
  gameOver: false,
  busy: false,
  soundOn: true,
  playerHandStartChips: 0,
  sessionBuyIn: 0,
  sessionHands: 0,
  raiseMin: 0, raiseMax: 0,
  seatPositions: [],
  _renderedCards: new WeakSet(),
  turnTimer: null,
  turnTimeLeft: 30,
  squid: { enabled:false, round:1, total:0, givenOut:0, firstPotTaken:false, pendingBonus:0, baseValue:0 }
};

const STAGE_KEYS = {
  preflop:"stagePreflop", flop:"stageFlop", turn:"stageTurn",
  river:"stageRiver", showdown:"stageShowdown"
};

const LEVELS = [
  { key:"nano",  name:"Nano",  sb:1,     bb:2,     buyMin:100,    buyMax:500,     minPlayers:4 },
  { key:"micro", name:"Micro", sb:100,   bb:200,   buyMin:4000,   buyMax:20000,   minPlayers:4 },
  { key:"low",   name:"Low",   sb:500,   bb:1000,  buyMin:20000,  buyMax:100000,  minPlayers:4 },
  { key:"mid",   name:"Mid",   sb:2500,  bb:5000,  buyMin:100000, buyMax:500000,  minPlayers:4 },
  { key:"high",  name:"High",  sb:10000, bb:20000, buyMin:400000, buyMax:2000000, minPlayers:4 }
];

const CHIP_TO_BEM = 0.0001;

function $(id){ return document.getElementById(id); }
function t(k,v){ return window.PokerI18n.t(k,v); }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function fmtNum(n){ return (Math.floor(n)||0).toLocaleString('en-US'); }
function toBem(chips){ return (chips * CHIP_TO_BEM).toFixed(4); }

function log(msg, cls){
  const el = $("logArea"); if(!el) return;
  const div = document.createElement("div");
  div.className = "log-line" + (cls ? " " + cls : "");
  div.textContent = msg;
  el.appendChild(div); el.scrollTop = el.scrollHeight;
  updateHandInfo();
}
function clearLog(){ const e = $("logArea"); if(e) e.innerHTML = ""; }

/* =========================================================
   导航切换
   ========================================================= */
function showScreen(name){
  ["lobbyScreen","rulesScreen","myNumbersScreen","gameScreen"].forEach(function(id){
    const el = $(id); if(el) el.classList.add("hidden");
  });
  const target = $(name + "Screen");
  if(target) target.classList.remove("hidden");
  document.querySelectorAll(".nav-link").forEach(function(a){
    a.classList.toggle("active", a.getAttribute("data-nav") === name);
  });
  if(name === "lobby") refreshBalanceUI();
  if(name === "myNumbers") renderNumbers();
}

/* =========================================================
   筹码 UI
   ========================================================= */
function refreshBalanceUI(){
  const p = PokerStorage.getPracticeChips();
  const r = PokerStorage.getRealChips();
  const pEl = $("practiceBalance"), pBem = $("practiceBem");
  if(pEl) pEl.textContent = fmtNum(p);
  if(pBem) pBem.textContent = "≈ " + toBem(p) + " BEM";
  const rEl = $("realBalance"), rBem = $("realBem");
  if(rEl) rEl.textContent = fmtNum(r);
  if(rBem) rBem.textContent = "≈ " + toBem(r) + " BEM";
}

/* =========================================================
   战绩页
   ========================================================= */
function renderNumbers(){
  const s = PokerStorage.getStats();
  const th = $("numTotalHands"), tw = $("numWins"), twr = $("numWinRate");
  const tb = $("numBiggest"), tn = $("numNet");
  if(th) th.textContent = s.hands;
  if(tw) tw.textContent = s.wins;
  if(twr) twr.textContent = s.hands > 0 ? Math.round(s.wins / s.hands * 100) + "%" : "0%";
  if(tb) tb.textContent = fmtNum(s.biggestPot);
  if(tn){
    tn.textContent = (s.netGain >= 0 ? "+" : "") + fmtNum(s.netGain);
    tn.style.color = s.netGain >= 0 ? 'var(--green)' : 'var(--red)';
  }
  /* sessions 表格 */
  const body = $("sessionsBody");
  if(!body) return;
  body.innerHTML = "";
  const sessions = s.sessions || [];
  if(sessions.length === 0){
    const empty = document.createElement("div");
    empty.className = "session-empty";
    empty.textContent = t("sessionsEmpty");
    body.appendChild(empty);
    return;
  }
  sessions.forEach(function(rec){
    const row = document.createElement("div");
    row.className = "session-row";
    const pnlCls = rec.pnl >= 0 ? "pos" : "neg";
    const pnlText = (rec.pnl >= 0 ? "+" : "") + fmtNum(rec.pnl);
    row.innerHTML =
      '<span>' + rec.table + '</span>' +
      '<span>' + rec.blinds + '</span>' +
      '<span>' + fmtNum(rec.buyIn) + '</span>' +
      '<span class="' + pnlCls + '">' + pnlText + '</span>' +
      '<span>' + (rec.hands || 0) + '</span>' +
      '<span>' + (rec.status === 'left' ? 'left' : rec.status) + '</span>';
    body.appendChild(row);
  });
}

/* =========================================================
   大厅渲染
   ========================================================= */
function renderLobby(){
  const list = $("levelList");
  if(!list) return;
  list.innerHTML = "";
  LEVELS.forEach(function(lv){
    const row = document.createElement("div");
    row.className = "level-row";
    const buyInText = t("buyIn") + ' <strong>' + fmtNum(lv.buyMin) + '–' + fmtNum(lv.buyMax) + ' ' + t("chips") + '</strong>' +
      ' (' + toBem(lv.buyMin) + '–' + toBem(lv.buyMax) + ' BEM)';
    const startText = t("startsAt") + ' <strong>' + lv.minPlayers + '</strong>';
    row.innerHTML =
      '<div class="level-name">' + lv.name +
        ' <span class="level-blinds">' + lv.sb + '/' + lv.bb + '</span>' +
      '</div>' +
      '<div class="level-meta">' + buyInText + '</div>' +
      '<div class="level-meta">' + startText + '</div>' +
      '<button class="level-open">' + t("openTable") + '</button>';
    row.querySelector(".level-open").onclick = function(){ openLevel(lv); };
    list.appendChild(row);
  });
  refreshBalanceUI();
}

/* =========================================================
   开局
   ========================================================= */
function openLevel(lv){
  /* 检查练习筹码 */
  let chips = PokerStorage.getPracticeChips();
  if(chips < lv.buyMin){
    if(!confirm(t("practiceBalance") + " " + fmtNum(chips) + " < " + fmtNum(lv.buyMin) + ". " + t("rebuy") + "?")){
      return;
    }
    chips = lv.buyMin;
    PokerStorage.setPracticeChips(chips);
  }
  const buyIn = Math.min(lv.buyMax, chips);

  G.tableMode = lv.key;
  G.tableLabel = lv.name;
  G.smallBlind = lv.sb;
  G.bigBlind = lv.bb;
  G.lastRaiseAmount = lv.bb;
  G.totalPlayers = 6;
  G.squid.enabled = (lv.key === "squid");
  G.sessionBuyIn = buyIn;
  G.sessionHands = 0;

  /* 人类玩家：从练习筹码中扣除买入 */
  PokerStorage.setPracticeChips(chips - buyIn);

  const human = PokerAvatars.HUMAN;
  G.players = [{
    id:0, name:human.name, emoji:human.emoji, bg:human.bg,
    isHuman:true, chips:buyIn,
    holeCards:[], folded:false, allIn:false, currentBet:0,
    totalContributed:0, needsToAct:false,
    position:"", positionKey:"", lastAction:"", styleKey:null,
    revealCards:false, _highlight:null,
    preflopOrder:0, postflopOrder:0, squids:[]
  }];

  const profiles = PokerAvatars.pickProfiles(G.totalPlayers - 1);
  const styleKeys = Object.keys(PokerAI.STYLES);
  const shuffled = styleKeys.slice();
  for(let i = shuffled.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
  }
  for(let i = 1; i < G.totalPlayers; i++){
    const profile = profiles[i - 1];
    const styleKey = shuffled[(i - 1) % shuffled.length];
    const aiBuy = Math.floor(lv.buyMin + Math.random() * (lv.buyMax - lv.buyMin));
    G.players.push({
      id:i, name:profile.name, emoji:profile.emoji, bg:profile.bg,
      isHuman:false, chips:aiBuy,
      holeCards:[], folded:false, allIn:false, currentBet:0,
      totalContributed:0, needsToAct:false,
      position:"", positionKey:"", lastAction:"", styleKey:styleKey,
      revealCards:false, _highlight:null,
      preflopOrder:0, postflopOrder:0, squids:[]
    });
  }

  G.seatPositions = computeSeatPositions(G.players.length);
  G.dealerIndex = Math.floor(Math.random() * G.players.length);
  G.handNumber = 0;
  G.gameOver = false;

  $("lobbyScreen").classList.add("hidden");
  $("gameScreen").classList.remove("hidden");
  const gl = $("gameLevelLabel");
  if(gl) gl.textContent = lv.name + " " + lv.sb + "/" + lv.bb;

  startNewHand();
}

function computeSeatPositions(n){
  const pos = [{ x:50, y:50 + 40 }];
  const ai = n - 1;
  if(ai === 0) return pos;
  const R = 40;
  const right = Math.ceil(ai / 2);
  const left = ai - right;
  if(right === 1){ pos.push({ x:50 + R, y:50 }); }
  else {
    for(let i = 0; i < right; i++){
      const tt = i / (right - 1);
      const d = -60 + tt * 120;
      const r = d * Math.PI / 180;
      pos.push({ x:50 + R*Math.cos(r), y:50 + R*Math.sin(r) });
    }
  }
  if(left === 1){ pos.push({ x:50 - R, y:50 }); }
  else if(left > 1){
    for(let i = 0; i < left; i++){
      const tt = i / (left - 1);
      const d = 120 + tt * 120;
      const r = d * Math.PI / 180;
      pos.push({ x:50 + R*Math.cos(r), y:50 + R*Math.sin(r) });
    }
  }
  return pos;
}

function computeActionOrders(){
  const n = G.players.length; if(!n) return;
  let start = (n === 2) ? G.dealerIndex : (G.dealerIndex + 3) % n;
  for(let i = 0; i < n; i++) G.players[(start+i)%n].preflopOrder = i + 1;
  if(n === 2){
    G.players[(G.dealerIndex+1)%n].postflopOrder = 1;
    G.players[G.dealerIndex].postflopOrder = 2;
  } else {
    const s = (G.dealerIndex + 1) % n;
    for(let i = 0; i < n; i++) G.players[(s+i)%n].postflopOrder = i + 1;
  }
}

function flyCard(from, to, delay){
  return new Promise(function(res){
    setTimeout(function(){
      if(!from || !to){ res(); return; }
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const el = document.createElement('div');
      el.className = 'flying-card';
      el.style.left = (a.left + a.width/2 - 12) + 'px';
      el.style.top = (a.top + a.height/2 - 17) + 'px';
      document.body.appendChild(el);
      void el.offsetWidth;
      const dx = (b.left + b.width/2) - (a.left + a.width/2);
      const dy = (b.top + b.height/2) - (a.top + a.height/2);
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(.65)';
      el.style.opacity = '0';
      setTimeout(function(){ el.remove(); res(); }, 520);
    }, delay || 0);
  });
}
async function playDealAnimation(){
  const dealer = $("dealerSeat");
  const deck = $("shuffleDeck");
  if(!dealer) return;
  if(deck){
    deck.classList.add("shuffling");
    PokerAudio.play('deal');
    await sleep(560);
    deck.classList.remove("shuffling");
  }
  const proms = [];
  let idx = 0;
  for(let r = 0; r < 2; r++){
    for(let i = 0; i < G.players.length; i++){
      const p = G.players[i];
      if(p.folded) continue;
      const tgt = document.querySelector('.seat[data-pid="' + p.id + '"]');
      if(tgt) proms.push(flyCard(dealer, tgt, idx * 60));
      idx++;
    }
  }
  await Promise.all(proms);
  await sleep(100);
}

async function startNewHand(){
  G.handNumber++;
  G.sessionHands++;
  G.pot = 0;
  G.community = [];
  G.currentBet = 0;
  G.lastRaiseAmount = G.bigBlind;
  G.stage = "preflop";
  G.busy = false;
  G.deck = PokerDeck.create();
  PokerDeck.shuffle(G.deck);
  G._renderedCards = new WeakSet();
  stopTurnTimer();

  G.players.forEach(function(p){
    p.folded = p.chips <= 0;
    p.allIn = false;
    p.currentBet = 0;
    p.totalContributed = 0;
    p.needsToAct = false;
    p.lastAction = "";
    p.holeCards = [];
    p.revealCards = false;
    p._highlight = null;
    p._score = null;
  });

  G.playerHandStartChips = G.players[0].chips;
  if(G.players[0].chips <= 0){ showRebuy(); return; }

  const alive = G.players.filter(function(p){ return p.chips > 0; }).length;
  if(alive === 1){ showGameOver(t("gameOverTitle")); return; }

  assignPositions();
  computeActionOrders();

  const n = G.players.length;
  for(let r = 0; r < 2; r++){
    for(let i = 1; i <= n; i++){
      const idx = (G.dealerIndex + i) % n;
      const p = G.players[idx];
      if(!p.folded) p.holeCards.push(G.deck.pop());
    }
  }

  clearLog();
  log(t("handNum", { n:G.handNumber }) + " · " + t("dealerIs", { name:G.players[G.dealerIndex].name }), "hl");
  log(t("blindsAre", { sb:G.smallBlind, bb:G.bigBlind }), "hl");

  const gh = $("gameHandLabel");
  if(gh) gh.textContent = t("handShortLabel", { n:G.handNumber });

  render();
  await playDealAnimation();
  postBlinds();
  render();
  startPreflop();
}

function assignPositions(){
  const n = G.players.length;
  const names = {
    2:["posBTNSB","posBB"], 3:["posBTN","posSB","posBB"],
    4:["posBTN","posSB","posBB","posUTG"],
    5:["posBTN","posSB","posBB","posUTG","posCO"],
    6:["posBTN","posSB","posBB","posUTG","posHJ","posCO"],
    7:["posBTN","posSB","posBB","posUTG","posUTG1","posHJ","posCO"]
  }[n] || ["posBTN","posSB","posBB","posUTG","posUTG1","posHJ","posCO"];
  for(let i = 0; i < n; i++){
    const idx = (G.dealerIndex + i) % n;
    G.players[idx].positionKey = names[i];
    G.players[idx].position = t(names[i]);
  }
}

function postBlinds(){
  const n = G.players.length;
  const sbIdx = n === 2 ? G.dealerIndex : (G.dealerIndex + 1) % n;
  const bbIdx = n === 2 ? (G.dealerIndex + 1) % n : (G.dealerIndex + 2) % n;
  const sbP = G.players[sbIdx], bbP = G.players[bbIdx];
  const sb = Math.min(G.smallBlind, sbP.chips);
  sbP.chips -= sb; sbP.currentBet = sb; sbP.totalContributed += sb; G.pot += sb;
  if(sbP.chips === 0) sbP.allIn = true;
  const bb = Math.min(G.bigBlind, bbP.chips);
  bbP.chips -= bb; bbP.currentBet = bb; bbP.totalContributed += bb; G.pot += bb;
  if(bbP.chips === 0) bbP.allIn = true;
  G.currentBet = bb;
  G.lastRaiseAmount = G.bigBlind;
  log(t("sbBet", { name:sbP.name, amt:sb, name2:bbP.name, amt2:bb }), "action");
}

function startPreflop(){
  const n = G.players.length;
  G.players.forEach(function(p){ p.needsToAct = !p.folded && !p.allIn && p.chips > 0; });
  let idx = n === 2 ? G.dealerIndex : (G.dealerIndex + 3) % n;
  let tries = 0;
  while((G.players[idx].folded || G.players[idx].allIn) && tries < n){ idx = (idx + 1) % n; tries++; }
  G.currentPlayerIndex = idx;
  render();
  runTurn();
}

function startPostflopRound(){
  const n = G.players.length;
  G.players.forEach(function(p){
    p.currentBet = 0; p.lastAction = "";
    p.needsToAct = !p.folded && !p.allIn && p.chips > 0;
  });
  G.currentBet = 0;
  G.lastRaiseAmount = G.bigBlind;
  let idx = (G.dealerIndex + 1) % n;
  let tries = 0;
  while((G.players[idx].folded || G.players[idx].allIn) && tries < n){ idx = (idx + 1) % n; tries++; }
  G.currentPlayerIndex = idx;
  render();
  runTurn();
}

function countActive(){ return G.players.filter(function(p){ return !p.folded; }).length; }
function findNextToAct(){
  const n = G.players.length;
  for(let k = 0; k < n; k++){
    const idx = (G.currentPlayerIndex + k) % n;
    const p = G.players[idx];
    if(!p.folded && !p.allIn && p.needsToAct && p.chips > 0){
      G.currentPlayerIndex = idx; return true;
    }
  }
  return false;
}

function runTurn(){
  if(G.gameOver || G.busy) return;
  if(countActive() <= 1){ endHandNoShowdown(); return; }
  const notAllIn = G.players.filter(function(p){ return !p.folded && !p.allIn; });
  if(notAllIn.length <= 1 && notAllIn.every(function(p){ return !p.needsToAct; })){ advanceStage(); return; }
  if(!findNextToAct()){ advanceStage(); return; }
  const p = G.players[G.currentPlayerIndex];
  render();
  if(p.isHuman){
    showHumanControls();
    PokerAudio.play('turn');
    startTurnTimer(p);
  } else {
    stopTurnTimer();
    G.busy = true;
    const ms = 800 + Math.random() * 2200;
    setTimeout(function(){
      G.busy = false;
      if(G.gameOver) return;
      const action = PokerAI.decide(p, G);
      executeAction(p, action);
      render();
      runTurn();
    }, ms);
  }
}

function executeAction(player, action){
  if(player.folded || player.allIn) return;
  if(action.type === "fold"){
    player.folded = true; player.needsToAct = false;
    player.lastAction = t("actionFold");
    log(t("playerFolds", { name:player.name }), "action");
    PokerAudio.play('fold'); return;
  }
  if(action.type === "check"){
    player.needsToAct = false;
    player.lastAction = t("actionCheck");
    log(t("playerChecks", { name:player.name }), "action");
    PokerAudio.play('check'); return;
  }
  if(action.type === "call"){
    const toCall = Math.min(player.chips, G.currentBet - player.currentBet);
    player.chips -= toCall; player.currentBet += toCall; player.totalContributed += toCall;
    G.pot += toCall;
    if(player.chips === 0) player.allIn = true;
    player.needsToAct = false;
    player.lastAction = toCall === 0 ? t("actionCheck") : (t("actionCall") + " " + fmtNum(toCall));
    log(toCall === 0 ? t("playerChecks",{name:player.name}) : t("playerCalls",{name:player.name,amt:fmtNum(toCall)}), "action");
    PokerAudio.play(toCall === 0 ? 'check' : 'call'); return;
  }
  if(action.type === "raise"){
    const oldBet = G.currentBet;
    const max = player.chips + player.currentBet;
    let target;
    if(action.target != null){ target = Math.min(action.target, max); }
    else if(G.currentBet === 0){ target = Math.max(G.bigBlind, Math.floor(G.pot * 0.5)); }
    else {
      const minT = G.currentBet + Math.max(G.lastRaiseAmount, G.bigBlind);
      const potT = G.currentBet + Math.floor(G.pot * 0.6);
      target = Math.min(max, Math.max(minT, potT));
    }
    if(target <= G.currentBet){
      const toCall = Math.min(player.chips, G.currentBet - player.currentBet);
      player.chips -= toCall; player.currentBet += toCall; player.totalContributed += toCall;
      G.pot += toCall;
      if(player.chips === 0) player.allIn = true;
      player.needsToAct = false;
      player.lastAction = t("actionCall") + " " + fmtNum(toCall);
      log(t("playerCalls",{name:player.name,amt:fmtNum(toCall)}), "action");
      PokerAudio.play('call'); return;
    }
    const delta = target - player.currentBet;
    if(delta <= 0 || delta > player.chips) return;
    player.chips -= delta;
    player.currentBet = target;
    player.totalContributed += delta;
    G.pot += delta;
    if(player.chips === 0) player.allIn = true;
    if(target - oldBet > G.lastRaiseAmount) G.lastRaiseAmount = target - oldBet;
    if(target > G.currentBet) G.currentBet = target;
    player.needsToAct = false;
    player.lastAction = (oldBet === 0 ? t("actionBet") : t("actionRaiseTo")) + " " + fmtNum(target);
    log(oldBet === 0 ? t("playerBets",{name:player.name,amt:fmtNum(target)}) : t("playerRaises",{name:player.name,amt:fmtNum(target)}), "action");
    PokerAudio.play('raise');
    G.players.forEach(function(p){
      if(p !== player && !p.folded && !p.allIn && p.chips > 0) p.needsToAct = true;
    });
  }
}

function advanceStage(){
  stopTurnTimer();
  if(countActive() <= 1){ endHandNoShowdown(); return; }
  G.players.forEach(function(p){ p.currentBet = 0; p.lastAction = ""; });
  G.currentBet = 0; G.lastRaiseAmount = G.bigBlind;
  if(G.stage === "preflop"){
    G.stage = "flop";
    G.community.push(G.deck.pop(), G.deck.pop(), G.deck.pop());
    log(t("flopIs",{cards:G.community.map(function(c){return c.display;}).join("  ")}), "hl");
  } else if(G.stage === "flop"){
    G.stage = "turn";
    G.community.push(G.deck.pop());
    log(t("turnIs",{card:G.community[G.community.length-1].display}), "hl");
  } else if(G.stage === "turn"){
    G.stage = "river";
    G.community.push(G.deck.pop());
    log(t("riverIs",{card:G.community[G.community.length-1].display}), "hl");
  } else if(G.stage === "river"){ showdown(); return; }
  PokerAudio.play('deal');
  render();
  startPostflopRound();
}

function endHandNoShowdown(){
  stopTurnTimer();
  const w = G.players.filter(function(p){ return !p.folded; })[0];
  if(!w) return;
  const pot = G.pot;
  w.chips += pot;
  log(t("winsPot",{name:w.name,pot:fmtNum(pot)}), "win");
  PokerAudio.play('win');
  G.pot = 0;
  G.stage = "showdown";
  finalizeHand(pot);
}

function calculateSidePots(){
  const c = G.players
    .filter(function(p){ return (p.totalContributed||0) > 0; })
    .map(function(p){ return { player:p, amount:p.totalContributed, folded:p.folded }; });
  const pots = [];
  let guard = 0;
  while(c.some(function(x){ return x.amount > 0; }) && guard < 20){
    guard++;
    const a = c.filter(function(x){ return x.amount > 0; });
    if(!a.length) break;
    const minA = Math.min.apply(null, a.map(function(x){ return x.amount; }));
    let amt = 0; const el = [];
    a.forEach(function(x){
      amt += minA; x.amount -= minA;
      if(!x.folded) el.push(x.player);
    });
    pots.push({ amount:amt, eligible:el });
  }
  return pots;
}

function showdown(){
  stopTurnTimer();
  G.stage = "showdown";
  G.busy = true;
  log(t("showdownHeader"), "hl");
  PokerAudio.play('showdown');
  const cont = G.players.filter(function(p){ return !p.folded; });
  cont.forEach(function(p){ p.revealCards = false; p._highlight = null; });
  render();
  let idx = 0;
  function next(){
    if(idx >= cont.length){ setTimeout(function(){ resolve(cont); }, 800); return; }
    const p = cont[idx];
    p.revealCards = true;
    render();
    PokerAudio.play('deal');
    log(t("reveals",{name:p.name,cards:p.holeCards.map(function(c){return c.display;}).join("  ")}), "showdown");
    idx++;
    setTimeout(next, 650);
  }
  next();
}

function resolve(cont){
  cont.forEach(function(p){
    const r = PokerEval.bestHand(p.holeCards.concat(G.community));
    p._score = r.score; p._bestCards = r.cards;
    log(t("handResult",{
      name:p.name,
      cards:p.holeCards.map(function(c){return c.display;}).join(" "),
      hand:PokerEval.nameOf(r.score)
    }), "showdown");
  });
  const pots = calculateSidePots();
  const n = pots.length;
  pots.forEach(function(pot, i){
    if(!pot.eligible.length) return;
    let best = null, ws = [];
    pot.eligible.forEach(function(p){
      if(best === null || PokerEval.compare(p._score, best) > 0){ best = p._score; ws = [p]; }
      else if(PokerEval.compare(p._score, best) === 0) ws.push(p);
    });
    const each = Math.floor(pot.amount / ws.length);
    const rem = pot.amount - each * ws.length;
    ws.forEach(function(w, k){ w.chips += each + (k === 0 ? rem : 0); });
    const lbl = n === 1 ? t("pot") : (i === 0 ? t("mainPot") : t("sidePot") + " " + i);
    log(t("winsPotSide",{
      name:ws.map(function(x){return x.name;}).join(", "),
      potLabel:lbl, amt:fmtNum(pot.amount), hand:PokerEval.nameOf(best)
    }), "win");
    if(!ws[0]._highlight && ws[0]._bestCards) ws[0]._highlight = new Set(ws[0]._bestCards);
  });
  const totalPot = pots.reduce(function(s,p){ return s + p.amount; }, 0);
  G.pot = 0; G.busy = false;
  PokerAudio.play('win');
  render();
  finalizeHand(totalPot);
}

function finalizeHand(totalPot){
  const me = G.players[0];
  PokerStorage.recordHand(me.chips - G.playerHandStartChips, totalPot || 0);
  render();
  if(me.chips <= 0){ setTimeout(showRebuy, 800); return; }
  showNextHandButton();
}

function showNextHandButton(){
  const btn = $("nextHandBtn");
  if(!btn) return;
  btn.textContent = "▶ " + t("nextHand");
  btn.classList.remove("hidden");
  btn.onclick = function(){
    btn.classList.add("hidden");
    do { G.dealerIndex = (G.dealerIndex + 1) % G.players.length; }
    while(G.players[G.dealerIndex].chips <= 0 && G.players.length > 1);
    startNewHand();
  };
}

function showRebuy(){
  stopTurnTimer();
  const lv = LEVELS.find(function(l){ return l.key === G.tableMode; }) || LEVELS[0];
  const amount = lv.buyMin;
  $("rebuyOverlay").classList.remove("hidden");
  $("rebuyMsg").textContent = t("rebuyMsg") + " (" + fmtNum(amount) + " " + t("chips") + " ≈ " + toBem(amount) + " BEM)";
  $("rebuyGameBtn").onclick = function(){
    $("rebuyOverlay").classList.add("hidden");
    /* 从练习筹码扣，如果不够就补 */
    let pc = PokerStorage.getPracticeChips();
    if(pc < amount){
      PokerStorage.addPracticeChips(amount - pc);
      pc = amount;
    }
    PokerStorage.setPracticeChips(pc - amount);
    G.players[0].chips = amount;
    G.sessionBuyIn += amount;
    PokerAudio.play('chip');
    do { G.dealerIndex = (G.dealerIndex + 1) % G.players.length; }
    while(G.players[G.dealerIndex].chips <= 0 && G.players.length > 1);
    startNewHand();
  };
  $("leaveGameBtn").onclick = function(){
    $("rebuyOverlay").classList.add("hidden");
    backToLobby();
  };
}

/* 离桌：把剩余筹码退回练习余额，记录一条 session */
function backToLobby(){
  stopTurnTimer();
  const me = G.players[0];
  if(me){
    /* 退回剩余筹码到练习余额 */
    PokerStorage.addPracticeChips(me.chips);
    /* 记录 session：P&L = 剩余 - 买入 */
    const pnl = me.chips - G.sessionBuyIn;
    PokerStorage.addSession({
      table: G.tableLabel,
      blinds: G.smallBlind + "/" + G.bigBlind,
      buyIn: G.sessionBuyIn,
      pnl: pnl,
      hands: G.sessionHands,
      status: 'left'
    });
  }
  G.gameOver = true;
  $("gameScreen").classList.add("hidden");
  $("lobbyScreen").classList.remove("hidden");
  $("nextHandBtn").classList.add("hidden");
  $("humanActions").innerHTML = "";
  $("raisePanel").classList.add("hidden");
  $("handCardsLarge").innerHTML = "";
  showScreen("lobby");
}

function showGameOver(reason){
  stopTurnTimer();
  G.gameOver = true;
  $("gameOverMsg").textContent = reason;
  $("gameOverOverlay").classList.remove("hidden");
}

function renderCardEl(card, mini, hl){
  const d = document.createElement("div");
  const isNew = !G._renderedCards.has(card);
  if(isNew) G._renderedCards.add(card);
  const cls = "face " + (card.red ? "red" : "black") + (hl ? " highlight" : "") + (isNew ? " card-new" : "");
  if(mini){
    d.className = "mini-card " + cls;
    d.innerHTML = '<div class="v">' + card.rank + '</div><div class="s">' + card.suit + '</div>';
  } else {
    d.className = "card " + (card.red ? "red" : "black") + (hl ? " highlight" : "") + (isNew ? " card-new" : "");
    d.innerHTML = '<div class="v">' + card.rank + '</div><div class="s">' + card.suit + '</div>';
  }
  return d;
}
function renderCardBackMini(){ const d = document.createElement("div"); d.className = "mini-card"; return d; }

function posCls(k){
  if(!k) return "";
  if(k === "posBTNSB" || k === "posBTN") return "btn";
  if(k === "posSB") return "sb";
  if(k === "posBB") return "bb";
  return "";
}

function render(){
  if(!G.players.length) return;
  const container = $("seatsLayer");
  if(!container) return;
  container.innerHTML = "";

  for(let i = 0; i < G.players.length; i++){
    const p = G.players[i];
    const style = p.isHuman ? null : PokerAI.STYLES[p.styleKey];
    const seat = document.createElement("div");
    seat.className = "seat";
    seat.setAttribute("data-pid", p.id);
    const pos = G.seatPositions[i] || { x:50, y:50 };
    seat.style.left = pos.x + "%";
    seat.style.top = pos.y + "%";
    if(p.folded) seat.classList.add("folded");
    if(p.revealCards) seat.classList.add("reveal");
    if(G.currentPlayerIndex === i && !G.gameOver && !p.folded && G.stage !== "showdown") seat.classList.add("active");

    let betInfo = "";
    if(p.currentBet > 0) betInfo = t("actionBet") + " " + fmtNum(p.currentBet);
    if(p.lastAction) betInfo += (betInfo ? " · " : "") + p.lastAction;

    const posHtml = p.position ? '<span class="pos-badge ' + posCls(p.positionKey) + '">' + p.position + '</span>' : '';
    const orderHtml =
      '<div class="order-badges">' +
        '<span class="order-badge p">' + t("orderPreflopShort") + ' ' + (p.preflopOrder || '-') + '</span>' +
        '<span class="order-badge f">' + t("orderPostflopShort") + ' ' + (p.postflopOrder || '-') + '</span>' +
      '</div>';
    const styleHtml = style
      ? '<span class="seat-style">' + t(style.name) + '</span>'
      : '<span class="seat-style">' + t("handShort") + '</span>';

    let squidHtml = '';
    if(G.squid.enabled){
      const sn = (p.squids || []).length;
      const sv = (p.squids || []).reduce(function(s, q){ return s + q.value; }, 0);
      squidHtml = '<div class="squid-badge ' + (sn === 0 ? 'zero' : '') + '">🐙 ' + sn + (sn > 0 ? ' · ' + fmtNum(sv) : '') + '</div>';
    }

    seat.innerHTML =
      '<div class="seat-head">' +
        '<div class="avatar-wrap" style="background:' + p.bg + '">' + p.emoji + '</div>' +
        '<div class="seat-meta">' +
          '<div class="seat-name">' + p.name + '</div>' +
          '<div>' + posHtml + styleHtml + '</div>' +
        '</div>' +
      '</div>' + orderHtml +
      '<div class="seat-chips">' + fmtNum(p.chips) + ' ' + t("chips") + '</div>' +
      '<div class="seat-bet">' + betInfo + '</div>' +
      squidHtml +
      '<div class="seat-cards"></div>';

    const cards = seat.querySelector(".seat-cards");
    if(p.folded || p.holeCards.length < 2){
      const a = renderCardBackMini(); a.style.opacity = ".3";
      const b = renderCardBackMini(); b.style.opacity = ".3";
      cards.appendChild(a); cards.appendChild(b);
    } else if(p.revealCards){
      p.holeCards.forEach(function(c){
        cards.appendChild(renderCardEl(c, true, p._highlight && p._highlight.has(c)));
      });
    } else {
      cards.appendChild(renderCardBackMini());
      cards.appendChild(renderCardBackMini());
    }
    container.appendChild(seat);
  }

  const bc = $("boardCards");
  if(bc){
    bc.innerHTML = "";
    const hlSet = new Set();
    G.players.forEach(function(p){ if(p._highlight) p._highlight.forEach(function(c){ hlSet.add(c); }); });
    G.community.forEach(function(c){ bc.appendChild(renderCardEl(c, false, hlSet.has(c))); });
  }

  renderHumanHand();

  const pots = calculateSidePots();
  const pm = $("potMain"), psw = $("potSideWrap"), ps = $("potSide");
  if(pm){
    if(!pots.length){ pm.textContent = fmtNum(G.pot); if(psw) psw.classList.add("hidden"); }
    else {
      pm.textContent = fmtNum(pots[0].amount);
      if(pots.length > 1){
        const s = pots.slice(1).reduce(function(a, p){ return a + p.amount; }, 0);
        if(ps) ps.textContent = fmtNum(s);
        if(psw) psw.classList.remove("hidden");
      } else if(psw) psw.classList.add("hidden");
    }
  }
  const sl = $("stageLabel");
  if(sl) sl.textContent = t(STAGE_KEYS[G.stage] || "stagePreflop");
  updateHandInfo();
}

function renderHumanHand(){
  const me = G.players[0];
  const c = $("handCardsLarge");
  if(!c) return;
  c.innerHTML = "";
  const bem = $("handBem");
  if(bem) bem.textContent = "≈ " + toBem(me.chips) + " BEM";
  if(!me || me.folded || me.holeCards.length < 2){
    const a = document.createElement("div"); a.className = "card"; a.style.opacity = ".2";
    const b = document.createElement("div"); b.className = "card"; b.style.opacity = ".2";
    c.appendChild(a); c.appendChild(b);
    return;
  }
  me.holeCards.forEach(function(card){
    const d = document.createElement("div");
    d.className = "card " + (card.red ? "red" : "black") + (me._highlight && me._highlight.has(card) ? " highlight" : "");
    d.innerHTML = '<div class="v">' + card.rank + '</div><div class="s">' + card.suit + '</div>';
    c.appendChild(d);
  });
}

function updateHandInfo(){
  const el = $("handInfo");
  if(!el) return;
  if(!G.players.length){ el.innerHTML = ""; return; }
  const me = G.players[0];
  const toCall = Math.max(0, G.currentBet - (me.currentBet || 0));
  el.innerHTML =
    '<div class="row"><span>' + t("infoHand") + '</span><strong>#' + G.handNumber + '</strong></div>' +
    '<div class="row"><span>' + t("infoStage") + '</span><strong>' + t(STAGE_KEYS[G.stage] || "stagePreflop") + '</strong></div>' +
    '<div class="row"><span>' + t("infoPot") + '</span><strong>' + fmtNum(G.pot) + '</strong></div>' +
    '<div class="row"><span>' + t("infoYourBet") + '</span><strong>' + fmtNum(me.currentBet || 0) + '</strong></div>' +
    '<div class="row"><span>' + t("infoToCall") + '</span><strong>' + fmtNum(toCall) + '</strong></div>';
}

function showHumanControls(){
  const me = G.players[0];
  const box = $("humanActions");
  const panel = $("raisePanel");
  if(!box || !panel) return;
  box.innerHTML = ""; panel.classList.add("hidden");
  if(me.folded || me.allIn || me.chips <= 0) return;
  const toCall = Math.max(0, G.currentBet - me.currentBet);
  const canCheck = toCall === 0;

  const foldBtn = document.createElement("button");
  foldBtn.className = "danger";
  foldBtn.textContent = t("actionFold");
  foldBtn.onclick = function(){ doHumanAction({ type:"fold" }); };
  box.appendChild(foldBtn);

  const callBtn = document.createElement("button");
  callBtn.textContent = canCheck ? t("actionCheck") : (t("actionCall") + " " + fmtNum(Math.min(me.chips, toCall)));
  callBtn.onclick = function(){ doHumanAction({ type:"call" }); };
  box.appendChild(callBtn);

  if(me.chips > toCall){
    const raiseBtn = document.createElement("button");
    raiseBtn.textContent = canCheck ? t("actionBetMenu") : t("actionRaise");
    raiseBtn.onclick = openRaisePanel;
    box.appendChild(raiseBtn);
  }
}

function openRaisePanel(){
  const me = G.players[0];
  const panel = $("raisePanel");
  const oldBet = G.currentBet;
  const max = me.chips + me.currentBet;
  let minT = oldBet === 0 ? G.bigBlind * 2 : oldBet * 2;
  const std = oldBet === 0 ? G.bigBlind : (oldBet + Math.max(G.lastRaiseAmount, G.bigBlind));
  if(std > minT) minT = std;
  if(minT > max) minT = max;
  if(max <= oldBet) return;
  G.raiseMin = minT; G.raiseMax = max;
  const sl = $("raiseSlider"); if(sl) sl.value = 0;
  const a = $("raiseMinLabel"), b = $("raiseMaxLabel");
  if(a) a.textContent = fmtNum(minT);
  if(b) b.textContent = fmtNum(max);
  updateRaiseAmount();
  panel.classList.remove("hidden");
}

function updateRaiseAmount(){
  const sl = $("raiseSlider"), d = $("raiseAmountValue");
  if(!sl || !d) return;
  const pct = parseInt(sl.value, 10) / 1000;
  d.textContent = fmtNum(Math.round(G.raiseMin + (G.raiseMax - G.raiseMin) * pct));
}

function applyRaisePreset(preset){
  const me = G.players[0];
  const oldBet = G.currentBet;
  const max = G.raiseMax;
  const toCall = Math.max(0, oldBet - me.currentBet);
  let target;
  if(preset === 'allin') target = max;
  else {
    const potAfter = G.pot + toCall;
    let amt;
    if(preset === 'half') amt = Math.floor(potAfter * 0.5);
    else if(preset === 'threeQuarter') amt = Math.floor(potAfter * 0.75);
    else amt = potAfter;
    target = oldBet === 0 ? Math.max(G.bigBlind, amt) : (oldBet + amt);
  }
  if(target < G.raiseMin) target = G.raiseMin;
  if(target > max) target = max;
  const range = max - G.raiseMin;
  const pct = range <= 0 ? 0 : (target - G.raiseMin) / range;
  const sl = $("raiseSlider"); if(sl) sl.value = Math.round(pct * 1000);
  updateRaiseAmount();
}

function doHumanAction(action){
  const me = G.players[0];
  if(me.folded || me.allIn) return;
  stopTurnTimer();
  $("humanActions").innerHTML = "";
  $("raisePanel").classList.add("hidden");
  executeAction(me, action);
  render();
  runTurn();
}

function startTurnTimer(player){
  stopTurnTimer();
  if(!player || !player.isHuman) return;
  G.turnTimeLeft = 30;
  updateTimerUI();
  const tt = $("turnTimer"); if(tt) tt.classList.remove("hidden");
  G.turnTimer = setInterval(function(){
    G.turnTimeLeft -= 0.1;
    if(G.turnTimeLeft <= 0){
      stopTurnTimer();
      const me = G.players[0];
      if(!me.folded && !me.allIn){
        log(t("timeoutFold", { name:me.name }), "action");
        doHumanAction({ type:"fold" });
      }
      return;
    }
    updateTimerUI();
  }, 100);
}
function stopTurnTimer(){
  if(G.turnTimer){ clearInterval(G.turnTimer); G.turnTimer = null; }
  const tt = $("turnTimer"); if(tt) tt.classList.add("hidden");
}
function updateTimerUI(){
  const f = $("timerFill"), t2 = $("timerText");
  if(!f || !t2) return;
  const pct = Math.max(0, G.turnTimeLeft / 30) * 100;
  f.style.width = pct + "%";
  t2.textContent = Math.ceil(Math.max(0, G.turnTimeLeft)) + "s";
  if(G.turnTimeLeft <= 5){ f.classList.add("warn"); t2.classList.add("warn"); }
  else { f.classList.remove("warn"); t2.classList.remove("warn"); }
}

document.addEventListener("DOMContentLoaded", function(){
  const saved = (function(){
    try { return localStorage.getItem('neon_holdem_lang') || 'zh'; }
    catch(e){ return 'zh'; }
  })();
  PokerI18n.setLang(saved);
  const ls = $("langSelect"); if(ls) ls.value = saved;
  if(ls) ls.addEventListener("change", function(){
    PokerI18n.setLang(this.value);
    try { localStorage.setItem('neon_holdem_lang', this.value); } catch(e){}
    PokerI18n.apply(document);
    renderLobby();
    renderNumbers();
  });

  /* 导航 */
  document.querySelectorAll(".nav-link").forEach(function(a){
    a.addEventListener("click", function(){
      const nav = a.getAttribute("data-nav");
      if(nav === "lobby") showScreen("lobby");
      else if(nav === "rules") showScreen("rules");
      else if(nav === "myNumbers") showScreen("myNumbers");
    });
  });

  renderLobby();

  /* 练习筹码补码 / 重置 */
  const prb = $("practiceRebuyBtn");
  if(prb) prb.onclick = function(){
    const amt = parseInt($("practiceRebuyAmount").value, 10);
    PokerStorage.addPracticeChips(amt);
    refreshBalanceUI();
  };
  const prst = $("practiceResetBtn");
  if(prst) prst.onclick = function(){
    if(confirm(t("confirmResetNumbers"))){
      PokerStorage.resetPracticeChips();
      refreshBalanceUI();
    }
  };
  const rnb = $("resetNumbersBtn");
  if(rnb) rnb.onclick = function(){
    if(confirm(t("confirmResetNumbers"))){
      PokerStorage.resetStats();
      renderNumbers();
    }
  };

  const back = $("backToLobbyBtn");
  if(back) back.onclick = function(){ if(confirm(t("leaveConfirm"))) backToLobby(); };

  const cw = $("connectWalletBtn");
  if(cw) cw.onclick = function(){ $("walletOverlay").classList.remove("hidden"); };
  const wc = $("walletCloseBtn");
  if(wc) wc.onclick = function(){ $("walletOverlay").classList.add("hidden"); };

  const ngb = $("newGameBtn");
  if(ngb) ngb.onclick = function(){ $("gameOverOverlay").classList.add("hidden"); backToLobby(); };

  const rs = $("raiseSlider"); if(rs) rs.addEventListener("input", updateRaiseAmount);
  const crb = $("cancelRaiseBtn");
  if(crb) crb.onclick = function(){ $("raisePanel").classList.add("hidden"); };
  const cfr = $("confirmRaiseBtn");
  if(cfr) cfr.onclick = function(){
    const sl = $("raiseSlider");
    const pct = parseInt(sl.value, 10) / 1000;
    const amt = Math.round(G.raiseMin + (G.raiseMax - G.raiseMin) * pct);
    doHumanAction({ type:"raise", target:amt });
  };
  const rp = $("raisePresets");
  if(rp) rp.addEventListener("click", function(e){
    const b = e.target.closest('button[data-preset]');
    if(b) applyRaisePreset(b.getAttribute('data-preset'));
  });

  const scb = $("squidConfirmBtn");
  if(scb) scb.onclick = function(){ $("squidOverlay").classList.add("hidden"); };
});

})();