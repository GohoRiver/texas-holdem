window.PokerWallet = (function(){
  /* 平台收款地址（你提供的） */
  const PLATFORM_ADDRESS = '0x1219C18ADc187c918d0216EB7B983f5068EEb19A';
  /* BEM 合约地址 */
  const BEM_ADDRESS = '0x5ce033b2bfca3af30b3e8c8457deaf776a8b695a';
  /* 充值手续费 2% */
  const FEE_RATE = 0.02;
  /* BSC 主网 chainId */
  const BSC_CHAIN_ID = '0x38';

  const BEM_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
  ];

  let provider = null;
  let signer = null;
  let userAddress = null;
  let bemBalance = 0;
  let decimals = 18;

  function getEth(){
    return window.binancew3w?.ethereum || window.ethereum || null;
  }

  async function connect(){
    const eth = getEth();
    if(!eth){
      alert('请安装币安 Web3 钱包或 MetaMask');
      return null;
    }
    try{
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      if(!accounts || !accounts.length) return null;
      userAddress = accounts[0];

      // 切换到 BNB Chain
      try{
        await eth.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BSC_CHAIN_ID }]
        });
      }catch(sw){
        if(sw.code === 4902){
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: BSC_CHAIN_ID,
              chainName: 'BNB Smart Chain',
              nativeCurrency: { name:'BNB', symbol:'BNB', decimals:18 },
              rpcUrls: ['https://bsc-dataseed.binance.org/'],
              blockExplorerUrls: ['https://bscscan.com/']
            }]
          });
        } else {
          throw sw;
        }
      }

      provider = new ethers.BrowserProvider(eth);
      signer = await provider.getSigner();

      // 读 BEM 余额
      await refreshBemBalance();
      updateUI();

      // 监听账户变化
      eth.on && eth.on('accountsChanged', function(accs){
        if(accs && accs.length){
          userAddress = accs[0];
          refreshBemBalance().then(updateUI);
        } else {
          userAddress = null;
          bemBalance = 0;
          updateUI();
        }
      });

      return { address: userAddress, signer, bemBalance };
    }catch(err){
      console.error('connect error', err);
      return null;
    }
  }

  async function refreshBemBalance(){
    if(!provider || !userAddress) return 0;
    try{
      const contract = new ethers.Contract(BEM_ADDRESS, BEM_ABI, provider);
      const raw = await contract.balanceOf(userAddress);
      try{
        decimals = await contract.decimals();
        decimals = Number(decimals);
      }catch(e){ decimals = 18; }
      bemBalance = parseFloat(ethers.formatUnits(raw, decimals));
    }catch(e){
      console.warn('read BEM failed', e);
      bemBalance = 0;
    }
    return bemBalance;
  }

  function updateUI(){
    const btn = document.getElementById('connectWalletBtn');
    const btn2 = document.getElementById('realConnectBtn');
    const label = userAddress
      ? (userAddress.slice(0,6) + '...' + userAddress.slice(-4))
      : null;

    if(btn){
      if(label){
        btn.textContent = label;
        btn.classList.add('connected');
      } else {
        btn.textContent = window.PokerI18n.t('connectWallet');
        btn.classList.remove('connected');
      }
    }
    if(btn2){
      if(label){
        btn2.textContent = label;
        btn2.classList.add('connected');
      } else {
        btn2.textContent = window.PokerI18n.t('connectWallet');
        btn2.classList.remove('connected');
      }
    }

    const bem = document.getElementById('walletBemBalance');
    if(bem) bem.textContent = bemBalance.toFixed(4);

    const addr = document.getElementById('walletAddress');
    if(addr){
      addr.textContent = userAddress
        ? (userAddress.slice(0,6) + '...' + userAddress.slice(-4))
        : window.PokerI18n.t('notConnected');
    }

    const pill = document.getElementById('statusPill');
    if(pill && userAddress){
      pill.innerHTML = '<span class="dot" style="background:#22c55e;box-shadow:0 0 6px #22c55e;"></span>' + bemBalance.toFixed(2) + ' BEM';
    }
  }

  /* 充值：用户签名一笔 BEM 转账到平台地址 */
  async function depositBem(amountBem){
    if(!signer || !userAddress){
      throw new Error('not-connected');
    }
    const amount = Number(amountBem);
    if(!amount || amount < 1){
      throw new Error('min-amount');
    }
    if(amount > bemBalance){
      throw new Error('insufficient');
    }

    const contract = new ethers.Contract(BEM_ADDRESS, BEM_ABI, signer);

    // 用户实际付 amount，平台收到 amount - fee
    // 也就是说：用户拿到 (amount * (1 - FEE_RATE)) 对应的筹码
    const netAmount = amount * (1 - FEE_RATE);
    const netChips = Math.floor(netAmount / 0.0001); // 1 chip = 0.0001 BEM

    // 发起 BEM 转账到平台
    const tx = await contract.transfer(
      PLATFORM_ADDRESS,
      ethers.parseUnits(amount.toString(), decimals)
    );
    await tx.wait();

    // 刷新余额
    await refreshBemBalance();
    updateUI();

    return { netChips, netBem: netAmount, txHash: tx.hash };
  }

  function getBemBalance(){ return bemBalance; }
  function getAddress(){ return userAddress; }
  function isConnected(){ return !!userAddress; }
  function getPlatformAddress(){ return PLATFORM_ADDRESS; }
  function getFeeRate(){ return FEE_RATE; }

  return {
    connect,
    depositBem,
    refreshBemBalance,
    updateUI,
    getBemBalance,
    getAddress,
    isConnected,
    getPlatformAddress,
    getFeeRate
  };
})();
