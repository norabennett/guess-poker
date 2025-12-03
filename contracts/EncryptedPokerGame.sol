// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title EncryptedPokerGame
/// @notice Poker-style guessing game with encrypted card values managed through Zama FHE.
contract EncryptedPokerGame is ZamaEthereumConfig {
    uint256 public constant GAME_FEE = 1e15; // 0.001 ether
    uint256 public constant SUIT_REWARD = 1e14; // 0.0001 ether
    uint256 public constant RANK_REWARD = 1e15; // 0.001 ether
    uint256 public constant FULL_REWARD = 2e15; // 0.002 ether

    struct GameSession {
        euint8 encryptedSuit;
        euint8 encryptedRank;
        uint8 suit;
        uint8 rank;
        bool active;
    }

    mapping(address => GameSession) private games;

    address private _owner;
    uint256 private _nonce;

    event GameStarted(address indexed player, bytes32 encryptedSuit, bytes32 encryptedRank);
    event GuessEvaluated(address indexed player, bool suitMatched, bool rankMatched, uint256 reward);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error ActiveGameExists();
    error InvalidFee();
    error InvalidGuess();
    error NoActiveGame();
    error TransferFailed();
    error InsufficientBankroll();
    error AmountExceedsBalance();
    error NotOwner();
    error InvalidOwner();
    error InvalidRecipient();

    modifier onlyOwner() {
        if (msg.sender != _owner) {
            revert NotOwner();
        }
        _;
    }

    constructor() {
        _owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function owner() external view returns (address currentOwner) {
        currentOwner = _owner;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) {
            revert InvalidOwner();
        }
        address previousOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function startGame() external payable returns (bytes32 encryptedSuit, bytes32 encryptedRank) {
        if (msg.value != GAME_FEE) {
            revert InvalidFee();
        }

        GameSession storage session = games[msg.sender];
        if (session.active) {
            revert ActiveGameExists();
        }

        if (address(this).balance < FULL_REWARD) {
            revert InsufficientBankroll();
        }

        (uint8 suitValue, uint8 rankValue) = _drawCard(msg.sender);

        euint8 suitCipher = FHE.asEuint8(suitValue);
        euint8 rankCipher = FHE.asEuint8(rankValue);

        suitCipher = FHE.allowThis(suitCipher);
        rankCipher = FHE.allowThis(rankCipher);

        suitCipher = FHE.allow(suitCipher, msg.sender);
        rankCipher = FHE.allow(rankCipher, msg.sender);

        session.encryptedSuit = suitCipher;
        session.encryptedRank = rankCipher;
        session.suit = suitValue;
        session.rank = rankValue;
        session.active = true;

        encryptedSuit = FHE.toBytes32(suitCipher);
        encryptedRank = FHE.toBytes32(rankCipher);

        emit GameStarted(msg.sender, encryptedSuit, encryptedRank);
    }

    function makeGuess(uint8 suitGuess, uint8 rankGuess) external {
        if (suitGuess < 1 || suitGuess > 4 || rankGuess < 1 || rankGuess > 13) {
            revert InvalidGuess();
        }

        GameSession storage session = games[msg.sender];
        if (!session.active) {
            revert NoActiveGame();
        }

        bool suitMatched = session.suit == suitGuess;
        bool rankMatched = session.rank == rankGuess;

        uint256 reward;
        if (suitMatched && rankMatched) {
            reward = FULL_REWARD;
        } else if (rankMatched) {
            reward = RANK_REWARD;
        } else if (suitMatched) {
            reward = SUIT_REWARD;
        }

        session.active = false;
        delete games[msg.sender];

        if (reward > 0) {
            if (address(this).balance < reward) {
                revert InsufficientBankroll();
            }
            (bool success, ) = payable(msg.sender).call{value: reward}("");
            if (!success) {
                revert TransferFailed();
            }
        }

        emit GuessEvaluated(msg.sender, suitMatched, rankMatched, reward);
    }

    function getActiveGame(address player)
        external
        view
        returns (bool isActive, bytes32 encryptedSuit, bytes32 encryptedRank)
    {
        GameSession storage session = games[player];
        if (session.active) {
            isActive = true;
            encryptedSuit = FHE.toBytes32(session.encryptedSuit);
            encryptedRank = FHE.toBytes32(session.encryptedRank);
        }
    }

    function withdraw(address payable recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) {
            revert InvalidRecipient();
        }
        if (amount > address(this).balance) {
            revert AmountExceedsBalance();
        }
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) {
            revert TransferFailed();
        }
    }

    function houseBalance() external view returns (uint256 balance) {
        balance = address(this).balance;
    }

    receive() external payable {}

    function _drawCard(address player) private returns (uint8 suitValue, uint8 rankValue) {
        uint256 randomSeed = uint256(
            keccak256(abi.encodePacked(block.prevrandao, block.timestamp, player, _nonce))
        );
        unchecked {
            _nonce++;
        }

        suitValue = uint8((randomSeed % 4) + 1);
        rankValue = uint8(((randomSeed >> 16) % 13) + 1);
    }
}
