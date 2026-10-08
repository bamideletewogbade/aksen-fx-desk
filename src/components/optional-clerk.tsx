'use client';

import { ClerkProvider, UserButton, useClerk } from '@clerk/nextjs';
import { createContext, useContext, type ReactNode } from 'react';

type ClerkState = {
  isSignedIn: boolean;
  signOut: () => Promise<void>;
};

const ClerkStateContext = createContext<ClerkState>({
  isSignedIn: false,
  signOut: async () => {},
});

function ActiveClerkState({ children }: { children: ReactNode }) {
  const clerk = useClerk();
  return (
    <ClerkStateContext.Provider
      value={{
        isSignedIn: clerk.isSignedIn,
        signOut: async () => { await clerk.signOut({ redirectUrl: '/login' }); },
      }}
    >
      {children}
    </ClerkStateContext.Provider>
  );
}

export function OptionalClerkProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  if (!enabled) return <ClerkStateContext.Provider value={{ isSignedIn: false, signOut: async () => {} }}>{children}</ClerkStateContext.Provider>;
  return <ClerkProvider><ActiveClerkState>{children}</ActiveClerkState></ClerkProvider>;
}

export function useOptionalClerk() {
  return useContext(ClerkStateContext);
}

export function OptionalUserButton() {
  const clerk = useOptionalClerk();
  return clerk.isSignedIn ? <UserButton /> : null;
}
