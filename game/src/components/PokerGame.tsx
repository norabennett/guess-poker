import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ethers } from 'ethers';
import { useAccount, usePublicClient } from 'wagmi';

import {
  CHAIN_ID,
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  DEFAULT_FULL_REWARD_WEI,
  DEFAULT_GAME_FEE_WEI,
  DEFAULT_RANK_REWARD_WEI,
  DEFAULT_SUIT_REWARD_WEI,
  RANK_OPTIONS,
  SUIT_OPTIONS,
} from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import '../styles/PokerGame.css';

type ActiveGame = {
  isActive: true;
  encryptedSuit: `0x${string}`;
  encryptedRank: `0x${string}`;
};

type GameTerms = {
  gameFee: bigint;
  suitReward: bigint;
  rankReward: bigint;
  fullReward: bigint;
};

type GuessResult = {
  suitMatched: boolean;
  rankMatched: boolean;
  reward: bigint;
};

type Feedback = {
  type: 'success' | 'error';
  message: string;
};

const truncateHandle = (value: string | null) => {
  if (!value || value === '0x') return '—';
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
};

const formatEtherValue = (value?: bigint, fallback?: bigint) => {
  const candidate = value ?? fallback;
  if (candidate === undefined) {
    return '…';
  }
  return ethers.formatEther(candidate);
};

const formatError = (error: unknown) => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'shortMessage' in (error as any)) {
    return String((error as any).shortMessage);
  }
  return 'Unexpected error';
};

export function PokerGame() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const ethersSigner = useEthersSigner({ chainId: CHAIN_ID });
  const queryClient = useQueryClient();

  const [selectedSuit, setSelectedSuit] = useState<number>(SUIT_OPTIONS[0].value);
  const [selectedRank, setSelectedRank] = useState<number>(RANK_OPTIONS[0].value);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [guessResult, setGuessResult] = useState<GuessResult | null>(null);
  const [lastHandles, setLastHandles] = useState<{ suit: string; rank: string } | null>(null);

  const contractInterface = useMemo(() => new ethers.Interface(CONTRACT_ABI), []);

  const { data: gameTerms } = useQuery<GameTerms | null>({
    queryKey: ['game-terms'],
    enabled: Boolean(publicClient),
    queryFn: async () => {
      if (!publicClient) return null;
      const [gameFee, suitReward, rankReward, fullReward] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'GAME_FEE',
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'SUIT_REWARD',
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'RANK_REWARD',
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'FULL_REWARD',
        }),
      ]);

      return {
        gameFee: gameFee as bigint,
        suitReward: suitReward as bigint,
        rankReward: rankReward as bigint,
        fullReward: fullReward as bigint,
      };
    },
  });

  const { data: houseBalance } = useQuery<bigint | null>({
    queryKey: ['house-balance'],
    enabled: Boolean(publicClient),
    queryFn: async () => {
      if (!publicClient) return null;
      const balance = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'houseBalance',
      });
      return balance as bigint;
    },
  });

  const { data: activeGame } = useQuery<ActiveGame | null>({
    queryKey: ['active-game', address],
    enabled: Boolean(publicClient && address),
    queryFn: async () => {
      if (!publicClient || !address) {
        return null;
      }

      const result = (await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getActiveGame',
        args: [address],
      })) as [boolean, `0x${string}`, `0x${string}`];

      if (!result[0]) {
        return null;
      }

      return {
        isActive: true,
        encryptedSuit: result[1],
        encryptedRank: result[2],
      } satisfies ActiveGame;
    },
  });

  const startGameMutation = useMutation<{ suit: string; rank: string } | null, unknown>({
    mutationFn: async () => {
      if (!isConnected) {
        throw new Error('Connect a wallet on Sepolia to start.');
      }

      const signer = await ethersSigner;
      if (!signer) {
        throw new Error('Wallet signer unavailable.');
      }

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const value = gameTerms?.gameFee ?? DEFAULT_GAME_FEE_WEI;

      const tx = await contract.startGame({ value });
      const receipt = await tx.wait();

      let suitHandle: string | null = null;
      let rankHandle: string | null = null;

      for (const log of receipt.logs) {
        try {
          const parsed = contractInterface.parseLog(log);
          if (parsed?.name === 'GameStarted') {
            suitHandle = parsed.args.encryptedSuit as string;
            rankHandle = parsed.args.encryptedRank as string;
            break;
          }
        } catch (error) {
          // Ignore logs that do not belong to this contract
          continue;
        }
      }

      return suitHandle && rankHandle ? { suit: suitHandle, rank: rankHandle } : null;
    },
    onSuccess: (handles) => {
      if (address) {
        queryClient.invalidateQueries({ queryKey: ['active-game', address] });
      }
      queryClient.invalidateQueries({ queryKey: ['house-balance'] });

      setGuessResult(null);
      setLastHandles(handles ?? null);
      setFeedback({ type: 'success', message: 'A fresh encrypted card is ready. Time to guess!' });
    },
    onError: (error) => {
      setFeedback({ type: 'error', message: formatError(error) });
    },
  });

  const guessMutation = useMutation<GuessResult, unknown, { suit: number; rank: number }>({
    mutationFn: async ({ suit, rank }) => {
      if (!isConnected) {
        throw new Error('Connect a wallet to submit a guess.');
      }
      if (!activeGame) {
        throw new Error('Start a game before guessing.');
      }

      const signer = await ethersSigner;
      if (!signer) {
        throw new Error('Wallet signer unavailable.');
      }

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.makeGuess(suit, rank);
      const receipt = await tx.wait();

      for (const log of receipt.logs) {
        try {
          const parsed = contractInterface.parseLog(log);
          if (parsed?.name === 'GuessEvaluated') {
            const suitMatched = Boolean(parsed.args.suitMatched);
            const rankMatched = Boolean(parsed.args.rankMatched);
            const reward = BigInt(parsed.args.reward);
            return { suitMatched, rankMatched, reward } satisfies GuessResult;
          }
        } catch (error) {
          continue;
        }
      }

      throw new Error('Unable to read guess result from transaction logs.');
    },
    onSuccess: (result) => {
      if (address) {
        queryClient.invalidateQueries({ queryKey: ['active-game', address] });
      }
      queryClient.invalidateQueries({ queryKey: ['house-balance'] });

      setGuessResult(result);

      const rewardText = result.reward > 0n ? `${ethers.formatEther(result.reward)} ETH rewarded.` : 'No payout this round.';

      if (result.reward > 0n) {
        setFeedback({ type: 'success', message: `Victory! ${rewardText}` });
      } else if (result.suitMatched || result.rankMatched) {
        setFeedback({
          type: 'success',
          message: `Close call! ${result.suitMatched ? 'Suit matched. ' : ''}${
            result.rankMatched ? 'Rank matched.' : 'Rank missed.'
          } ${rewardText}`,
        });
      } else {
        setFeedback({ type: 'error', message: 'No matches. Try another combination.' });
      }
    },
    onError: (error) => {
      setFeedback({ type: 'error', message: formatError(error) });
    },
  });

  const isStartDisabled = !isConnected || Boolean(activeGame) || startGameMutation.isPending || guessMutation.isPending;
  const isGuessDisabled = !isConnected || !activeGame || guessMutation.isPending;

  return (
    <div className="poker-wrapper">
      <header className="poker-header">
        <div>
          <h1>Encrypted Poker Guess</h1>
          <p>Start a round, inspect encrypted handles, and predict the exact card.</p>
        </div>
        <ConnectButton />
      </header>

      <section className="poker-card">
        <h2>Game Status</h2>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Active Session</span>
            <span className="info-value">{activeGame ? 'Yes' : 'No'}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Encrypted Suit Handle</span>
            <span className="handle" title={activeGame?.encryptedSuit ?? ''}>
              {truncateHandle(activeGame?.encryptedSuit ?? lastHandles?.suit ?? null)}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Encrypted Rank Handle</span>
            <span className="handle" title={activeGame?.encryptedRank ?? ''}>
              {truncateHandle(activeGame?.encryptedRank ?? lastHandles?.rank ?? null)}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">House Balance</span>
            <span className="info-value">{formatEtherValue(houseBalance ?? undefined)} ETH</span>
          </div>
        </div>
      </section>

      <section className="poker-card">
        <h2>Start a New Game</h2>
        <p className="card-subtitle">
          Pay {formatEtherValue(gameTerms?.gameFee, DEFAULT_GAME_FEE_WEI)} ETH to receive a fresh encrypted card. The contract
          requires at least {formatEtherValue(gameTerms?.fullReward, DEFAULT_FULL_REWARD_WEI)} ETH to cover a full win.
        </p>
        <button
          className="primary-button"
          onClick={() => startGameMutation.mutate()}
          disabled={isStartDisabled}
        >
          {startGameMutation.isPending ? 'Starting...' : 'Start New Game'}
        </button>
        {!isConnected && <p className="helper-text">Connect a wallet on Sepolia to begin.</p>}
        {activeGame && <p className="helper-text">Resolve your current game before starting another.</p>}
      </section>

      <section className="poker-card">
        <h2>Make Your Guess</h2>
        <p className="card-subtitle">
          Rewards: suit only {formatEtherValue(gameTerms?.suitReward, DEFAULT_SUIT_REWARD_WEI)} ETH · rank only {formatEtherValue(
            gameTerms?.rankReward,
            DEFAULT_RANK_REWARD_WEI,
          )}{' '}
          ETH · full match {formatEtherValue(gameTerms?.fullReward, DEFAULT_FULL_REWARD_WEI)} ETH.
        </p>
        <div className="action-row">
          <label className="input-group">
            <span>Suit</span>
            <select
              className="select-input"
              value={selectedSuit}
              onChange={(event) => setSelectedSuit(Number(event.target.value))}
              disabled={isGuessDisabled}
            >
              {SUIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="input-group">
            <span>Rank</span>
            <select
              className="select-input"
              value={selectedRank}
              onChange={(event) => setSelectedRank(Number(event.target.value))}
              disabled={isGuessDisabled}
            >
              {RANK_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            className="primary-button"
            onClick={() => guessMutation.mutate({ suit: selectedSuit, rank: selectedRank })}
            disabled={isGuessDisabled}
          >
            {guessMutation.isPending ? 'Submitting...' : 'Submit Guess'}
          </button>
        </div>
        {!activeGame && <p className="helper-text">Start a game to enable guessing.</p>}
      </section>

      {feedback && <div className={`feedback ${feedback.type}`}>{feedback.message}</div>}

      {guessResult && (
        <section className="poker-card">
          <h2>Last Result</h2>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Suit</span>
              <span className="info-value">{guessResult.suitMatched ? 'Matched' : 'Missed'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Rank</span>
              <span className="info-value">{guessResult.rankMatched ? 'Matched' : 'Missed'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Reward</span>
              <span className="info-value">{ethers.formatEther(guessResult.reward)} ETH</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
