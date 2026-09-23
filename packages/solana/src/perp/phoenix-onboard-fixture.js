// @ts-check
import {
  getOnboardTraderDelegatedEncoder,
  getRegisterTraderInstructionEncoder,
  PHOENIX_GLOBAL_CONFIGURATION_ADDRESS,
  PHOENIX_LOG_AUTHORITY_ADDRESS,
} from "@ellipsis-labs/rise";
import { address } from "@solana/kit";
import { PHOENIX_PERPS_PROGRAM } from "./phoenix-api.js";

/** @param {string} pubkey @param {boolean} [isSigner] @param {boolean} [isWritable] */
const key = (pubkey, isSigner = false, isWritable = false) => ({ pubkey, isSigner, isWritable });
const registerData = () => [
  ...getRegisterTraderInstructionEncoder().encode({
    maxPositions: 128n,
    traderPdaIndex: 0,
    subaccountIndex: 0,
  }),
];

/** @param {string} owner @param {string} trader */
export const buildFor = (owner, trader) => {
  const onboarder = "SysvarRent111111111111111111111111111111111";
  return {
    traderPda: trader,
    traderOnboarder: onboarder,
    txFeePayer: owner,
    maxPositions: 128,
    includeRegisterTrader: true,
    instructions: [
      {
        programId: PHOENIX_PERPS_PROGRAM,
        data: registerData(),
        keys: [
          key(PHOENIX_PERPS_PROGRAM),
          key(PHOENIX_LOG_AUTHORITY_ADDRESS),
          key(PHOENIX_GLOBAL_CONFIGURATION_ADDRESS),
          key(owner, true, true),
          key(owner),
          key(trader, false, true),
          key("11111111111111111111111111111111"),
        ],
      },
      {
        programId: PHOENIX_PERPS_PROGRAM,
        data: [...getOnboardTraderDelegatedEncoder().encode(undefined)],
        keys: [
          key(PHOENIX_PERPS_PROGRAM),
          key(PHOENIX_LOG_AUTHORITY_ADDRESS),
          key(PHOENIX_GLOBAL_CONFIGURATION_ADDRESS),
          key(onboarder, true),
          key(onboarder, false, true),
          key(trader, false, true),
        ],
      },
    ],
  };
};

export const fakeRpc = () => ({
  url: "http://127.0.0.1:1",
  rpc: {
    getLatestBlockhash: () => ({
      send: async () => ({
        value: {
          blockhash: address("11111111111111111111111111111111"),
          lastValidBlockHeight: 100n,
        },
      }),
    }),
  },
});
