const STORAGE_KEY = 'srludo_state_v1';
const channel = new BroadcastChannel('srludo_realtime');

const initialState = {
  wallet: { win_balance: 300, balance: 700 },
  currentBattle: null,
  matchHistory: [],
  depositHistory: [],
  withdrawHistory: [],
  referrals: [
    { id: 'r1', name: 'Aman Singh', phone: '9999000011', registeredAt: '2026-01-15', lifetimeWins: 0, earningsGenerated: 0 },
    { id: 'r2', name: 'Neha Roy', phone: '9999000012', registeredAt: '2026-01-20', lifetimeWins: 0, earningsGenerated: 0 }
  ],
  kyc: { locked: false, data: null }
};

function loadState() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(initialState);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  channel.postMessage({ type: 'sync' });
}

let state = loadState();

const $ = (id) => document.getElementById(id);

function payoutForEntry(entry) {
  const commission = entry >= 500 ? 0.03 : 0.05;
  return Math.round(entry * 2 * (1 - commission));
}

function computeDeduction(entry) {
  const fromWin = Math.min(state.wallet.win_balance, entry);
  const fromCash = Math.max(0, entry - fromWin);
  return { fromWin, fromCash };
}

function renderWallet() {
  $('winBalance').textContent = state.wallet.win_balance;
  $('cashBalance').textContent = state.wallet.balance;
}

function renderBattle() {
  const battle = state.currentBattle;
  $('creatorCodeSection').classList.add('hidden');
  $('joinerCodeSection').classList.add('hidden');
  $('resultSection').classList.add('hidden');

  if (!battle) {
    $('battleState').textContent = 'No active battle.';
    return;
  }

  $('battleState').textContent = `Battle #${battle.id} | Entry ₹${battle.entry} | Status: ${battle.status}`;
  if (battle.status === 'awaiting_code') $('creatorCodeSection').classList.remove('hidden');
  if (battle.roomCode) {
    $('joinerCodeSection').classList.remove('hidden');
    $('roomCodeDisplay').textContent = battle.roomCode;
    $('resultSection').classList.remove('hidden');
  }
}

function pushHistory(type, text) {
  const item = `${new Date().toLocaleString()} - ${text}`;
  state[type].unshift(item);
  state[type] = state[type].slice(0, 20);
}

function renderHistory() {
  const mappings = [
    ['matchHistory', 'matchHistoryList'],
    ['depositHistory', 'depositHistoryList'],
    ['withdrawHistory', 'withdrawHistoryList']
  ];
  mappings.forEach(([key, el]) => {
    $(el).innerHTML = state[key].map((v) => `<li>${v}</li>`).join('') || '<li>No records.</li>';
  });
}

function renderReferrals() {
  $('refUserSelect').innerHTML = state.referrals.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
  $('refTableBody').innerHTML = state.referrals.map((r) => `
    <tr>
      <td>${r.name}</td>
      <td>${r.phone}</td>
      <td>${r.registeredAt}</td>
      <td>₹${r.lifetimeWins}</td>
      <td>₹${r.earningsGenerated.toFixed(2)}</td>
    </tr>
  `).join('');
}

function lockKycUI() {
  const locked = state.kyc.locked;
  Array.from($('kycForm').elements).forEach((el) => {
    if (el.type !== 'submit') el.disabled = locked;
  });
  $('kycForm').querySelector('button[type="submit"]').disabled = locked;
  $('kycLockNotice').textContent = locked
    ? 'KYC and banking details are locked after submission.'
    : 'Submit once to lock banking and KYC details.';
  $('messageAdminLink').classList.toggle('hidden', !locked);
}

function renderAll() {
  renderWallet();
  renderBattle();
  renderHistory();
  renderReferrals();
  lockKycUI();
}

$('goArena').onclick = () => $('arena').classList.toggle('hidden');
$('openRules').onclick = () => $('rulesModal').classList.remove('hidden');
document.querySelectorAll('[data-close-modal]').forEach((btn) => {
  btn.onclick = () => $(btn.dataset.closeModal).classList.add('hidden');
});
document.querySelectorAll('[data-open-modal]').forEach((btn) => {
  btn.onclick = () => $(btn.dataset.openModal).classList.remove('hidden');
});

$('entryAmount').oninput = () => {
  const entry = Number($('entryAmount').value || 0);
  if (!entry) return;
  const d = computeDeduction(entry);
  $('deductionPreview').textContent = `Deduction split: ₹${d.fromWin} from Win + ₹${d.fromCash} from Cash`;
};

$('createBattleBtn').onclick = () => {
  const entry = Number($('entryAmount').value);
  if (entry <= 0 || entry % 50 !== 0) return alert('Entry must be a positive multiple of 50.');
  const d = computeDeduction(entry);
  if (d.fromCash > state.wallet.balance) return alert('Insufficient total wallet balance.');

  state.wallet.win_balance -= d.fromWin;
  state.wallet.balance -= d.fromCash;
  state.currentBattle = {
    id: Date.now(),
    entry,
    deduction: d,
    status: 'awaiting_code',
    roomCode: '',
    dispute: false
  };
  pushHistory('matchHistory', `Created battle with entry ₹${entry}.`);
  saveState();
  renderAll();
};

$('joinMockBtn').onclick = () => {
  if (!state.currentBattle) return alert('Create a battle first.');
  state.currentBattle.status = 'awaiting_code';
  pushHistory('matchHistory', 'Opponent joined battle.');
  saveState();
  renderAll();
};

$('saveRoomCodeBtn').onclick = () => {
  const code = $('roomCodeInput').value.trim();
  if (!code || !state.currentBattle) return;
  state.currentBattle.roomCode = code;
  state.currentBattle.status = 'live';
  saveState();
  renderAll();
};

$('cancelBattleBtn').onclick = () => {
  if (!state.currentBattle) return;
  const refund = state.currentBattle.entry;
  state.wallet.balance += refund;
  pushHistory('matchHistory', `Battle cancelled. Refunded ₹${refund} to Cash Wallet.`);
  state.currentBattle = null;
  saveState();
  renderAll();
};

$('lostBtn').onclick = () => {
  if (!state.currentBattle) return;
  const prize = payoutForEntry(state.currentBattle.entry);
  pushHistory('matchHistory', `Marked LOST. Opponent credited ₹${prize}.`);
  state.currentBattle = null;
  saveState();
  renderAll();
};

$('winBtn').onclick = () => {
  if (!state.currentBattle) return;
  $('screenshotModal').classList.remove('hidden');
};

$('submitWinEvidence').onclick = async () => {
  const key = $('imgbbKey').value.trim();
  const file = $('winningScreenshot').files[0];
  if (!key || !file || !state.currentBattle) return alert('Provide ImgBB key and screenshot.');

  const form = new FormData();
  form.append('key', key);
  form.append('image', file);
  $('uploadStatus').textContent = 'Uploading...';

  try {
    const res = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (!data.success) throw new Error('Upload failed');
    state.currentBattle.dispute = true;
    state.currentBattle.status = 'dispute';
    pushHistory('matchHistory', `Marked WIN and submitted evidence for admin review: ${data.data.url}`);
    $('uploadStatus').textContent = 'Uploaded. Match moved to dispute state.';
    saveState();
    renderAll();
  } catch {
    $('uploadStatus').textContent = 'Upload failed. Try again with valid ImgBB key.';
  }
};

$('creditReferralBtn').onclick = () => {
  const id = $('refUserSelect').value;
  const winAmount = Number($('refWinAmount').value || 0);
  if (winAmount <= 0) return;
  const ref = state.referrals.find((r) => r.id === id);
  if (!ref) return;
  const commission = winAmount * 0.02;
  ref.lifetimeWins += winAmount;
  ref.earningsGenerated += commission;
  state.wallet.balance += commission;
  pushHistory('matchHistory', `Referral ${ref.name} won ₹${winAmount}. Commission ₹${commission.toFixed(2)} added to Cash Wallet.`);
  saveState();
  renderAll();
};

$('kycForm').onsubmit = async (e) => {
  e.preventDefault();
  if (state.kyc.locked) return;
  const formData = new FormData(e.target);
  const file = formData.get('aadharFront');
  state.kyc = {
    locked: true,
    data: {
      holderName: formData.get('holderName'),
      upiId: formData.get('upiId'),
      bankAccount: formData.get('bankAccount'),
      ifsc: formData.get('ifsc'),
      aadharNumber: formData.get('aadharNumber'),
      aadharFrontName: file?.name || 'uploaded'
    }
  };
  pushHistory('matchHistory', 'KYC submitted and locked.');
  saveState();
  renderAll();
};

$('depositBtn').onclick = () => {
  const amount = Number($('depositAmount').value || 0);
  if (amount <= 0) return;
  state.wallet.balance += amount;
  pushHistory('depositHistory', `Deposited ₹${amount}.`);
  saveState();
  renderAll();
};

$('withdrawBtn').onclick = () => {
  const amount = Number($('withdrawAmount').value || 0);
  if (amount <= 0 || amount > state.wallet.balance) return alert('Invalid withdraw amount.');
  state.wallet.balance -= amount;
  pushHistory('withdrawHistory', `Withdrew ₹${amount}.`);
  saveState();
  renderAll();
};

channel.onmessage = () => {
  state = loadState();
  renderAll();
};

setInterval(() => {
  $('livePlayers').textContent = 1200 + Math.floor(Math.random() * 800);
  $('liveDot').classList.toggle('alt');
}, 1200);

renderAll();
