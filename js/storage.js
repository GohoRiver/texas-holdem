window.PokerStorage = (function(){
  /* 练习模式筹码（本地） */
  const PRACTICE_CHIPS_KEY = 'neon_holdem_practice_chips_v2';
  /* 对战场筹码（预留给链上，暂为 0） */
  const REAL_CHIPS_KEY = 'neon_holdem_real_chips_v2';
  const STATS_KEY = 'neon_holdem_stats_v2';
  const VOLUME_KEY = 'neon_holdem_volume_v2';

  function safeGet(key, fallback){
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch(e){ return fallback; }
  }
  function safeSet(key, val){
    try { localStorage.setItem(key, val); } catch(e){}
  }

  /* ========= 练习模式 ========= */
  function getPracticeChips(){
    const v = parseInt(safeGet(PRACTICE_CHIPS_KEY, '0'), 10);
    return isNaN(v) ? 0 : Math.max(0, v);
  }
  function setPracticeChips(v){
    safeSet(PRACTICE_CHIPS_KEY, String(Math.max(0, Math.floor(v))));
  }
  function addPracticeChips(v){
    setPracticeChips(getPracticeChips() + Math.max(0, Math.floor(v)));
  }
  function resetPracticeChips(){ setPracticeChips(0); }

  /* 兼容旧接口：getChips 现在指练习筹码 */
  function getChips(){ return getPracticeChips(); }
  function setChips(v){ setPracticeChips(v); }
  function addChips(v){ addPracticeChips(v); }
  function resetChips(){ resetPracticeChips(); }

  /* ========= 对战场筹码 ========= */
  function getRealChips(){
    const v = parseInt(safeGet(REAL_CHIPS_KEY, '0'), 10);
    return isNaN(v) ? 0 : Math.max(0, v);
  }
  function setRealChips(v){
    safeSet(REAL_CHIPS_KEY, String(Math.max(0, Math.floor(v))));
  }

  /* ========= 战绩 ========= */
  function getStats(){
    const raw = safeGet(STATS_KEY, null);
    if(!raw) return { hands: 0, wins: 0, biggestPot: 0, netGain: 0, sessions: [] };
    try {
      const s = JSON.parse(raw);
      return {
        hands: s.hands || 0,
        wins: s.wins || 0,
        biggestPot: s.biggestPot || 0,
        netGain: s.netGain || 0,
        sessions: Array.isArray(s.sessions) ? s.sessions : []
      };
    } catch(e){
      return { hands: 0, wins: 0, biggestPot: 0, netGain: 0, sessions: [] };
    }
  }
  function recordHand(delta, potSize){
    const s = getStats();
    s.hands += 1;
    if(delta > 0) s.wins += 1;
    s.netGain += delta;
    if(potSize > s.biggestPot) s.biggestPot = potSize;
    safeSet(STATS_KEY, JSON.stringify(s));
    return s;
  }

  /* 添加一条 session 记录 */
  function addSession(rec){
    const s = getStats();
    s.sessions = s.sessions || [];
    s.sessions.unshift({
      table: rec.table || 'Nano',
      blinds: rec.blinds || '1/2',
      buyIn: rec.buyIn || 0,
      pnl: rec.pnl || 0,
      hands: rec.hands || 0,
      status: rec.status || 'left',
      date: rec.date || Date.now()
    });
    /* 最多保留 30 条 */
    if(s.sessions.length > 30) s.sessions = s.sessions.slice(0, 30);
    safeSet(STATS_KEY, JSON.stringify(s));
  }

  function resetStats(){
    safeSet(STATS_KEY, JSON.stringify({
      hands: 0, wins: 0, biggestPot: 0, netGain: 0, sessions: []
    }));
  }

  /* ========= 音量 ========= */
  function getVolume(){
    const v = parseFloat(safeGet(VOLUME_KEY, '0.7'));
    return isNaN(v) ? 0.7 : Math.max(0, Math.min(1, v));
  }
  function setVolume(v){
    safeSet(VOLUME_KEY, String(Math.max(0, Math.min(1, v))));
  }

  return {
    /* 练习 */
    getPracticeChips, setPracticeChips, addPracticeChips, resetPracticeChips,
    /* 对战 */
    getRealChips, setRealChips,
    /* 兼容旧接口 */
    getChips, setChips, addChips, resetChips,
    /* 战绩 */
    getStats, recordHand, addSession, resetStats,
    /* 音量 */
    getVolume, setVolume
  };
})();