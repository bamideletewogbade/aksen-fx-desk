import { redirect } from 'next/navigation';

/** Liquidity syndicates are out of scope until the core desk is proven with customers. */
export default function SyndicatesPage() {
  redirect('/accounts');
}
