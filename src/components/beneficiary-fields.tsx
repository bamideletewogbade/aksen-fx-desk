'use client';

import { GH_BANKS, GH_MOMO_PROVIDERS, NG_BANKS, RELATIONSHIP_LABEL, type Beneficiary, type Relationship } from '@/lib/trades';
import type { Currency } from '@/lib/money';
import { Field, Input, Segmented, Select } from './ui';

export const emptyBeneficiary = (currency: Currency): Beneficiary => ({
  kind: currency === 'GHS' ? 'MOMO' : 'BANK',
  provider: currency === 'GHS' ? 'MTN MoMo' : 'GTBank',
  accountNumber: '',
  accountName: '',
  relationship: 'SELF',
});

/** Payout destination form, used by operators and customers. */
export function BeneficiaryFields({ value, onChange, currency, idPrefix = 'ben', customerFacing }: { value: Beneficiary; onChange: (b: Beneficiary) => void; currency: Currency; idPrefix?: string; customerFacing?: boolean }) {
  const providers = currency === 'NGN' ? NG_BANKS : value.kind === 'MOMO' ? GH_MOMO_PROVIDERS : GH_BANKS;
  const set = (patch: Partial<Beneficiary>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      {currency === 'GHS' && (
        <Segmented
          value={value.kind}
          onChange={(kind) => set({ kind, provider: kind === 'MOMO' ? 'MTN MoMo' : GH_BANKS[0] })}
          options={[{ value: 'MOMO', label: 'Mobile money' }, { value: 'BANK', label: 'Bank account' }]}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={value.kind === 'MOMO' ? 'Network' : 'Bank'} htmlFor={`${idPrefix}-provider`}>
          <Select id={`${idPrefix}-provider`} value={value.provider} onChange={(e) => set({ provider: e.target.value })}>
            {providers.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label={value.kind === 'MOMO' ? 'Mobile money number' : 'Account number'} htmlFor={`${idPrefix}-number`} hint={value.kind === 'MOMO' ? '10 digits, e.g. 0244123456' : currency === 'NGN' ? '10-digit NUBAN' : undefined}>
          <Input id={`${idPrefix}-number`} mono inputMode="numeric" autoComplete="off" value={value.accountNumber} onChange={(e) => set({ accountNumber: e.target.value.replace(/[^\d]/g, '').slice(0, 16) })} placeholder={value.kind === 'MOMO' ? '0244123456' : '0123456789'} />
        </Field>
      </div>
      <Field label="Name on the account" htmlFor={`${idPrefix}-name`} hint={customerFacing ? 'Exactly as registered with the bank or network.' : 'As registered. Check it on the network’s name lookup before paying.'}>
        <Input id={`${idPrefix}-name`} value={value.accountName} onChange={(e) => set({ accountName: e.target.value })} placeholder="Full name" autoComplete="off" />
      </Field>
      <Field label={customerFacing ? 'Whose account is this?' : 'Relationship to customer'} htmlFor={`${idPrefix}-rel`}>
        <Select id={`${idPrefix}-rel`} value={value.relationship} onChange={(e) => set({ relationship: e.target.value as Relationship })}>
          {(Object.keys(RELATIONSHIP_LABEL) as Relationship[]).map((r) => (
            <option key={r} value={r}>{customerFacing && r === 'SELF' ? 'My own account' : RELATIONSHIP_LABEL[r]}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

export function beneficiaryComplete(b: Beneficiary) {
  return b.accountNumber.length >= 8 && b.accountName.trim().length >= 3 && b.provider.length > 1;
}
