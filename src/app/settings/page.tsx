'use client';

import { useState, useEffect } from 'react';
import { OperatorShell } from '@/components/navigation/operator-shell';
import { 
  Building2, Smartphone, Plus, Edit2, Trash2, 
  Check, X, Sliders, ShieldCheck, UserCheck, 
  RefreshCw, CheckCircle2, AlertTriangle, ArrowRight,
  SlidersHorizontal, Lock
} from 'lucide-react';
import { BankAccountHealth } from '@/types/desk';
import { MomoWallet } from '@/app/api/settings/momo-wallets/route';
import { Session } from '@/lib/auth';

export default function SettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccountHealth[]>([]);
  const [momoWallets, setMomoWallets] = useState<MomoWallet[]>([]);
  const [loading, setLoading] = useState(true);

  // Bank Form State
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccountHealth | null>(null);
  const [bankForm, setBankForm] = useState({
    bankName: '',
    accountNumber: '',
    accountName: '',
    dailyLimit: '25000000',
    status: 'ACTIVE_ROUTING' as 'ACTIVE_ROUTING' | 'COOLING_DOWN' | 'SUSPENDED',
  });

  // MoMo Form State
  const [isMomoModalOpen, setIsMomoModalOpen] = useState(false);
  const [editingMomo, setEditingMomo] = useState<MomoWallet | null>(null);
  const [momoForm, setMomoForm] = useState({
    network: 'MTN MoMo',
    phoneNumber: '',
    merchantName: '',
    balance: '50000',
    dailyLimit: '100000',
    status: 'ACTIVE_DISBURSING' as 'ACTIVE_DISBURSING' | 'STANDBY' | 'LOW_FLOAT',
  });

  // Load Session and Accounts
  useEffect(() => {
    async function loadAll() {
      try {
        const [sessRes, bankRes, momoRes] = await Promise.all([
          fetch('/api/auth/session').catch(() => null),
          fetch('/api/settings/bank-accounts').catch(() => null),
          fetch('/api/settings/momo-wallets').catch(() => null),
        ]);

        if (sessRes && sessRes.ok) {
          const sessData = await sessRes.json();
          setSession(sessData.session || null);
        }

        if (bankRes && bankRes.ok) {
          const bankData = await bankRes.json();
          setBankAccounts(bankData.accounts || []);
        }

        if (momoRes && momoRes.ok) {
          const momoData = await momoRes.json();
          setMomoWallets(momoData.wallets || []);
        }
      } catch (e) {
        console.error('Error loading settings data:', e);
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, []);

  // Bank Account Handlers
  const handleOpenAddBank = () => {
    setEditingBank(null);
    setBankForm({
      bankName: 'GTBank Nigeria',
      accountNumber: '',
      accountName: 'Aksen Liquidity Services Ltd',
      dailyLimit: '25000000',
      status: 'ACTIVE_ROUTING',
    });
    setIsBankModalOpen(true);
  };

  const handleOpenEditBank = (bank: BankAccountHealth) => {
    setEditingBank(bank);
    setBankForm({
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      accountName: bank.accountName,
      dailyLimit: bank.dailyLimit.toString(),
      status: bank.status as any,
    });
    setIsBankModalOpen(true);
  };

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankForm.bankName || !bankForm.accountNumber) return;

    if (editingBank) {
      // Update
      try {
        await fetch('/api/settings/bank-accounts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingBank.id,
            ...bankForm,
            dailyLimit: parseFloat(bankForm.dailyLimit),
          }),
        });

        setBankAccounts((prev) =>
          prev.map((b) =>
            b.id === editingBank.id
              ? { ...b, ...bankForm, dailyLimit: parseFloat(bankForm.dailyLimit) }
              : b
          )
        );
      } catch (err) {
        console.error(err);
      }
    } else {
      // Create
      try {
        const id = `bank-${Date.now()}`;
        await fetch('/api/settings/bank-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            ...bankForm,
            dailyLimit: parseFloat(bankForm.dailyLimit),
          }),
        });

        setBankAccounts((prev) => [
          {
            id,
            bankName: bankForm.bankName,
            accountNumber: bankForm.accountNumber,
            accountName: bankForm.accountName,
            dailyLimit: parseFloat(bankForm.dailyLimit),
            dailyUsed: 0,
            status: bankForm.status,
          },
          ...prev,
        ]);
      } catch (err) {
        console.error(err);
      }
    }

    setIsBankModalOpen(false);
  };

  const handleDeleteBank = async (id: string) => {
    if (!confirm('Are you sure you want to remove this bank collection account?')) return;
    try {
      await fetch(`/api/settings/bank-accounts?id=${id}`, { method: 'DELETE' });
      setBankAccounts((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleBankStatus = async (bank: BankAccountHealth) => {
    const nextStatus = bank.status === 'ACTIVE_ROUTING' ? 'COOLING_DOWN' : 'ACTIVE_ROUTING';
    try {
      await fetch('/api/settings/bank-accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bank.id, status: nextStatus }),
      });
      setBankAccounts((prev) =>
        prev.map((b) => (b.id === bank.id ? { ...b, status: nextStatus } : b))
      );
    } catch (err) {
      console.error(err);
    }
  };

  // MoMo Wallet Handlers
  const handleOpenAddMomo = () => {
    setEditingMomo(null);
    setMomoForm({
      network: 'MTN MoMo',
      phoneNumber: '',
      merchantName: 'Aksen Liquidity Services Ghana',
      balance: '50000',
      dailyLimit: '100000',
      status: 'ACTIVE_DISBURSING',
    });
    setIsMomoModalOpen(true);
  };

  const handleOpenEditMomo = (wallet: MomoWallet) => {
    setEditingMomo(wallet);
    setMomoForm({
      network: wallet.network,
      phoneNumber: wallet.phoneNumber,
      merchantName: wallet.merchantName,
      balance: wallet.balance.toString(),
      dailyLimit: wallet.dailyLimit.toString(),
      status: wallet.status,
    });
    setIsMomoModalOpen(true);
  };

  const handleSaveMomo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!momoForm.phoneNumber || !momoForm.merchantName) return;

    if (editingMomo) {
      // Update
      try {
        await fetch('/api/settings/momo-wallets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingMomo.id,
            ...momoForm,
            balance: parseFloat(momoForm.balance),
            dailyLimit: parseFloat(momoForm.dailyLimit),
          }),
        });

        setMomoWallets((prev) =>
          prev.map((w) =>
            w.id === editingMomo.id
              ? {
                  ...w,
                  ...momoForm,
                  balance: parseFloat(momoForm.balance),
                  dailyLimit: parseFloat(momoForm.dailyLimit),
                }
              : w
          )
        );
      } catch (err) {
        console.error(err);
      }
    } else {
      // Create
      try {
        const id = `momo-${Date.now()}`;
        await fetch('/api/settings/momo-wallets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            ...momoForm,
            balance: parseFloat(momoForm.balance),
            dailyLimit: parseFloat(momoForm.dailyLimit),
          }),
        });

        setMomoWallets((prev) => [
          {
            id,
            network: momoForm.network,
            phoneNumber: momoForm.phoneNumber,
            merchantName: momoForm.merchantName,
            balance: parseFloat(momoForm.balance),
            dailyDisbursed: 0,
            dailyLimit: parseFloat(momoForm.dailyLimit),
            status: momoForm.status,
          },
          ...prev,
        ]);
      } catch (err) {
        console.error(err);
      }
    }

    setIsMomoModalOpen(false);
  };

  const handleDeleteMomo = async (id: string) => {
    if (!confirm('Are you sure you want to remove this MoMo disbursement SIM line?')) return;
    try {
      await fetch(`/api/settings/momo-wallets?id=${id}`, { method: 'DELETE' });
      setMomoWallets((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleMomoStatus = async (wallet: MomoWallet) => {
    const nextStatus = wallet.status === 'ACTIVE_DISBURSING' ? 'STANDBY' : 'ACTIVE_DISBURSING';
    try {
      await fetch('/api/settings/momo-wallets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: wallet.id, status: nextStatus }),
      });
      setMomoWallets((prev) =>
        prev.map((w) => (w.id === wallet.id ? { ...w, status: nextStatus } : w))
      );
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <OperatorShell session={session}>
      <div className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8 text-left">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#10261d]">
            Settings &middot; Bank &amp; MoMo Accounts
          </h1>
          <p className="text-xs text-[#53635a] mt-0.5">
            Manage your rotated Nigerian bank collection accounts, Ghana MoMo disbursement SIM lines, and daily limits.
          </p>
        </div>

        {/* Section 1: Nigerian Bank Collection Accounts CRUD */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#10261d] flex items-center gap-2">
                <Building2 size={18} className="text-[#175b3b]" />
                <span>Nigerian Bank Collection Accounts</span>
              </h2>
              <span className="text-xs text-[#53635a]">
                Accounts rotated to receive customer Naira deposits. Prevents NIP threshold freezes.
              </span>
            </div>

            <button
              type="button"
              onClick={handleOpenAddBank}
              className="flex items-center gap-1.5 rounded-full bg-[#175b3b] hover:bg-[#0f4329] text-white text-xs font-bold px-4 py-2 transition-all cursor-pointer shadow-2xs"
            >
              <Plus size={14} />
              <span>Add Bank Account</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bankAccounts.map((bank) => {
              const isNearCap = bank.status === 'NEAR_CAP';
              const isActive = bank.status === 'ACTIVE_ROUTING';
              const usedPct = Math.min(100, Math.round((bank.dailyUsed / bank.dailyLimit) * 100));

              return (
                <div
                  key={bank.id}
                  className="rounded-2xl border border-[#e3ece1] bg-white p-5 shadow-xs space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <strong className="text-sm font-bold text-[#10261d] block">
                          {bank.bankName}
                        </strong>
                        <span className="font-mono text-xs text-[#53635a]">
                          Acc: {bank.accountNumber} &bull; {bank.accountName}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleBankStatus(bank)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#ebf5e7] text-[#175b3b] border border-[#175b3b]/30'
                            : isNearCap
                            ? 'bg-amber-50 text-amber-700 border border-amber-300'
                            : 'bg-neutral-100 text-neutral-600 border border-neutral-300'
                        }`}
                        title="Click to toggle routing status"
                      >
                        {bank.status}
                      </button>
                    </div>

                    {/* Progress Bar of Daily Limit Used */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#53635a]">
                        <span>Daily Capacity:</span>
                        <span>
                          ₦{(bank.dailyUsed / 1000000).toFixed(1)}M / ₦{(bank.dailyLimit / 1000000).toFixed(1)}M ({usedPct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#f1f5ee] overflow-hidden">
                        <div
                          style={{ width: `${usedPct}%` }}
                          className={`h-full rounded-full transition-all ${
                            isNearCap ? 'bg-amber-500' : 'bg-[#175b3b]'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actions Strip */}
                  <div className="pt-2 border-t border-[#e3ece1] flex items-center justify-between text-xs">
                    <span className="text-[10px] font-mono text-[#798d81]">
                      ID: {bank.id}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditBank(bank)}
                        className="p-1.5 rounded-lg text-[#53635a] hover:text-[#10261d] hover:bg-neutral-100 transition-colors cursor-pointer"
                        title="Edit Details"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBank(bank.id)}
                        className="p-1.5 rounded-lg text-[#53635a] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Delete Account"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 2: Ghana MoMo Disbursement Wallets CRUD */}
        <section className="space-y-4 pt-4 border-t border-[#e3ece1]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#10261d] flex items-center gap-2">
                <Smartphone size={18} className="text-[#175b3b]" />
                <span>Ghana MoMo Disbursement SIMs &amp; Float Wallets</span>
              </h2>
              <span className="text-xs text-[#53635a]">
                Active mobile money merchant lines in Accra &amp; Kumasi used to disburse Cedis instantly.
              </span>
            </div>

            <button
              type="button"
              onClick={handleOpenAddMomo}
              className="flex items-center gap-1.5 rounded-full bg-[#175b3b] hover:bg-[#0f4329] text-white text-xs font-bold px-4 py-2 transition-all cursor-pointer shadow-2xs"
            >
              <Plus size={14} />
              <span>Add MoMo Line</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {momoWallets.map((wallet) => {
              const isActive = wallet.status === 'ACTIVE_DISBURSING';
              return (
                <div
                  key={wallet.id}
                  className="rounded-2xl border border-[#e3ece1] bg-white p-5 shadow-xs space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <strong className="text-sm font-bold text-[#10261d] block">
                          {wallet.network} &bull; {wallet.phoneNumber}
                        </strong>
                        <span className="font-mono text-xs text-[#53635a]">
                          {wallet.merchantName}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleMomoStatus(wallet)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#ebf5e7] text-[#175b3b] border border-[#175b3b]/30'
                            : 'bg-neutral-100 text-neutral-600 border border-neutral-300'
                        }`}
                        title="Click to toggle status"
                      >
                        {wallet.status}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                      <div className="p-2 rounded-xl bg-[#f9faf7] border border-[#e3ece1]">
                        <span className="text-[10px] text-[#798d81] block">CURRENT FLOAT</span>
                        <strong className="text-[#10261d] text-sm">
                          GH₵ {wallet.balance.toLocaleString()}
                        </strong>
                      </div>

                      <div className="p-2 rounded-xl bg-[#f9faf7] border border-[#e3ece1]">
                        <span className="text-[10px] text-[#798d81] block">DAILY DISBURSED</span>
                        <strong className="text-[#175b3b] text-sm">
                          GH₵ {wallet.dailyDisbursed.toLocaleString()}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Actions Strip */}
                  <div className="pt-2 border-t border-[#e3ece1] flex items-center justify-between text-xs">
                    <span className="text-[10px] font-mono text-[#798d81]">
                      Limit: GH₵ {wallet.dailyLimit.toLocaleString()} / day
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditMomo(wallet)}
                        className="p-1.5 rounded-lg text-[#53635a] hover:text-[#10261d] hover:bg-neutral-100 transition-colors cursor-pointer"
                        title="Edit Details"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMomo(wallet.id)}
                        className="p-1.5 rounded-lg text-[#53635a] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Delete Line"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Modal: Bank Account Create/Edit */}
      {isBankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-[#e3ece1] space-y-5 text-left">
            <div className="flex items-center justify-between border-b border-[#e3ece1] pb-3">
              <h3 className="text-base font-bold text-[#10261d]">
                {editingBank ? 'Edit Bank Account' : 'Add Bank Collection Account'}
              </h3>
              <button
                type="button"
                onClick={() => setIsBankModalOpen(false)}
                className="text-[#53635a] hover:text-[#10261d]"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveBank} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[#53635a] block mb-1">Bank Name</label>
                <select
                  value={bankForm.bankName}
                  onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                  className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 text-[#10261d] focus:bg-white focus:outline-none"
                >
                  <option value="GTBank Nigeria">GTBank Nigeria</option>
                  <option value="OPay Digital Bank">OPay Digital Bank</option>
                  <option value="Zenith Bank">Zenith Bank</option>
                  <option value="PalmPay Business">PalmPay Business</option>
                  <option value="Providus Bank">Providus Bank</option>
                  <option value="Access Bank">Access Bank</option>
                  <option value="Moniepoint MFB">Moniepoint MFB</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-[#53635a] block mb-1">Account Number</label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={bankForm.accountNumber}
                  onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                  placeholder="0123984752"
                  className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 font-mono text-[#10261d] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#53635a] block mb-1">Account Name</label>
                <input
                  type="text"
                  required
                  value={bankForm.accountName}
                  onChange={(e) => setBankForm({ ...bankForm, accountName: e.target.value })}
                  placeholder="Aksen Liquidity Services Ltd"
                  className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 text-[#10261d] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#53635a] block mb-1">Daily Limit (₦ NGN)</label>
                <input
                  type="number"
                  required
                  value={bankForm.dailyLimit}
                  onChange={(e) => setBankForm({ ...bankForm, dailyLimit: e.target.value })}
                  placeholder="25000000"
                  className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 font-mono text-[#10261d] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#53635a] block mb-1">Status</label>
                <select
                  value={bankForm.status}
                  onChange={(e) => setBankForm({ ...bankForm, status: e.target.value as any })}
                  className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 text-[#10261d] focus:bg-white focus:outline-none"
                >
                  <option value="ACTIVE_ROUTING">ACTIVE_ROUTING (Accept Deposits)</option>
                  <option value="COOLING_DOWN">COOLING_DOWN (Temporary Hold)</option>
                  <option value="NEAR_CAP">NEAR_CAP (Approaching Limit)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsBankModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#e3ece1] hover:bg-neutral-100 text-[#53635a] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#175b3b] hover:bg-[#0f4329] text-white font-bold cursor-pointer shadow-xs"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: MoMo Wallet Create/Edit */}
      {isMomoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-[#e3ece1] space-y-5 text-left">
            <div className="flex items-center justify-between border-b border-[#e3ece1] pb-3">
              <h3 className="text-base font-bold text-[#10261d]">
                {editingMomo ? 'Edit MoMo Wallet' : 'Add MoMo Disbursement SIM'}
              </h3>
              <button
                type="button"
                onClick={() => setIsMomoModalOpen(false)}
                className="text-[#53635a] hover:text-[#10261d]"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveMomo} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[#53635a] block mb-1">Network</label>
                <select
                  value={momoForm.network}
                  onChange={(e) => setMomoForm({ ...momoForm, network: e.target.value })}
                  className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 text-[#10261d] focus:bg-white focus:outline-none"
                >
                  <option value="MTN MoMo">MTN MoMo (Ghana)</option>
                  <option value="Telecel Cash">Telecel Cash (Ghana)</option>
                  <option value="Zeepay">Zeepay Cross-Border</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-[#53635a] block mb-1">Phone Number</label>
                <input
                  type="text"
                  required
                  value={momoForm.phoneNumber}
                  onChange={(e) => setMomoForm({ ...momoForm, phoneNumber: e.target.value })}
                  placeholder="0245719646"
                  className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 font-mono text-[#10261d] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#53635a] block mb-1">Merchant Registered Name</label>
                <input
                  type="text"
                  required
                  value={momoForm.merchantName}
                  onChange={(e) => setMomoForm({ ...momoForm, merchantName: e.target.value })}
                  placeholder="Aksen Liquidity Services Ghana"
                  className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 text-[#10261d] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-[#53635a] block mb-1">Float Balance (GH₵)</label>
                  <input
                    type="number"
                    required
                    value={momoForm.balance}
                    onChange={(e) => setMomoForm({ ...momoForm, balance: e.target.value })}
                    placeholder="50000"
                    className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 font-mono text-[#10261d] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#53635a] block mb-1">Daily Cap (GH₵)</label>
                  <input
                    type="number"
                    required
                    value={momoForm.dailyLimit}
                    onChange={(e) => setMomoForm({ ...momoForm, dailyLimit: e.target.value })}
                    placeholder="100000"
                    className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 font-mono text-[#10261d] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-[#53635a] block mb-1">Status</label>
                <select
                  value={momoForm.status}
                  onChange={(e) => setMomoForm({ ...momoForm, status: e.target.value as any })}
                  className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 text-[#10261d] focus:bg-white focus:outline-none"
                >
                  <option value="ACTIVE_DISBURSING">ACTIVE_DISBURSING (Online for Payout)</option>
                  <option value="STANDBY">STANDBY (Reserve SIM)</option>
                  <option value="LOW_FLOAT">LOW_FLOAT (Requires Float Top-Up)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsMomoModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#e3ece1] hover:bg-neutral-100 text-[#53635a] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#175b3b] hover:bg-[#0f4329] text-white font-bold cursor-pointer shadow-xs"
                >
                  Save Wallet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </OperatorShell>
  );
}
