import { describe, expect, it } from "vitest";
import {
  WALLET_ASSETS,
  assetByKey,
  fromUnits,
  isValidAddress,
  parseBlockcypher,
  parseEvm,
  parseEvmAddress,
  callWithAddress,
  YIELD_MODULES_SELECTOR,
  parseNear,
  parseSolana,
  parseToncenter,
  parseTron,
  parseXrp,
  walletCostBasis,
} from "./index";

// Response shapes as the production server received them (2026-09-25), with
// the owner's addresses left out.

describe("fromUnits", () => {
  it("reads decimal, hex and number amounts exactly", () => {
    expect(fromUnits("16201927438832190717356800", 24)).toBeCloseTo(16.2019274388, 9);
    expect(fromUnits("0x0000000000000000000000000000000000000000000000000003141614be8c00", 18)).toBeCloseTo(0.00086651, 8);
    expect(fromUnits("0xcb1a0c2b62300", 18)).toBeCloseTo(0.003573, 6);
    expect(fromUnits(4502631, 6)).toBe(4.502631);
    expect(fromUnits("0x", 18)).toBe(0);
  });
  it("refuses what is not an amount", () => {
    expect(fromUnits("-5", 6)).toBeNull();
    expect(fromUnits("1.5", 6)).toBeNull();
    expect(fromUnits(1.5, 6)).toBeNull();
  });
});

describe("isValidAddress", () => {
  it("accepts each network's own shape", () => {
    expect(isValidAddress("evm", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(true);
    expect(isValidAddress("tron", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe(true);
    expect(isValidAddress("solana", "Vote111111111111111111111111111111111111111")).toBe(true);
    expect(isValidAddress("xrp", "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh")).toBe(true);
    expect(isValidAddress("near", "near")).toBe(true);
    expect(isValidAddress("near", "98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6de")).toBe(true);
    expect(isValidAddress("litecoin", "ltc1qg42tkwuuxefutzxezdkdel39gfstuap288mfea")).toBe(true);
    expect(isValidAddress("dash", "XpESxaUmonkq8RaLLp46Brx2K39ggQe226")).toBe(true);
    expect(isValidAddress("bitcoin", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toBe(true);
  });
  it("refuses an address meant for another network", () => {
    expect(isValidAddress("tron", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(false);
    expect(isValidAddress("evm", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA9604")).toBe(false);
    expect(isValidAddress("dash", "ltc1qg42tkwuuxefutzxezdkdel39gfstuap288mfea")).toBe(false);
  });
  it("checks a TON address's checksum, so one misread letter is caught", () => {
    expect(isValidAddress("ton", "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N")).toBe(true);
    expect(isValidAddress("ton", "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2n")).toBe(false);
    expect(isValidAddress("ton", "0:" + "a".repeat(64))).toBe(true);
  });
});

describe("parsers", () => {
  const trx = assetByKey("tron:TRX")!;
  const usdtTron = assetByKey("tron:USDT")!;

  it("EVM balance and token balance", () => {
    expect(parseEvm({ jsonrpc: "2.0", id: 1, result: "0x0" }, 18)).toBe(0);
    expect(parseEvm({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "x" } }, 18)).toBeNull();
  });

  it("EVM address result: Tangem's yield module, none, or no factory", () => {
    expect(parseEvmAddress({ result: "0x000000000000000000000000cd36f74767ad00229b985fd3d1616cdb7e08287c" })).toBe(
      "0xcd36f74767ad00229b985fd3d1616cdb7e08287c",
    );
    expect(parseEvmAddress({ result: "0x" + "0".repeat(64) })).toBeNull();
    expect(parseEvmAddress({ result: "0x" })).toBeNull();
    expect(parseEvmAddress({ error: { code: -32000 } })).toBeUndefined();
    expect(callWithAddress(YIELD_MODULES_SELECTOR, "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(
      "0x36571e2c000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045",
    );
    // The module's aUSDC balance as the server read it.
    expect(parseEvm({ jsonrpc: "2.0", id: 1, result: "0x0000000000000000000000000000000000000000000000000000000006ffe6b6" }, 6)).toBeCloseTo(117.43, 1);
  });

  it("Tron: coin, TRC20 token, and an account not yet used", () => {
    const json = {
      data: [
        {
          balance: 4502631,
          assetV2: [{ value: 4444444444, key: "1005193" }], // TRC10 airdrops: ignored
          trc20: [{ TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: "12500000" }],
          frozenV2: [{}, { type: "ENERGY" }],
        },
      ],
      success: true,
      meta: { at: 1790336282881, page_size: 1 },
    };
    expect(parseTron(json, trx)).toBe(4.502631);
    expect(parseTron(json, usdtTron)).toBe(12.5);
    expect(parseTron({ ...json, data: [{ ...json.data[0], trc20: [] }] }, usdtTron)).toBe(0);
    expect(parseTron({ data: [], success: true }, trx)).toBe(0);
    expect(parseTron({ success: false, error: "x" }, trx)).toBeNull();
  });

  it("TON, and a rejected address", () => {
    expect(parseToncenter({ ok: true, result: "10340389690" })).toBeCloseTo(10.34038969, 8);
    expect(parseToncenter({ ok: false, error: "failed to parse get request", code: 422 })).toBeNull();
  });

  it("Solana", () => {
    expect(parseSolana({ jsonrpc: "2.0", result: { context: { apiVersion: "4.3.0", slot: 450341483 }, value: 42671030 }, id: 1 })).toBe(0.04267103);
  });

  it("NEAR, and an account that does not exist yet", () => {
    const json = { jsonrpc: "2.0", result: { amount: "16201927438832190717356800", locked: "0", storage_usage: 182 }, id: 1 };
    expect(parseNear(json)).toBeCloseTo(16.20192744, 8);
    expect(parseNear({ jsonrpc: "2.0", error: { cause: { name: "UNKNOWN_ACCOUNT" } }, id: 1 })).toBe(0);
    expect(parseNear({ jsonrpc: "2.0", error: { cause: { name: "TIMEOUT" } }, id: 1 })).toBeNull();
  });

  it("XRP counts only what is above the reserve (as wallet apps show it)", () => {
    const json = { result: { account_data: { Balance: "1000002", OwnerCount: 0, LedgerEntryType: "AccountRoot" }, validated: true } };
    expect(parseXrp(json)).toBe(0.000002);
    expect(parseXrp({ result: { account_data: { Balance: "5000000", OwnerCount: 2 } } })).toBeCloseTo(3.6, 9);
    expect(parseXrp({ result: { error: "actNotFound", status: "error" } })).toBe(0);
    expect(parseXrp({ result: { error: "tooBusy" } })).toBeNull();
  });

  it("Litecoin / Dash / Bitcoin via BlockCypher", () => {
    expect(parseBlockcypher({ total_received: 101589555, total_sent: 101589555, balance: 0, final_balance: 0, n_tx: 2 })).toBe(0);
    expect(parseBlockcypher({ final_balance: 42815678 })).toBe(0.42815678);
    expect(parseBlockcypher({ error: "Limits reached." })).toBeNull();
  });
});

describe("catalogue", () => {
  it("has unique keys and a price id for every asset", () => {
    const keys = WALLET_ASSETS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(WALLET_ASSETS.every((a) => a.coingecko && a.decimals > 0)).toBe(true);
  });
});

describe("walletCostBasis", () => {
  it("starts at today's value, adds arrivals at today's price, cuts leavers in proportion", () => {
    expect(walletCostBasis(null, 10, 2)).toBe(20);
    expect(walletCostBasis({ quantity: 10, costBasis: 15 }, 12, 3)).toBe(21);
    expect(walletCostBasis({ quantity: 10, costBasis: 15 }, 5, 3)).toBe(7.5);
    expect(walletCostBasis({ quantity: 10, costBasis: 15 }, 10, 99)).toBe(15);
  });
});
