import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'SET_WALLETCONNECT_PROJECT_ID_IN_ENV';

export const config = getDefaultConfig({
  appName: 'Encrypted Poker Guess',
  projectId,
  chains: [sepolia],
  ssr: false,
});
